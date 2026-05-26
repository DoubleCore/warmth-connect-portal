package agentruntime

import (
	"context"
	"sync"

	"github.com/fastclaw-ai/agentcore"
)

// HookRegistry manages hook registrations and invocations.
type HookRegistry struct {
	mu    sync.RWMutex
	hooks map[agentcore.HookPoint][]agentcore.HookFunc
}

// NewHookRegistry creates a new hook registry.
func NewHookRegistry() *HookRegistry {
	return &HookRegistry{
		hooks: make(map[agentcore.HookPoint][]agentcore.HookFunc),
	}
}

// Register adds a hook function at the given hook point.
func (hr *HookRegistry) Register(point agentcore.HookPoint, fn agentcore.HookFunc) {
	hr.mu.Lock()
	defer hr.mu.Unlock()
	hr.hooks[point] = append(hr.hooks[point], fn)
}

// Run invokes all hooks registered at the given point.
func (hr *HookRegistry) Run(ctx context.Context, point agentcore.HookPoint, hc *agentcore.HookContext) {
	hr.mu.RLock()
	fns := hr.hooks[point]
	hr.mu.RUnlock()

	for _, fn := range fns {
		fn(ctx, hc)
	}
}

// Clear removes all hooks at the given point.
func (hr *HookRegistry) Clear(point agentcore.HookPoint) {
	hr.mu.Lock()
	defer hr.mu.Unlock()
	delete(hr.hooks, point)
}
