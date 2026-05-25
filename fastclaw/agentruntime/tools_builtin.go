package agentruntime

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// exec tool
// ---------------------------------------------------------------------------

type execArgs struct {
	Command string `json:"command"`
	Timeout int    `json:"timeout,omitempty"`
}

// RegisterExecTool registers the shell execution tool.
func RegisterExecTool(r *ToolRegistry, sandboxEnabled bool) {
	schema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"command": map[string]interface{}{
				"type":        "string",
				"description": "The shell command to execute",
			},
			"timeout": map[string]interface{}{
				"type":        "integer",
				"description": "Timeout in seconds (default 120)",
			},
		},
		"required": []string{"command"},
	}

	r.Register("exec", "Execute a shell command and return stdout+stderr", schema,
		func(ctx context.Context, args json.RawMessage) (string, error) {
			var a execArgs
			if err := json.Unmarshal(args, &a); err != nil {
				return "", err
			}
			if a.Command == "" {
				return "", fmt.Errorf("command is required")
			}
			timeout := time.Duration(a.Timeout) * time.Second
			if timeout == 0 {
				timeout = 120 * time.Second
			}

			// If sandbox executor is available, use it
			if ex := r.Executor(); ex != nil {
				return ex.Exec(ctx, a.Command, timeout)
			}

			// If sandbox is required but no executor, refuse
			if r.SandboxRequired() {
				return "", fmt.Errorf("sandbox required but no executor available")
			}

			// Host execution fallback
			ctx, cancel := context.WithTimeout(ctx, timeout)
			defer cancel()

			var cmd *exec.Cmd
			if runtime.GOOS == "windows" {
				cmd = exec.CommandContext(ctx, "cmd", "/C", a.Command)
			} else {
				cmd = exec.CommandContext(ctx, "sh", "-c", a.Command)
			}
			if r.userRoot != "" {
				cmd.Dir = r.userRoot
			}
			out, err := cmd.CombinedOutput()
			result := string(out)
			if err != nil {
				result += "\n" + err.Error()
			}
			// Truncate very long output
			if len(result) > 100000 {
				result = result[:100000] + "\n... (truncated)"
			}
			return result, nil
		})
}

// ---------------------------------------------------------------------------
// file tools (read_file, write_file, list_dir)
// ---------------------------------------------------------------------------

type readFileArgs struct {
	Path string `json:"path"`
}

type writeFileArgs struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type listDirArgs struct {
	Path string `json:"path"`
}

