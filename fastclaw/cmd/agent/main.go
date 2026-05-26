// Command agent is a standalone AI Agent server.
//
// It exposes an OpenAI-compatible /v1/chat/completions endpoint backed by
// the agentruntime ReAct engine. Deploy as a single binary on Windows or Linux.
//
// Usage:
//
//	agent -port 18953 -model openai/gpt-4o-mini -api-key $OPENAI_API_KEY
//	agent -config agent.json
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/fastclaw-ai/agentcore"
	"github.com/fastclaw-ai/agentruntime"
	"github.com/fastclaw-ai/connector"
)

var (
	version   = "dev"
	commit    = "unknown"
	buildDate = "unknown"
)

func main() {
	// CLI flags
	port := flag.Int("port", 18953, "HTTP server port")
	bind := flag.String("bind", "127.0.0.1", "Bind address (127.0.0.1 or 0.0.0.0)")
	model := flag.String("model", "", "LLM model (e.g. openai/gpt-4o-mini)")
	apiKey := flag.String("api-key", "", "LLM API key (or set AGENT_API_KEY env)")
	apiBase := flag.String("api-base", "https://api.openai.com/v1", "LLM API base URL")
	apiType := flag.String("api-type", "", "API type: empty for OpenAI-compat, 'anthropic-messages' for Anthropic")
	agentHome := flag.String("home", "./agent-data", "Agent home directory (SOUL.md, MEMORY.md, etc.)")
	workspace := flag.String("workspace", "./workspace", "Agent workspace directory")
	authToken := flag.String("auth-token", "", "Bearer token for API auth (or set AGENT_AUTH_TOKEN env)")
	configFile := flag.String("config", "", "Path to JSON config file (overrides flags)")
	showVersion := flag.Bool("version", false, "Print version and exit")

	flag.Parse()

	if *showVersion {
		fmt.Printf("agentruntime %s (commit: %s, built: %s)\n", version, commit, buildDate)
		os.Exit(0)
	}

	// Resolve from env if flags are empty
	if *apiKey == "" {
		*apiKey = os.Getenv("AGENT_API_KEY")
	}
	if *authToken == "" {
		*authToken = os.Getenv("AGENT_AUTH_TOKEN")
	}
	if *model == "" {
		*model = os.Getenv("AGENT_MODEL")
	}

	// Load config file if specified
	var cfg agentcore.AgentConfig
	if *configFile != "" {
		var err error
		cfg, err = loadConfigFile(*configFile)
		if err != nil {
			slog.Error("failed to load config", "file", *configFile, "error", err)
			os.Exit(1)
		}
	} else {
		if *model == "" {
			slog.Error("model is required: use -model flag or AGENT_MODEL env")
			os.Exit(1)
		}
		if *apiKey == "" {
			slog.Error("api-key is required: use -api-key flag or AGENT_API_KEY env")
			os.Exit(1)
		}

		// Parse provider key from model string
		provKey := "default"
		if idx := strings.Index(*model, "/"); idx > 0 {
			provKey = (*model)[:idx]
		}

		cfg = agentcore.AgentConfig{
			ID:                "default",
			Model:             *model,
			MaxTokens:         8192,
			Temperature:       0.7,
			MaxToolIterations: 20,
			Home:              *agentHome,
			Workspace:         *workspace,
			Providers: map[string]agentcore.ProviderConfig{
				provKey: {
					APIKey:  *apiKey,
					APIBase: *apiBase,
					APIType: *apiType,
				},
			},
		}
	}

	// Ensure directories exist
	os.MkdirAll(cfg.Home, 0o755)
	os.MkdirAll(cfg.Workspace, 0o755)

	// Create agent
	platform := connector.NewSimplePlatform()
	factory := connector.NewAgentFactory(platform)
	agent := factory.CreateAgent(cfg)

	slog.Info("agent created",
		"id", cfg.ID,
		"model", cfg.Model,
		"home", cfg.Home,
		"workspace", cfg.Workspace,
	)

	// HTTP server
	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "version": version})
	})

	// OpenAI-compatible chat completions
	mux.HandleFunc("/v1/chat/completions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "POST only", 405)
			return
		}

		// Auth check
		if *authToken != "" {
			auth := r.Header.Get("Authorization")
			if auth != "Bearer "+*authToken {
				http.Error(w, "Unauthorized", 401)
				return
			}
		}

		var req chatCompletionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), 400)
			return
		}

		// Build inbound message from the last user message
		var userText string
		var systemPrompt string
		for _, m := range req.Messages {
			switch m.Role {
			case "user":
				userText = m.Content
			case "system":
				systemPrompt = m.Content
			}
		}

		if userText == "" {
			http.Error(w, "no user message found", 400)
			return
		}

		// Write SOUL.md if system prompt provided (per-request override)
		if systemPrompt != "" {
			soulPath := cfg.Home + "/SOUL.md"
			os.WriteFile(soulPath, []byte(systemPrompt), 0o644)
		}

		msg := agentcore.InboundMessage{
			Channel: "api",
			ChatID:  req.SessionID,
			UserID:  "api-user",
			Text:    userText,
			AgentID: cfg.ID,
		}
		if msg.ChatID == "" {
			msg.ChatID = "default"
		}

		if req.Stream {
			// SSE streaming
			handleStream(w, r, agent, msg)
		} else {
			// Non-streaming
			reply := agent.HandleMessage(r.Context(), msg)
			resp := chatCompletionResponse{
				ID:      "chatcmpl-" + fmt.Sprintf("%d", time.Now().UnixNano()),
				Object:  "chat.completion",
				Created: time.Now().Unix(),
				Choices: []chatChoice{
					{
						Index:        0,
						Message:      chatMessage{Role: "assistant", Content: reply},
						FinishReason: "stop",
					},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
		}
	})

	addr := fmt.Sprintf("%s:%d", *bind, *port)
	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		slog.Info("shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	slog.Info("agent server starting", "addr", addr, "version", version)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}

// ---------- Streaming ----------

func handleStream(w http.ResponseWriter, r *http.Request, agent *agentruntime.Agent, msg agentcore.InboundMessage) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", 500)
		return
	}

	events := make(chan agentruntime.ChatEvent, 64)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	done := make(chan string, 1)
	go func() {
		reply := agent.HandleMessageStream(ctx, msg, events)
		done <- reply
		close(events)
	}()

	id := fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano())

	for ev := range events {
		if ev.Type == "content_delta" {
			delta := ""
			if d, ok := ev.Data["delta"].(string); ok {
				delta = d
			}
			chunk := streamChunk{
				ID:      id,
				Object:  "chat.completion.chunk",
				Created: time.Now().Unix(),
				Choices: []streamChoice{
					{Index: 0, Delta: chatDelta{Content: delta}},
				},
			}
			data, _ := json.Marshal(chunk)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}

	// Final chunk
	finalChunk := streamChunk{
		ID:      id,
		Object:  "chat.completion.chunk",
		Created: time.Now().Unix(),
		Choices: []streamChoice{
			{Index: 0, Delta: chatDelta{}, FinishReason: strPtr("stop")},
		},
	}
	data, _ := json.Marshal(finalChunk)
	fmt.Fprintf(w, "data: %s\n\n", data)
	fmt.Fprintf(w, "data: [DONE]\n\n")
	flusher.Flush()
}

