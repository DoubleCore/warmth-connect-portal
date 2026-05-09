import { z } from "zod";

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).nullish(),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const createMessageSchema = z.object({
  content: z.string().trim().min(1),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export type ConversationDto = {
  id: string;
  paperId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type SendMessageResponseDto = {
  userMessage: MessageDto;
  assistantMessage: MessageDto;
};
