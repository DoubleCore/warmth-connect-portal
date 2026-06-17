/**
 * FastclawToolCard — FastClaw 流式工具调用 / 进度的状态卡片。
 *
 * 镜像 Hermes 指令中心 research.tsx 里 BubbleShell / BubbleIcon 的视觉范式，
 * 让两条 FastClaw 链路（部署页、论文分析页）共用同一套工具状态呈现：
 *   - running → Hammer 图标 + primary 调（带旋转 Loader2 暗示进行中）
 *   - done    → CheckCircle2 图标 + success 调，可选展示结果摘要
 *   - progress → 小号 muted 行 + 旋转 Loader2
 */

import { CheckCircle2, Hammer, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { FastclawTranscriptItem } from "@/hooks/use-fastclaw-stream";

type ToolItem = Extract<FastclawTranscriptItem, { kind: "tool" }>;
type ProgressItem = Extract<FastclawTranscriptItem, { kind: "progress" }>;

export function FastclawToolCard({ item }: { item: ToolItem }) {
  const { t } = useI18n();
  const running = item.status === "running";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3",
        running ? "border-primary/30 bg-primary/5" : "border-emerald-500/40 bg-emerald-500/5",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg",
          running
            ? "bg-primary/15 text-primary"
            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        )}
        aria-hidden
      >
        {running ? <Hammer className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {running
              ? t("fastclaw.tool.running", { name: item.name })
              : t("fastclaw.tool.done", { name: item.name })}
          </span>
          {running && <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden />}
        </div>
        {!running && item.summary ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground line-clamp-6">
            {item.summary}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function FastclawProgressRow({ item }: { item: ProgressItem }) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      <span>
        {item.phase}
        {item.detail ? ` · ${item.detail}` : ""}
      </span>
    </div>
  );
}
