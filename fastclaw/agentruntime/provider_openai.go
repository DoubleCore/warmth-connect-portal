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

// OpenAIProvider implements the Provider interface for OpenAI-compatible APIs.
type OpenAIProvider struct {
	apiKey  string
	apiBase string
	client  *http.Client
}

// NewOpenAIProvider creates a new OpenAI-compatible provider.
func NewOpenAIProvider(apiKey, apiBase string) *OpenAIProvider {
	if apiBase == "" {
		apiBase = "https://api.openai.com/v1"
	}
	apiBase = strings.TrimRight(apiBase, "/")
	return &OpenAIProvider{
		apiKey:  apiKey,
		apiBase: apiBase,
		client: &http.Client{
			Transport: &http.Transport{
				ResponseHeaderTimeout: 60 * time.Second,
			},
		},
	}
}

// Chat sends a non-streaming chat completion request.
func (p *OpenAIProvider) Chat(ctx context.Context, messages []agentcore.Message, tools []agentcore.Tool, model string, maxTokens int, temperature float64) (*agentcore.Response, error) {
	// Strip provider prefix from model
	if idx := strings.Index(model, "/"); idx >= 0 {
		model = model[idx+1:]
	}

	body := map[string]interface{}{
		"model":       model,
		"messages":    convertMessages(messages),
		"max_tokens":  maxTokens,
		"temperature": temperature,
	}
	if len(tools) > 0 {
		body["tools"] = tools
	}

	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.apiBase+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

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
		return nil, fmt.Errorf("OpenAI API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result openAIResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	if len(result.Choices) == 0 {
		return &agentcore.Response{}, nil
	}

	choice := result.Choices[0]
	response := &agentcore.Response{
		Content:      choice.Message.Content,
		RawAssistant: respBody,
	}

	// Convert tool calls
	for _, tc := range choice.Message.ToolCalls {
		response.ToolCalls = append(response.ToolCalls, agentcore.ToolCall{
			ID:   tc.ID,
			Type: tc.Type,
			Function: agentcore.FunctionCall{
				Name:      tc.Function.Name,
				Arguments: tc.Function.Arguments,
			},
		})
	}

	// Extract usage
	if result.Usage.TotalTokens > 0 {
		response.Usage = agentcore.Usage{
			InputTokens:  result.Usage.PromptTokens,
			OutputTokens: result.Usage.CompletionTokens,
		}
	}

	return response, nil
}

// ChatStream sends a streaming chat completion request.
func (p *OpenAIProvider) ChatStream(ctx context.Context, messages []agentcore.Message, tools []agentcore.Tool, model string, maxTokens int, temperature float64) (*agentcore.StreamReader, error) {
	if idx := strings.Index(model, "/"); idx >= 0 {
		model = model[idx+1:]
	}

	body := map[string]interface{}{
		"model":       model,
		"messages":    convertMessages(messages),
		"max_tokens":  maxTokens,
		"temperature": temperature,
		"stream":      true,
	}
	if len(tools) > 0 {
		body["tools"] = tools
	}

	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.apiBase+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("OpenAI API error %d: %s", resp.StatusCode, string(body))
	}

	ch := make(chan agentcore.StreamChunk, 64)
	sr := agentcore.NewStreamReader(ch)

	go p.readSSEStream(resp.Body, ch, sr)

	return sr, nil
}