// RegisterFileTool registers file operation tools.
func RegisterFileTool(r *ToolRegistry, systemRoot, userRoot string) {
	// read_file
	readSchema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Path to the file to read",
			},
		},
		"required": []string{"path"},
	}
	r.Register("read_file", "Read the contents of a file", readSchema,
		func(ctx context.Context, args json.RawMessage) (string, error) {
			var a readFileArgs
			if err := json.Unmarshal(args, &a); err != nil {
				return "", err
			}

			// Sandbox path
			if ex := r.Executor(); ex != nil {
				return ex.ReadFile(ctx, a.Path)
			}

			// Resolve path
			fullPath := resolvePath(a.Path, systemRoot, userRoot)
			data, err := os.ReadFile(fullPath)
			if err != nil {
				return "", err
			}
			content := string(data)
			if len(content) > 500000 {
				content = content[:500000] + "\n... (truncated)"
			}
			return content, nil
		})

	// write_file
	writeSchema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Path to write the file",
			},
			"content": map[string]interface{}{
				"type":        "string",
				"description": "Content to write",
			},
		},
		"required": []string{"path", "content"},
	}
	r.Register("write_file", "Write content to a file (creates parent directories)", writeSchema,
		func(ctx context.Context, args json.RawMessage) (string, error) {
			var a writeFileArgs
			if err := json.Unmarshal(args, &a); err != nil {
				return "", err
			}

			// Sandbox path
			if ex := r.Executor(); ex != nil {
				return ex.WriteFile(ctx, a.Path, a.Content)
			}

			// Resolve path
			fullPath := resolvePath(a.Path, systemRoot, userRoot)
			dir := filepath.Dir(fullPath)
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return "", err
			}
			if err := os.WriteFile(fullPath, []byte(a.Content), 0o644); err != nil {
				return "", err
			}
			return fmt.Sprintf("Written %d bytes to %s", len(a.Content), a.Path), nil
		})

	// list_dir
	listSchema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Directory path to list",
			},
		},
		"required": []string{"path"},
	}
	r.Register("list_dir", "List directory contents", listSchema,
		func(ctx context.Context, args json.RawMessage) (string, error) {
			var a listDirArgs
			if err := json.Unmarshal(args, &a); err != nil {
				return "", err
			}

			// Sandbox path
			if ex := r.Executor(); ex != nil {
				return ex.ListDir(ctx, a.Path)
			}

			// Resolve path
			fullPath := resolvePath(a.Path, systemRoot, userRoot)
			entries, err := os.ReadDir(fullPath)
			if err != nil {
				return "", err
			}
			var sb strings.Builder
			for _, e := range entries {
				info, _ := e.Info()
				if info != nil {
					if e.IsDir() {
						fmt.Fprintf(&sb, "d %s/\n", e.Name())
					} else {
						fmt.Fprintf(&sb, "- %s (%d bytes)\n", e.Name(), info.Size())
					}
				} else {
					fmt.Fprintf(&sb, "  %s\n", e.Name())
				}
			}
			return sb.String(), nil
		})
}

// resolvePath resolves a relative path to an absolute path.
func resolvePath(path, systemRoot, userRoot string) string {
	if filepath.IsAbs(path) {
		return path
	}
	// Check if it's a known system file
	base := filepath.Base(path)
	systemFiles := map[string]bool{
		"SOUL.md": true, "IDENTITY.md": true, "AGENTS.md": true,
		"BOOTSTRAP.md": true, "TOOLS.md": true, "HEARTBEAT.md": true,
		"USER.md": true, "MEMORY.md": true, "agent.json": true,
	}
	if systemFiles[base] && systemRoot != "" {
		return filepath.Join(systemRoot, path)
	}
	if userRoot != "" {
		return filepath.Join(userRoot, path)
	}
	return path
}

// ---------------------------------------------------------------------------
// web_fetch tool
// ---------------------------------------------------------------------------

type webFetchArgs struct {
	URL     string `json:"url"`
	Method  string `json:"method,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

// RegisterWebFetchTool registers the web fetch tool.
func RegisterWebFetchTool(r *ToolRegistry) {
	schema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"url": map[string]interface{}{
				"type":        "string",
				"description": "URL to fetch",
			},
			"method": map[string]interface{}{
				"type":        "string",
				"description": "HTTP method (default GET)",
			},
			"headers": map[string]interface{}{
				"type":        "object",
				"description": "Optional HTTP headers",
			},
		},
		"required": []string{"url"},
	}

	r.Register("web_fetch", "Fetch content from a URL", schema,
		func(ctx context.Context, args json.RawMessage) (string, error) {
			var a webFetchArgs
			if err := json.Unmarshal(args, &a); err != nil {
				return "", err
			}
			if a.URL == "" {
				return "", fmt.Errorf("url is required")
			}
			method := a.Method
			if method == "" {
				method = "GET"
			}

			client := &http.Client{Timeout: 30 * time.Second}
			req, err := http.NewRequestWithContext(ctx, method, a.URL, nil)
			if err != nil {
				return "", err
			}
			for k, v := range a.Headers {
				req.Header.Set(k, v)
			}

			resp, err := client.Do(req)
			if err != nil {
				return "", err
			}
			defer resp.Body.Close()

			body, err := io.ReadAll(io.LimitReader(resp.Body, 200000))
			if err != nil {
				return "", err
			}

			result := fmt.Sprintf("HTTP %d\n\n%s", resp.StatusCode, string(body))
			return result, nil
		})
}
