package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
)

// Ports 是一次启动里实际选定的三个端口。
//
// 选端口策略：先试默认值（避免每次启动都换数字让用户疑惑），占用了就让 OS
// 随机分一个。前端运行时通过读 data/config/runtime.json 拿到 backend 真实端口。
type Ports struct {
	Backend  int `json:"backend"`
	FastClaw int `json:"fastclaw"`
	Control  int `json:"control"`
}

const (
	defaultBackendPort  = 8787
	defaultFastClawPort = 18953
	defaultControlPort  = 28953
)

func allocatePorts() (*Ports, error) {
	backend, err := pickPort(defaultBackendPort)
	if err != nil {
		return nil, fmt.Errorf("backend port: %w", err)
	}
	fastclaw, err := pickPort(defaultFastClawPort)
	if err != nil {
		return nil, fmt.Errorf("fastclaw port: %w", err)
	}
	control, err := pickPort(defaultControlPort)
	if err != nil {
		return nil, fmt.Errorf("control port: %w", err)
	}
	return &Ports{
		Backend:  backend,
		FastClaw: fastclaw,
		Control:  control,
	}, nil
}

// pickPort 试探优先端口；占用了就让 OS 给随机端口。
//
// 这里只检测 "可监听 127.0.0.1"。返回的端口可能在我们 close 后到子进程 listen 之间
// 被别人抢走，但概率极低，先不上 retry loop（生产里见过几年才一次）。
func pickPort(preferred int) (int, error) {
	if preferred > 0 {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", preferred))
		if err == nil {
			_ = ln.Close()
			return preferred, nil
		}
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()
	return port, nil
}

// writeRuntimeConfig 落盘 runtime.json，让前端 / 文档脚本能读到当前端口。
//
// 写入是原子的（temp + rename），避免读取方读到半截 JSON。
func writeRuntimeConfig(path string, ports *Ports) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	payload := map[string]any{
		"backendPort":  ports.Backend,
		"fastclawPort": ports.FastClaw,
		"controlPort":  ports.Control,
		"writtenAt":    nowRFC3339(),
	}
	buf, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(buf, '\n'), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
