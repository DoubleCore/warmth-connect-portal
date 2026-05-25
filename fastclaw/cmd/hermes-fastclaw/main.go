// Command hermes-fastclaw runs the bundled FastClaw kernel with the three
// Hermes paper agents and exposes the endpoints used by warmth-connect-portal.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
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

type runtimeConfig struct {
	DefaultAgentID string                              `json:"defaultAgentId"`
	Providers      map[string]agentcore.ProviderConfig `json:"providers,omitempty"`
	Agents         []agentSpec                         `json:"agents"`
}

type agentSpec struct {
	ID                   string                                  `json:"id"`
	Role                 string                                  `json:"role,omitempty"`
	Name                 string                                  `json:"name,omitempty"`
	Model                string                                  `json:"model"`
	MaxTokens            int                                     `json:"maxTokens,omitempty"`
	Temperature          float64                                 `json:"temperature,omitempty"`
	MaxToolIterations    int                                     `json:"maxToolIterations,omitempty"`
	MaxParallelToolCalls int                                     `json:"maxParallelToolCalls,omitempty"`
	Thinking             string                                  `json:"thinking,omitempty"`
	Home                 string                                  `json:"home"`
	Workspace            string                                  `json:"workspace"`
	Skills               agentcore.SkillsConfig                  `json:"skills,omitempty"`
	Sandbox              agentcore.SandboxConfig                 `json:"sandbox,omitempty"`
	Providers            map[string]agentcore.ProviderConfig     `json:"providers,omitempty"`
	ToolProviders        map[string]agentcore.ToolProviderConfig `json:"toolProviders,omitempty"`
	Tools                map[string]agentcore.ToolCategoryConfig `json:"tools,omitempty"`
}

type serverState struct {
	defaultAgentID string
	agents         map[string]*agentruntime.Agent
	specs          map[string]agentSpec
	authToken      string
}

func main() {
	port := flag.Int("port", 18953, "HTTP server port")
	bind := flag.String("bind", "127.0.0.1", "Bind address")
	configFile := flag.String("config", "config/hermes-agents.json", "Hermes FastClaw agents config")
	authToken := flag.String("auth-token", "", "Bearer token for API auth; falls back to FASTCLAW_API_KEY or AGENT_AUTH_TOKEN")
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("hermes-fastclaw %s (commit: %s, built: %s)\n", version, commit, buildDate)
		os.Exit(0)
	}

	if *authToken == "" {
		*authToken = firstEnv("FASTCLAW_API_KEY", "AGENT_AUTH_TOKEN")
	}

	cfg, configDir, err := loadRuntimeConfig(*configFile)
	if err != nil {
		slog.Error("failed to load FastClaw config", "file", *configFile, "error", err)
		os.Exit(1)
	}

	state, err := createState(cfg, configDir, *authToken)
	if err != nil {
		slog.Error("failed to create FastClaw state", "error", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", state.handleHealth)
	mux.HandleFunc("/v1/models", state.handleModels)
	mux.HandleFunc("/v1/chat/completions", state.handleChatCompletions)
	mux.HandleFunc("/api/chat/stream", state.handleWebChatStream)

	addr := fmt.Sprintf("%s:%d", *bind, *port)
	server := &http.Server{Addr: addr, Handler: mux}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		slog.Info("shutting down hermes-fastclaw")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()

	slog.Info("hermes-fastclaw starting",
		"addr", addr,
		"agents", len(state.agents),
		"defaultAgentId", state.defaultAgentID,
		"version", version,
	)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}

func loadRuntimeConfig(path string) (runtimeConfig, string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return runtimeConfig{}, "", err
	}
	var cfg runtimeConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return runtimeConfig{}, "", err
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return runtimeConfig{}, "", err
	}
	return cfg, filepath.Dir(absPath), nil
}

