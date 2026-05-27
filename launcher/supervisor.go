package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

// supervisor 管理 backend 和 fastclaw 两个子进程。
//
// 设计要点：
//   - 子进程退出 → 自动重启（最多每 30 秒一次，避免疯狂崩溃 loop）。
//   - 受 rootCtx 取消控制：rootCtx 一旦 cancel，supervisor 就停止重启逻辑并发 SIGTERM 给子进程。
//   - Restart() 给 control HTTP 用：手动停一次，重启循环会自动拉起新实例。
//   - 子进程 stdout/stderr 全部 tee 到 data/logs/<name>.log。
type supervisor struct {
	paths *AppPaths
	ports *Ports

	mu  sync.Mutex
	srv map[string]*serviceState
}

type serviceState struct {
	name       string
	cmd        *exec.Cmd
	cancelLoop func() // 取消"自动重启 loop"自身的 ctx；用在 Restart() 流程
	logFile    *os.File
}

func newSupervisor(paths *AppPaths, ports *Ports) *supervisor {
	return &supervisor{
		paths: paths,
		ports: ports,
		srv:   map[string]*serviceState{},
	}
}

// Run 阻塞，启动 fastclaw 和 backend 两个 service，并把 runtime.json 写出去。
// 一旦 ctx 取消就把所有子进程优雅停掉再返回。
func (s *supervisor) Run(ctx context.Context) {
	if err := writeRuntimeConfig(s.paths.RuntimeConfig, s.ports); err != nil {
		log.Printf("warn: write runtime.json: %v", err)
	}

	// 保证 fastclaw.json 存在 — 否则 fastclaw 启动会立刻退出形成重启循环。
	// backend 起来后会用真实 agents 配置覆盖这份占位。
	ensureFastClawConfig(s.paths)

	// 两个 service 互相独立，并行启动。
	var wg sync.WaitGroup
	for _, svc := range []string{"fastclaw", "backend"} {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			s.runService(ctx, name)
		}(svc)
	}
	wg.Wait()
	log.Printf("supervisor: all services stopped")
}

// runService 启动一个 service 并在 ctx 未取消时反复重启它。
func (s *supervisor) runService(ctx context.Context, name string) {
	const minRestartDelay = 2 * time.Second
	const maxRestartDelay = 30 * time.Second
	delay := minRestartDelay

	for ctx.Err() == nil {
		startedAt := time.Now()
		err := s.startOnce(ctx, name)
		runFor := time.Since(startedAt)

		if ctx.Err() != nil {
			return
		}
		if runFor > 30*time.Second {
			// 跑了一段时间才挂，重置退避。
			delay = minRestartDelay
		} else {
			// 立刻挂，逐步加长重启间隔避免疯狂 loop。
			delay *= 2
			if delay > maxRestartDelay {
				delay = maxRestartDelay
			}
		}
		log.Printf("service %s exited (ran %s, err=%v); restart in %s", name, runFor.Round(time.Millisecond), err, delay)

		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
	}
}

// startOnce 跑一次子进程，阻塞直到子进程退出或 ctx 取消。
func (s *supervisor) startOnce(ctx context.Context, name string) error {
	cmd, logFile, err := s.buildCommand(ctx, name)
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		_ = logFile.Close()
		return fmt.Errorf("start %s: %w", name, err)
	}
	log.Printf("service %s started (pid=%d)", name, cmd.Process.Pid)

	loopCtx, cancelLoop := context.WithCancel(ctx)
	state := &serviceState{
		name:       name,
		cmd:        cmd,
		cancelLoop: cancelLoop,
		logFile:    logFile,
	}
	s.mu.Lock()
	s.srv[name] = state
	s.mu.Unlock()

	// 等子进程退出 / 外部取消。
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	defer func() {
		_ = logFile.Close()
		s.mu.Lock()
		delete(s.srv, name)
		s.mu.Unlock()
	}()

	select {
	case err := <-done:
		_ = loopCtx
		return err
	case <-loopCtx.Done():
		// 主动停止：先 SIGTERM，给 5 秒；不退就 Kill。
		_ = cmd.Process.Signal(syscall.SIGTERM)
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			log.Printf("service %s did not stop in 5s, killing", name)
			_ = cmd.Process.Kill()
			<-done
		}
		return ctx.Err()
	}
}

