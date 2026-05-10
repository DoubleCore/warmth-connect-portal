import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CornerDownLeft,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useMainCommandStream } from "@/hooks/command-stream-context";
import { CommandConversation } from "@/components/hermes/CommandConversation";

/**
 * FloatingAssistant —— 全站可呼出的悬浮对话助手。
 *
 * 设计要点：
 *   - 与主页 `CommandPrompt` / `/research` 页共享**同一条** Command 流
 *     （见 `MainCommandStreamProvider`），三个视图渲染同一个 transcript。
 *     这样 "浮窗里问一句" → "切到 /research 看详情" → "回到主页继续问"
 *     永远看到的是同一个连续会话。
 *   - FAB + 卡片都 position: fixed + z-50。右下角为默认锚点，支持拖拽头部；
 *     位置与展开状态持久化到 localStorage，SSR 初始值稳定（折叠态 + 右下角默认）。
 *   - 主页 `/` 和研究页 `/research` 已经有原生的 Command 面板，FAB 自动隐藏，
 *     避免两个视图互相抢注意力。
 *   - Busy / 等待确认 时 FAB 上显示状态圆点提示。
 *
 * SSR 一致性：
 *   - 第一次客户端渲染必须与 SSR 输出一致。所以 `open` / `position` 的初值
 *     来自常量（而不是直接读 localStorage），恢复值在 useEffect 里异步写入。
 */

const STORAGE_KEY = "hermes.assistant.ui";
const ROUTES_HIDING_FAB: readonly string[] = ["/", "/research"];
const CARD_WIDTH = 380;
const CARD_HEIGHT = 560;
const FAB_SIZE = 56;
const EDGE_GAP = 24;

type StoredUi = {
  open: boolean;
  minimized: boolean;
  /** Offset from viewport right / bottom in px. */
  right: number;
  bottom: number;
};

const DEFAULT_UI: StoredUi = {
  open: false,
  minimized: false,
  right: EDGE_GAP,
  bottom: EDGE_GAP,
};

function readStoredUi(): StoredUi {
  if (typeof window === "undefined") return DEFAULT_UI;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UI;
    const parsed = JSON.parse(raw) as Partial<StoredUi>;
    return {
      open: Boolean(parsed.open),
      minimized: Boolean(parsed.minimized),
      right: typeof parsed.right === "number" ? parsed.right : EDGE_GAP,
      bottom: typeof parsed.bottom === "number" ? parsed.bottom : EDGE_GAP,
    };
  } catch {
    return DEFAULT_UI;
  }
}

function writeStoredUi(ui: StoredUi) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ui));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function FloatingAssistant() {
  const { t } = useI18n();
  const command = useMainCommandStream();

  // SSR-safe defaults; we rehydrate from localStorage in the effect below.
  const [ui, setUi] = useState<StoredUi>(DEFAULT_UI);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUi(readStoredUi());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) writeStoredUi(ui);
  }, [ui, mounted]);

  // Auto-hide FAB on surfaces that already own a full-width Command panel.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hiddenOnThisRoute = ROUTES_HIDING_FAB.includes(pathname);

  // When navigating to /research, collapse the card so we don't double-render.
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      if (hiddenOnThisRoute && ui.open) {
        setUi((prev) => ({ ...prev, open: false, minimized: false }));
      }
    }
  }, [pathname, hiddenOnThisRoute, ui.open]);

  // Flash unread dot when a new event lands while the card is closed / minimized.
  const [hasUnread, setHasUnread] = useState(false);
  const lastTranscriptLen = useRef(command.transcript.length);
  useEffect(() => {
    const len = command.transcript.length;
    if (len > lastTranscriptLen.current && (!ui.open || ui.minimized)) {
      setHasUnread(true);
    }
    lastTranscriptLen.current = len;
  }, [command.transcript.length, ui.open, ui.minimized]);
  useEffect(() => {
    if (ui.open && !ui.minimized) setHasUnread(false);
  }, [ui.open, ui.minimized]);

  if (hiddenOnThisRoute) return null;

  const isBusy =
    command.phase === "connecting" ||
    command.phase === "streaming" ||
    command.phase === "awaiting_confirmation";
  const needsConfirm = command.phase === "awaiting_confirmation";

  // Collapsed: just the FAB.
  if (!ui.open) {
    return (
      <FabButton
        label={t("assistant.open")}
        right={ui.right}
        bottom={ui.bottom}
        busy={isBusy}
        needsConfirm={needsConfirm}
        hasUnread={hasUnread}
        onOpen={() => setUi((prev) => ({ ...prev, open: true, minimized: false }))}
      />
    );
  }

  if (ui.minimized) {
    return (
      <MinimizedPill
        t={t}
        right={ui.right}
        bottom={ui.bottom}
        busy={isBusy}
        needsConfirm={needsConfirm}
        onExpand={() => setUi((prev) => ({ ...prev, minimized: false }))}
        onClose={() => setUi((prev) => ({ ...prev, open: false, minimized: false }))}
      />
    );
  }

  return (
    <AssistantCard
      right={ui.right}
      bottom={ui.bottom}
      currentPage={pathname}
      command={command}
      onPositionChange={(next) => setUi((prev) => ({ ...prev, ...next }))}
      onMinimize={() => setUi((prev) => ({ ...prev, minimized: true }))}
      onClose={() => setUi((prev) => ({ ...prev, open: false, minimized: false }))}
    />
  );
}

