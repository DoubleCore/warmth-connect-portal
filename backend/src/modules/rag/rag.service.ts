import { NotFoundError } from "@/shared/errors.js";
import * as papersService from "@/modules/papers/papers.service.js";
import type {
  ConversationDto,
  CreateMessageInput,
  MessageDto,
  SendMessageResponseDto,
} from "./rag.dto.js";
import * as repo from "./rag.repository.js";
import type { RagConversationRow, RagMessageRow } from "@/db/schema.js";

function toConversationDto(row: RagConversationRow): ConversationDto {
  return {
    id: row.id,
    paperId: row.paperId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessageDto(row: RagMessageRow): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  };
}

export async function listConversationsByPaper(paperId: string): Promise<{
  items: ConversationDto[];
}> {
  await papersService.getPaperOrThrow(paperId);
  const rows = await repo.listConversationsByPaperId(paperId);
  return { items: rows.map(toConversationDto) };
}

export async function createConversation(
  paperId: string,
  title: string | null,
): Promise<ConversationDto> {
  await papersService.getPaperOrThrow(paperId);
  const row = await repo.insertConversation(paperId, title);
  return toConversationDto(row);
}

export async function getConversationOrThrow(id: string): Promise<RagConversationRow> {
  const row = await repo.getConversationById(id);
  if (!row) throw new NotFoundError("Conversation", id);
  return row;
}

export async function listMessages(conversationId: string): Promise<{ items: MessageDto[] }> {
  await getConversationOrThrow(conversationId);
  const rows = await repo.listMessages(conversationId);
  return { items: rows.map(toMessageDto) };
}

/**
 * MVP 占位实现：记录用户消息，并产生一个 stub assistant 回答。
 * 后续对接真实 RAG 服务时，只需替换这里的 assistant 生成逻辑即可。
 */
export async function sendMessage(
  conversationId: string,
  input: CreateMessageInput,
): Promise<SendMessageResponseDto> {
  const conversation = await getConversationOrThrow(conversationId);

  const userMessage = await repo.insertMessage(conversationId, "user", input.content);

  const stubAnswer = buildStubAnswer(conversation.paperId, input.content);
  const assistantMessage = await repo.insertMessage(conversationId, "assistant", stubAnswer);

  await repo.touchConversation(conversationId);

  return {
    userMessage: toMessageDto(userMessage),
    assistantMessage: toMessageDto(assistantMessage),
  };
}

function buildStubAnswer(paperId: string, question: string): string {
  return [
    `[stub RAG answer for paper ${paperId}]`,
    `Your question: ${question}`,
    "Real retrieval/generation is not wired up yet.",
  ].join("\n");
}
