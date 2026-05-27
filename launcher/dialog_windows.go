//go:build windows

package main

import (
	"log"
	"syscall"
	"unsafe"
)

// fatalDialog 在启动期不可恢复错误（找不到 backend.exe、磁盘写不下…）时弹一个
// Windows 原生 MessageBox，让用户看到原因再退出，避免静默闪退。
func fatalDialog(title, body string) {
	log.Printf("fatal: %s — %s", title, body)
	user32 := syscall.NewLazyDLL("user32.dll")
	mbox := user32.NewProc("MessageBoxW")
	titleW, _ := syscall.UTF16PtrFromString(title)
	bodyW, _ := syscall.UTF16PtrFromString(body)
	const (
		MB_OK       = 0x00000000
		MB_ICONSTOP = 0x00000010
	)
	mbox.Call(0, uintptr(unsafe.Pointer(bodyW)), uintptr(unsafe.Pointer(titleW)), MB_OK|MB_ICONSTOP)
}
