export type RagConversation = {
  id: string;
  paperId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RagMessageRole = "user" | "assistant";

export type RagMessage = {
  id: string;
  conversationId: string;
  role: RagMessageRole;
  content: string;
  createdAt: string;
};

export type SendMessageResponse = {
  userMessage: RagMessage;
  assistantMessage: RagMessage;
};