func strPtr(s string) *string { return &s }

// ---------- Config file ----------

type fileConfig struct {
	ID          string                              `json:"id"`
	Model       string                              `json:"model"`
	MaxTokens   int                                 `json:"maxTokens"`
	Temperature float64                             `json:"temperature"`
	Home        string                              `json:"home"`
	Workspace   string                              `json:"workspace"`
	Providers   map[string]agentcore.ProviderConfig `json:"providers"`
}

func loadConfigFile(path string) (agentcore.AgentConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return agentcore.AgentConfig{}, err
	}
	var fc fileConfig
	if err := json.Unmarshal(data, &fc); err != nil {
		return agentcore.AgentConfig{}, err
	}

	cfg := agentcore.AgentConfig{
		ID:                fc.ID,
		Model:             fc.Model,
		MaxTokens:         fc.MaxTokens,
		Temperature:       fc.Temperature,
		MaxToolIterations: 20,
		Home:              fc.Home,
		Workspace:         fc.Workspace,
		Providers:         fc.Providers,
	}
	if cfg.ID == "" {
		cfg.ID = "default"
	}
	if cfg.MaxTokens == 0 {
		cfg.MaxTokens = 8192
	}
	if cfg.Temperature == 0 {
		cfg.Temperature = 0.7
	}
	if cfg.Home == "" {
		cfg.Home = "./agent-data"
	}
	if cfg.Workspace == "" {
		cfg.Workspace = "./workspace"
	}

	// Expand env vars in API keys
	for k, p := range cfg.Providers {
		if strings.HasPrefix(p.APIKey, "$") {
			p.APIKey = os.Getenv(strings.TrimPrefix(p.APIKey, "$"))
			cfg.Providers[k] = p
		}
	}

	return cfg, nil
}

// ---------- OpenAI-compatible types ----------

type chatCompletionRequest struct {
	Model     string        `json:"model"`
	Messages  []chatMessage `json:"messages"`
	Stream    bool          `json:"stream"`
	SessionID string        `json:"session_id,omitempty"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionResponse struct {
	ID      string       `json:"id"`
	Object  string       `json:"object"`
	Created int64        `json:"created"`
	Choices []chatChoice `json:"choices"`
}

type chatChoice struct {
	Index        int         `json:"index"`
	Message      chatMessage `json:"message"`
	FinishReason string      `json:"finish_reason"`
}

type streamChunk struct {
	ID      string         `json:"id"`
	Object  string         `json:"object"`
	Created int64          `json:"created"`
	Choices []streamChoice `json:"choices"`
}

type streamChoice struct {
	Index        int       `json:"index"`
	Delta        chatDelta `json:"delta"`
	FinishReason *string   `json:"finish_reason"`
}

type chatDelta struct {
	Role    string `json:"role,omitempty"`
	Content string `json:"content,omitempty"`
}
