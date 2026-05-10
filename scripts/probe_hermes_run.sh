#!/bin/bash
# Probe a real Hermes run to capture actual SSE event shapes.
# Usage: bash scripts/probe_hermes_run.sh
set -eu
KEY="${HERMES_API_KEY:-0ced248ce3f5e2ee0ec5b3736908938b229e2da5ea699d16}"
BASE="${HERMES_BASE_URL:-http://127.0.0.1:8642}"
AUTH="Authorization: Bearer $KEY"

echo "=== POST /v1/runs ==="
RUN_JSON=$(curl -sS --max-time 10 -X POST "$BASE/v1/runs" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"input":"请用一句话自我介绍,不要调用任何工具,直接回答。","model":"hermes-agent"}')
echo "$RUN_JSON"
RUN_ID=$(echo "$RUN_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('run_id',''))")
echo "RUN_ID=$RUN_ID"

if [ -z "$RUN_ID" ]; then
  echo "No run_id returned, aborting"
  exit 1
fi

echo ""
echo "=== GET /v1/runs/$RUN_ID/events (SSE, max 60s) ==="
curl -sS -N --max-time 60 "$BASE/v1/runs/$RUN_ID/events" -H "$AUTH" \
  | tee /tmp/hermes_events.log

echo ""
echo "=== GET /v1/runs/$RUN_ID (final status) ==="
curl -sS --max-time 10 "$BASE/v1/runs/$RUN_ID" -H "$AUTH" | python3 -m json.tool
