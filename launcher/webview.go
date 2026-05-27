package main

import (
	"context"
	"log"
	"sync"

	webview "github.com/jchv/go-webview2"
)

// 跨 goroutine 把目标 URL 通知给主窗口。
//
// 启动期 splash → backend ready 后切到 backend 真实 URL。
// 用一个 unbuffered chan + sync.Once 包一层，避免重复 Navigate。
var (
	mainURLOnce sync.Once
	mainURLCh   = make(chan string, 1)
	// mainOpenCh 由 tray "Open Hermes" 触发，让 webview 重新 navigate 到当前 URL，
	// 顺带把窗口拉到前台。buffered=1，溢出就 drop。
	mainOpenCh = make(chan struct{}, 1)
)

func notifyMainURL(u string) {
	mainURLOnce.Do(func() {
		mainURLCh <- u
	})
}

// webviewMain 在主 goroutine 上托管 WebView2 窗口。阻塞到窗口关闭。
//
// 行为：
//  1. 立刻显示 splash URL；
//  2. 后台 goroutine 监听 mainURLCh，收到后用 webview.Dispatch 切到 backend URL；
//  3. 窗口关闭 → 函数返回 → 主进程进入退出流程。
//
// dispatchToWebView：webview API 的方法只能在创建窗口的那个 OS 线程上调用。
// 我们用 w.Dispatch 把 navigate 操作回到 webview 线程。
func webviewMain(ctx context.Context, splashURL, backendURL string) {
	defer func() {
		// webview 库 panic 也别拖死 launcher。
		if r := recover(); r != nil {
			log.Printf("webview crashed: %v", r)
		}
	}()

	opts := webview.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		WindowOptions: webview.WindowOptions{
			Title:  "Hermes AI",
			Width:  1280,
			Height: 800,
			IconId: 0, // 由 .syso 资源文件提供（rsrc 工具生成）；没有就用默认
			Center: true,
		},
	}
	w := webview.NewWithOptions(opts)
	if w == nil {
		log.Printf("webview: creation failed")
		return
	}
	defer w.Destroy()

	w.Navigate(splashURL)

	// goroutine：等 backendURL 通知 → 派发到 webview 线程 → Navigate。
	go func() {
		var current string
		for {
			select {
			case u := <-mainURLCh:
				current = u
				w.Dispatch(func() {
					log.Printf("webview navigate: %s", u)
					w.Navigate(u)
				})
			case <-mainOpenCh:
				if current == "" {
					continue
				}
				w.Dispatch(func() {
					// 重新 navigate 一次：在 Windows 上会把窗口带到前台。
					w.Navigate(current)
				})
			case <-ctx.Done():
				w.Dispatch(func() { w.Terminate() })
				return
			}
		}
	}()

	w.Run()
}
