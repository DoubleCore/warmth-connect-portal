import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MessageSquare, Send, User, Bot } from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { ApiError } from "@/lib/api-client";
import { getPaperDetail } from "@/api/papers";
import {
  createConversation,
  listConversations,
  listMessages,
  sendMessage,
} from "@/api/rag";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { RagMessage } from "@/types/rag";

export const Route = createFileRoute("/library/$paperId/rag")({
  loader: async ({ params, context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: ["paper-detail", params.paperId],
        queryFn: () => getPaperDetail(params.paperId),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw notFound();
      throw err;
    }
  },
  component: RagChatPage,
});

function RagChatPage() {
  const { paperId } = Route.useParams();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const paperQuery = useQuery({
    queryKey: ["paper-detail", paperId],
    queryFn: () => getPaperDetail(paperId),
  });

  const conversationsQuery = useQuery({
    queryKey: ["rag-conversations", paperId],
    queryFn: () => listConversations(paperId),
  });

  // MVP: drive a single active conversation at a time. We pick the most recent,
  // or create a new one lazily when the user sends the first message.
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (activeConversationId) return;
    const first = conversationsQuery.data?.items[0];
    if (first) setActiveConversationId(first.id);
  }, [conversationsQuery.data, activeConversationId]);

  const messagesQuery = useQuery({
    queryKey: ["rag-messages", activeConversationId],
    queryFn: () => listMessages(activeConversationId as string),
    enabled: Boolean(activeConversationId),
  });

  const ensureConversation = async (): Promise<string> => {
    if (activeConversationId) return activeConversationId;
    const created = await createConversation(paperId, null);
    await queryClient.invalidateQueries({ queryKey: ["rag-conversations", paperId] });
    setActiveConversationId(created.id);
    return created.id;
  };

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const convId = await ensureConversation();
      return sendMessage(convId, content);
    },
    onSuccess: (_data, _variables, _context) => {
      // Refetch messages for the active conversation. We don't patch the cache
      // optimistically because assistant content comes from the server.
      if (activeConversationId) {
        void queryClient.invalidateQueries({ queryKey: ["rag-messages", activeConversationId] });
      }
    },
  });

  const [draft, setDraft] = useState("");
  const listEndRef = useRef<HTMLDivElement>(null);

  // Keep the chat scrolled to the latest message as new ones arrive.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messagesQuery.data?.items.length, sendMutation.isPending]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    setDraft("");
    sendMutation.mutate(trimmed);
  };

  const paper = paperQuery.data?.paper;
  const messages = messagesQuery.data?.items ?? [];

  return (
    <Shell active="Library">
      <div className="mx-auto flex h-[calc(100vh-65px)] w-full max-w-4xl flex-col px-8 py-6">
        <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0">
            <Link
              to="/library/$paperId"
              params={{ paperId }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {t("rag.backToPaper")}
            </Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold">
              <MessageSquare className="h-5 w-5 text-primary" />
              {t("rag.heading")}
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {paper?.title ?? t("workspace.loading")}
            </p>
          </div>
        </header>

        <div className="mt-4 flex-1 overflow-y-auto pr-2">
          {messagesQuery.isLoading && activeConversationId ? (
            <CenterMsg>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("workspace.loading")}
            </CenterMsg>
          ) : messagesQuery.isError ? (
            <CenterMsg tone="error">
              {t("rag.loadError", { message: getErrorMessage(messagesQuery.error) })}
            </CenterMsg>
          ) : messages.length === 0 && !sendMutation.isPending ? (
            <CenterMsg tone="muted">{t("rag.empty")}</CenterMsg>
          ) : (
            <ul className="flex flex-col gap-4 py-2">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {sendMutation.isPending && (
                <li className="flex items-start gap-3">
                  <Avatar role="assistant" />
                  <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </li>
              )}
              <div ref={listEndRef} />
            </ul>
          )}
        </div>

        {sendMutation.isError && (
          <p className="mt-2 text-xs text-destructive">
            {t("rag.sendError", { message: getErrorMessage(sendMutation.error) })}
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="mt-4 flex items-end gap-2 rounded-2xl border border-border bg-card p-2"
        >
          <label htmlFor="rag-input" className="sr-only">
            {t("rag.placeholder")}
          </label>
          <textarea
            id="rag-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as FormEvent);
              }
            }}
            rows={2}
            placeholder={t("rag.placeholder")}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sendMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sendMutation.isPending ? t("rag.sending") : t("rag.send")}
          </button>
        </form>
      </div>
    </Shell>
  );
}

function MessageBubble({ message }: { message: RagMessage }) {
  const isUser = message.role === "user";
  return (
    <li className={isUser ? "flex items-start gap-3 flex-row-reverse" : "flex items-start gap-3"}>
      <Avatar role={message.role} />
      <div
        className={
          isUser
            ? "max-w-[80%] whitespace-pre-wrap rounded-2xl bg-primary/15 px-4 py-3 text-sm text-foreground ring-1 ring-primary/30"
            : "max-w-[80%] whitespace-pre-wrap rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground"
        }
      >
        {message.content}
      </div>
    </li>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  const Icon = role === "user" ? User : Bot;
  return (
    <span
      className={
        "grid h-8 w-8 shrink-0 place-items-center rounded-full " +
        (role === "user"
          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
          : "border border-border bg-card text-muted-foreground")
      }
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

function CenterMsg({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={
        "flex h-full items-center justify-center gap-2 text-sm " +
        (tone === "error" ? "text-destructive" : "text-muted-foreground")
      }
    >
      {children}
    </div>
  );
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
