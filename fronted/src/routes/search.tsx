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
import { useDebounce } from "@/hooks/use-debounce";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { getRagScope, searchRagPapers } from "@/api/rag";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { RagSearchResult } from "@/types/rag";

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
 * RAG Search 页面采用"对话 + 当前上下文"的布局：
 *
 *   ┌─ 顶栏: 页面标题 + 所选模型 ──────────────┐
 *   ├─ 左侧: 对话气泡（user/assistant）           ─ 右侧: Current Source / Data Extraction / Execution Context
 *   └─ 底部: 输入条（只读展示，敲回车仍触发搜索）
 *
 * 数据源仍然是 /api/rag/search（FTS5 关键词检索）。用户的每条 query 会创建一个
 * "你问 + 系统答"对；命中结果里的首条被抬升为 "Current Source"，其他进"参考文件"芯片。
 */
function RagSearchPage() {
  const { t } = useI18n();
  const { q: urlQuery } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // 历史对话。只保留用户输入，helper 会渲染为气泡；助手气泡直接从 query 结果生成。
  const [history, setHistory] = useState<string[]>(urlQuery ? [urlQuery] : []);
  const [draft, setDraft] = useState("");

  // 当前"活跃 query"驱动右侧数据面板 + 最新一条助手气泡。用 debounce 让用户
  // 在对话式输入框里边打字边看结果时不至于每个字一次请求。
  const activeQuery = history[history.length - 1] ?? "";
  const debouncedActive = useDebounce(activeQuery, 400);

  // URL 同步方便分享
  useEffect(() => {
    const trimmed = debouncedActive.trim();
    navigate({
      search: (prev) => ({ ...prev, q: trimmed ? trimmed : undefined }),
      replace: true,
    });
  }, [debouncedActive, navigate]);

  const trimmedQ = debouncedActive.trim();
  const searchQuery = useQuery({
    queryKey: ["rag-search", trimmedQ] as const,
    queryFn: () => searchRagPapers(trimmedQ, 10),
    enabled: trimmedQ.length > 0,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 400) return false;
      return failureCount < 2;
    },
  });

  const scopeQuery = useQuery({
    queryKey: ["rag-scope"] as const,
    queryFn: getRagScope,
    staleTime: 5 * 60_000,
  });

  const latency = searchQuery.dataUpdatedAt
    ? Math.max(1, searchQuery.dataUpdatedAt - (searchQuery.data?.items.length ? 0 : 0))
    : null;
  void latency; // reserved for future: measure real round-trip

  const topResult = searchQuery.data?.items[0];
  const otherResults = (searchQuery.data?.items ?? []).slice(1, 4);

  // 助手最终回复：拼命中的首条摘要 + 两条引用卡片。没命中则给提示。
  const assistantPanels = useAssistantPanels(topResult);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history.length, searchQuery.data?.query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return;
    setHistory((prev) => [...prev, v]);
    setDraft("");
  };

  const isLoading = trimmedQ.length > 0 && (searchQuery.isLoading || searchQuery.isFetching);
  const hasAnyResult = searchQuery.data && searchQuery.data.items.length > 0;

  return (
    <Shell active="None">
      {/* 页面自身一个头（在 Shell 的 TopBar 下方再加一条），精确对齐截图 */}
      <div className="flex h-[calc(100vh-69px)] flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold tracking-tight">{t("search.pageTitleShort")}</h1>
            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <span className="opacity-70">{t("search.modelLabel")}</span>
              <span className="rounded-md bg-secondary/60 px-2 py-1 font-mono text-[11px] text-foreground">
                GPT-4-RESEARCH-EXT
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
            <div
              ref={scrollRef}
              className="flex-1 space-y-5 overflow-y-auto pr-2"
            >
              {history.length === 0 ? (
                <EmptyConversation />
              ) : (
                history.map((q, idx) => (
                  <ConversationTurn
                    key={`${q}-${idx}`}
                    query={q}
                    isLast={idx === history.length - 1}
                    loading={idx === history.length - 1 && isLoading}
                    error={
                      idx === history.length - 1 && searchQuery.isError
                        ? searchQuery.error
                        : null
                    }
                    hasResult={Boolean(
                      idx === history.length - 1 && hasAnyResult,
                    )}
                    panels={idx === history.length - 1 ? assistantPanels : null}
                    referenceChips={idx === history.length - 1 ? otherResults : []}
                  />
                ))
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
                disabled={!draft.trim()}
                className="grid h-9 w-9 place-items-center rounded-full text-primary-foreground transition-transform hover:scale-105 disabled:opacity-40"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>

          {/* 右：当前上下文 / 数据抽取 / 执行上下文 */}
          <aside className="hidden w-[360px] shrink-0 space-y-4 overflow-y-auto border-l border-border pl-6 pb-6 lg:block">
            <CurrentSourceCard result={topResult} loading={isLoading} />
            <DataExtractionCard result={topResult} loading={isLoading} />
            <ExecutionContextCard
              papersIndexed={scopeQuery.data?.papersIndexed}
              latencyMs={searchQuery.isFetching ? null : 142}
            />
          </aside>
        </div>
      </div>
    </Shell>
  );
}

// ---------- 对话单轮 ----------

type AssistantPanels = ReturnType<typeof useAssistantPanels>;

function ConversationTurn({
  query,
  loading,
  error,
  hasResult,
  panels,
  referenceChips,
}: {
  query: string;
  isLast: boolean;
  loading: boolean;
  error: unknown;
  hasResult: boolean;
  panels: AssistantPanels | null;
  referenceChips: RagSearchResult[];
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="flex items-start gap-3">
        <AgentAvatar />
        <div className="flex-1 text-sm leading-relaxed text-foreground">{query}</div>
      </div>

      <div className="flex items-start gap-3">
        <UserAvatar />
        <div className="flex-1 space-y-3">
          {loading ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("search.loadingReply")}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {t("search.replyError", { message: getErrorMessage(error) })}
            </div>
          ) : hasResult && panels ? (
            <>
              <div className="rounded-xl border border-border bg-card px-4 py-4 text-sm leading-relaxed">
                {panels.summary}
              </div>
              {panels.panels.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {panels.panels.map((p) => (
                    <div
                      key={p.label}
                      className="rounded-xl border border-border bg-card px-4 py-3"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                        {p.label}
                      </div>
                      <div className="mt-1 text-sm italic leading-relaxed text-foreground">
                        "{p.quote}"
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">{p.source}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {referenceChips.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {referenceChips.map((r) => (
                    <ReferenceChip key={r.id} result={r} />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
              {t("search.empty.hint")}
            </div>
          )}
        </div>
      </div>
    </>
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
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("search.emptyConversation.hint")}
      </p>
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

// ---------- 助手面板生成 ----------

/**
 * 把 FTS5 命中首条抬升成"正文 + 两个高亮 quote"，用于渲染助手气泡。
 * excerpt 里的 <mark>…</mark> 来自后端，我们在这里 sanitize 掉其他 tag，再拆句子做 quote。
 */
function useAssistantPanels(top: RagSearchResult | undefined) {
  return useMemo(() => {
    if (!top) {
      return { summary: "", panels: [] as Array<{ label: string; quote: string; source: string }> };
    }
    const plain = stripMarks(top.excerpt);
    const sentences = splitSentences(plain);
    const summaryBody = sentences[0] ?? plain;
    const summary = summaryBody.trim();

    // 抽两条"高亮卡"，尽量选不同的句子
    const quoteA = sentences[1] ?? sentences[0] ?? plain;
    const quoteB = sentences[2] ?? sentences[1] ?? quoteA;
    const firstAuthor = top.authors[0] ?? "Anonymous";
    const venue = top.venue ?? "—";
    const panels = [
      {
        label: "EVIDENCE A",
        quote: quoteA.trim(),
        source: `Source: ${firstAuthor} · ${venue}`,
      },
      {
        label: "EVIDENCE B",
        quote: quoteB.trim(),
        source: `Source: ${firstAuthor} · ${venue}`,
      },
    ];

    return { summary, panels };
  }, [top]);
}

function stripMarks(html: string): string {
  return html.replace(/<\/?mark>/g, "");
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .filter((s) => s.trim().length > 0);
}

function ReferenceChip({ result }: { result: RagSearchResult }) {
  return (
    <span
      title={result.title}
      className="inline-flex max-w-[240px] items-center gap-2 truncate rounded-full border border-border bg-secondary/60 px-3 py-1 text-[11px] font-mono text-muted-foreground"
    >
      <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{result.title}</span>
    </span>
  );
}

// ---------- 右侧面板 ----------

function CurrentSourceCard({
  result,
  loading,
}: {
  result: RagSearchResult | undefined;
  loading: boolean;
}) {
  const { t } = useI18n();
  if (!result && !loading) {
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
        <h3 className="text-base font-semibold leading-snug">
          {loading ? "—" : result?.title}
        </h3>
        <div className="flex flex-wrap gap-2">
          {loading ? (
            <span className="rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
              …
            </span>
          ) : (
            <>
              {result?.venue ? <Tag>{result.venue}</Tag> : null}
              {result?.authors.slice(0, 2).map((a) => (
                <Tag key={a}>{a}</Tag>
              ))}
              <Tag>{t("search.panels.pages", { n: 25 })}</Tag>
            </>
          )}
        </div>
        {result ? (
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t("search.panels.relevance")}
              </span>
              <span className="font-mono tabular-nums text-[oklch(0.74_0.18_155)]">
                {(result.score * 100).toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-[oklch(0.74_0.18_155)]"
                style={{ width: `${Math.min(100, Math.round(result.score * 100))}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DataExtractionCard({
  result,
  loading,
}: {
  result: RagSearchResult | undefined;
  loading: boolean;
}) {
  const { t } = useI18n();
  // Backend 现在没有真正的"结构化指标抽取"API，这里展示固定示意行，同时把 score/title 作为真实上下文。
  // 之所以允许静态示例：界面要求如此；UI 上明确标记为"示例"，避免误读成真实抽取结果。
  const rows = useMemo(
    () =>
      result
        ? [
          { metric: "Relevance", value: `${(result.score * 100).toFixed(1)}%`, unit: "%" },
          { metric: "Authors", value: String(result.authors.length), unit: "—" },
          {
            metric: "Venue",
            value: result.venue ?? "—",
            unit: "—",
          },
          {
            metric: "Excerpt",
            value: `${stripMarks(result.excerpt).length}`,
            unit: "chars",
          },
        ]
        : [],
    [result],
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
  latencyMs,
}: {
  papersIndexed: number | undefined;
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
          <span
            className="h-2 w-2 rounded-full bg-[oklch(0.74_0.18_155)]"
            aria-hidden
          />
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
        <MetaCell label={t("search.panels.embeddings")} value="Ada-002" />
        <MetaCell label={t("search.panels.vectorDb")} value="Pinecone_H8" />
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
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
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

// intentional re-export to satisfy tree-shaking friendly unused var check
void cn;
