import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ActivitySquare,
  AlertTriangle,
  ArrowLeft,
  Clock,
  Cpu,
  Download,
  Gauge,
  History,
  Loader2,
  Maximize2,
  Send,
  TerminalSquare,
  User,
} from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { listReproductionRecords } from "@/api/reproduction";
import { listDevices } from "@/api/devices";
import { cn } from "@/lib/utils";
import { useFastClawDeploy } from "@/hooks/use-fastclaw-deploy";
import { getHostDetail, getHostMetricsHistory, type HostMetricsDto, type HostWithLatestMetricsDto } from "@/api/host-tracking";
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

  const recordsQuery = useQuery({
    queryKey: ["reproduction-records"],
    queryFn: listReproductionRecords,
  });
  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
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

  const totalNodes = Math.max(1, (devicesQuery.data?.items ?? []).length || 4);

  return (
    <Shell active="None">
      <ManagerShell header={<ManagerHeader active={active} runsList={records} />}>
        <div className="grid min-h-0 flex-1 gap-6 px-6 pb-6 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <CommandInterfacePanel active={active} totalNodes={totalNodes} />
          <TelemetryPanel active={active} totalNodes={totalNodes} />
        </div>
      </ManagerShell>
    </Shell>
  );
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
}: {
  active: ReproductionRecord;
  runsList: ReproductionRecord[];
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {t("manager.titlePrefix")}: {active.paper.title}
        </h1>
        <StatusBadge status={active.status} />
      </div>
      <select
        className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        defaultValue={active.id}
        onChange={(e) => {
          const next = e.target.value;
          const url = new URL(window.location.href);
          url.searchParams.set("runId", next);
          window.history.replaceState({}, "", url.toString());
          // Soft navigate via reload; the route picks runId from URL.
          window.location.reload();
        }}
        aria-label={t("manager.switchRun")}
      >
        {runsList.map((r) => (
          <option key={r.id} value={r.id}>
            {r.paper.title} · {r.status}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------- 左：Command Interface ----------

function CommandInterfacePanel({
  active,
  totalNodes,
}: {
  active: ReproductionRecord;
  totalNodes: number;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  // persistKey 按 reproductionId 分隔——刷新或切回这条复现都能恢复对话。
  const deploy = useFastClawDeploy({ persistKey: active.id });
  const scrollRef = useRef<HTMLDivElement>(null);
  // 防 strict-mode 双触发 / 渲染抖动：每个 reproductionId 只允许 fire 一次。
  // reset 时由副作用重置成 null，让下一轮可以重新发起。
  const firedKeyRef = useRef<string | null>(null);

  // 自动触发部署：必须等到 hook 从 localStorage 恢复完毕，且确实没有任何
  // 历史消息时才发起；这样即使刷新也不会重复打部署初始化指令。
  useEffect(() => {
    if (!deploy.restored) return;
    if (!active || active.status !== "running") return;
    if (!active.device) return;
    if (deploy.messages.length > 0) {
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
  }, [
    deploy.restored,
    deploy.messages.length,
    deploy.phase,
    active,
    deploy,
  ]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [deploy.messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = draft.trim();
    if (!msg) return;
    setDraft("");
    deploy.send(msg);
  };

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TerminalSquare className="h-4 w-4 text-primary" aria-hidden />
          {t("manager.panels.commandInterface")}
          {deploy.phase === "streaming" && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("manager.chat.streaming")}
            </span>
          )}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          onClick={() => {
            firedKeyRef.current = null; // 让下一轮 useEffect 可以重新 fire
            deploy.reset();
          }}
        >
          <History className="h-3.5 w-3.5" aria-hidden />
          New
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {deploy.messages.length === 0 && deploy.phase === "idle" && (
          <div className="text-center text-sm text-muted-foreground py-12">
            {t("manager.chat.waitingDeploy")}
          </div>
        )}

        {deploy.messages.map((msg) => {
          if (msg.role === "system") {
            return (
              <div key={msg.id} className="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {msg.content}
              </div>
            );
          }
          if (msg.role === "user") {
            return <UserBubble key={msg.id}>{msg.content}</UserBubble>;
          }
          // assistant：空内容 + streaming 时显示带 spinner 的等待提示，
          // 不再用裸的「…」让人误以为卡死。
          if (!msg.content) {
            return (
              <SystemBubble key={msg.id}>
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  正在分析论文与目标主机环境，正在生成部署计划…
                </span>
              </SystemBubble>
            );
          }
          return (
            <SystemBubble key={msg.id}>
              <DeployMarkdown>{msg.content}</DeployMarkdown>
            </SystemBubble>
          );
        })}

        {deploy.error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {deploy.error}
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2 rounded-full border border-border bg-background/40 px-4 py-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("manager.chat.inputPlaceholder")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
            disabled={deploy.phase === "streaming"}
          />
          <button
            type="submit"
            aria-label={t("manager.chat.send")}
            className="grid h-8 w-8 place-items-center rounded-full text-primary-foreground disabled:opacity-40"
            style={{ background: "var(--gradient-primary)" }}
            disabled={!draft.trim()}
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <SlashChip onClick={() => deploy.send("查看当前训练状态")}>/status</SlashChip>
          <SlashChip onClick={() => deploy.send("查看 GPU 使用情况")}>/gpu</SlashChip>
          <SlashChip onClick={() => deploy.send("暂停训练")}>/pause</SlashChip>
        </div>
      </form>
    </div>
  );
}

function SystemBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
        <TerminalSquare className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          System
        </div>
        <div className="mt-1 rounded-xl border border-border bg-background/40 px-3 py-2 text-sm leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-row-reverse items-start gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
        <User className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 max-w-[80%]">
        <div className="text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          You
        </div>
        <div className="mt-1 rounded-xl bg-primary/10 px-3 py-2 text-sm leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-sm last:border-none">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 font-mono tabular-nums",
          trend === "down" && "text-[oklch(0.74_0.18_155)]",
        )}
      >
        {value}
        {trend ? <span className="text-[10px]">{trend === "down" ? "↓" : "↑"}</span> : null}
      </span>
    </div>
  );
}

function SlashChip({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors"
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
            <a href={href} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline" {...rest} />
          ),
          blockquote: (props) => (
            <blockquote className="border-l-2 border-border pl-3 text-muted-foreground" {...props} />
          ),
          code: ({ className, children: codeChildren, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return <code className={cn("block font-mono text-xs", className)} {...rest}>{codeChildren}</code>;
            }
            return <code className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[0.85em]" {...rest}>{codeChildren}</code>;
          },
          pre: (props) => (
            <pre className="max-h-56 overflow-auto rounded-lg bg-secondary/60 p-2 text-xs leading-relaxed" {...props} />
          ),
          table: (props) => (
            <div className="overflow-x-auto"><table className="my-1 w-full border-collapse text-left text-xs" {...props} /></div>
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

function TelemetryPanel({
  active,
  totalNodes,
}: {
  active: ReproductionRecord;
  totalNodes: number;
}) {
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

function LossCurveCard({ active }: { active: ReproductionRecord }) {
  const { t } = useI18n();
  const points = useMemo(() => buildLossSeries(active.id, 120), [active.id]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{t("manager.metrics.lossCurve")}</div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: "oklch(0.7 0.18 300)" }}
              aria-hidden
            />
            Train
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: "oklch(0.74 0.18 155)" }}
              aria-hidden
            />
            Eval
          </span>
        </div>
      </div>
      <svg viewBox="0 0 400 140" className="mt-3 h-36 w-full">
        {/* grid */}
        {[0.5, 1, 1.5, 2].map((v, i) => (
          <g key={i}>
            <line
              x1={40}
              x2={390}
              y1={30 + i * 25}
              y2={30 + i * 25}
              stroke="oklch(0.3 0.02 270 / 0.5)"
              strokeDasharray="3 4"
            />
            <text x={8} y={34 + i * 25} fontSize={9} fill="oklch(0.6 0.02 270)">
              {(2 - v / 1).toFixed(1)}
            </text>
          </g>
        ))}
        <path
          d={lossPath(points.train)}
          fill="none"
          stroke="oklch(0.7 0.18 300)"
          strokeWidth={1.75}
        />
        <path
          d={lossPath(points.eval)}
          fill="none"
          stroke="oklch(0.74 0.18 155)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      </svg>
    </div>
  );
}

