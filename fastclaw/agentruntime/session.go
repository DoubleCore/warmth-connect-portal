package agentruntime

import (
	"fmt"
	"sync"

	"github.com/fastclaw-ai/agentcore"
)

// ---------------------------------------------------------------------------
// In-memory session implementation (default when no external store is wired)
// ---------------------------------------------------------------------------

// InMemorySession is a simple in-memory conversation session.
type InMemorySession struct {
	mu       sync.Mutex
	key      string
	messages []agentcore.Message
}

func (s *InMemorySession) SessionKey() string { return s.key }

func (s *InMemorySession) Messages() []agentcore.Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	cp := make([]agentcore.Message, len(s.messages))
	copy(cp, s.messages)
	return cp
}

func (s *InMemorySession) Append(msg agentcore.Message) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.messages = append(s.messages, msg)
}

func (s *InMemorySession) SetMessages(msgs []agentcore.Message) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.messages = make([]agentcore.Message, len(msgs))
	copy(s.messages, msgs)
}

// ---------------------------------------------------------------------------
// In-memory session manager
// ---------------------------------------------------------------------------

// InMemorySessionManager manages sessions in memory.
type InMemorySessionManager struct {
	mu       sync.Mutex
	sessions map[string]*InMemorySession
}

// NewInMemorySessionManager creates a new in-memory session manager.
func NewInMemorySessionManager() *InMemorySessionManager {
	return &InMemorySessionManager{
		sessions: make(map[string]*InMemorySession),
	}
}

func (m *InMemorySessionManager) Get(channel, accountID, chatID, projectID string) agentcore.Session {
	key := sessionKey(channel, accountID, chatID, projectID)
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[key]; ok {
		return s
	}
	s := &InMemorySession{key: key}
	m.sessions[key] = s
	return s
}

func (m *InMemorySessionManager) SessionExists(key string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.sessions[key]
	return ok
}

func sessionKey(channel, accountID, chatID, projectID string) string {
	if projectID != "" {
		return fmt.Sprintf("%s:%s:%s:p:%s", channel, accountID, chatID, projectID)
	}
	return fmt.Sprintf("%s:%s:%s", channel, accountID, chatID)
}