func (p *OpenAIProvider) readSSEStream(body io.ReadCloser, ch chan agentcore.StreamChunk, sr *agentcore.StreamReader) {
	defer body.Close()
	defer close(ch)

	var contentBuilder strings.Builder
	var toolCalls []agentcore.ToolCall

	buf := make([]byte, 4096)
	var remainder string

	for {
		n, err := body.Read(buf)
		if n > 0 {
			text := remainder + string(buf[:n])
			remainder = ""
			lines := strings.Split(text, "\n")

			for i, line := range lines {
				// Last element might be incomplete
				if i == len(lines)-1 && !strings.HasSuffix(text, "\n") {
					remainder = line
					continue
				}

				line = strings.TrimSpace(line)
				if !strings.HasPrefix(line, "data: ") {
					continue
				}
				data := strings.TrimPrefix(line, "data: ")
				if data == "[DONE]" {
					ch <- agentcore.StreamChunk{
						Done:      true,
						Content:   contentBuilder.String(),
						ToolCalls: toolCalls,
					}
					return
				}

				var chunk openAIStreamChunk
				if err := json.Unmarshal([]byte(data), &chunk); err != nil {
					continue
				}

				if len(chunk.Choices) > 0 {
					delta := chunk.Choices[0].Delta
					if delta.Content != "" {
						contentBuilder.WriteString(delta.Content)
						ch <- agentcore.StreamChunk{Content: delta.Content}
					}
					// Accumulate tool calls
					for _, tc := range delta.ToolCalls {
						for len(toolCalls) <= tc.Index {
							toolCalls = append(toolCalls, agentcore.ToolCall{})
						}
						if tc.ID != "" {
							toolCalls[tc.Index].ID = tc.ID
							toolCalls[tc.Index].Type = "function"
						}
						if tc.Function.Name != "" {
							toolCalls[tc.Index].Function.Name = tc.Function.Name
						}
						if tc.Function.Arguments != "" {
							toolCalls[tc.Index].Function.Arguments += tc.Function.Arguments
						}
					}
				}
			}
		}
		if err != nil {
			if err != io.EOF {
				sr.SetErr(err)
			}
			// Send final chunk
			ch <- agentcore.StreamChunk{
				Done:      true,
				Content:   contentBuilder.String(),
				ToolCalls: toolCalls,
			}
			return
		}
	}
}

// convertMessages converts agentcore messages to OpenAI API format.
func convertMessages(messages []agentcore.Message) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(messages))
	for _, m := range messages {
		msg := map[string]interface{}{
			"role": m.Role,
		}
		if m.Content != "" {
			msg["content"] = m.Content
		}
		if len(m.ContentParts) > 0 {
			parts := make([]map[string]interface{}, 0, len(m.ContentParts))
			for _, p := range m.ContentParts {
				part := map[string]interface{}{"type": p.Type}
				if p.Type == "text" {
					part["text"] = p.Text
				} else if p.Type == "image_url" && p.ImageURL != nil {
					part["image_url"] = map[string]interface{}{
						"url":    p.ImageURL.URL,
						"detail": p.ImageURL.Detail,
					}
				}
				parts = append(parts, part)
			}
			msg["content"] = parts
		}
		if len(m.ToolCalls) > 0 {
			msg["tool_calls"] = m.ToolCalls
		}
		if m.ToolCallID != "" {
			msg["tool_call_id"] = m.ToolCallID
		}
		if m.Name != "" {
			msg["name"] = m.Name
		}
		out = append(out, msg)
	}
	return out
}

// OpenAI API response types
type openAIResponse struct {
	Choices []openAIChoice `json:"choices"`
	Usage   openAIUsage    `json:"usage"`
}

type openAIChoice struct {
	Message openAIMessage `json:"message"`
}

type openAIMessage struct {
	Content   string           `json:"content"`
	ToolCalls []openAIToolCall `json:"tool_calls,omitempty"`
}

type openAIToolCall struct {
	ID       string             `json:"id"`
	Type     string             `json:"type"`
	Function openAIFunctionCall `json:"function"`
}

type openAIFunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type openAIUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

type openAIStreamChunk struct {
	Choices []openAIStreamChoice `json:"choices"`
}

type openAIStreamChoice struct {
	Delta openAIStreamDelta `json:"delta"`
}

type openAIStreamDelta struct {
	Content   string                    `json:"content,omitempty"`
	ToolCalls []openAIStreamToolCall    `json:"tool_calls,omitempty"`
}

type openAIStreamToolCall struct {
	Index    int                `json:"index"`
	ID       string             `json:"id,omitempty"`
	Type     string             `json:"type,omitempty"`
	Function openAIFunctionCall `json:"function"`
}
