package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// AppPaths 收敛 launcher 用到的所有文件系统位置。
//
// 布局（安装后）：
//
//	<install>/Hermes.exe                 ← 当前可执行
//	<install>/app/                       ← 升级覆盖区（只读）
//	  ├─ backend/{node.exe,dist,node_modules}
//	  ├─ frontend/{index.html,assets/}
//	  └─ fastclaw/hermes-fastclaw.exe
//	<install>/data/                      ← 用户区（永远保留）
//	  ├─ app.db
//	  ├─ pdfs/
//	  ├─ logs/
//	  ├─ config/
//	  └─ agents/
//
// 开发模式（直接 `go run launcher/`）下，AppDir 会是仓库根，
// AppDir/data 不存在我们就退到 AppDir/launcher/.devdata 避免污染仓库。
type AppPaths struct {
	// 当前可执行所在目录。
	ExeDir string
	// app/ 目录的绝对路径。
	AppDir string
	// app/backend
	BackendDir string
	// app/backend/node.exe（开发模式下回退到系统 PATH 上的 node）
	NodeExe string
	// app/backend/dist/server.js
	BackendEntry string
	// app/frontend
	FrontendDir string
	// app/fastclaw/hermes-fastclaw.exe
	FastClawExe string
	// data/
	DataDir string
	// data/config/fastclaw.json — 由 backend 渲染、fastclaw 启动时读
	FastClawConfig string
	// data/config/runtime.json — launcher 写入实际端口给前端读
	RuntimeConfig string
	// data/logs
	LogsDir string
	// data/agents
	AgentsDir string
	// 启动期内嵌的 splash 页面（HTML 写到 data/cache/splash/index.html）
	SplashDir string
}

// resolvePaths 在生产 / 开发两种布局之间自动切换。
//
// 判定规则（按顺序）：
//  1. 如果可执行同级有 app/，认为是已安装的 production layout
//  2. 否则向上找最近的含 backend/ 和 fastclaw/ 的目录，认为是 dev 仓库
//
// 这个判定避免依赖 build tag — 同一份二进制 dev/prod 都能跑。
func resolvePaths() (*AppPaths, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("locate executable: %w", err)
	}
	exeDir := filepath.Dir(exe)

	// 1) production
	if dirExists(filepath.Join(exeDir, "app")) {
		return productionPaths(exeDir), nil
	}

	// 2) dev — 沿着可执行向上找仓库根
	root, err := findRepoRoot(exeDir)
	if err != nil {
		// 也试一下 cwd（go run 的话 exeDir 在 %TEMP%）。
		if cwd, cerr := os.Getwd(); cerr == nil {
			if r, ferr := findRepoRoot(cwd); ferr == nil {
				return devPaths(r, exeDir), nil
			}
		}
		return nil, fmt.Errorf("cannot locate Hermes layout (no app/ next to %q and no repo root above)", exeDir)
	}
	return devPaths(root, exeDir), nil
}

func productionPaths(exeDir string) *AppPaths {
	app := filepath.Join(exeDir, "app")
	data := filepath.Join(exeDir, "data")
	return &AppPaths{
		ExeDir:         exeDir,
		AppDir:         app,
		BackendDir:     filepath.Join(app, "backend"),
		NodeExe:        filepath.Join(app, "backend", "node.exe"),
		BackendEntry:   filepath.Join(app, "backend", "dist", "server.js"),
		FrontendDir:    filepath.Join(app, "frontend"),
		FastClawExe:    filepath.Join(app, "fastclaw", "hermes-fastclaw.exe"),
		DataDir:        data,
		FastClawConfig: filepath.Join(data, "config", "fastclaw.json"),
		RuntimeConfig:  filepath.Join(data, "config", "runtime.json"),
		LogsDir:        filepath.Join(data, "logs"),
		AgentsDir:      filepath.Join(data, "agents"),
		SplashDir:      filepath.Join(data, "cache", "splash"),
	}
}

func devPaths(root, exeDir string) *AppPaths {
	// dev 模式：data 落在 launcher/.devdata，避免污染仓库根 data/。
	devData := filepath.Join(root, "launcher", ".devdata")
	// fastclaw exe：dev 模式下若有 dist/hermes-fastclaw.exe 就用，否则后续 supervisor 会回退到 `go run`。
	fastclawExe := filepath.Join(root, "fastclaw", "dist", "hermes-fastclaw.exe")
	if !fileExists(fastclawExe) {
		fastclawExe = "" // supervisor 自己处理（go run 模式）
	}
	// backend 入口：dev 用 tsx 比较麻烦，建议先 `npm run build` 一次再启 launcher。
	return &AppPaths{
		ExeDir:         exeDir,
		AppDir:         root,
		BackendDir:     filepath.Join(root, "backend"),
		NodeExe:        "node", // 走系统 PATH
		BackendEntry:   filepath.Join(root, "backend", "dist", "server.js"),
		FrontendDir:    filepath.Join(root, "fronted", "dist-desktop", "client"),
		FastClawExe:    fastclawExe,
		DataDir:        devData,
		FastClawConfig: filepath.Join(devData, "config", "fastclaw.json"),
		RuntimeConfig:  filepath.Join(devData, "config", "runtime.json"),
		LogsDir:        filepath.Join(devData, "logs"),
		AgentsDir:      filepath.Join(devData, "agents"),
		SplashDir:      filepath.Join(devData, "cache", "splash"),
	}
}

func (p *AppPaths) ensureDirs() error {
	for _, d := range []string{
		p.DataDir,
		p.LogsDir,
		p.AgentsDir,
		p.SplashDir,
		filepath.Join(p.DataDir, "config"),
		filepath.Join(p.DataDir, "pdfs"),
	} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return fmt.Errorf("mkdir %s: %w", d, err)
		}
	}
	return nil
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

func findRepoRoot(start string) (string, error) {
	cur := start
	for i := 0; i < 8; i++ {
		// 仓库根的特征：同时存在 backend/ 和 fastclaw/。
		if dirExists(filepath.Join(cur, "backend")) && dirExists(filepath.Join(cur, "fastclaw")) {
			return cur, nil
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			break
		}
		cur = parent
	}
	return "", errors.New("repo root not found")
}

// openRotatingLog 打开一个简单的 size-limited 日志文件。
//
// 当前实现直接打开 append 模式，超过 10MB 时把现有的 .1 / .2 滚一下。这是个非常
// 朴素的轮转，不指望并发安全（launcher 只有一个进程在写），换成 lumberjack 也行
// 但 lumberjack 不必要地大。
func openRotatingLog(path string) (io.Writer, error) {
	if st, err := os.Stat(path); err == nil && st.Size() > 10*1024*1024 {
		// 简单轮转：.1 -> .2，当前 -> .1
		_ = os.Rename(path+".1", path+".2")
		_ = os.Rename(path, path+".1")
	}
	return os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
}
