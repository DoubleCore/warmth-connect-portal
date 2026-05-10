#!/bin/bash
# Probe a Hermes run that actually triggers a tool call, to capture tool.started/tool.completed shapes.
set -eu
KEY="${HERMES_API_KEY:-0ced248ce3f5e2ee0ec5b3736908938b229e2da5ea699d16}"
BASE="${HERMES_BASE_URL:-http://127.0.0.1:8642}"
AUTH="Authorization: Bearer $KEY"

echo "=== POST /v1/runs (ask for a small web search / terminal command) ==="
RUN_JSON=$(curl -sS --max-time 10 -X POST "$BASE/v1/runs" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"input":"请直接用终端工具执行 echo hello-hermes-probe 这一条命令,然后用一句话总结结果。","model":"hermes-agent"}')
echo "$RUN_JSON"
RUN_ID=$(echo "$RUN_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('run_id',''))")
echo "RUN_ID=$RUN_ID"

if [ -z "$RUN_ID" ]; then
  exit 1
fi

echo ""
echo "=== GET /v1/runs/$RUN_ID/events (SSE, max 180s) ==="
curl -sS -N --max-time 180 "$BASE/v1/runs/$RUN_ID/events" -H "$AUTH" \
  | tee /tmp/hermes_tool_events.log
