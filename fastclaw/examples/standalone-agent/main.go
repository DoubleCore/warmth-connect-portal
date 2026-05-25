// Example: standalone-agent
//
// Demonstrates how to use the extracted agentruntime as a reusable module
// in your own Go application — no FastClaw platform required.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/fastclaw-ai/agentcore"
	"github.com/fastclaw-ai/connector"
)

func main() {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		fmt.Println("Set OPENAI_API_KEY environment variable")
		os.Exit(1)
	}

	// 1. Create a simple platform (in-memory sessions, no metering)
	platform := connector.NewSimplePlatform()

	// 2. Create the agent factory
	factory := connector.NewAgentFactory(platform)

	// 3. Define agent configuration
	cfg := agentcore.AgentConfig{
		ID:                "paper-searcher",
		Model:             "openai/gpt-4o-mini",
		MaxTokens:         4096,
		Temperature:       0.7,
		MaxToolIterations: 10,
		Home:              "./agent-home",
		Workspace:         "./agent-workspace",
		Providers: map[string]agentcore.ProviderConfig{
			"openai": {
				APIKey:  apiKey,
				APIBase: "https://api.openai.com/v1",
			},
		},
	}

	// 4. Create the agent
	agent := factory.CreateAgent(cfg)

	// 5. Register custom tools
	agent.Registry().Register(
		"search_papers",
		"Search academic papers by keyword",
		map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"query": map[string]interface{}{
					"type":        "string",
					"description": "Search query for papers",
				},
			},
			"required": []string{"query"},
		},
		searchPapers,
	)

	// 6. Send a message
	msg := agentcore.InboundMessage{
		Channel: "cli",
		ChatID:  "session-1",
		UserID:  "user-1",
		Text:    "帮我搜索关于 LLM Agent 架构的最新论文",
	}

	fmt.Println("User:", msg.Text)
	fmt.Println("---")

	reply := agent.HandleMessage(context.Background(), msg)
	fmt.Println("Agent:", reply)
}

// searchPapers is a custom tool implementation.
func searchPapers(ctx context.Context, args json.RawMessage) (string, error) {
	// In a real implementation, this would call an academic search API
	return `Found 3 papers:
1. "ReAct: Synergizing Reasoning and Acting in Language Models" (2023)
2. "Toolformer: Language Models Can Teach Themselves to Use Tools" (2023)  
3. "A Survey on Large Language Model based Autonomous Agents" (2024)`, nil
}
