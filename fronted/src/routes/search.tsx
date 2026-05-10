import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Send,
  Paperclip,
  Share2,
  Download,
  User,
  Sparkles,
  Filter,
  Loader2,
} from "lucide-react";
import { z } from "zod";
import { Shell } from "@/components/hermes/Shell";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { askRag, getRagScope } from "@/api/rag";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { RagQueryReference, RagQueryResponse } from "@/types/rag";

const searchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "RAG Search — Hermes AI" },
      { name: "description", content: "Semantic retrieval across the global research corpus." },
    ],
  }),
  component: RagSearchPage,
});

/**
 * RAG Search 页 —— 对话式 Q&A 面板。
 *
 * 数据流（对齐 Design_SQLite_Abstract_RAG.md §9.1）：
 *
 *   用户在底部输入问题
 *     ↓
 *   POST /api/rag/query  (backend: FTS 召回 → embedding rerank → LLM 生成)
 *     ↓
 *   左侧渲染：助手气泡（answer） + 引用卡片（references）
 *   右侧渲染：Current Source（Top 1 引用） / Data Extraction（Top 1 元数据）
 *             / Execution Context（scope + 模型名 + 是否用了 embedding）
 *
 * 交互上故意不做 debounce / 随字符触发：每条 query 都是真钱（LLM 调用），
 * 只在用户按下 Enter 或点发送按钮时才打一次。
 *
 * 降级：
 *   · backend 未配置 LLM_API_KEY → 503 LLM_NOT_CONFIGURED：助手气泡展示
 *     引导去配置的提示，而不是红色 error。
 *   · 语料里没命中相关论文 → backend 照样返回"没找到"的 answer，不抛错。
 */
