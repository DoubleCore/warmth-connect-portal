module github.com/fastclaw-ai/connector

go 1.25.0

require (
	github.com/fastclaw-ai/agentcore v0.0.0
	github.com/fastclaw-ai/agentruntime v0.0.0
)

replace (
	github.com/fastclaw-ai/agentcore => ../agentcore
	github.com/fastclaw-ai/agentruntime => ../agentruntime
)
