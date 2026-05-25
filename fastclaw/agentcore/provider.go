// Package agentcore defines the core interfaces and types for the FastClaw
// agent runtime. This package has zero heavy dependencies and can be imported
// by any Go project that wants to integrate with or extend the agent system.
//
// Layers:
//   - agentcore (this package): interfaces + types only
//   - agentruntime: full ReAct engine + built-in tools + LLM provider implementations
//   - platform (internal/): gateway, store, API, channels, dashboard
package agentcore

import (
	"context"
	"encoding/json"
	"io"
	"time"
)

// ---------------------------------------------------------------------------
// Provider — LLM abstraction
// ---------------------------------------------------------------------------

// Provider is the LLM provider interface. Implementations handle the
// wire protocol (OpenAI, Anthropic, etc.) and return a unified response.
type Provider interface {
	Chat(ctx context.Context, messages []Message, tools []Tool, model string, maxTokens int, temperature float64) (*Response, error)
	ChatStream(ctx context.Context, messages []Message, tools []Tool, model string, maxTokens int, temperature float64) (*StreamReader, error)
}

// Message represents a chat message in the conversation history.
type Message struct {
	Role         string        `json:"role"`
	Content      string        `json:"content,omitempty"`
	ContentParts []ContentPart `json:"content_parts,omitempty"`
	ToolCalls    []ToolCall    `json:"tool_calls,omitempty"`
	ToolCallID   string        `json:"tool_call_id,omitempty"`
	Name         string        `json:"name,omitempty"`
	Thinking     string        `json:"thinking,omitempty"`
	Timestamp    int64         `json:"timestamp,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
	RawAssistant json.RawMessage `json:"_raw,omitempty"`
	Origin       string        `json:"origin,omitempty"`
}

// ContentPart represents a part of multimodal content.
type ContentPart struct {
	Type     string    `json:"type"`
	Text     string    `json:"text,omitempty"`
	ImageURL *ImageURL `json:"image_url,omitempty"`
}

// ImageURL represents an image URL for vision messages.
type ImageURL struct {
	URL    string `json:"url"`
	Detail string `json:"detail,omitempty"`
}

// ToolCall represents a function call requested by the model.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall contains the function name and arguments.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// Tool describes a tool available to the model.
type Tool struct {
	Type     string       `json:"type"`
	Function ToolFunction `json:"function"`
}

// ToolFunction describes a function tool.
type ToolFunction struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

// Usage reports token counts returned by the provider.
type Usage struct {
	InputTokens         int
	OutputTokens        int
	CacheReadTokens     int
	CacheCreationTokens int
}

// Response is the result of a Chat call.
type Response struct {
	Content      string
	ToolCalls    []ToolCall
	Thinking     string
	Usage        Usage
	RawAssistant json.RawMessage
}

// HasToolCalls returns true if the response contains tool calls.
func (r *Response) HasToolCalls() bool {
	return len(r.ToolCalls) > 0
}

// StreamChunk represents a single chunk from a streaming response.
type StreamChunk struct {
	Content           string
	ToolCalls         []ToolCall
	Done              bool
	Thinking          string
	ThinkingSignature string
	Usage             Usage
	RawAssistant      json.RawMessage
}

// StreamReader reads streaming chunks from an LLM response.
type StreamReader struct {
	ch  chan StreamChunk
	err error
}

// NewStreamReader creates a new StreamReader with the given channel.
func NewStreamReader(ch chan StreamChunk) *StreamReader {
	return &StreamReader{ch: ch}
}

// Next returns the next chunk and whether more chunks are available.
func (r *StreamReader) Next() (StreamChunk, bool) {
	chunk, ok := <-r.ch
	return chunk, ok
}

// Err returns any error that occurred during streaming.
func (r *StreamReader) Err() error { return r.err }

// SetErr sets the error on the stream reader.
func (r *StreamReader) SetErr(err error) { r.err = err }

// ---------------------------------------------------------------------------
// Sandbox — execution isolation
// ---------------------------------------------------------------------------

// Executor abstracts a sandboxed execution environment.
type Executor interface {
	Exec(ctx context.Context, command string, timeout time.Duration) (string, error)
	ReadFile(ctx context.Context, path string) (string, error)
	WriteFile(ctx context.Context, path, content string) (string, error)
	ListDir(ctx context.Context, path string) (string, error)
	Backend() string
	Close() error
}

// ExecutorPool manages per-(agent, project, session) sandbox lifecycles.
type ExecutorPool interface {
	Get(ctx context.Context, agentID, projectID, sessionID string) (Executor, error)
	Release(agentID, projectID, sessionID string) error
	CloseAll()
	Backend() string
}

// ---------------------------------------------------------------------------
// Workspace — durable artifact store
// ---------------------------------------------------------------------------

// WorkspaceStore is the durable blob store for agent-generated artifacts.
type WorkspaceStore interface {
	Put(ctx context.Context, agentID, projectID, sessionID, path string, r io.Reader, size int64, contentType string) error
	Get(ctx context.Context, agentID, projectID, sessionID, path string) (io.ReadCloser, error)
	List(ctx context.Context, agentID, projectID, sessionID string) ([]ObjectInfo, error)
	Delete(ctx context.Context, agentID, projectID, sessionID, path string) error
	SignedURL(ctx context.Context, agentID, projectID, sessionID, path string, ttl time.Duration) (string, error)
}

// ObjectInfo describes one stored object.
type ObjectInfo struct {
	Path        string
	Size        int64
	ContentType string
	ModTime     time.Time
}

// ---------------------------------------------------------------------------
// Token Metering
// ---------------------------------------------------------------------------

// Tokens is one Chat call's token accounting.
type Tokens struct {
	Input         int
	Output        int
	CacheRead     int
	CacheCreation int
}

// Meter records LLM token consumption.
type Meter interface {
	RecordTokens(ctx context.Context, userID, agentID, sessionKey, provider, model string, t Tokens) error
	Close() error
}