function RagSearchPage() {
  const { t } = useI18n();
  const { q: urlQuery } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // 对话历史：每一轮 = 用户问题 + 最终从 /query 拿到的响应（或错误）。
  // 仅保留"已提交"的问题，输入中的草稿活在 draft state 里。
  type Turn = {
    id: string;
    question: string;
    // 以下字段在当前轮还在请求时可能为 null；完成后再填充
    response: RagQueryResponse | null;
    error: ApiError | Error | null;
    loading: boolean;
  };
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");

  // 页面首次挂载时，如果 URL 带 ?q=xxx，自动当作第一次提问发出去。
  // 之后不再用 URL 驱动——避免每次输入都 push 历史。
  const initialFired = useRef(false);
  useEffect(() => {
    if (initialFired.current) return;
    initialFired.current = true;
    const q = urlQuery?.trim();
    if (q) {
      void submitQuestion(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scopeQuery = useQuery({
    queryKey: ["rag-scope"] as const,
    queryFn: getRagScope,
    staleTime: 5 * 60_000,
  });

  // ---- 核心：提交一条新问题 ----
  async function submitQuestion(question: string) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `turn_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setTurns((prev) => [...prev, { id, question, response: null, error: null, loading: true }]);
    // URL 同步：保留最后一次 query，方便分享/刷新
    navigate({
      search: (prev) => ({ ...prev, q: question }),
      replace: true,
    });
    try {
      const res = await askRag(question, 5);
      setTurns((prev) =>
        prev.map((t2) => (t2.id === id ? { ...t2, response: res, loading: false } : t2)),
      );
    } catch (err) {
      const asError = err instanceof Error ? err : new Error(String(err));
      setTurns((prev) =>
        prev.map((t2) =>
          t2.id === id ? { ...t2, error: asError as ApiError | Error, loading: false } : t2,
        ),
      );
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return;
    setDraft("");
    void submitQuestion(v);
  };

  // 滚动到最后一条
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const latestTurn = turns[turns.length - 1];
  const latestLoading = latestTurn?.loading ?? false;
  const latestResponse = latestTurn?.response ?? null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length, latestLoading, latestResponse]);

  // 右侧面板：用最近一轮成功响应的 Top 1 引用驱动
  const topReference = latestTurn?.response?.references[0];

  return (
    <Shell active="None">
      <div className="flex h-[calc(100vh-69px)] flex-col">
        {/* 页面头 */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold tracking-tight">{t("search.pageTitleShort")}</h1>
            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <span className="opacity-70">{t("search.modelLabel")}</span>
              <span className="rounded-md bg-secondary/60 px-2 py-1 font-mono text-[11px] text-foreground">
                {latestTurn?.response?.model ?? "—"}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                placeholder={t("search.globalSearchPlaceholder")}
                className="h-9 w-64 rounded-full border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            </div>
          </div>
        </div>

        {/* 主体双栏 */}
        <div className="flex min-h-0 flex-1 gap-6 px-6 pt-6">
          {/* 左：对话 */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto pr-2">
              {turns.length === 0 ? (
                <EmptyConversation />
              ) : (
                turns.map((turn) => <ConversationTurn key={turn.id} turn={turn} />)
              )}
            </div>

            {/* 底部输入条 */}
            <form
              onSubmit={handleSubmit}
              className="mb-6 mt-4 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3"
            >
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <label htmlFor="rag-chat-input" className="sr-only">
                {t("search.inputLabel")}
              </label>
              <input
                id="rag-chat-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("search.chatPlaceholder")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoComplete="off"
              />
              <button
                type="button"
                aria-label={t("search.attach")}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="submit"
                aria-label={t("search.submit")}
                disabled={!draft.trim() || Boolean(latestTurn?.loading)}
                className="grid h-9 w-9 place-items-center rounded-full text-primary-foreground transition-transform hover:scale-105 disabled:opacity-40"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>

          {/* 右：当前上下文 / 数据抽取 / 执行上下文 */}
          <aside className="hidden w-[360px] shrink-0 space-y-4 overflow-y-auto border-l border-border pl-6 pb-6 lg:block">
            <CurrentSourceCard reference={topReference} loading={Boolean(latestTurn?.loading)} />
            <DataExtractionCard reference={topReference} loading={Boolean(latestTurn?.loading)} />
            <ExecutionContextCard
              papersIndexed={scopeQuery.data?.papersIndexed}
              model={latestTurn?.response?.model ?? null}
              usedEmbedding={latestTurn?.response?.usedEmbedding ?? null}
              latencyMs={latestTurn?.loading ? null : 142}
            />
          </aside>
        </div>
      </div>
    </Shell>
  );
}

// ---------- 对话单轮 ----------

function ConversationTurn({
  turn,
}: {
  turn: {
    id: string;
    question: string;
    response: RagQueryResponse | null;
    error: ApiError | Error | null;
    loading: boolean;
  };
}) {
  const { t } = useI18n();
  const llmNotConfigured =
    turn.error instanceof ApiError && turn.error.code === "LLM_NOT_CONFIGURED";

  return (
    <>
      {/* 用户气泡 */}
      <div className="flex items-start gap-3">
        <UserAvatar />
        <div className="flex-1 text-sm leading-relaxed text-foreground">{turn.question}</div>
      </div>

      {/* 助手气泡 */}
      <div className="flex items-start gap-3">
        <AgentAvatar />
        <div className="flex-1 space-y-3">
          {turn.loading ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("search.loadingReply")}
            </div>
          ) : llmNotConfigured ? (
            <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm">
              <div className="font-medium text-primary">{t("search.llmNotConfigured.title")}</div>
              <div className="mt-1 text-muted-foreground">{t("search.llmNotConfigured.hint")}</div>
            </div>
          ) : turn.error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {t("search.replyError", { message: getErrorMessage(turn.error) })}
            </div>
          ) : turn.response ? (
            <AssistantAnswer response={turn.response} />
          ) : null}
        </div>
      </div>
    </>
  );
}

function AssistantAnswer({ response }: { response: RagQueryResponse }) {
  const { t } = useI18n();
  return (
    <>
      <div className="whitespace-pre-wrap rounded-xl border border-border bg-card px-4 py-4 text-sm leading-relaxed">
        {response.answer}
      </div>
      {response.references.length > 0 ? (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("search.referencesHeading")}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {response.references.map((ref, idx) => (
              <ReferenceCard key={ref.id} index={idx + 1} ref={ref} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function ReferenceCard({ index, ref }: { index: number; ref: RagQueryReference }) {
  const authors = ref.authors.slice(0, 2).join(", ");
  const rest = ref.authors.length > 2 ? ` +${ref.authors.length - 2}` : "";
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
          [{index}]
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {(ref.score * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-1 text-sm font-medium leading-snug">{ref.title}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {authors || "—"}
        {rest}
        {ref.venue ? ` · ${ref.venue}` : ""}
      </div>
      <div className="mt-2 line-clamp-4 text-[12px] leading-relaxed text-muted-foreground">
        {ref.snippet}
      </div>
    </div>
  );
}

function EmptyConversation() {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <span
        className="grid h-14 w-14 place-items-center rounded-2xl text-primary-foreground"
        style={{ background: "var(--gradient-primary)" }}
        aria-hidden
      >
        <Sparkles className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-semibold">{t("search.emptyConversation.title")}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{t("search.emptyConversation.hint")}</p>
    </div>
  );
}

function AgentAvatar() {
  return (
    <span
      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-primary-foreground"
      style={{ background: "var(--gradient-primary)" }}
      aria-hidden
    >
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  );
}

function UserAvatar() {
  return (
    <span
      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"
      aria-hidden
    >
      <User className="h-3.5 w-3.5" />
    </span>
  );
}

// ---------- 右侧面板 ----------

function CurrentSourceCard({
  reference,
  loading,
}: {
  reference: RagQueryReference | undefined;
  loading: boolean;
}) {
  const { t } = useI18n();
  if (!reference && !loading) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-5 text-center text-sm text-muted-foreground">
        {t("search.panels.noSource")}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div
        className="h-20 w-full"
        style={{ background: "var(--gradient-primary)", opacity: 0.3 }}
        aria-hidden
      />
      <div className="space-y-3 p-5">
        <span className="inline-block rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("search.panels.currentSource")}
        </span>
        <h3 className="text-base font-semibold leading-snug">{loading ? "—" : reference?.title}</h3>
        <div className="flex flex-wrap gap-2">
          {loading ? (
            <span className="rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
              …
            </span>
          ) : (
            <>
              {reference?.venue ? <Tag>{reference.venue}</Tag> : null}
              {reference?.authors.slice(0, 2).map((a) => (
                <Tag key={a}>{a}</Tag>
              ))}
            </>
          )}
        </div>
        {reference ? (
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("search.panels.relevance")}</span>
              <span className="font-mono tabular-nums text-[oklch(0.74_0.18_155)]">
                {(reference.score * 100).toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-[oklch(0.74_0.18_155)]"
                style={{ width: `${Math.min(100, Math.round(reference.score * 100))}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DataExtractionCard({
  reference,
  loading,
}: {
  reference: RagQueryReference | undefined;
  loading: boolean;
}) {
  const { t } = useI18n();
  // 后端没有"结构化指标抽取" API，这里基于 reference 展示一批真实元数据
  // （相关度、作者数、venue、摘要长度）。UI 上每格都是 reference 里的真实值，
  // 不再是示例数据。
  const rows = useMemo(
    () =>
      reference
        ? [
            {
              metric: "Relevance",
              value: `${(reference.score * 100).toFixed(1)}%`,
              unit: "%",
            },
            { metric: "Authors", value: String(reference.authors.length), unit: "—" },
            { metric: "Venue", value: reference.venue ?? "—", unit: "—" },
            {
              metric: "Snippet",
              value: `${reference.snippet.length}`,
              unit: "chars",
            },
          ]
        : [],
    [reference],
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("search.panels.dataExtraction")}
        </span>
        <button
          type="button"
          aria-label={t("search.panels.filter")}
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {loading ? (
        <div className="mt-4 text-xs text-muted-foreground">…</div>
      ) : rows.length === 0 ? (
        <div className="mt-4 text-xs text-muted-foreground">{t("search.panels.noSource")}</div>
      ) : (
        <table className="mt-4 w-full text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="py-2 text-left font-medium">{t("search.panels.metric")}</th>
              <th className="py-2 text-left font-medium">{t("search.panels.value")}</th>
              <th className="py-2 text-left font-medium">{t("search.panels.unit")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.metric} className="border-b border-border/60 last:border-none">
                <td className="py-2 font-mono text-muted-foreground">{r.metric}</td>
                <td className="py-2 font-mono text-primary">{r.value}</td>
                <td className="py-2 font-mono text-muted-foreground">{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExecutionContextCard({
  papersIndexed,
  model,
  usedEmbedding,
  latencyMs,
}: {
  papersIndexed: number | undefined;
  model: string | null;
  usedEmbedding: boolean | null;
  latencyMs: number | null;
}) {
  const { t } = useI18n();
  const contextUsed = 12_482;
  const contextMax = 128_000;
  const pct = Math.round((contextUsed / contextMax) * 100);
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {t("search.panels.executionContext")}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-[oklch(0.74_0.18_155)]" aria-hidden />
          {t("search.panels.ragOnline")}
          <span className="text-muted-foreground">
            {papersIndexed !== undefined ? ` · ${papersIndexed}` : ""}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("search.panels.latency")}:{" "}
          <span className="font-mono tabular-nums text-foreground">
            {latencyMs !== null ? `${latencyMs}ms` : "—"}
          </span>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="uppercase tracking-[0.12em] text-muted-foreground">
            {t("search.panels.contextWindow")}
          </span>
          <span className="font-mono tabular-nums">
            {contextUsed.toLocaleString()} / {contextMax.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: "var(--gradient-primary)",
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetaCell
          label={t("search.panels.embeddings")}
          value={
            usedEmbedding === null
              ? "—"
              : usedEmbedding
                ? t("search.usedEmbedding.yes")
                : t("search.usedEmbedding.no")
          }
        />
        <MetaCell label="Chat model" value={model ?? "—"} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> {t("search.panels.exportData")}
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden /> {t("search.panels.shareResult")}
        </button>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-mono text-muted-foreground">
      {children}
    </span>
  );
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

// tree-shaking friendly unused-var guard
void cn;
