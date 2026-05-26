#!/usr/bin/env sh
set -eu

FASTCLAW_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "$FASTCLAW_ROOT/.." && pwd)"

read_env() {
  key="$1"
  file="$PROJECT_ROOT/backend/.env"
  [ -f "$file" ] || return 0
  grep -m 1 "^$key=" "$file" | sed "s/^$key=//"
}

LLM_API_KEY="${LLM_API_KEY:-$(read_env LLM_API_KEY)}"
LLM_API_BASE_URL="${LLM_API_BASE_URL:-$(read_env LLM_API_BASE_URL)}"
LLM_CHAT_MODEL="${LLM_CHAT_MODEL:-$(read_env LLM_CHAT_MODEL)}"
FASTCLAW_API_KEY="${FASTCLAW_API_KEY:-$(read_env FASTCLAW_API_KEY)}"

: "${AGENT_API_KEY:=${LLM_API_KEY:-${OPENAI_API_KEY:-}}}"
: "${AGENT_API_BASE:=${LLM_API_BASE_URL:-${OPENAI_API_BASE:-https://api.openai.com/v1}}}"
: "${AGENT_MODEL:=${LLM_CHAT_MODEL:-${OPENAI_MODEL:-gpt-4o-mini}}}"
: "${FASTCLAW_API_KEY:=${FASTCLAW_API_KEY:-${AGENT_AUTH_TOKEN:-}}}"
export AGENT_API_KEY AGENT_API_BASE AGENT_MODEL FASTCLAW_API_KEY

cd "$FASTCLAW_ROOT"
exec go run ./cmd/hermes-fastclaw -config ./config/hermes-agents.json -bind 127.0.0.1 -port 18953