function LiveLogsCard({ active }: { active: ReproductionRecord }) {
  const { t } = useI18n();
  const lines = useMemo(() => buildLogLines(active), [active]);

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 rounded-full bg-[oklch(0.74_0.18_155)]" aria-hidden />
          {t("manager.logs.heading")}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <IconBtn icon={Gauge} label="filter" />
          <IconBtn icon={Download} label="download" />
          <IconBtn icon={Maximize2} label="expand" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className="break-all">
            <span className="text-muted-foreground">{line.time}</span>{" "}
            <span
              className={cn(
                "font-semibold",
                line.level === "INFO" && "text-primary",
                line.level === "SUCCESS" && "text-[oklch(0.74_0.18_155)]",
                line.level === "WARNING" && "text-amber-500",
                line.level === "ERROR" && "text-destructive",
              )}
            >
              {line.level}
            </span>{" "}
            <span className="text-foreground">{line.body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IconBtn({ icon: Icon, label }: { icon: typeof Gauge; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="rounded-md p-1.5 hover:bg-secondary hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
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
            <span className="font-mono">{metrics.diskUsedPct != null ? `${metrics.diskUsedPct}%` : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">SSH 延迟</span>
            <span className="font-mono">{metrics.latencyMs != null ? `${metrics.latencyMs}ms` : "—"}</span>
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
    queryFn: () => (deviceId ? getHostMetricsHistory(deviceId, { limit: 10 }) : Promise.resolve({ items: [] })),
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
              <span className={cn("font-semibold", m.online ? "text-[oklch(0.74_0.18_155)]" : "text-destructive")}>
                {m.online ? "OK" : "FAIL"}
              </span>{" "}
              <span className="text-foreground">
                {m.online
                  ? `GPU ${m.gpus?.[0]?.utilizationPct ?? 0}% | ${m.gpus?.[0]?.temperatureC ?? "?"}°C | CPU ${m.cpuLoad1m ?? "?"}% | Mem ${m.memoryUsedMb ?? "?"}/${m.memoryTotalMb ?? "?"} MB`
                  : m.errorMessage?.slice(0, 80) ?? "连接失败"}
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

/** 可复现的伪随机数 — 同一 record.id 多次刷新结果一致，避免 UI 抖动 */
function deterministic(seed: string, salt: number, range: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % range;
}

function buildLossSeries(seed: string, count: number) {
  const train: number[] = [];
  const evalArr: number[] = [];
  let cur = 2.1;
  for (let i = 0; i < count; i += 1) {
    const noise = (deterministic(seed, i, 100) / 100 - 0.5) * 0.06;
    cur = Math.max(0.4, cur * 0.985 + noise);
    train.push(cur);
    evalArr.push(cur + 0.12 + (deterministic(seed, i + 1000, 80) / 80 - 0.5) * 0.05);
  }
  return { train, eval: evalArr };
}

function lossPath(values: number[]): string {
  if (values.length === 0) return "";
  const max = 2.2;
  const min = 0.4;
  const toY = (v: number) => 130 - ((v - min) / (max - min)) * 100;
  const step = 350 / Math.max(1, values.length - 1);
  return values
    .map((v, i) => {
      const x = 40 + i * step;
      const y = toY(v);
      return i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function gpuUtilBars(util: number) {
  const bars: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const base = Math.max(4, Math.round((util / 100) * 20 + (i % 3) * 4));
    bars.push(base);
  }
  return bars;
}

function etaFor(r: ReproductionRecord): string {
  if (r.status === "success") return "0h 00m";
  if (r.status === "failed" || r.status === "paused") return "—";
  const remain = Math.max(0, 100 - r.progress);
  const minutes = Math.round(remain * 2.45);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildLogLines(r: ReproductionRecord) {
  const base = r.startedAt ? new Date(r.startedAt) : new Date();
  const step0 = 14_200 + deterministic(r.id, 99, 10_000);
  const line = (n: number, level: "INFO" | "SUCCESS" | "WARNING" | "ERROR", body: string) => ({
    time: formatLogTs(new Date(base.getTime() + n * 15_000)),
    level,
    body,
  });
  return [
    line(0, "INFO", "Initializing distributed training context…"),
    line(1, "INFO", "Found 4 nodes, 32 GPUs total (NVIDIA A100-SXM4-80GB)."),
    line(2, "INFO", "Loading model weights from s3://models/base/"),
    line(3, "INFO", "Model loaded successfully. Allocating VRAM."),
    line(4, "SUCCESS", "VRAM allocation complete. Rank 0 ready."),
    line(5, "INFO", "Starting data loader workers (num_workers=16)."),
    line(6, "INFO", "Beginning Epoch 12."),
    line(7, "INFO", `Step ${step0}/50000 | Loss: 1.051 | lr: 2.5e-5 | grad_norm: 0.84 | 4.1 it/s`),
    line(
      8,
      "WARNING",
      "Node-03 detected slight temperature anomaly (88°C). Throttling gracefully.",
    ),
    line(
      9,
      "INFO",
      `Step ${step0 + 5}/50000 | Loss: 1.042 | lr: 2.5e-5 | grad_norm: 0.81 | 4.2 it/s`,
    ),
    line(
      10,
      "INFO",
      `Step ${step0 + 10}/50000 | Loss: 1.038 | lr: 2.5e-5 | grad_norm: 0.79 | 4.2 it/s`,
    ),
    line(
      11,
      "INFO",
      `Step ${step0 + 15}/50000 | Loss: 1.035 | lr: 2.5e-5 | grad_norm: 0.80 | 4.2 it/s`,
    ),
  ];
}

function formatLogTs(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `[${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}]`;
}
