package connector

import "errors"

var (
	// ErrNoProvider is returned when no LLM provider is configured.
	ErrNoProvider = errors.New("connector: no LLM provider configured")

	// ErrAgentNotFound is returned when the target agent doesn't exist.
	ErrAgentNotFound = errors.New("connector: agent not found")
)
