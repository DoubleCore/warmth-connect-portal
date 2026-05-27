package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
)

// ensureFastClawConfig 在 launcher 启动期保证 data/config/fastclaw.json 存在。
//
// 为什么需要：
//
//	fastclaw 启动时强制读 -config 指向的文件；找不到就立刻退出。
//	backend 才是 agents 配置的真相来源（modules/agents），它启动期会把 agents 渲染
//	到这个文件。但第一次安装、或者用户清空了 data/ 之后，会出现"backend 还没起、
//	fastclaw 已经在重启 loop"的鸡蛋问题。
//
// 这个函数：
//   - 文件已存在 → 不动；
//   - 不存在 → 写一份"占位 + 三个默认 agent 但没配 apiKey"的最小可启动配置。
//
// 代价：placeholder agent 没有 apiKey，第一次对话会报 LLM_NOT_CONFIGURED；用户去
// settings 页填 key，backend 重写 config，launcher 通过 control HTTP 重启 fastclaw
// 后即生效。
func ensureFastClawConfig(paths *AppPaths) {
	if fileExists(paths.FastClawConfig) {
		return
	}
	if err := os.MkdirAll(filepath.Dir(paths.FastClawConfig), 0o755); err != nil {
		log.Printf("ensureFastClawConfig: mkdir: %v", err)
		return
	}

	// 三个 seed agent 的 ID 与 backend `modules/agents/agents.types.ts` 里的 SEED_AGENTS
	// 完全一致。重复一份是有意的：launcher 不依赖 backend 的源码。
	type provider struct {
		APIBase string `json:"apiBase"`
	}
	type providers struct {
		OpenAI provider `json:"openai"`
	}
	type seedAgent struct {
		ID                string    `json:"id"`
		Role              string    `json:"role"`
		Name              string    `json:"name"`
		Model             string    `json:"model"`
		MaxTokens         int       `json:"maxTokens"`
		Temperature       float64   `json:"temperature"`
		MaxToolIterations int       `json:"maxToolIterations"`
		Home              string    `json:"home"`
		Workspace         string    `json:"workspace"`
		Providers         providers `json:"providers"`
	}
	mk := func(id, role, name string, temp float64, maxTokens, maxIter int) seedAgent {
		return seedAgent{
			ID:                id,
			Role:              role,
			Name:              name,
			Model:             "openai/gpt-4o-mini",
			MaxTokens:         maxTokens,
			Temperature:       temp,
			MaxToolIterations: maxIter,
			Home:              filepath.Join(paths.AgentsDir, id),
			Workspace:         filepath.Join(paths.DataDir, "workspaces", id),
			Providers: providers{
				OpenAI: provider{APIBase: "https://api.openai.com/v1"},
			},
		}
	}
	cfg := struct {
		DefaultAgentID string      `json:"defaultAgentId"`
		Agents         []seedAgent `json:"agents"`
	}{
		DefaultAgentID: "agt_f908ad32af3120090a37",
		Agents: []seedAgent{
			mk("agt_f908ad32af3120090a37", "paper-search", "论文搜索助手", 0.4, 8192, 20),
			mk("agt_18b2eb56cb44f511848e", "rag-paper-reader", "RAG 论文阅读助手", 0.3, 8192, 20),
			mk("agt_44d05b7677054cebfdad", "paper-deploy", "论文部署助手", 0.2, 8192, 30),
		},
	}

	buf, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		log.Printf("ensureFastClawConfig: marshal: %v", err)
		return
	}
	tmp := paths.FastClawConfig + ".tmp"
	if err := os.WriteFile(tmp, append(buf, '\n'), 0o644); err != nil {
		log.Printf("ensureFastClawConfig: write tmp: %v", err)
		return
	}
	if err := os.Rename(tmp, paths.FastClawConfig); err != nil {
		log.Printf("ensureFastClawConfig: rename: %v", err)
		return
	}
	log.Printf("ensureFastClawConfig: wrote placeholder at %s (no API keys yet)", paths.FastClawConfig)

	// 顺手把三个 agent 目录建好，省得 fastclaw 起来时再 mkdir。
	for _, a := range cfg.Agents {
		_ = os.MkdirAll(a.Home, 0o755)
		_ = os.MkdirAll(a.Workspace, 0o755)
	}
}
