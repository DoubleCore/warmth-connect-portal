// Package main is the Hermes desktop launcher.
//
// 责任：
//   - 起两个子进程：fastclaw（Go LLM 内核）和 backend（Node Hono 服务）
//   - 给 backend 选一个空闲端口，把数据/配置目录的绝对路径以环境变量塞给两个子进程
//   - 跑一个本地 control HTTP（仅 127.0.0.1），让 backend 在改 agent 配置后请求 launcher 重启 fastclaw
//   - 在 backend `/health` 返回 200 之前显示一个本地 splash 页面
//   - 用 WebView2 打开主窗口指向 backend 服务的根
//   - 系统托盘提供 Open / Restart / Quit
//   - 窗口关闭 = 最小化到托盘；菜单 Quit 才真正退出
//
// 不做的事：
//   - 不知道前端业务逻辑
//   - 不直接和 fastclaw / backend 用任何私有协议通信，靠环境变量和 control HTTP
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

// version is filled in at build time via `-ldflags "-X main.version=..."`.
var version = "dev"

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.SetPrefix("[hermes] ")
	log.Printf("hermes launcher %s starting", version)

	paths, err := resolvePaths()
	if err != nil {
		fatalDialog("Hermes failed to start", err.Error())
		return
	}
	if err := paths.ensureDirs(); err != nil {
		fatalDialog("Hermes failed to prepare data folder", err.Error())
		return
	}

	// 把 launcher 自己的日志同时写到 data/logs/launcher.log，方便用户回报问题。
	if logFile, err := openRotatingLog(filepath.Join(paths.LogsDir, "launcher.log")); err == nil {
		log.SetOutput(logFile)
	} else {
		// 落盘失败也不阻塞启动 — 日志继续走 stderr。
		log.Printf("warning: cannot open launcher.log: %v", err)
	}

	ports, err := allocatePorts()
	if err != nil {
		fatalDialog("Hermes failed to allocate ports", err.Error())
		return
	}
	log.Printf("ports allocated: backend=%d fastclaw=%d control=%d", ports.Backend, ports.FastClaw, ports.Control)

	// SIGTERM/Ctrl+C 触发优雅退出。
	rootCtx, rootCancel := context.WithCancel(context.Background())
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Printf("received shutdown signal")
		rootCancel()
	}()

	sup := newSupervisor(paths, ports)

	// 起子进程；子进程进入 Run 是阻塞的，放 goroutine。
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		sup.Run(rootCtx)
	}()

	// Control HTTP（仅 loopback），让 backend 调"重启 fastclaw"。
	stopControl := startControlServer(ports.Control, sup)
	defer stopControl()

	// 等待 backend 健康 → 切到主窗口；之前先给一个 splash 页面。
	backendURL := fmt.Sprintf("http://127.0.0.1:%d", ports.Backend)
	go func() {
		if waitForBackend(rootCtx, backendURL, 60*time.Second) {
			log.Printf("backend ready at %s", backendURL)
			notifyMainURL(backendURL)
		} else {
			log.Printf("backend did not become ready within timeout")
			notifyMainURL("about:blank?error=backend-timeout")
		}
	}()

	// 系统托盘 + WebView2 主窗口。这俩调用都必须在主 goroutine 上跑（Win32 message loop）。
	// systray.Run 会一直阻塞直到 Quit；窗口由 webviewMain 在另一段单线程上托管。
	go startTray(sup, paths)

	// WebView2 必须 main goroutine。等它退出再清理。
	webviewMain(rootCtx, splashFileURL(paths), backendURL)

	rootCancel()
	wg.Wait()
	log.Printf("hermes launcher exited cleanly")
}
