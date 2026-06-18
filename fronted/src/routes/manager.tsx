import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ActivitySquare,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Gauge,
  History,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Search,
  Send,
  Sparkles,
  TerminalSquare,
  User,
  XCircle,
} from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { listReproductionRecords } from "@/api/reproduction";
import { cn } from "@/lib/utils";
import { useFastClawDeploy, type DeployPhase } from "@/hooks/use-fastclaw-deploy";
import { FastclawToolCard, FastclawProgressRow } from "@/components/hermes/FastclawToolCard";
import type { FastclawTranscriptItem } from "@/hooks/use-fastclaw-stream";
import {
  getHostDetail,
  getHostMetricsHistory,
  type HostMetricsDto,
  type HostWithLatestMetricsDto,
} from "@/api/host-tracking";
import type { ReproductionRecord, ReproductionStatus } from "@/types/reproduction";

/**
 * Device Manager 的 "Manage Training" 子页面（与侧栏"Manager"对应）。
 *
 * 布局复刻原型：
 *   ┌─ header: 任务标题 + 状态徽章
 *   ├─ left: Command Interface（聊天式运维面板）
 *   └─ right: 训练指标 + Loss 曲线 + Live Terminal Logs
 *
 * 数据策略：
 *   - 任务列表取 `reproduction_records`：它是项目现有的"训练/复现"记录表。
 *   - URL 支持 ?runId=xxx 锚定一条训练；未指定则默认第一条 running / success 的记录。
 *   - 指标面板用 progress / status 映射可视化；loss、日志属于演示性"模拟数据"，
 *     后端没有相应字段，前端这里做的是基于真实记录 id 的确定性伪数据，避免每次
 *     刷新跳动。
 */

type ManagerSearch = {
  runId?: string;
};

export const Route = createFileRoute("/manager")({
  validateSearch: (search: Record<string, unknown>): ManagerSearch => ({
    runId: typeof search.runId === "string" ? search.runId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Training Manager — Hermes AI" },
      {
        name: "description",
        content: "Live command interface for running reproductions and training jobs.",
      },
    ],
  }),
  component: ManagerPage,
});

function ManagerPage() {
  const { t } = useI18n();
  const { runId } = Route.useSearch();
  // 右侧遥测面板可折叠：折叠后对话占满整宽，视觉对齐 /research。
  // 默认展开；用户偏好写进 localStorage，刷新保留。
  const [telemetryCollapsed, setTelemetryCollapsed] = useState<boolean>(() =>
    readTelemetryCollapsed(),
  );

  const toggleTelemetry = () => {
    setTelemetryCollapsed((prev) => {
      const next = !prev;
      writeTelemetryCollapsed(next);
      return next;
    });
  };

  const recordsQuery = useQuery({
    queryKey: ["reproduction-records"],
    queryFn: listReproductionRecords,
  });

  const records = recordsQuery.data?.items ?? [];

  // 默认锚定：优先 URL 里的 runId，其次 running，再次第一条
  const active =
    records.find((r) => r.id === runId) ??
    records.find((r) => r.status === "running") ??
    records[0];

  if (recordsQuery.isLoading) {
    return (
      <Shell active="None">
        <div className="grid h-[calc(100vh-69px)] place-items-center text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("manager.loading")}
          </span>
        </div>
      </Shell>
    );
  }

  if (!active) {
    return (
      <Shell active="None">
        <ManagerShell>
          <EmptyState />
        </ManagerShell>
      </Shell>
    );
  }

  return (
    <Shell active="None">
      <ManagerShell
        header={
          <ManagerHeader
            active={active}
            runsList={records}
            telemetryCollapsed={telemetryCollapsed}
            onToggleTelemetry={toggleTelemetry}
          />
        }
      >
        <div
          className={cn(
            "grid min-h-0 flex-1 gap-6 px-6 pb-6 pt-4",
            telemetryCollapsed ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]",
          )}
        >
          <div className={cn(telemetryCollapsed && "mx-auto w-full max-w-3xl")}>
            <CommandInterfacePanel active={active} />
          </div>
          {telemetryCollapsed ? null : <TelemetryPanel active={active} />}
        </div>
      </ManagerShell>
    </Shell>
  );
}