func createState(cfg runtimeConfig, configDir string, authToken string) (*serverState, error) {
	if len(cfg.Agents) == 0 {
		return nil, fmt.Errorf("no agents configured")
	}

	platform := connector.NewSimplePlatform()
	factory := connector.NewAgentFactory(platform)
	state := &serverState{
		defaultAgentID: cfg.DefaultAgentID,
		agents:         map[string]*agentruntime.Agent{},
		specs:          map[string]agentSpec{},
		authToken:      authToken,
	}

	for _, spec := range cfg.Agents {
		if spec.ID == "" {
			return nil, fmt.Errorf("agent id is required")
		}
		if spec.Model == "" {
			return nil, fmt.Errorf("agent %s model is required", spec.ID)
		}
		if spec.Home == "" {
			return nil, fmt.Errorf("agent %s home is required", spec.ID)
		}
		spec.Home = resolveConfigPath(configDir, spec.Home)
		spec.Workspace = resolveConfigPath(configDir, spec.Workspace)
		providers := mergeProviders(cfg.Providers, spec.Providers)
		expandProviders(providers)
		spec.Model = resolveModel(spec.Model)

		agent := factory.CreateAgent(agentcore.AgentConfig{
			ID:                   spec.ID,
			Home:                 spec.Home,
			Workspace:            spec.Workspace,
			Model:                spec.Model,
			MaxTokens:            spec.MaxTokens,
			Temperature:          spec.Temperature,
			MaxToolIterations:    spec.MaxToolIterations,
			MaxParallelToolCalls: spec.MaxParallelToolCalls,
			Thinking:             spec.Thinking,
			Skills:               spec.Skills,
			Sandbox:              spec.Sandbox,
			ToolProviders:        spec.ToolProviders,
			Tools:                spec.Tools,
			Providers:            providers,
		})
		state.agents[spec.ID] = agent
		state.specs[spec.ID] = spec
	}

	if state.defaultAgentID == "" {
		state.defaultAgentID = cfg.Agents[0].ID
	}
	if _, ok := state.agents[state.defaultAgentID]; !ok {
		return nil, fmt.Errorf("default agent %s is not configured", state.defaultAgentID)
	}
	return state, nil
}

func mergeProviders(global, local map[string]agentcore.ProviderConfig) map[string]agentcore.ProviderConfig {
	merged := map[string]agentcore.ProviderConfig{}
	for k, v := range global {
		merged[k] = v
	}
	for k, v := range local {
		merged[k] = v
	}
	return merged
}

func expandProviders(providers map[string]agentcore.ProviderConfig) {
	for key, provider := range providers {
		provider.APIKey = os.ExpandEnv(provider.APIKey)
		provider.APIBase = os.ExpandEnv(provider.APIBase)
		provider.APIType = os.ExpandEnv(provider.APIType)
		if provider.APIKey == "" {
			provider.APIKey = firstEnv("AGENT_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY")
		}
		if provider.APIBase == "" {
			provider.APIBase = firstEnv("AGENT_API_BASE", "OPENAI_API_BASE", "LLM_API_BASE_URL")
		}
		if provider.APIBase == "" {
			provider.APIBase = "https://api.openai.com/v1"
		}
		providers[key] = provider
	}
}

func resolveModel(model string) string {
	expanded := os.ExpandEnv(model)
	if strings.HasSuffix(expanded, "/") {
		expanded += firstEnv("AGENT_MODEL", "OPENAI_MODEL", "LLM_CHAT_MODEL")
	}
	if expanded == "" || strings.HasSuffix(expanded, "/") {
		return "openai/gpt-4o-mini"
	}
	return expanded
}

func resolveConfigPath(configDir, path string) string {
	if path == "" || filepath.IsAbs(path) {
		return path
	}
	return filepath.Clean(filepath.Join(configDir, path))
}

func (s *serverState) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "GET only", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, map[string]any{
		"status":         "ok",
		"version":        version,
		"defaultAgentId": s.defaultAgentID,
		"agents":         s.modelList(),
	})
}

func (s *serverState) handleModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "GET only", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorized(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	writeJSON(w, map[string]any{
		"object": "list",
		"data":   s.modelList(),
	})
}

func (s *serverState) modelList() []map[string]any {
	items := make([]map[string]any, 0, len(s.specs))
	for id, spec := range s.specs {
		items = append(items, map[string]any{
			"id":       id,
			"object":   "model",
			"owned_by": "fastclaw",
			"name":     spec.Name,
			"role":     spec.Role,
			"model":    spec.Model,
		})
	}
	return items
}

