package connector

import (
	"github.com/fastclaw-ai/agentcore"
	"github.com/fastclaw-ai/agentruntime"
)

// ---------------------------------------------------------------------------
// Adapter helpers — convert between platform-specific types and agentcore
// ---------------------------------------------------------------------------

// SimplePlatform is a convenience implementation of Platform for quick setup.
type SimplePlatform struct {
	sessions    agentcore.SessionManager
	meter       agentcore.Meter
	bus         agentcore.MessageBus
	sandboxPool agentcore.ExecutorPool
}

// NewSimplePlatform creates a platform with sensible defaults.
// Pass nil for any component to use the built-in default.
func NewSimplePlatform(opts ...PlatformOption) *SimplePlatform {
	p := &SimplePlatform{}
	for _, opt := range opts {
		opt(p)
	}
	// Wire defaults for nil components
	if p.sessions == nil {
		p.sessions = agentruntime.NewInMemorySessionManager()
	}
	if p.bus == nil {
		p.bus = agentruntime.NewChannelMessageBus()
	}
	return p
}

func (p *SimplePlatform) SessionStore() agentcore.SessionManager { return p.sessions }
func (p *SimplePlatform) Meter() agentcore.Meter                 { return p.meter }
func (p *SimplePlatform) MessageBus() agentcore.MessageBus       { return p.bus }
func (p *SimplePlatform) SandboxPool() agentcore.ExecutorPool    { return p.sandboxPool }

// PlatformOption configures a SimplePlatform.
type PlatformOption func(*SimplePlatform)

// WithSessions sets the session manager.
func WithSessions(sm agentcore.SessionManager) PlatformOption {
	return func(p *SimplePlatform) { p.sessions = sm }
}

// WithMeter sets the token meter.
func WithMeter(m agentcore.Meter) PlatformOption {
	return func(p *SimplePlatform) { p.meter = m }
}

// WithBus sets the message bus.
func WithBus(b agentcore.MessageBus) PlatformOption {
	return func(p *SimplePlatform) { p.bus = b }
}

// WithSandbox sets the sandbox pool.
func WithSandbox(pool agentcore.ExecutorPool) PlatformOption {
	return func(p *SimplePlatform) { p.sandboxPool = pool }
}
