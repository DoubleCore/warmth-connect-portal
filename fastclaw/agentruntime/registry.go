package agentruntime

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/fastclaw-ai/agentcore"
)

// registeredTool holds a tool's metadata and implementation.
type registeredTool struct {
	name        string
	description string
	schema      interface{}
	fn          agentcore.ToolFunc
	source      agentcore.ToolSource
}

// ToolRegistry holds all registered tools for an agent.
type ToolRegistry struct {
	mu         sync.RWMutex
	tools      map[string]registeredTool
	systemRoot string
	userRoot   string

	// Per-turn state
	sessionID  string
	projectID  string
	executor   agentcore.Executor
	sandboxReq bool
}

// NewToolRegistry creates a new tool registry.
func NewToolRegistry(systemRoot, userRoot string) *ToolRegistry {
	return &ToolRegistry{
		tools:      make(map[string]registeredTool),
		systemRoot: systemRoot,
		userRoot:   userRoot,
	}
}

// Register adds a tool to the registry.
func (r *ToolRegistry) Register(name, description string, schema interface{}, fn agentcore.ToolFunc) {
	r.RegisterWithSource(name, description, schema, fn, agentcore.SourceBuiltin)
}

// RegisterWithSource adds a tool with an explicit source tag.
func (r *ToolRegistry) RegisterWithSource(name, description string, schema interface{}, fn agentcore.ToolFunc, source agentcore.ToolSource) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tools[name] = registeredTool{
		name:        name,
		description: description,
		schema:      schema,
		fn:          fn,
		source:      source,
	}
}

// Unregister removes a tool from the registry.
func (r *ToolRegistry) Unregister(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.tools, name)
}

// Tools returns all registered tools as provider-compatible Tool definitions.
func (r *ToolRegistry) Tools() []agentcore.Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]agentcore.Tool, 0, len(r.tools))
	for _, t := range r.tools {
		out = append(out, agentcore.Tool{
			Type: "function",
			Function: agentcore.ToolFunction{
				Name:        t.name,
				Description: t.description,
				Parameters:  t.schema,
			},
		})
	}
	return out
}

// Call invokes a tool by name.
func (r *ToolRegistry) Call(ctx context.Context, name string, args json.RawMessage) (string, error) {
	r.mu.RLock()
	t, ok := r.tools[name]
	r.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("tool %q not found", name)
	}
	return t.fn(ctx, args)
}

// Has returns true if a tool with the given name is registered.
func (r *ToolRegistry) Has(name string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.tools[name]
	return ok
}

// SetSessionID sets the per-turn session ID.
func (r *ToolRegistry) SetSessionID(id string) { r.sessionID = id }

// SetProjectID sets the per-turn project ID.
func (r *ToolRegistry) SetProjectID(id string) { r.projectID = id }

// SetExecutor sets the per-turn sandbox executor.
func (r *ToolRegistry) SetExecutor(ex agentcore.Executor) { r.executor = ex }

// SetSandboxRequired marks whether sandbox is required.
func (r *ToolRegistry) SetSandboxRequired(req bool) { r.sandboxReq = req }

// Executor returns the current sandbox executor (may be nil).
func (r *ToolRegistry) Executor() agentcore.Executor { return r.executor }

// SandboxRequired returns whether sandbox execution is required.
func (r *ToolRegistry) SandboxRequired() bool { return r.sandboxReq }