func (s *serverState) handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorized(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req chatCompletionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	agent, agentID, err := s.resolveAgent(r, req.Model, req.AgentID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	userText, systemPrompt := splitMessages(req.Messages)
	if userText == "" {
		http.Error(w, "no user message found", http.StatusBadRequest)
		return
	}
	if systemPrompt != "" {
		userText = fmt.Sprintf("<request_system_prompt>\n%s\n</request_system_prompt>\n\n%s", systemPrompt, userText)
	}

	sessionID := s.resolveSessionID(r, req.SessionID)
	msg := agentcore.InboundMessage{
		Channel: "api",
		ChatID:  sessionID,
		UserID:  "api-user",
		Text:    userText,
		AgentID: agentID,
	}

	if req.Stream {
		s.streamOpenAI(w, r, agent, msg)
		return
	}

	reply := agent.HandleMessage(r.Context(), msg)
	writeJSON(w, chatCompletionResponse{
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
	})
}

func (s *serverState) handleWebChatStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorized(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req webChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Message) == "" {
		http.Error(w, "message is required", http.StatusBadRequest)
		return
	}

	agent, agentID, err := s.resolveAgent(r, req.AgentID, req.AgentID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	sessionID := s.resolveSessionID(r, req.SessionID)
	msg := agentcore.InboundMessage{
		Channel: "web",
		ChatID:  sessionID,
		UserID:  "api-user",
		Text:    req.Message,
		AgentID: agentID,
	}
	s.streamFastClawEvents(w, r, agent, msg)
}

func (s *serverState) streamOpenAI(w http.ResponseWriter, r *http.Request, agent *agentruntime.Agent, msg agentcore.InboundMessage) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	events := make(chan agentruntime.ChatEvent, 64)
	go func() {
		agent.HandleMessageStream(r.Context(), msg, events)
		close(events)
	}()

	id := fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano())
	for ev := range events {
		switch ev.Type {
		case "content_delta":
			delta, _ := ev.Data["delta"].(string)
			if delta == "" {
				continue
			}
			data, _ := json.Marshal(streamChunk{
				ID:      id,
				Object:  "chat.completion.chunk",
				Created: time.Now().Unix(),
				Choices: []streamChoice{
					{Index: 0, Delta: chatDelta{Content: delta}},
				},
			})
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case "error":
			message, _ := ev.Data["message"].(string)
			data, _ := json.Marshal(streamChunk{
				ID:      id,
				Object:  "chat.completion.chunk",
				Created: time.Now().Unix(),
				Choices: []streamChoice{
					{Index: 0, Delta: chatDelta{Content: message}},
				},
			})
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}

	data, _ := json.Marshal(streamChunk{
		ID:      id,
		Object:  "chat.completion.chunk",
		Created: time.Now().Unix(),
		Choices: []streamChoice{
			{Index: 0, Delta: chatDelta{}, FinishReason: strPtr("stop")},
		},
	})
	fmt.Fprintf(w, "data: %s\n\n", data)
	fmt.Fprintf(w, "data: [DONE]\n\n")
	flusher.Flush()
}

func (s *serverState) streamFastClawEvents(w http.ResponseWriter, r *http.Request, agent *agentruntime.Agent, msg agentcore.InboundMessage) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	events := make(chan agentruntime.ChatEvent, 64)
	go func() {
		agent.HandleMessageStream(r.Context(), msg, events)
		close(events)
	}()

	for ev := range events {
		writeSSE(w, ev)
		flusher.Flush()
	}
	writeSSE(w, agentruntime.ChatEvent{Type: "done"})
	flusher.Flush()
}

func (s *serverState) resolveAgent(r *http.Request, model, bodyAgentID string) (*agentruntime.Agent, string, error) {
	candidates := []string{
		r.Header.Get("X-Fastclaw-Agent-Id"),
		bodyAgentID,
		model,
		s.defaultAgentID,
	}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if agent, ok := s.agents[candidate]; ok {
			return agent, candidate, nil
		}
	}
	return nil, "", fmt.Errorf("agent not found")
}

func (s *serverState) resolveSessionID(r *http.Request, bodySessionID string) string {
	for _, candidate := range []string{
		r.Header.Get("X-Fastclaw-Session-Key"),
		bodySessionID,
	} {
		candidate = strings.TrimSpace(candidate)
		if candidate != "" {
			return candidate
		}
	}
	return fmt.Sprintf("api-%d", time.Now().UnixNano())
}

func (s *serverState) authorized(r *http.Request) bool {
	if s.authToken == "" {
		return true
	}
	return r.Header.Get("Authorization") == "Bearer "+s.authToken
}

func splitMessages(messages []chatMessage) (userText string, systemPrompt string) {
	for _, message := range messages {
		switch message.Role {
		case "system":
			systemPrompt = message.Content
		case "user":
			userText = message.Content
		}
	}
	return userText, systemPrompt
}

func firstEnv(names ...string) string {
	for _, name := range names {
		if value := os.Getenv(name); value != "" {
			return value
		}
	}
	return ""
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}

func writeSSE(w http.ResponseWriter, value any) {
	data, _ := json.Marshal(value)
	fmt.Fprintf(w, "data: %s\n\n", data)
}

func strPtr(s string) *string { return &s }

type webChatRequest struct {
	AgentID   string   `json:"agentId"`
	SessionID string   `json:"sessionId"`
	Message   string   `json:"message"`
	ImageURLs []string `json:"imageUrls,omitempty"`
}

type chatCompletionRequest struct {
	Model     string        `json:"model"`
	AgentID   string        `json:"agent_id,omitempty"`
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