// ---------------- FAB ----------------

function FabButton({
  label,
  right,
  bottom,
  busy,
  needsConfirm,
  hasUnread,
  onOpen,
}: {
  label: string;
  right: number;
  bottom: number;
  busy: boolean;
  needsConfirm: boolean;
  hasUnread: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onOpen}
      className={cn(
        "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground",
        "transition-transform hover:scale-105 active:scale-95",
      )}
      style={{
        right,
        bottom,
        background: "var(--gradient-primary)",
        boxShadow: "var(--shadow-glow)",
      }}
    >
      {busy ? (
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      ) : (
        <MessageCircle className="h-6 w-6" aria-hidden />
      )}
      {needsConfirm ? (
        <span
          className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white ring-2 ring-background"
          aria-hidden
        >
          !
        </span>
      ) : hasUnread ? (
        <span
          className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

// ---------------- Minimized pill ----------------

function MinimizedPill({
  t,
  right,
  bottom,
  busy,
  needsConfirm,
  onExpand,
  onClose,
}: {
  t: ReturnType<typeof useI18n>["t"];
  right: number;
  bottom: number;
  busy: boolean;
  needsConfirm: boolean;
  onExpand: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed z-50 flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-1.5 pl-3 shadow-lg"
      style={{ right, bottom }}
    >
      <button
        type="button"
        onClick={onExpand}
        className="flex items-center gap-2 text-sm font-medium"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
        ) : needsConfirm ? (
          <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden />
        ) : (
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        )}
        <span>{t("assistant.title")}</span>
      </button>
      <button
        type="button"
        aria-label={t("assistant.close")}
        onClick={onClose}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

// ---------------- Expanded card ----------------

function AssistantCard({
  right,
  bottom,
  currentPage,
  command,
  onPositionChange,
  onMinimize,
  onClose,
}: {
  right: number;
  bottom: number;
  currentPage: string;
  command: ReturnType<typeof useMainCommandStream>;
  onPositionChange: (p: { right: number; bottom: number }) => void;
  onMinimize: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const cardRef = useRef<HTMLDivElement | null>(null);

  const isBusy =
    command.phase === "connecting" ||
    command.phase === "streaming" ||
    command.phase === "awaiting_confirmation";

  const ctxLabel = useMemo(() => currentPage || "/", [currentPage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isBusy) return;
    setInput("");
    await command.run(trimmed, { currentPage });
  };

  // Drag-to-move: we operate on right/bottom offsets so that resizing the
  // window keeps the card anchored to the nearest edge.
  const dragStart = useRef<null | {
    startX: number;
    startY: number;
    originRight: number;
    originBottom: number;
  }>(null);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore drags starting on interactive elements in the header
    if ((e.target as HTMLElement).closest("button")) return;
    dragStart.current = {
      startX: e.clientX,
      startY: e.clientY,
      originRight: right,
      originBottom: bottom,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragStart.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    const maxRight = window.innerWidth - CARD_WIDTH - EDGE_GAP;
    const maxBottom = window.innerHeight - CARD_HEIGHT - EDGE_GAP;
    const nextRight = clamp(ds.originRight - dx, EDGE_GAP, Math.max(EDGE_GAP, maxRight));
    const nextBottom = clamp(ds.originBottom - dy, EDGE_GAP, Math.max(EDGE_GAP, maxBottom));
    onPositionChange({ right: nextRight, bottom: nextBottom });
  };

  const onDragEnd = () => {
    dragStart.current = null;
  };

  return (
    <div
      ref={cardRef}
      className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      style={{
        right,
        bottom,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }}
      role="dialog"
      aria-label={t("assistant.title")}
    >
      {/* Header (draggable) */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="flex cursor-grab items-center gap-2 border-b border-border bg-card/80 px-3 py-2 select-none active:cursor-grabbing"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{t("assistant.title")}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {t("assistant.contextHint", { page: ctxLabel })}
          </div>
        </div>

        <Link
          to="/research"
          aria-label={t("assistant.openFull")}
          title={t("assistant.openFull")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
        <button
          type="button"
          aria-label={t("assistant.newSession")}
          title={t("assistant.newSession")}
          onClick={command.newSession}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t("assistant.minimize")}
          title={t("assistant.minimize")}
          onClick={onMinimize}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t("assistant.close")}
          title={t("assistant.close")}
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto px-3 pt-2 pb-3">
          <CommandConversation
            phase={command.phase}
            transcript={command.transcript}
            pendingConfirmation={command.pendingConfirmation}
            error={command.error}
            onConfirm={() => command.respondConfirmation("confirm")}
            onCancel={() => command.respondConfirmation("cancel")}
            onReset={command.reset}
          />
        </div>
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-border bg-background px-3 py-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isBusy ? t("assistant.inputPlaceholderBusy") : t("assistant.inputPlaceholder")
          }
          disabled={isBusy}
          className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          autoComplete="off"
          aria-label={t("assistant.inputPlaceholder")}
        />
        <Button
          type="submit"
          size="icon"
          aria-label={t("assistant.send")}
          disabled={!input.trim() || isBusy}
          className="shrink-0"
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CornerDownLeft className="h-4 w-4" aria-hidden />
          )}
        </Button>
      </form>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// FAB_SIZE is currently unused at runtime but kept as an explicit design token
// so future layouts (e.g. mobile drag target sizing) share a single source of
// truth.
void FAB_SIZE;
