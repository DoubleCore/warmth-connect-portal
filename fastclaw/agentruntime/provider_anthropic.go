package agentruntime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/fastclaw-ai/agentcore"
)

// AnthropicProvider implements the Provider interface for Anthropic's Messages API.
type AnthropicProvider struct {
	apiKey  string
	apiBase string
	client  *http.Client
}

// NewAnthropicProvider creates a new Anthropic provider.
func NewAnthropicProvider(apiKey, apiBase string) *AnthropicProvider {
	if apiBase == "" {
		apiBase = "https://api.anthropic.com"
	}
	apiBase = strings.TrimRight(apiBase, "/")
	return &AnthropicProvider{
		apiKey:  apiKey,
		apiBase: apiBase,
		client: &http.Client{
			Transport: &http.Transport{
				ResponseHeaderTimeout: 60 * time.Second,
			},
		},
	}
}

// Chat sends a non-streaming message to the Anthropic API.
func (p *AnthropicProvider) Chat(ctx context.Context, messages []agentcore.Message, tools []agentcore.Tool, model string, maxTokens int, temperature float64) (*agentcore.Response, error) {
	if idx := strings.Index(model, "/"); idx >= 0 {
		model = model[idx+1:]
	}

	// Separate system message from conversation
	var system string
	var convMessages []agentcore.Message
	for _, m := range messages {
		if m.Role == "system" {
			system = m.Content
		} else {
			convMessages = append(convMessages, m)
		}
	}

	body := map[string]interface{}{
		"model":       model,
		"max_tokens":  maxTokens,
		"temperature": temperature,
		"messages":    convertToAnthropicMessages(convMessages),
	}
	if system != "" {
		body["system"] = system
	}
	if len(tools) > 0 {
		body["tools"] = convertToAnthropicTools(tools)
	}

	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.apiBase+"/v1/messages", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Anthropic API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result anthropicResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	response := &agentcore.Response{
		RawAssistant: respBody,
		Usage: agentcore.Usage{
			InputTokens:  result.Usage.InputTokens,
			OutputTokens: result.Usage.OutputTokens,
		},
	}

	// Parse content blocks
	for _, block := range result.Content {
		switch block.Type {
		case "text":
			response.Content = block.Text
		case "thinking":
			response.Thinking = block.Thinking
		case "tool_use":
			argsJSON, _ := json.Marshal(block.Input)
			response.ToolCalls = append(response.ToolCalls, agentcore.ToolCall{
				ID:   block.ID,
				Type: "function",
				Function: agentcore.FunctionCall{
					Name:      block.Name,
					Arguments: string(argsJSON),
				},
			})
		}
	}

	return response, nil
}

// ChatStream sends a streaming message to the Anthropic API.
func (p *AnthropicProvider) ChatStream(ctx context.Context, messages []agentcore.Message, tools []agentcore.Tool, model string, maxTokens int, temperature float64) (*agentcore.StreamReader, error) {
	if idx := strings.Index(model, "/"); idx >= 0 {
		model = model[idx+1:]
	}

	var system string
	var convMessages []agentcore.Message
	for _, m := range messages {
		if m.Role == "system" {
			system = m.Content
		} else {
			convMessages = append(convMessages, m)
		}
	}

	body := map[string]interface{}{
		"model":       model,
		"max_tokens":  maxTokens,
		"temperature": temperature,
		"messages":    convertToAnthropicMessages(convMessages),
		"stream":      true,
	}
	if system != "" {
		body["system"] = system
	}
	if len(tools) > 0 {
		body["tools"] = convertToAnthropicTools(tools)
	}

	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.apiBase+"/v1/messages", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("Anthropic API error %d: %s", resp.StatusCode, string(body))
	}

	ch := make(chan agentcore.StreamChunk, 64)
	sr := agentcore.NewStreamReader(ch)

	go p.readAnthropicSSE(resp.Body, ch, sr)

	return sr, nil
}

