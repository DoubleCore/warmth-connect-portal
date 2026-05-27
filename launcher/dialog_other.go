//go:build !windows

package main

import "log"

// fatalDialog 非 Windows 平台仅打日志 — launcher 当前只面向 Windows 用户，
// 但保留一个 stub 让 `go vet` / 跨平台 build 通过。
func fatalDialog(title, body string) {
	log.Printf("fatal: %s — %s", title, body)
}
