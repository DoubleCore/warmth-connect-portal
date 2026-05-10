#!/usr/bin/env bash
# scripts/check_db.sh
#
# 一键排查 SQLite DB 状态。默认读 backend/data/app.db；可以通过
# `DB=/path/to/other.db bash scripts/check_db.sh` 覆盖。
#
# 输出三段：
#   1. 每张表的行数（含 FTS5 虚表，验证 trigger 是否把 rag_papers 同步过去）
#   2. 每张业务表最近 3 条记录的摘要（id + 一个易读字段 + createdAt）
#   3. Hermes 指令中心三张表的最近活动 + 状态分布（排查会话/事件异常）
#
# 只读；不修改数据。

set -eu

DB_PATH="${DB:-backend/data/app.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "DB file not found: $DB_PATH" >&2
  echo "Hint: run \`cd backend && npm run db:migrate\` first." >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 CLI not installed. apt/brew install sqlite3." >&2
  exit 1
fi

# 一个有 header、带宽度对齐的输出格式
Q() {
  sqlite3 -header -column "$DB_PATH" "$@"
}

echo "=== DB: $DB_PATH ==="
echo

echo "--- [1/3] Table row counts ---"
Q <<SQL
SELECT 'papers'                     AS "table", COUNT(*) AS rows FROM papers
UNION ALL SELECT 'paper_analysis',             COUNT(*) FROM paper_analysis
UNION ALL SELECT 'rag_papers',                 COUNT(*) FROM rag_papers
UNION ALL SELECT 'rag_papers_fts',             COUNT(*) FROM rag_papers_fts
UNION ALL SELECT 'devices',                    COUNT(*) FROM devices
UNION ALL SELECT 'paper_reproduction_records', COUNT(*) FROM paper_reproduction_records
UNION ALL SELECT 'user_profile',               COUNT(*) FROM user_profile
UNION ALL SELECT 'command_sessions',           COUNT(*) FROM command_sessions
UNION ALL SELECT 'commands',                   COUNT(*) FROM commands
UNION ALL SELECT 'command_events',             COUNT(*) FROM command_events;
SQL

# FTS5 与源表行数不一致通常意味着 trigger 被破坏或早于 trigger 建好前插过数据。
echo
FTS_DIFF=$(sqlite3 "$DB_PATH" "SELECT (SELECT COUNT(*) FROM rag_papers) - (SELECT COUNT(*) FROM rag_papers_fts);")
if [ "$FTS_DIFF" != "0" ]; then
  echo "WARNING: rag_papers / rag_papers_fts count mismatch (delta=$FTS_DIFF)"
  echo "         FTS5 sync trigger may be broken; try: rebuild via 'INSERT INTO rag_papers_fts(rag_papers_fts) VALUES(\"rebuild\");'"
  echo
fi

echo "--- [2/3] Latest 3 rows per business table ---"

echo
echo "papers (top 3 by created_at desc):"
Q "SELECT substr(id,1,8) AS id, substr(title,1,48) AS title, published_year AS year, created_at FROM papers ORDER BY created_at DESC LIMIT 3;"

echo
echo "paper_analysis (top 3 by created_at desc):"
Q "SELECT substr(id,1,8) AS id, substr(paper_id,1,8) AS paper_id, substr(coalesce(task_definition,'-'),1,40) AS task, created_at FROM paper_analysis ORDER BY created_at DESC LIMIT 3;"

echo
echo "rag_papers (top 3 by created_at desc):"
Q "SELECT id, substr(title,1,48) AS title, venue, created_at FROM rag_papers ORDER BY created_at DESC LIMIT 3;"

echo
echo "devices (all):"
Q "SELECT substr(id,1,8) AS id, name, device_type, status, location FROM devices ORDER BY created_at ASC;"

echo
echo "paper_reproduction_records (top 3 by created_at desc):"
Q "SELECT substr(id,1,8) AS id, substr(paper_id,1,8) AS paper_id, substr(coalesce(device_id,'-'),1,8) AS device_id, status, progress, substr(coalesce(training_notes,'-'),1,40) AS notes FROM paper_reproduction_records ORDER BY created_at DESC LIMIT 3;"

echo
echo "user_profile:"
Q "SELECT id, username, updated_at FROM user_profile;"

echo
echo "--- [3/3] Hermes command center activity ---"
echo
echo "commands status distribution:"
Q "SELECT status, COUNT(*) AS n FROM commands GROUP BY status ORDER BY n DESC;"

echo
echo "commands most recent 5:"
Q "SELECT substr(id,1,8) AS id, substr(session_id,1,8) AS session_id, status, substr(user_message,1,48) AS user_message, created_at FROM commands ORDER BY created_at DESC LIMIT 5;"

echo
echo "command_events count per event_type:"
Q "SELECT event_type, COUNT(*) AS n FROM command_events GROUP BY event_type ORDER BY n DESC;"

echo
echo "command_sessions most recent 5:"
Q "SELECT substr(id,1,8) AS id, coalesce(entry,'-') AS entry, created_at FROM command_sessions ORDER BY created_at DESC LIMIT 5;"

echo
echo "=== done ==="
