import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createConversationSchema,
  createMessageSchema,
} from "./rag.dto.js";
import * as service from "./rag.service.js";

/**
 * 挂在 /api/papers 上，用于创建与列出指定论文的 RAG 会话。
 */
export const paperRagRouter = new Hono();

paperRagRouter.get("/:paperId/rag/conversations", async (c) => {
  const paperId = c.req.param("paperId");
  const result = await service.listConversationsByPaper(paperId);
  return c.json(result);
});

paperRagRouter.post(
  "/:paperId/rag/conversations",
  zValidator("json", createConversationSchema),
  async (c) => {
    const paperId = c.req.param("paperId");
    const body = c.req.valid("json");
    const conversation = await service.createConversation(paperId, body.title ?? null);
    return c.json(conversation, 201);
  },
);

/**
 * 挂在 /api/rag 上，用于会话消息操作。
 */
export const ragRouter = new Hono();

ragRouter.get("/conversations/:conversationId/messages", async (c) => {
  const id = c.req.param("conversationId");
  const result = await service.listMessages(id);
  return c.json(result);
});

ragRouter.post(
  "/conversations/:conversationId/messages",
  zValidator("json", createMessageSchema),
  async (c) => {
    const id = c.req.param("conversationId");
    const body = c.req.valid("json");
    const result = await service.sendMessage(id, body);
    return c.json(result, 201);
  },
);
