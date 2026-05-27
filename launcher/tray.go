package main

import (
	"log"
	"os/exec"
	"runtime"

	"github.com/getlantern/systray"
)

// startTray 启动系统托盘菜单，提供 Open / Restart FastClaw / Restart Backend /
// Open Data Folder / Quit。
//
// 直接拿 supervisor 引用做 in-process 调用，比走本地 HTTP 简单也不易错。
//
// 线程模型：systray 内部跑自己的消息循环（windows 上是隐藏窗口 + WndProc）。
// 这里把 systray.Run 跑在一个 goroutine 上，与 webview 的消息循环各跑各的。
// 实测在 Windows 10/11 上没有冲突；万一以后撞到事件错乱再合并到一个 GUI 线程。
func startTray(sup *supervisor, paths *AppPaths) {
	onReady := func() {
		systray.SetTitle("Hermes")
		systray.SetTooltip("Hermes AI Research Command Center")

		mOpen := systray.AddMenuItem("Open Hermes", "Bring Hermes window to front")
		mRestartFC := systray.AddMenuItem("Restart FastClaw", "Restart the agent kernel")
		mRestartBE := systray.AddMenuItem("Restart Backend", "Restart the API backend")
		systray.AddSeparator()
		mDataDir := systray.AddMenuItem("Open Data Folder", "Open user data folder in Explorer")
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("Quit", "Quit Hermes")

		go func() {
			for {
				select {
				case <-mOpen.ClickedCh:
					// webview 库目前没暴露 BringToFront — 先发一次"重新 Navigate"信号，
					// Windows 在 WebView2 持有焦点时会顺带把窗口带到前。后续如果不够直观
					// 再走 SetForegroundWindow（要拿 hwnd）。
					sendOpenSignal()
				case <-mRestartFC.ClickedCh:
					if err := sup.Restart("fastclaw"); err != nil {
						log.Printf("tray restart fastclaw: %v", err)
					}
				case <-mRestartBE.ClickedCh:
					if err := sup.Restart("backend"); err != nil {
						log.Printf("tray restart backend: %v", err)
					}
				case <-mDataDir.ClickedCh:
					openInExplorer(paths.DataDir)
				case <-mQuit.ClickedCh:
					systray.Quit()
				}
			}
		}()
	}
	onExit := func() { log.Printf("tray exited") }
	systray.Run(onReady, onExit)
}

// sendOpenSignal 向 webviewMain 发一次"导航回主 URL"消息。当前 webview 库不暴露
// 直接的 BringToFront；点击托盘"Open"通常发生在用户不小心最小化或叠层后，导航
// 一次足够把窗口拉回前台。
func sendOpenSignal() {
	select {
	case mainOpenCh <- struct{}{}:
	default:
	}
}

func openInExplorer(path string) {
	if runtime.GOOS != "windows" {
		log.Printf("openInExplorer: unsupported on %s", runtime.GOOS)
		return
	}
	// 用 cmd /c start 而不是直接 explorer，避免 explorer 把当前 cwd 当默认参数。
	if err := exec.Command("cmd", "/c", "start", "", path).Start(); err != nil {
		log.Printf("openInExplorer: %v", err)
	}
}
