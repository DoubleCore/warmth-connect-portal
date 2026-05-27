package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
)

// startControlServer 启动 launcher 的本地控制 API。
//
// 仅监听 127.0.0.1，无鉴权 — backend 知道这个地址（通过 HERMES_LAUNCHER_CONTROL_URL
// 环境变量），且 loopback 接口不会暴露给外部。如果以后要做更严格隔离，可以加一段
// shared-secret header（启动时随机生成、env 注入给 backend）。
//
// 路由：
//
//	POST /control/fastclaw/restart   重启 fastclaw 子进程（用于 backend 改完 agent.json 之后）
//	GET  /control/healthz            launcher 自身存活探针
//
// 返回值统一 application/json {ok, error?}.
func startControlServer(port int, sup *supervisor) (stop func()) {
	mux := http.NewServeMux()

	mux.HandleFunc("/control/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	mux.HandleFunc("/control/fastclaw/restart", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if err := sup.Restart("fastclaw"); err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"ok": true})
	})

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	srv := &http.Server{
		Addr:              addr,
		Handler:           loopbackOnly(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Printf("control server: listen %s: %v", addr, err)
		return func() {}
	}
	go func() {
		log.Printf("control server listening on %s", addr)
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("control server: %v", err)
		}
	}()

	return func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}
}

// loopbackOnly 拒绝任何不来自 loopback 接口的请求。即使 listen 错挂到 0.0.0.0
// （现在没有），这一层也会拦住外网请求。
func loopbackOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.RemoteAddr
		if i := strings.LastIndex(host, ":"); i >= 0 {
			host = host[:i]
		}
		host = strings.Trim(host, "[]")
		if host != "127.0.0.1" && host != "::1" && host != "localhost" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
