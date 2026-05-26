package agentcore

// ---------------------------------------------------------------------------
// Message Bus — async IPC between channels and agent runtime
// ---------------------------------------------------------------------------

// Source identifies what produced an InboundMessage.
const (
	SourceUser        = ""
	SourceCron        = "cron"
	SourceHeartbeat   = "heartbeat"
	SourceSubAgent    = "subagent"
	SourceGoalContext = "goal_context"
)

// InboundMessage represents a message received from any channel.
type InboundMessage struct {
	Channel         string
	AccountID       string
	ChatID          string
	ProjectID       string
	UserID          string
	OwnerUserID     string
	AgentID         string
	MessageID       string
	Text            string
	PeerKind        string
	SenderName      string
	SenderAvatarURL string
	Mentions        []string
	IsBotMessage    bool
	PhotoURL        string
	PhotoURLs       []string
	ReplyToMsgID    string
	Params          map[string]any
	Source          string
}

// OutboundMessage represents a message to be sent to a channel.
type OutboundMessage struct {
	Channel      string
	AccountID    string
	AgentID      string
	ChatID       string
	Text         string
	ReplyToMsgID string
	ParseMode    string
	Buttons      [][]OutboundButton
	EditMsgID    string
	MediaPaths   []string
	MediaItems   []MediaItem
}

// OutboundButton represents a button in an inline keyboard.
type OutboundButton struct {
	Text         string
	CallbackData string
	URL          string
}

// MediaItem is an attachment with resolved bytes.
type MediaItem struct {
	Filename    string
	ContentType string
	Bytes       []byte
}

// MessageBus is the async message queue interface.
type MessageBus interface {
	// PublishInbound sends a message into the agent runtime.
	PublishInbound(msg InboundMessage)
	// PublishOutbound sends a message out to a channel.
	PublishOutbound(msg OutboundMessage)
	// InboundChan returns the channel for reading inbound messages.
	InboundChan() <-chan InboundMessage
	// OutboundChan returns the channel for reading outbound messages.
	OutboundChan() <-chan OutboundMessage
}
