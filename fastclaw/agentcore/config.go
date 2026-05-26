package agentcore

// ---------------------------------------------------------------------------
// Agent Configuration Types
// ---------------------------------------------------------------------------

// AgentConfig is the fully resolved configuration for a single agent.
// This is the input to creating an Agent instance.
type AgentConfig struct {
	ID                   string
	UserID               string
	Home                 string // agent metadata dir (SOUL.md, etc.)
	Workspace            string // working dir for user-facing artifacts
	Model                string // "provider/model" format
	MaxTokens            int
	Temperature          float64
	MaxToolIterations    int
	MaxParallelToolCalls int
	Thinking             string
	Skills               SkillsConfig
	MCPServers           map[string]MCPServerConfig
	Sandbox              SandboxConfig
	PolicyPreset         string
	ToolProviders        map[string]ToolProviderConfig
	Tools                map[string]ToolCategoryConfig
	Providers            map[string]ProviderConfig
	Admins               map[string][]string
}

// SkillsConfig controls which skills are loaded for an agent.
type SkillsConfig struct {
	Disabled   []string `json:"disabled,omitempty"`
	AlwaysLoad []string `json:"alwaysLoad,omitempty"`
}

// MCPServerConfig holds configuration for a single MCP server.
type MCPServerConfig struct {
	Type    string            `json:"type"`
	URL     string            `json:"url,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Command string            `json:"command,omitempty"`
	Args    []string          `json:"args,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
}

// SandboxConfig holds sandbox configuration.
type SandboxConfig struct {
	Enabled bool   `json:"enabled"`
	Image   string `json:"image,omitempty"`
	Backend string `json:"backend,omitempty"`
	Network string `json:"network,omitempty"`
}

// ProviderConfig holds API credentials for an LLM provider.
type ProviderConfig struct {
	APIKey  string `json:"apiKey"`
	APIBase string `json:"apiBase"`
	APIType string `json:"apiType,omitempty"`
}

// ToolProviderConfig holds credentials for a tool provider (e.g. web search).
type ToolProviderConfig struct {
	APIKey   string            `json:"apiKey,omitempty"`
	Endpoint string            `json:"endpoint,omitempty"`
	Options  map[string]string `json:"options,omitempty"`
}

// ToolCategoryConfig chooses which provider(s) back a tool category.
type ToolCategoryConfig struct {
	Primary      string   `json:"primary,omitempty"`
	Fallbacks    []string `json:"fallbacks,omitempty"`
	AutoFallback *bool    `json:"autoFallback,omitempty"`
}

// MemoryConfig controls memory behavior.
type MemoryConfig struct {
	AutoPersistEnabled     bool
	AutoPersistEveryNTurns int
	AutoPersistModel       string
	FTSEnabled             bool
	FTSDBPath              string
}

// PrivacyConfig controls PII scrubbing.
type PrivacyConfig struct {
	PIIScrubEnabled bool
}

// SkillsLearnerConfig controls the skills learner.
type SkillsLearnerConfig struct {
	Enabled      bool
	MinToolCalls int
	Model        string
}