// 折叠偏好持久化（localStorage，SSR 安全）
const TELEMETRY_COLLAPSE_KEY = "hermes.manager.telemetry-collapsed";

function readTelemetryCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TELEMETRY_COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTelemetryCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TELEMETRY_COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch {
    // quota / private mode — 忽略
  }
}

// ---------- Shell ----------

function ManagerShell({
  header,
  children,
}: {
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex h-[calc(100vh-69px)] flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <Link
          to="/workspace"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t("manager.backToDevices")}
        </Link>
        {header ? <div className="flex-1">{header}</div> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function ManagerHeader({
  active,
  runsList,
  telemetryCollapsed,
  onToggleTelemetry,
}: {
  active: ReproductionRecord;
  runsList: ReproductionRecord[];
  telemetryCollapsed: boolean;
  onToggleTelemetry: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {t("manager.titlePrefix")}: {active.paper.title}
        </h1>
        <StatusBadge status={active.status} />
      </div>
      <div className="flex items-center gap-2">
        <select
          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          value={active.id}
          onChange={(e) => {
            // Soft client-side navigation: the route reads runId from search and
            // re-anchors the active run without a full-page reload.
            void navigate({ to: "/manager", search: { runId: e.target.value } });
          }}
          aria-label={t("manager.switchRun")}
        >
          {runsList.map((r) => (
            <option key={r.id} value={r.id}>
              {r.paper.title} · {r.status}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onToggleTelemetry}
          aria-pressed={!telemetryCollapsed}
          title={telemetryCollapsed ? t("manager.telemetry.show") : t("manager.telemetry.hide")}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {telemetryCollapsed ? (
            <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <PanelRightClose className="h-3.5 w-3.5" aria-hidden />
          )}
          {telemetryCollapsed ? t("manager.telemetry.show") : t("manager.telemetry.hide")}
        </button>
      </div>
    </div>
  );
}

// ---------- 左：Command Interface ----------

function CommandInterfacePanel({ active }: { active: ReproductionRecord }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  // persistKey 按 reproductionId 分隔——刷新或切回这条复现都能恢复对话。
  const deploy = useFastClawDeploy({ persistKey: active.id });
  const scrollRef = useRef<HTMLDivElement>(null);
  // 防 strict-mode 双触发 / 渲染抖动：每个 reproductionId 只允许 fire 一次。
  // reset 时由副作用重置成 null，让下一轮可以重新发起。
  const firedKeyRef = useRef<string | null>(null);

  const isBusy = deploy.phase === "streaming";

  // 自动触发部署：必须等到 hook 从 localStorage 恢复完毕，且确实没有任何
  // 历史消息时才发起；这样即使刷新也不会重复打部署初始化指令。
  useEffect(() => {
    if (!deploy.restored) return;
    if (!active || active.status !== "running") return;
    if (!active.device) return;
    if (deploy.items.length > 0) {
      // 已经有恢复出来的对话，标记为 fired，避免之后被错误重发。
      firedKeyRef.current = active.id;
      return;
    }
    if (deploy.phase === "streaming") return;
    if (firedKeyRef.current === active.id) return;

    firedKeyRef.current = active.id;
    deploy.startDeploy(
      {
        reproductionId: active.id,
        paperId: active.paper.id,
        deviceId: active.device.id,
      },
      // 把"做什么"作为用户气泡显示出来，避免初始化指令隐式发出后用户盯着空白等。
      `请帮我把《${active.paper.title}》部署到设备「${active.device.name}」上，并按标准流程拉代码、装依赖、跑训练。`,
    );
  }, [deploy.restored, deploy.items.length, deploy.phase, active, deploy]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [deploy.items]);

  // 把 transcript 按 user 消息聚合成一轮一轮（镜像 /research 的 groupTurns）：
  // 每条 user 开一轮，后续所有非 user 项归到当前轮，渲染成"提问 → 回答"两行气泡。
  const turns = useMemo(() => groupDeployTurns(deploy.items), [deploy.items]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = draft.trim();
    if (!msg || isBusy) return;
    setDraft("");
    deploy.send(msg);
  };

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TerminalSquare className="h-4 w-4 text-primary" aria-hidden />
          {t("manager.panels.commandInterface")}
        </div>
        <div className="flex items-center gap-2">
          <DeployPhaseBadge phase={deploy.phase} />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy}
            onClick={() => {
              firedKeyRef.current = null; // 让下一轮 useEffect 可以重新 fire
              deploy.reset();
            }}
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            New
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {turns.length === 0 && deploy.phase === "idle" ? (
          <EmptyDeployConversation />
        ) : (
          turns.map((turn, idx) => (
            <DeployTurn
              key={turn.userId ?? `turn-${idx}`}
              turn={turn}
              isLast={idx === turns.length - 1}
              phase={deploy.phase}
            />
          ))
        )}

        {deploy.error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {deploy.error}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="mx-4 mb-4 mt-2 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3"
      >
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isBusy ? t("manager.chat.streaming") : t("manager.chat.inputPlaceholder")}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
          autoComplete="off"
          disabled={isBusy}
        />
        {/* Paperclip 是视觉占位：部署对话目前不支持附件上传（镜像 /research） */}
        <button
          type="button"
          aria-label={t("search.attach")}
          disabled
          className="rounded-full p-1.5 text-muted-foreground opacity-40"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="submit"
          aria-label={t("manager.chat.send")}
          className="grid h-9 w-9 place-items-center rounded-full text-primary-foreground transition-transform hover:scale-105 disabled:opacity-40"
          style={{ background: "var(--gradient-primary)" }}
          disabled={!draft.trim() || isBusy}
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
        </button>
      </form>
      <div className="mx-4 mb-4 flex flex-wrap gap-2">
        <SlashChip disabled={isBusy} onClick={() => deploy.send("查看当前训练状态")}>
          /status
        </SlashChip>
        <SlashChip disabled={isBusy} onClick={() => deploy.send("查看 GPU 使用情况")}>
          /gpu
        </SlashChip>
        <SlashChip disabled={isBusy} onClick={() => deploy.send("暂停训练")}>
          /pause
        </SlashChip>
      </div>
    </div>
  );
}

// ---------- Turn 聚合（镜像 /research） ----------

type DeployTurnData = {
  userId: string | null;
  userMessage: string | null;
  events: FastclawTranscriptItem[];
};

function groupDeployTurns(items: FastclawTranscriptItem[]): DeployTurnData[] {
  const turns: DeployTurnData[] = [];
  let current: DeployTurnData | null = null;
  for (const item of items) {
    // system 通告（"部署任务已启动…"）不单独成轮，挂到当前轮的事件流里。
    if (item.kind === "user") {
      current = { userId: item.id, userMessage: item.content, events: [] };
      turns.push(current);
      continue;
    }
    if (!current) {
      current = { userId: null, userMessage: null, events: [] };
      turns.push(current);
    }
    current.events.push(item);
  }
  return turns;
}

function DeployTurn({
  turn,
  isLast,
  phase,
}: {
  turn: DeployTurnData;
  isLast: boolean;
  phase: DeployPhase;
}) {
  // 流式但本轮还没有任何工具/文本时，给一句带 spinner 的等待提示，避免空白。
  const showSpinner =
    isLast &&
    phase === "streaming" &&
    !turn.events.some((it) => it.kind === "tool" || it.kind === "assistant");

  return (
    <>
      {turn.userMessage !== null ? (
        <div className="flex items-start gap-3">
          <AgentAvatar />
          <div className="flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {turn.userMessage}
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <UserAvatar />
        <div className="min-w-0 flex-1 space-y-3">
          {turn.events.map((item) => (
            <DeployEventBubble key={item.id} item={item} />
          ))}
          {showSpinner ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              正在分析论文与目标主机环境，正在生成部署计划…
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function DeployEventBubble({ item }: { item: FastclawTranscriptItem }) {
  switch (item.kind) {
    case "system":
      return (
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {item.content}
        </div>
      );
    case "tool":
      return <FastclawToolCard item={item} />;
    case "progress":
      return <FastclawProgressRow item={item} />;
    case "assistant":
      return (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <span
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"
            aria-hidden
          >
            <Bot className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <DeployMarkdown>{item.content}</DeployMarkdown>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function EmptyDeployConversation() {
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
      <p className="max-w-sm text-sm text-muted-foreground">{t("manager.chat.waitingDeploy")}</p>
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

// ---------- Phase 徽章（镜像 /research，按 FastClaw 四态精简） ----------

function DeployPhaseBadge({ phase }: { phase: DeployPhase }) {
  const { t } = useI18n();
  const meta = deployPhaseMeta(phase, t);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        meta.tone,
      )}
    >
      <meta.Icon className={cn("h-3 w-3", meta.spin && "animate-spin")} aria-hidden />
      {meta.label}
    </span>
  );
}

function deployPhaseMeta(
  phase: DeployPhase,
  t: (k: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string,
): { label: string; Icon: typeof Loader2; tone: string; spin: boolean } {
  switch (phase) {
    case "idle":
      return {
        label: t("command.phase.idle"),
        Icon: Sparkles,
        tone: "border-border text-muted-foreground",
        spin: false,
      };
    case "streaming":
      return {
        label: t("command.phase.streaming"),
        Icon: Loader2,
        tone: "border-primary/40 text-primary",
        spin: true,
      };
    case "completed":
      return {
        label: t("command.phase.completed"),
        Icon: CheckCircle2,
        tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        spin: false,
      };
    case "error":
      return {
        label: t("command.phase.failed"),
        Icon: XCircle,
        tone: "border-destructive/40 text-destructive",
        spin: false,
      };
  }
}

function SlashChip({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Markdown 渲染组件 — 复用 /research 页面的样式 */
function DeployMarkdown({ children }: { children: string }) {
  return (
    <div className="command-md space-y-2 text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h3 className="mt-1 text-base font-semibold" {...props} />,
          h2: (props) => <h4 className="mt-1 text-sm font-semibold" {...props} />,
          h3: (props) => <h5 className="mt-1 text-sm font-semibold" {...props} />,
          p: (props) => <p className="leading-relaxed" {...props} />,
          ul: (props) => <ul className="list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => <li className="leading-relaxed" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          a: ({ href, ...rest }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
              {...rest}
            />
          ),
          blockquote: (props) => (
            <blockquote
              className="border-l-2 border-border pl-3 text-muted-foreground"
              {...props}
            />
          ),
          code: ({ className, children: codeChildren, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code className={cn("block font-mono text-xs", className)} {...rest}>
                  {codeChildren}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[0.85em]"
                {...rest}
              >
                {codeChildren}
              </code>
            );
          },
          pre: (props) => (
            <pre
              className="max-h-56 overflow-auto rounded-lg bg-secondary/60 p-2 text-xs leading-relaxed"
              {...props}
            />
          ),
          table: (props) => (
            <div className="overflow-x-auto">
              <table className="my-1 w-full border-collapse text-left text-xs" {...props} />
            </div>
          ),
          th: (props) => <th className="border border-border px-2 py-1 font-semibold" {...props} />,
          td: (props) => <td className="border border-border px-2 py-1 align-top" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

// ---------- 右：指标 / Loss / Live logs ----------

function TelemetryPanel({ active }: { active: ReproductionRecord }) {
  const { t } = useI18n();
  const deviceId = active.device?.id;

  // 拉取真实主机监控数据
  const hostQuery = useQuery({
    queryKey: ["host-detail", deviceId],
    queryFn: () => (deviceId ? getHostDetail(deviceId) : Promise.resolve(null)),
    enabled: Boolean(deviceId),
    refetchInterval: 60_000, // 每分钟刷新
  });

  const metrics = hostQuery.data?.latestMetrics;
  const gpu = metrics?.gpus?.[0]; // 取第一张卡

  return (
    <div className="flex min-h-0 flex-col gap-5">
      {/* 顶部四卡指标 — 真实数据 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Cpu}
          label="GPU 利用率"
          value={gpu ? `${gpu.utilizationPct}%` : metrics?.online === false ? "离线" : "—"}
          hint={gpu?.name ?? ""}
          bars={gpu ? gpuUtilBars(gpu.utilizationPct) : undefined}
        />
        <StatCard
          icon={Gauge}
          label="GPU 温度"
          value={gpu?.temperatureC != null ? `${gpu.temperatureC}°C` : "—"}
          hint={gpu?.powerW != null ? `${gpu.powerW.toFixed(1)}W` : ""}
        />
        <StatCard
          icon={ActivitySquare}
          label="显存"
          value={gpu ? `${gpu.memoryUsedMb}/${gpu.memoryTotalMb} MB` : "—"}
          hint={gpu ? `${Math.round((gpu.memoryUsedMb / gpu.memoryTotalMb) * 100)}%` : ""}
          progress={gpu ? gpu.memoryUsedMb / gpu.memoryTotalMb : undefined}
        />
        <StatCard
          icon={Clock}
          label="CPU / 内存"
          value={metrics?.cpuLoad1m != null ? `CPU ${metrics.cpuLoad1m}%` : "—"}
          hint={
            metrics?.memoryUsedMb != null && metrics?.memoryTotalMb != null
              ? `${metrics.memoryUsedMb}/${metrics.memoryTotalMb} MB`
              : ""
          }
          progress={
            metrics?.memoryUsedMb != null && metrics?.memoryTotalMb != null
              ? metrics.memoryUsedMb / metrics.memoryTotalMb
              : undefined
          }
        />
      </div>

      {/* 主机状态卡片 */}
      <HostStatusCard metrics={metrics} host={hostQuery.data} />

      {/* Live logs — 显示最近采集记录 */}
      <LiveMetricsCard deviceId={deviceId} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  progress,
  delta,
  bars,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  hint?: string;
  progress?: number;
  delta?: string;
  bars?: number[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {progress !== undefined ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(progress * 100)}%`,
              background: "var(--gradient-primary)",
            }}
          />
        </div>
      ) : null}
      {delta ? (
        <div className="mt-2 text-[11px] text-muted-foreground">
          <span className="text-[oklch(0.74_0.18_155)]">{delta}</span> (last 100 steps)
        </div>
      ) : null}
      {bars ? (
        <div className="mt-3 flex items-end gap-1">
          {bars.map((b, i) => (
            <div
              key={i}
              className="w-2 rounded-sm bg-[oklch(0.74_0.18_155)]"
              style={{ height: `${Math.max(4, b)}px`, opacity: 0.4 + b / 28 }}
              aria-hidden
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------- 真实监控组件 ----------

function HostStatusCard({
  metrics,
  host,
}: {
  metrics: HostMetricsDto | null | undefined;
  host: HostWithLatestMetricsDto | null | undefined;
}) {
  if (!metrics && !host) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        未绑定主机凭证，无法获取监控数据
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">主机状态</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              metrics?.online ? "bg-[oklch(0.74_0.18_155)]" : "bg-destructive",
            )}
          />
          {metrics?.online ? "在线" : "离线"}
          {metrics?.collectedAt && (
            <span>· {new Date(metrics.collectedAt).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {metrics?.online && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">主机名</span>
            <span className="font-mono">{metrics.hostname ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">内核</span>
            <span className="font-mono text-xs">{metrics.kernel ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">运行时间</span>
            <span className="font-mono">{formatUptime(metrics.uptimeSeconds)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">磁盘</span>
            <span className="font-mono">
              {metrics.diskUsedPct != null ? `${metrics.diskUsedPct}%` : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">SSH 延迟</span>
            <span className="font-mono">
              {metrics.latencyMs != null ? `${metrics.latencyMs}ms` : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IP</span>
            <span className="font-mono">{host?.host ?? "—"}</span>
          </div>
        </div>
      )}

      {metrics && !metrics.online && metrics.errorMessage && (
        <div className="mt-3 rounded-md bg-destructive/5 p-2 text-xs text-destructive">
          {metrics.errorMessage}
        </div>
      )}
    </div>
  );
}

function LiveMetricsCard({ deviceId }: { deviceId: string | undefined }) {
  const historyQuery = useQuery({
    queryKey: ["host-metrics-history", deviceId],
    queryFn: () =>
      deviceId ? getHostMetricsHistory(deviceId, { limit: 10 }) : Promise.resolve({ items: [] }),
    enabled: Boolean(deviceId),
    refetchInterval: 60_000,
  });

  const items = historyQuery.data?.items ?? [];

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 rounded-full bg-[oklch(0.74_0.18_155)]" aria-hidden />
          采集日志（最近 10 条）
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed max-h-48">
        {items.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">暂无采集记录</div>
        ) : (
          items.map((m) => (
            <div key={m.id} className="break-all">
              <span className="text-muted-foreground">
                [{new Date(m.collectedAt).toLocaleTimeString()}]
              </span>{" "}
              <span
                className={cn(
                  "font-semibold",
                  m.online ? "text-[oklch(0.74_0.18_155)]" : "text-destructive",
                )}
              >
                {m.online ? "OK" : "FAIL"}
              </span>{" "}
              <span className="text-foreground">
                {m.online
                  ? `GPU ${m.gpus?.[0]?.utilizationPct ?? 0}% | ${m.gpus?.[0]?.temperatureC ?? "?"}°C | CPU ${m.cpuLoad1m ?? "?"}% | Mem ${m.memoryUsedMb ?? "?"}/${m.memoryTotalMb ?? "?"} MB`
                  : (m.errorMessage?.slice(0, 80) ?? "连接失败")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

// ---------- helpers ----------

function StatusBadge({ status }: { status: ReproductionStatus }) {
  const map: Record<ReproductionStatus, { label: string; tone: string }> = {
    running: {
      label: "RUNNING",
      tone: "bg-[oklch(0.74_0.18_155)] text-[oklch(0.16_0.03_155)]",
    },
    success: { label: "SUCCESS", tone: "bg-primary/20 text-primary" },
    failed: { label: "FAILED", tone: "bg-destructive/20 text-destructive" },
    paused: { label: "PAUSED", tone: "bg-secondary text-muted-foreground" },
    not_started: {
      label: "PENDING",
      tone: "bg-secondary text-muted-foreground",
    },
  };
  const meta = map[status];
  return (
    <span
      className={cn(
        "rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
        meta.tone,
      )}
    >
      {meta.label}
    </span>
  );
}

function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="mx-auto grid max-w-md flex-1 place-items-center px-6 text-center">
      <div>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{t("manager.empty.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("manager.empty.hint")}</p>
        <Link
          to="/workspace"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("manager.empty.cta")}
        </Link>
      </div>
    </div>
  );
}

function gpuUtilBars(util: number) {
  const bars: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const base = Math.max(4, Math.round((util / 100) * 20 + (i % 3) * 4));
    bars.push(base);
  }
  return bars;
}
