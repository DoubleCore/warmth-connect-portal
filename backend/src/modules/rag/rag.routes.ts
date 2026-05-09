import { createRouter } from "@/shared/context.js";
import { created, ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import {
  createConversationSchema,
  createMessageSchema,
} from "./rag.dto.js";
import * as service from "./rag.service.js";

/**
 * 挂在 /api/papers 上，用于创建与列出指定论文的 RAG 会话。
 */
export const paperRagRouter = createRouter();

paperRagRouter.get("/:paperId/rag/conversations", async (c) => {
  const paperId = c.req.param("paperId");
  const result = await service.listConversationsByPaper(paperId);
  return ok(c, result);
});

paperRagRouter.post(
  "/:paperId/rag/conversations",
  zv("json", createConversationSchema),
  async (c) => {
    const paperId = c.req.param("paperId");
    const body = c.req.valid("json");
    const conversation = await service.createConversation(paperId, body.title ?? null);
    return created(c, conversation);
  },
);

/**
 * 挂在 /api/rag 上，用于会话消息操作。
 */
export const ragRouter = createRouter();

ragRouter.get("/conversations/:conversationId/messages", async (c) => {
  const id = c.req.param("conversationId");
  const result = await service.listMessages(id);
  return ok(c, result);
});

ragRouter.post(
  "/conversations/:conversationId/messages",
  zv("json", createMessageSchema),
  async (c) => {
    const id = c.req.param("conversationId");
    const body = c.req.valid("json");
    const result = await service.sendMessage(id, body);
    return created(c, result);
  },
);
