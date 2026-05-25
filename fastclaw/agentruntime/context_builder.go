package agentruntime

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// ContextBuilder constructs the system prompt for an agent.
type ContextBuilder struct {
	homePath       string
	workspacePath  string
	memory         *Memory
	skillsSummary  string
	thinking       string
	sandboxEnabled bool
	sandboxBackend string
	groupContext   *GroupContext
}

// GroupContext holds group chat awareness state.
type GroupContext struct {
	GroupName string
	Members   []string
	BotName   string
}

// NewContextBuilder creates a new system prompt builder.
func NewContextBuilder(homePath string, memory *Memory) *ContextBuilder {
	return &ContextBuilder{
		homePath: homePath,
		memory:   memory,
	}
}

// SetWorkspace sets the workspace path for the context builder.
func (cb *ContextBuilder) SetWorkspace(path string) {
	cb.workspacePath = path
}

// SetThinking sets the thinking mode.
func (cb *ContextBuilder) SetThinking(mode string) {
	cb.thinking = mode
}

// SetSkillsSummary sets the skills catalog summary.
func (cb *ContextBuilder) SetSkillsSummary(summary string) {
	cb.skillsSummary = summary
}

// SetGroupContext sets group chat context.
func (cb *ContextBuilder) SetGroupContext(gc *GroupContext) {
	cb.groupContext = gc
}

// Build constructs the full system prompt.
func (cb *ContextBuilder) Build(_ context.Context) string {
	var parts []string

	// 1. Runtime environment
	parts = append(parts, cb.buildRuntimeInfo())

	// 2. Sandbox description (if enabled)
	if cb.sandboxEnabled {
		parts = append(parts, cb.buildSandboxInfo())
	}

	// 3. Identity files (SOUL.md, IDENTITY.md, etc.)
	parts = append(parts, cb.buildIdentityFiles()...)

	// 4. Skills summary
	if cb.skillsSummary != "" {
		parts = append(parts, fmt.Sprintf("<skill_catalog>\n%s\n</skill_catalog>", cb.skillsSummary))
	}

	// 5. Long-term memory
	if mem := cb.memory.Load(); mem != "" {
		parts = append(parts, fmt.Sprintf("<long_term_memory>\n%s\n</long_term_memory>", mem))
	}

	// 6. Group context
	if cb.groupContext != nil {
		parts = append(parts, cb.buildGroupContext())
	}

	return strings.Join(parts, "\n\n")
}

func (cb *ContextBuilder) buildRuntimeInfo() string {
	now := time.Now()
	return fmt.Sprintf(`Current time: %s
OS: %s/%s
Working directory: %s`,
		now.Format("2006-01-02 15:04:05 MST"),
		runtime.GOOS, runtime.GOARCH,
		cb.workspacePath)
}

func (cb *ContextBuilder) buildSandboxInfo() string {
	return `You have access to a sandboxed execution environment.
- Files are stored in /workspace
- You can install packages and run code safely
- The sandbox is isolated from the host system`
}

func (cb *ContextBuilder) buildIdentityFiles() []string {
	var parts []string
	// Load identity files in priority order
	files := []string{
		"AGENTS.md", "BOOTSTRAP.md", "HEARTBEAT.md",
		"SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md",
	}
	for _, f := range files {
		content := cb.readIdentityFile(f)
		if content != "" {
			parts = append(parts, content)
		}
	}
	return parts
}

func (cb *ContextBuilder) readIdentityFile(name string) string {
	path := filepath.Join(cb.homePath, name)
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	content := strings.TrimSpace(string(data))
	if content == "" {
		return ""
	}
	return content
}

func (cb *ContextBuilder) buildGroupContext() string {
	gc := cb.groupContext
	return fmt.Sprintf(`You are in a group chat named "%s".
Your name in this chat is "%s".
Other members: %s`,
		gc.GroupName, gc.BotName, strings.Join(gc.Members, ", "))
}
