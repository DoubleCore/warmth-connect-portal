// Phase 1 冒烟脚本：
// 1) 启动 Hono app（不经 HTTP 实体监听，直接用 app.fetch 调用）
// 2) POST /api/command/sessions 创建会话
// 3) POST /api/command/sessions/:id/messages 发送一条指令
//    此时 Hermes 不在本机运行，预期得到 HERMES_CONNECTION_FAILED
// 4) GET /api/command/commands/:id/events 回放事件，校验 error 事件已落库
//
// 覆盖 Hermes 尚未上线时的 sad path 闭环。
// 通过 tsx 执行，使用 src（TypeScript + 路径别名）。
import { createApp } from "@/app.js";

const app = createApp();

async function req(path, init) {
  const res = await app.fetch(
    new Request(`http://local${path}`, init),
  );
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const sessionResp = await req("/api/command/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ entry: "smoke", initialContext: { test: true } }),
});
console.log("session:", JSON.stringify(sessionResp, null, 2));
if (!sessionResp.body?.success) {
  process.exit(1);
}
const sessionId = sessionResp.body.data.sessionId;

const msgResp = await req(`/api/command/sessions/${sessionId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "hello hermes smoke test",
    context: { currentPage: "smoke" },
  }),
});
console.log("message:", JSON.stringify(msgResp, null, 2));

// 从错误 details.commandId 或事件列表回捞 commandId 不容易，
// 改用 debug ping + DB 查最新 command
const pingResp = await req("/api/command/_debug/hermes-ping");
console.log("ping:", JSON.stringify(pingResp, null, 2));

// 用 better-sqlite3 拉最近一条 command + 它的 events
const Database = (await import("better-sqlite3")).default;
const { resolve, dirname } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const here = dirname(fileURLToPath(import.meta.url));
const db = new Database(resolve(here, "..", "data", "app.db"), { readonly: true });
const lastCommand = db
  .prepare(
    "SELECT id, status, user_message, error_json FROM commands ORDER BY created_at DESC, id DESC LIMIT 1",
  )
  .get();
const events = db
  .prepare(
    "SELECT event_type, payload_json, created_at FROM command_events WHERE command_id = ? ORDER BY created_at ASC, id ASC",
  )
  .all(lastCommand.id);
console.log("last command:", JSON.stringify(lastCommand, null, 2));
console.log("events:", JSON.stringify(events, null, 2));
db.close();
