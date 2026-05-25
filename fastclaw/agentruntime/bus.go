package agentruntime

import "github.com/fastclaw-ai/agentcore"

// ChannelMessageBus is the default MessageBus implementation using Go channels.
type ChannelMessageBus struct {
	inbound  chan agentcore.InboundMessage
	outbound chan agentcore.OutboundMessage
}

// NewChannelMessageBus creates a new channel-based message bus.
func NewChannelMessageBus() *ChannelMessageBus {
	return &ChannelMessageBus{
		inbound:  make(chan agentcore.InboundMessage, 100),
		outbound: make(chan agentcore.OutboundMessage, 100),
	}
}

func (b *ChannelMessageBus) PublishInbound(msg agentcore.InboundMessage) {
	select {
	case b.inbound <- msg:
	default:
		// Drop if full
	}
}

func (b *ChannelMessageBus) PublishOutbound(msg agentcore.OutboundMessage) {
	select {
	case b.outbound <- msg:
	default:
	}
}

func (b *ChannelMessageBus) InboundChan() <-chan agentcore.InboundMessage {
	return b.inbound
}

func (b *ChannelMessageBus) OutboundChan() <-chan agentcore.OutboundMessage {
	return b.outbound
}