func (p *AnthropicProvider) readAnthropicSSE(body io.ReadCloser, ch chan agentcore.StreamChunk, sr *agentcore.StreamReader) {
	defer body.Close()
	defer close(ch)

	var contentBuilder strings.Builder
	var thinking string
	var toolCalls []agentcore.ToolCall
	var currentToolJSON strings.Builder
	var currentToolID, currentToolName string
	var usage agentcore.Usage

	buf := make([]byte, 4096)
	var remainder string

	for {
		n, err := body.Read(buf)
		if n > 0 {
			text := remainder + string(buf[:n])
			remainder = ""
			lines := strings.Split(text, "\n")

			for i, line := range lines {
				if i == len(lines)-1 && !strings.HasSuffix(text, "\n") {
					remainder = line
					continue
				}

				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "event: ") {
					continue
				}
				if !strings.HasPrefix(line, "data: ") {
					continue
				}
				data := strings.TrimPrefix(line, "data: ")

				var event anthropicSSEEvent
				if err := json.Unmarshal([]byte(data), &event); err != nil {
					continue
				}

				switch event.Type {
				case "content_block_start":
					if event.ContentBlock.Type == "tool_use" {
						currentToolID = event.ContentBlock.ID
						currentToolName = event.ContentBlock.Name
						currentToolJSON.Reset()
					}
				case "content_block_delta":
					if event.Delta.Type == "text_delta" {
						contentBuilder.WriteString(event.Delta.Text)
						ch <- agentcore.StreamChunk{Content: event.Delta.Text}
					} else if event.Delta.Type == "thinking_delta" {
						thinking += event.Delta.Thinking
					} else if event.Delta.Type == "input_json_delta" {
						currentToolJSON.WriteString(event.Delta.PartialJSON)
					}
				case "content_block_stop":
					if currentToolID != "" {
						toolCalls = append(toolCalls, agentcore.ToolCall{
							ID:   currentToolID,
							Type: "function",
							Function: agentcore.FunctionCall{
								Name:      currentToolName,
								Arguments: currentToolJSON.String(),
							},
						})
						currentToolID = ""
						currentToolName = ""
					}
				case "message_delta":
					if event.Usage.OutputTokens > 0 {
						usage.OutputTokens = event.Usage.OutputTokens
					}
				case "message_start":
					if event.Message.Usage.InputTokens > 0 {
						usage.InputTokens = event.Message.Usage.InputTokens
					}
				}
			}
		}
		if err != nil {
			if err != io.EOF {
				sr.SetErr(err)
			}
			ch <- agentcore.StreamChunk{
				Done:      true,
				Content:   contentBuilder.String(),
				ToolCalls: toolCalls,
				Thinking:  thinking,
				Usage:     usage,
			}
			return
		}
	}
}

func convertToAnthropicMessages(messages []agentcore.Message) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(messages))
	for _, m := range messages {
		msg := map[string]interface{}{
			"role": m.Role,
		}
		if m.Role == "tool" {
			// Anthropic uses "user" role with tool_result content block
			msg["role"] = "user"
			msg["content"] = []map[string]interface{}{
				{
					"type":        "tool_result",
					"tool_use_id": m.ToolCallID,
					"content":     m.Content,
				},
			}
		} else if len(m.ToolCalls) > 0 {
			// Assistant with tool_use
			content := []map[string]interface{}{}
			if m.Content != "" {
				content = append(content, map[string]interface{}{
					"type": "text",
					"text": m.Content,
				})
			}
			for _, tc := range m.ToolCalls {
				var input interface{}
				_ = json.Unmarshal([]byte(tc.Function.Arguments), &input)
				content = append(content, map[string]interface{}{
					"type":  "tool_use",
					"id":    tc.ID,
					"name":  tc.Function.Name,
					"input": input,
				})
			}
			msg["content"] = content
		} else {
			msg["content"] = m.Content
		}
		out = append(out, msg)
	}
	return out
}

func convertToAnthropicTools(tools []agentcore.Tool) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(tools))
	for _, t := range tools {
		out = append(out, map[string]interface{}{
			"name":         t.Function.Name,
			"description":  t.Function.Description,
			"input_schema": t.Function.Parameters,
		})
	}
	return out
}

// Anthropic API types
type anthropicResponse struct {
	Content []anthropicContentBlock `json:"content"`
	Usage   anthropicUsage          `json:"usage"`
}

type anthropicContentBlock struct {
	Type     string      `json:"type"`
	Text     string      `json:"text,omitempty"`
	Thinking string      `json:"thinking,omitempty"`
	ID       string      `json:"id,omitempty"`
	Name     string      `json:"name,omitempty"`
	Input    interface{} `json:"input,omitempty"`
}

type anthropicUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type anthropicSSEEvent struct {
	Type         string `json:"type"`
	ContentBlock struct {
		Type string `json:"type"`
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"content_block,omitempty"`
	Delta struct {
		Type        string `json:"type"`
		Text        string `json:"text,omitempty"`
		Thinking    string `json:"thinking,omitempty"`
		PartialJSON string `json:"partial_json,omitempty"`
	} `json:"delta,omitempty"`
	Usage struct {
		OutputTokens int `json:"output_tokens"`
	} `json:"usage,omitempty"`
	Message struct {
		Usage anthropicUsage `json:"usage"`
	} `json:"message,omitempty"`
}
