package agentruntime

import (
	"os"
	"path/filepath"
	"strings"
)

// Memory manages the agent's long-term memory (MEMORY.md).
type Memory struct {
	homePath string
}

// NewMemory creates a new Memory instance.
func NewMemory(homePath string) *Memory {
	return &Memory{homePath: homePath}
}

// Load reads the MEMORY.md file and returns its content.
func (m *Memory) Load() string {
	path := filepath.Join(m.homePath, "MEMORY.md")
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// Save writes content to the MEMORY.md file.
func (m *Memory) Save(content string) error {
	path := filepath.Join(m.homePath, "MEMORY.md")
	return os.WriteFile(path, []byte(content), 0o644)
}

// Append adds content to the end of MEMORY.md.
func (m *Memory) Append(content string) error {
	existing := m.Load()
	if existing != "" {
		content = existing + "\n\n" + content
	}
	return m.Save(content)
}