func (s *supervisor) buildCommand(ctx context.Context, name string) (*exec.Cmd, *os.File, error) {
	logPath := filepath.Join(s.paths.LogsDir, name+".log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, nil, fmt.Errorf("open log %s: %w", logPath, err)
	}
	out := io.MultiWriter(logFile)

	switch name {
	case "fastclaw":
		return s.buildFastClawCmd(ctx, out, logFile)
	case "backend":
		return s.buildBackendCmd(ctx, out, logFile)
	default:
		_ = logFile.Close()
		return nil, nil, fmt.Errorf("unknown service %q", name)
	}
}

func (s *supervisor) buildFastClawCmd(ctx context.Context, out io.Writer, logFile *os.File) (*exec.Cmd, *os.File, error) {
	exePath := s.paths.FastClawExe
	if exePath == "" {
		// dev 回退：仓库根 + go run。Go 工具链必须在 PATH 上。
		exePath = "go"
	}

	args := []string{}
	if filepath.Base(exePath) == "go" {
		args = []string{"run", "./cmd/hermes-fastclaw/", "-config", s.paths.FastClawConfig, "-bind", "127.0.0.1", "-port", fmt.Sprintf("%d", s.ports.FastClaw)}
	} else {
		args = []string{"-config", s.paths.FastClawConfig, "-bind", "127.0.0.1", "-port", fmt.Sprintf("%d", s.ports.FastClaw)}
	}

	cmd := exec.CommandContext(ctx, exePath, args...)
	if filepath.Base(exePath) == "go" {
		cmd.Dir = filepath.Join(s.paths.AppDir, "fastclaw")
	} else {
		cmd.Dir = filepath.Dir(exePath)
	}
	cmd.Stdout = out
	cmd.Stderr = out
	cmd.Env = append(os.Environ(),
		"GODEBUG=http2client=0", // 见 fastclaw/start-hermes-fastclaw.bat 的注释
	)
	return cmd, logFile, nil
}

func (s *supervisor) buildBackendCmd(ctx context.Context, out io.Writer, logFile *os.File) (*exec.Cmd, *os.File, error) {
	if !fileExists(s.paths.BackendEntry) {
		_ = logFile.Close()
		return nil, nil, fmt.Errorf("backend entry not found: %s (did you run `npm run build` in backend/?)", s.paths.BackendEntry)
	}

	cmd := exec.CommandContext(ctx, s.paths.NodeExe, s.paths.BackendEntry)
	cmd.Dir = s.paths.BackendDir
	cmd.Stdout = out
	cmd.Stderr = out

	// 把数据/配置/前端静态目录的绝对路径塞给 backend，免得它再去猜。
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("PORT=%d", s.ports.Backend),
		fmt.Sprintf("DATABASE_URL=%s", filepath.Join(s.paths.DataDir, "app.db")),
		fmt.Sprintf("PDF_STORAGE_DIR=%s", filepath.Join(s.paths.DataDir, "pdfs")),
		fmt.Sprintf("AGENTS_DIR=%s", s.paths.AgentsDir),
		fmt.Sprintf("FASTCLAW_CONFIG_PATH=%s", s.paths.FastClawConfig),
		fmt.Sprintf("FASTCLAW_BASE_URL=http://127.0.0.1:%d", s.ports.FastClaw),
		fmt.Sprintf("FRONTEND_STATIC_DIR=%s", s.paths.FrontendDir),
		fmt.Sprintf("HERMES_LAUNCHER_CONTROL_URL=http://127.0.0.1:%d", s.ports.Control),
		"NODE_ENV=production",
		"LOG_LEVEL=info",
		// 装包后没有外部 .env，CORS 限定到自己的 origin 即可
		fmt.Sprintf("CORS_ORIGIN=http://127.0.0.1:%d", s.ports.Backend),
	)
	return cmd, logFile, nil
}

// Restart 触发某个 service 的优雅重启。runService 的 loop 会自动拉起一个新实例。
func (s *supervisor) Restart(name string) error {
	s.mu.Lock()
	st, ok := s.srv[name]
	s.mu.Unlock()
	if !ok {
		return fmt.Errorf("service %q not running", name)
	}
	log.Printf("restart requested for %s", name)
	st.cancelLoop()
	return nil
}
