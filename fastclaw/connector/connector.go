// Package connector bridges the reusable agentruntime with platform-specific
// infrastructure (databases, IM channels, HTTP APIs, etc.).
//
// This is the "glue" layer. It adapts platform interfaces (Store, Channels,
// Auth) into the agentcore interfaces that agentruntime expects. Third-party
// integrators implement this layer to plug the agent engine into their own
// backend.
//
// Architecture:
//
//	┌─────────────────────────────────────────────────────────┐
//	│  Your Application (HTTP server, CLI, bot, etc.)         │
//	├─────────────────────────────────────────────────────────┤
//	│  connector (this package)                               │
//	│  - Adapts your DB/store to agentcore.SessionManager     │
//	│  - Adapts your blob store to agentcore.WorkspaceStore   │
//	│  - Routes IM messages to/from agentcore.MessageBus      │
//	│  - Wires token metering                                 │
//	├─────────────────────────────────────────────────────────┤
//	│  agentruntime                                           │
//	│  - ReAct loop, tools, providers, sessions, memory       │
//	├─────────────────────────────────────────────────────────┤
//	│  agentcore (interfaces only)                            │
//	└─────────────────────────────────────────────────────────┘
package connector

import (
	"context"
	"log/slog"
	"strings"

	"github.com/fastclaw-ai/agentcore"
	"github.com/fastclaw-ai/agentruntime"
)

// Platform defines the interface that a hosting platform must implement
// to integrate with the agent runtime.
type Platform interface {
	// SessionStore returns a session manager backed by the platform's database.
	SessionStore() agentcore.SessionManager

	// Meter returns the token usage meter (may return nil for no metering).
	Meter() agentcore.Meter

	// MessageBus returns the platform's message bus.
	MessageBus() agentcore.MessageBus

	// SandboxPool returns the sandbox executor pool (may return nil).
	SandboxPool() agentcore.ExecutorPool
}

// AgentFactory creates and manages agents using the platform's infrastructure.
type AgentFactory struct {
	platform Platform
	agents   map[string]*agentruntime.Agent
}

// NewAgentFactory creates a new agent factory.
func NewAgentFactory(platform Platform) *AgentFactory {
	return &AgentFactory{
		platform: platform,
		agents:   make(map[string]*agentruntime.Agent),
	}
}

// CreateAgent creates a new agent with the given configuration.
func (f *AgentFactory) CreateAgent(cfg agentcore.AgentConfig) *agentruntime.Agent {
	// Resolve provider
	prov := resolveProvider(cfg)

	agent := agentruntime.NewAgent(agentruntime.AgentOptions{
		Config:      cfg,
		Provider:    prov,
		Bus:         f.platform.MessageBus(),
		Sessions:    f.platform.SessionStore(),
		Meter:       f.platform.Meter(),
		SandboxPool: f.platform.SandboxPool(),
	})

	f.agents[cfg.ID] = agent
	slog.Info("agent created", "id", cfg.ID, "model", cfg.Model)
	return agent
}

// GetAgent returns an agent by ID.
func (f *AgentFactory) GetAgent(id string) (*agentruntime.Agent, bool) {
	ag, ok := f.agents[id]
	return ag, ok
}

// RemoveAgent removes an agent.
func (f *AgentFactory) RemoveAgent(id string) {
	delete(f.agents, id)
}

// HandleInbound routes an inbound message to the appropriate agent.
func (f *AgentFactory) HandleInbound(ctx context.Context, msg agentcore.InboundMessage) string {
	agent, ok := f.agents[msg.AgentID]
	if !ok {
		slog.Warn("agent not found for inbound message", "agentID", msg.AgentID)
		return ""
	}
	return agent.HandleMessage(ctx, msg)
}

// resolveProvider creates an LLM provider from the agent config.
func resolveProvider(cfg agentcore.AgentConfig) agentcore.Provider {
	// Parse "provider/model" format (e.g. "openai/gpt-4o-mini")
	provKey := ""
	if idx := strings.Index(cfg.Model, "/"); idx > 0 {
		provKey = cfg.Model[:idx]
	}

	// Look up provider config by key
	if provKey != "" {
		if pc, ok := cfg.Providers[provKey]; ok && pc.APIKey != "" {
			if pc.APIType == "anthropic-messages" {
				return agentruntime.NewAnthropicProvider(pc.APIKey, pc.APIBase)
			}
			return agentruntime.NewOpenAIProvider(pc.APIKey, pc.APIBase)
		}
	}

	// Fallback: use first available provider
	for _, pc := range cfg.Providers {
		if pc.APIKey != "" {
			if pc.APIType == "anthropic-messages" {
				return agentruntime.NewAnthropicProvider(pc.APIKey, pc.APIBase)
			}
			return agentruntime.NewOpenAIProvider(pc.APIKey, pc.APIBase)
		}
	}

	// Last resort: return a provider that errors on call
	return &noopProvider{}
}

// noopProvider returns errors for all calls (used when no provider is configured).
type noopProvider struct{}

func (p *noopProvider) Chat(ctx context.Context, messages []agentcore.Message, tools []agentcore.Tool, model string, maxTokens int, temperature float64) (*agentcore.Response, error) {
	return nil, ErrNoProvider
}

func (p *noopProvider) ChatStream(ctx context.Context, messages []agentcore.Message, tools []agentcore.Tool, model string, maxTokens int, temperature float64) (*agentcore.StreamReader, error) {
	return nil, ErrNoProvider
}
