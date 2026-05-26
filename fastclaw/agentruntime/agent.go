// Package agentruntime provides the full ReAct agent engine.
//
// This package is the reusable core of FastClaw's agent system. It contains:
//   - The ReAct loop (iterative LLM → tool-call → result cycle)
//   - Built-in tool implementations (exec, file, web, delegate, etc.)
//   - LLM provider implementations (OpenAI-compatible, Anthropic)
//   - Session management
//   - Memory management
//   - System prompt construction
//   - Sub-agent delegation
//   - Hook system
//
// Usage:
//
//	prov := agentruntime.NewOpenAIProvider(apiKey, apiBase)
//	agent := agentruntime.NewAgent(agentruntime.AgentOptions{
//	    Config:   cfg,
//	    Provider: prov,
//	})
//	reply := agent.HandleMessage(ctx, msg)
package agentruntime

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/fastclaw-ai/agentcore"
)

// Agent is the ReAct agent loop — the core execution engine.
type Agent struct {
	name     string
	provider agentcore.Provider
	model    string

	maxTokens            int
	temperature          float64
	maxToolIterations    int
	maxParallelToolCalls int
	thinking             string

	homePath      string
	workspacePath string

	registry    *ToolRegistry
	sessions    agentcore.SessionManager
	memory      *Memory
	ctxBuilder  *ContextBuilder
	hooks       *HookRegistry
	bus         agentcore.MessageBus
	meter       agentcore.Meter
	ownerUserID string
	agentID     string

	sandboxPool agentcore.ExecutorPool

	turnCount int
}

// AgentOptions configures a new Agent.
type AgentOptions struct {
	// Config is the resolved agent configuration.
	Config agentcore.AgentConfig

	// Provider is the LLM provider to use.
	Provider agentcore.Provider

	// Bus is the optional message bus for async communication.
	// When nil, outbound messages are dropped silently.
	Bus agentcore.MessageBus

	// Sessions is the optional session manager.
	// When nil, an in-memory session manager is used.
	Sessions agentcore.SessionManager

	// Meter is the optional token meter.
	Meter agentcore.Meter

	// SandboxPool is the optional sandbox executor pool.
	SandboxPool agentcore.ExecutorPool

	// HomeDir is the FastClaw root directory (for skill resolution).
	HomeDir string

	// SkillDirs are additional directories to scan for skills.
	SkillDirs []string
}

// NewAgent creates a new Agent from options.
func NewAgent(opts AgentOptions) *Agent {
	cfg := opts.Config

	if cfg.MaxToolIterations == 0 {
		cfg.MaxToolIterations = 20
	}
	if cfg.MaxTokens == 0 {
		cfg.MaxTokens = 8192
	}
	if cfg.Temperature == 0 {
		cfg.Temperature = 0.7
	}

	registry := NewToolRegistry(cfg.Home, cfg.Workspace)
	memory := NewMemory(cfg.Home)

	sessions := opts.Sessions
	if sessions == nil {
		sessions = NewInMemorySessionManager()
	}

	hooks := NewHookRegistry()

	ctxBuilder := NewContextBuilder(cfg.Home, memory)
	if cfg.Thinking != "" {
		ctxBuilder.SetThinking(cfg.Thinking)
	}
	if cfg.Workspace != "" {
		ctxBuilder.SetWorkspace(cfg.Workspace)
	}
	if skillsSummary := BuildSkillsSummary(cfg.Home, opts.SkillDirs); skillsSummary != "" {
		ctxBuilder.SetSkillsSummary(skillsSummary)
	}

	ag := &Agent{
		name:                 cfg.ID,
		provider:             opts.Provider,
		model:                cfg.Model,
		maxTokens:            cfg.MaxTokens,
		temperature:          cfg.Temperature,
		maxToolIterations:    cfg.MaxToolIterations,
		maxParallelToolCalls: cfg.MaxParallelToolCalls,
		thinking:             cfg.Thinking,
		homePath:             cfg.Home,
		workspacePath:        cfg.Workspace,
		registry:             registry,
		sessions:             sessions,
		memory:               memory,
		ctxBuilder:           ctxBuilder,
		hooks:                hooks,
		bus:                  opts.Bus,
		meter:                opts.Meter,
		sandboxPool:          opts.SandboxPool,
		ownerUserID:          cfg.UserID,
		agentID:              cfg.ID,
	}

	// Register built-in tools
	RegisterExecTool(registry, cfg.Sandbox.Enabled)
	RegisterFileTool(registry, cfg.Home, cfg.Workspace)
	RegisterWebFetchTool(registry)

	return ag
}

// Name returns the agent's identifier.
func (a *Agent) Name() string { return a.name }

// OwnerUserID returns the agent's owning user ID.
func (a *Agent) OwnerUserID() string { return a.ownerUserID }

// Registry returns the tool registry for external tool registration.
func (a *Agent) Registry() *ToolRegistry { return a.registry }

// Hooks returns the hook registry for external hook registration.
func (a *Agent) Hooks() *HookRegistry { return a.hooks }

// SetSandboxPool wires the sandbox executor pool.
func (a *Agent) SetSandboxPool(p agentcore.ExecutorPool) {
	a.sandboxPool = p
	if a.ctxBuilder != nil {
		a.ctxBuilder.sandboxEnabled = p != nil
	}
}

