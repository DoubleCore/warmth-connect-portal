package main

import (
	"context"
	"net/http"
	"time"
)

// waitForBackend 阻塞轮询 backend `/health` 直到 200 或超时 / ctx 取消。
//
// 间隔 200ms，比较粗暴但 backend 平均 1-2 秒能起。比一秒一次更顺滑。
// HTTP client 用极短超时，避免一个慢 connect 把整轮 poll 卡住。
func waitForBackend(ctx context.Context, baseURL string, timeout time.Duration) bool {
	client := &http.Client{
		Timeout: 1 * time.Second,
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			return false
		}
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/health", nil)
		resp, err := client.Do(req)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return true
			}
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(200 * time.Millisecond):
		}
	}
	return false
}
