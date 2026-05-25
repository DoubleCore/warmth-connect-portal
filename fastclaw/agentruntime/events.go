package agentruntime

import "context"

// ChatEvent represents a real-time event emitted during agent processing.
type ChatEvent struct {
	Type string         `json:"type"`
	Data map[string]any `json:"data,omitempty"`
}

type chatEventsKey struct{}

// ContextWithChatEvents attaches a chat events channel to the context.
func ContextWithChatEvents(ctx context.Context, ch chan<- ChatEvent) context.Context {
	return context.WithValue(ctx, chatEventsKey{}, ch)
}

// EmitEvent sends a chat event to the context's event channel (if any).
func EmitEvent(ctx context.Context, ev ChatEvent) {
	if ch, ok := ctx.Value(chatEventsKey{}).(chan<- ChatEvent); ok && ch != nil {
		select {
		case ch <- ev:
		default:
			// Drop if channel is full — non-blocking
		}
	}
}