// HandleMessage processes an inbound message and returns the agent's reply.
// This is the main entry point for the ReAct loop.
func (a *Agent) HandleMessage(ctx context.Context, msg agentcore.InboundMessage) string {
	// Bind session
	sess := a.sessions.Get(msg.Channel, msg.AccountID, msg.ChatID, msg.ProjectID)

	// Build system prompt
	systemPrompt := a.ctxBuilder.Build(ctx)

	// Append user message
	userMsg := agentcore.Message{
		Role:    "user",
		Content: msg.Text,
	}
	sess.Append(userMsg)

	// Get conversation history
	messages := make([]agentcore.Message, 0, len(sess.Messages())+1)
	messages = append(messages, agentcore.Message{
		Role:    "system",
		Content: systemPrompt,
	})
	messages = append(messages, sess.Messages()...)

	// Get available tools
	tools := a.registry.Tools()

	// Run hooks: BeforeModelCall
	a.hooks.Run(ctx, agentcore.BeforeModelCall, &agentcore.HookContext{
		AgentID:    a.agentID,
		SessionKey: sess.SessionKey(),
		Source:     msg.Source,
		Messages:   messages,
	})

	// ReAct loop
	var finalContent string
	for i := 0; i < a.maxToolIterations; i++ {
		resp, err := a.provider.Chat(ctx, messages, tools, a.model, a.maxTokens, a.temperature)
		if err != nil {
			slog.Error("LLM call failed", "agent", a.name, "error", err)
			finalContent = fmt.Sprintf("Error: %v", err)
			EmitEvent(ctx, ChatEvent{
				Type: "error",
				Data: map[string]any{"message": finalContent},
			})
			break
		}

		// Run hooks: AfterModelCall
		a.hooks.Run(ctx, agentcore.AfterModelCall, &agentcore.HookContext{
			AgentID:    a.agentID,
			SessionKey: sess.SessionKey(),
			Source:     msg.Source,
			Response:   resp,
		})

		// Record token usage
		a.meterTokens(ctx, sess.SessionKey(), resp.Usage)

		// No tool calls — we have the final answer
		if !resp.HasToolCalls() {
			finalContent = resp.Content
			if finalContent != "" {
				EmitEvent(ctx, ChatEvent{
					Type: "content_delta",
					Data: map[string]any{"delta": finalContent},
				})
				EmitEvent(ctx, ChatEvent{
					Type: "content",
					Data: map[string]any{"content": finalContent},
				})
			}
			sess.Append(agentcore.Message{
				Role:         "assistant",
				Content:      resp.Content,
				Thinking:     resp.Thinking,
				RawAssistant: resp.RawAssistant,
			})
			break
		}

		// Append assistant message with tool calls
		sess.Append(agentcore.Message{
			Role:         "assistant",
			Content:      resp.Content,
			ToolCalls:    resp.ToolCalls,
			Thinking:     resp.Thinking,
			RawAssistant: resp.RawAssistant,
		})
		messages = append(messages, agentcore.Message{
			Role:         "assistant",
			Content:      resp.Content,
			ToolCalls:    resp.ToolCalls,
			RawAssistant: resp.RawAssistant,
		})

		// Execute tool calls
		for _, tc := range resp.ToolCalls {
			EmitEvent(ctx, ChatEvent{
				Type: "tool_call",
				Data: map[string]any{
					"id":        tc.ID,
					"name":      tc.Function.Name,
					"arguments": tc.Function.Arguments,
				},
			})

			// Run hooks: BeforeToolCall
			a.hooks.Run(ctx, agentcore.BeforeToolCall, &agentcore.HookContext{
				AgentID:    a.agentID,
				SessionKey: sess.SessionKey(),
				ToolName:   tc.Function.Name,
				ToolArgs:   json.RawMessage(tc.Function.Arguments),
			})

			result, err := a.registry.Call(ctx, tc.Function.Name, json.RawMessage(tc.Function.Arguments))
			if err != nil {
				result = fmt.Sprintf("Error: %v", err)
			}
			EmitEvent(ctx, ChatEvent{
				Type: "tool_result",
				Data: map[string]any{
					"id":     tc.ID,
					"name":   tc.Function.Name,
					"result": result,
				},
			})

			// Run hooks: AfterToolCall
			a.hooks.Run(ctx, agentcore.AfterToolCall, &agentcore.HookContext{
				AgentID:    a.agentID,
				SessionKey: sess.SessionKey(),
				ToolName:   tc.Function.Name,
				ToolArgs:   json.RawMessage(tc.Function.Arguments),
				ToolResult: result,
			})

			toolMsg := agentcore.Message{
				Role:       "tool",
				Content:    result,
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			}
			sess.Append(toolMsg)
			messages = append(messages, toolMsg)
		}
	}

	// Run hooks: PostTurn
	a.hooks.Run(ctx, agentcore.PostTurn, &agentcore.HookContext{
		AgentID:    a.agentID,
		SessionKey: sess.SessionKey(),
		Source:     msg.Source,
	})

	a.turnCount++
	return finalContent
}

// HandleMessageStream processes a message with real-time streaming events.
func (a *Agent) HandleMessageStream(ctx context.Context, msg agentcore.InboundMessage, events chan<- ChatEvent) string {
	ctx = ContextWithChatEvents(ctx, events)
	return a.HandleMessage(ctx, msg)
}

// meterTokens records token usage if a meter is configured.
func (a *Agent) meterTokens(ctx context.Context, sessionKey string, u agentcore.Usage) {
	if a.meter == nil {
		return
	}
	prov, mdl := SplitProviderModel(a.model)
	_ = a.meter.RecordTokens(ctx, a.ownerUserID, a.agentID, sessionKey, prov, mdl,
		agentcore.Tokens{
			Input:         u.InputTokens,
			Output:        u.OutputTokens,
			CacheRead:     u.CacheReadTokens,
			CacheCreation: u.CacheCreationTokens,
		})
}

// SplitProviderModel splits "provider/model" into its two parts.
func SplitProviderModel(s string) (provider, model string) {
	if idx := strings.Index(s, "/"); idx >= 0 {
		return s[:idx], s[idx+1:]
	}
	return "", s
}
