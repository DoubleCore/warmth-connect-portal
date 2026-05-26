package agentcore

import (
	"context"
	"encoding/json"
)

// ---------------------------------------------------------------------------
// Tool System
// ---------------------------------------------------------------------------

// ToolFunc is a function that executes a tool with JSON arguments.
type ToolFunc func(ctx context.Context, args json.RawMessage) (string, error)

// ToolSource indicates where a tool was registered from.
type ToolSource int

const (
	SourceBuiltin ToolSource = iota
	SourceMCP
	SourcePlugin
)

// ToolRegistry is the interface for registering and managing tools.
type ToolRegistry interface {
	// Register adds a tool to the registry.
	Register(name, description string, schema interface{}, fn ToolFunc)
	// RegisterWithSource adds a tool with an explicit source tag.
	RegisterWithSource(name, description string, schema interface{}, fn ToolFunc, source ToolSource)
	// Unregister removes a tool from the registry.
	Unregister(name string)
	// Tools returns all registered tools as provider-compatible Tool definitions.
	Tools() []Tool
	// Call invokes a tool by name with the given arguments.
	Call(ctx context.Context, name string, args json.RawMessage) (string, error)
	// Has returns true if a tool with the given name is registered.
	Has(name string) bool
}

// SubAgentSpawner creates and runs sub-agents for task delegation.
type SubAgentSpawner interface {
	SpawnSubAgent(ctx context.Context, parentAgentID, task string, maxIterations int) (string, error)
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

// Session represents a conversation session.
type Session interface {
	// SessionKey returns the unique key for this session.
	SessionKey() string
	// Messages returns the conversation history.
	Messages() []Message
	// Append adds a message to the session.
	Append(msg Message)
	// SetMessages replaces the entire message history.
	SetMessages(msgs []Message)
}

// SessionManager manages conversation sessions.
type SessionManager interface {
	// Get returns or creates a session for the given coordinates.
	Get(channel, accountID, chatID, projectID string) Session
	// SessionExists checks if a session with the given key exists.
	SessionExists(key string) bool
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

// MemoryStore provides persistent storage for agent identity files
// (SOUL.md, IDENTITY.md, etc.) backed by a database rather than filesystem.
type MemoryStore interface {
	// ReadFile reads an agent identity file from the store.
	ReadFile(ctx context.Context, agentID, userID, filename string) (string, error)
	// WriteFile writes an agent identity file to the store.
	WriteFile(ctx context.Context, agentID, userID, filename, content string) error
}

// ---------------------------------------------------------------------------
// Hook System
// ---------------------------------------------------------------------------

// HookPoint identifies when a hook fires.
type HookPoint int

const (
	BeforeModelCall HookPoint = iota
	AfterModelCall
	BeforeToolCall
	AfterToolCall
	PostTurn
)

// HookContext carries state available to hook functions.
type HookContext struct {
	AgentID        string
	SessionKey     string
	Source         string
	IsPlanMode     bool
	GoalSessionKey string
	Messages       []Message
	Response       *Response
	ToolName       string
	ToolArgs       json.RawMessage
	ToolResult     string
}

// HookFunc is a function invoked at a hook point.
type HookFunc func(ctx context.Context, hc *HookContext)
