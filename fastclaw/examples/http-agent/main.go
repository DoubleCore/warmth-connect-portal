// Example: http-agent
//
// Demonstrates embedding the agent runtime into a standard HTTP server.
// This is the pattern you'd use in warmth-connect-portal or any other
// existing backend that wants to add AI agent capabilities.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/fastclaw-ai/agentcore"
	"github.com/fastclaw-ai/agentruntime"
	"github.com/fastclaw-ai/connector"
)

var factory *connector.AgentFactory

func main() {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		log.Fatal("Set OPENAI_API_KEY")
	}

	// Set up platform with defaults
	platform := connector.NewSimplePlatform()
	factory = connector.NewAgentFactory(platform)

	// Create a default agent
	factory.CreateAgent(agentcore.AgentConfig{
		ID:                "assistant",
		Model:             "openai/gpt-4o-mini",
		MaxTokens:         4096,
		Temperature:       0.7,
		MaxToolIterations: 15,
		Home:              "./data/assistant",
		Workspace:         "./data/workspace",
		Providers: map[string]agentcore.ProviderConfig{
			"openai": {APIKey: apiKey, APIBase: "https://api.openai.com/v1"},
		},
	})

	// HTTP routes
	http.HandleFunc("/api/chat", handleChat)
	http.HandleFunc("/api/chat/stream", handleChatStream)

	addr := ":8080"
	log.Printf("Agent HTTP server listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

type chatRequest struct {
	AgentID   string `json:"agent_id"`
	SessionID string `json:"session_id"`
	UserID    string `json:"user_id"`
	Message   string `json:"message"`
}

type chatResponse struct {
	Reply string `json:"reply"`
}

func handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "POST only", 405)
		return
	}

	var req chatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	agentID := req.AgentID
	if agentID == "" {
		agentID = "assistant"
	}

	agent, ok := factory.GetAgent(agentID)
	if !ok {
		http.Error(w, "agent not found", 404)
		return
	}

	msg := agentcore.InboundMessage{
		Channel: "http",
		ChatID:  req.SessionID,
		UserID:  req.UserID,
		Text:    req.Message,
		AgentID: agentID,
	}

	reply := agent.HandleMessage(r.Context(), msg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(chatResponse{Reply: reply})
}

func handleChatStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "POST only", 405)
		return
	}

	var req chatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	agentID := req.AgentID
	if agentID == "" {
		agentID = "assistant"
	}

	agent, ok := factory.GetAgent(agentID)
	if !ok {
		http.Error(w, "agent not found", 404)
		return
	}

	// Set up SSE
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

	msg := agentcore.InboundMessage{
		Channel: "http",
		ChatID:  req.SessionID,
		UserID:  req.UserID,
		Text:    req.Message,
		AgentID: agentID,
	}

	// Run agent in background
	done := make(chan string, 1)
	go func() {
		reply := agent.HandleMessageStream(ctx, msg, events)
		done <- reply
		close(events)
	}()

	// Stream events to client
	for ev := range events {
		data, _ := json.Marshal(ev)
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	// Final event with complete reply
	reply := <-done
	final, _ := json.Marshal(map[string]string{"type": "done", "content": reply})
	fmt.Fprintf(w, "data: %s\n\n", final)
	flusher.Flush()
}
