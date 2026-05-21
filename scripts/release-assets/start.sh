#!/bin/bash
# ============================================================
#  Warmth Connect Portal - 启动器 (Linux)
# ============================================================

DIR="$(cd "$(dirname "$0")" && pwd)"

# 加载 .env
if [ -f "$DIR/.env" ]; then
    set -a
    source "$DIR/.env"
    set +a
fi

# 默认值
PORT="${PORT:-8787}"
AGENT_MODEL="${AGENT_MODEL:-openai/gpt-4o-mini}"
AGENT_API_BASE="${AGENT_API_BASE:-https://api.openai.com/v1}"

# 启动 Agent Runtime (后台)
echo "[*] Starting Agent Runtime on port 18953..."
"$DIR/agentruntime" \
    -port 18953 \
    -bind 127.0.0.1 \
    -model "$AGENT_MODEL" \
    -api-key "$AGENT_API_KEY" \
    -api-base "$AGENT_API_BASE" \
    -home "$DIR/agents/paper-deployer" \
    -workspace "$DIR/workspace" \
    -auth-token "$FASTCLAW_API_KEY" &

AGENT_PID=$!

# 等待启动
sleep 2

# 启动后端
echo "[*] Starting Portal Server on port $PORT..."
echo ""
echo "============================================================"
echo "  Portal:  http://localhost:$PORT"
echo "  Agent:   http://localhost:18953/health"
echo "============================================================"
echo ""
echo "Press Ctrl+C to stop."

cd "$DIR/server"
node server.js &
SERVER_PID=$!

# 优雅退出
trap "echo 'Shutting down...'; kill $AGENT_PID $SERVER_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
