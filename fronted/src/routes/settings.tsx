import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  SlidersHorizontal,
  QrCode,
  ChevronRight,
  CircleDot,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { ProfileSection } from "@/components/hermes/ProfileSection";
import { LlmConfigSection } from "@/components/hermes/LlmConfigSection";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { useFastclawStream } from "@/hooks/use-fastclaw-stream";
import { getApiBaseUrl } from "@/lib/api-client";
import { getProfile } from "@/api/profile";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hermes AI" },
      { name: "description", content: "Profile, preferences, and connectivity settings." },
    ],
  }),
  loader: async ({ context }) => {
    // Pre-warm the profile query so SSR HTML and first client render agree.
    // Swallow errors — the component renders its own empty / error states.
    await context.queryClient
      .ensureQueryData({
        queryKey: ["profile"],
        queryFn: getProfile,
      })
      .catch(() => undefined);
  },
  component: SettingsPage,
});

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        on ? "bg-primary" : "bg-secondary",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out",
          on ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

  const darkMode = theme === "dark";
  const zhLocale = locale === "zh";

  return (
    <Shell active="None">
      <div className="mx-auto w-full max-w-7xl px-8 py-10">
        <nav
          className="flex items-center gap-2 text-sm text-muted-foreground"
          aria-label="Breadcrumb"
        >
          <Link to="/" className="hover:text-foreground">
            {t("settings.breadcrumbSettings")}
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden />
          <span className="text-foreground">{t("settings.breadcrumbCurrent")}</span>
        </nav>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{t("settings.title")}</h1>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            <ProfileSection />
            <LlmConfigSection />

            <section
              aria-labelledby="prefs-heading"
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden />
                <h2 id="prefs-heading" className="text-lg font-semibold">
                  {t("settings.prefs.heading")}
                </h2>
              </div>
              <div className="mt-6 space-y-3">
                <PrefRow
                  title={t("settings.prefs.darkTitle")}
                  desc={t("settings.prefs.darkDesc")}
                  on={darkMode}
                  onChange={(next) => setTheme(next ? "dark" : "light")}
                />
                <PrefRow
                  title={t("settings.prefs.localeTitle")}
                  desc={t("settings.prefs.localeDesc")}
                  on={zhLocale}
                  onChange={(next) => setLocale(next ? "zh" : "en")}
                />
              </div>
            </section>
          </div>

          <aside
            className="rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-6 lg:self-start"
            aria-labelledby="feishu-heading"
          >
            <FeishuPairingCard />
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function PrefRow({
  title,
  desc,
  on,
  onChange,
}: {
  title: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  );
}

// ---------- 飞书配对二维码 ----------

/**
 * 通过 FastClaw 为当前用户生成一个飞书配对链接，并把它渲染成二维码。
 *
 * 交互：
 *   - 初始：展示模糊占位 + "点击生成"。点击整张卡片或按钮触发请求。
 *   - 请求中：覆盖一层 loader，避免重复触发。
 *   - 成功：显示 SVG 二维码 + 可复制的链接文本。
 *   - 失败 / FastClaw 没返回可识别的链接：提示 + 重试按钮。
 *
 * 与 FastClaw 的交互策略：
 *   - 走 /api/fastclaw/chat/stream（researcher agent），复用后端鉴权 & 日志。
 *   - Prompt 要求只回纯 URL，便于前端稳定抽取。对可靠性不做硬性依赖：
 *     若抽到的不是合法链接，也能直接把原文本生成二维码（至少扫得到）。
 */
function FeishuPairingCard() {
  const { t } = useI18n();
  const { phase, items, error, start } = useFastclawStream();

  const [copied, setCopied] = useState(false);

  const isLoading = phase === "streaming";

  // 从 FastClaw 回复里抽出二维码应当编码的内容。
  const qrValue = useMemo(() => extractPairingPayload(items), [items]);

  // 重新触发时清除复制状态
  useEffect(() => {
    setCopied(false);
  }, [qrValue]);

  const hasResult = phase === "completed" && qrValue !== null;
  const emptyResult = phase === "completed" && qrValue === null;
  const hasError = phase === "error" && error !== null;

  const handleTrigger = async () => {
    if (isLoading) return;
    // Prompt 设计要点：
    //  - 飞书打开机器人会话的 deep link 是固定模板：
    //      https://applink.feishu.cn/client/chat/open?appId=<APP_ID>
    //    Lark 国际版对应 applink.larksuite.com。
    //  - 约束 agent 只回纯 URL：前端 `firstUrl` 抽取器对 Markdown 代码块、
    //    引号、解释性前后缀都能兜底，但让它直接给裸 URL 最稳。
    //  - 明确的"找不到就回 NO_LINK"分支比让它瞎编更安全，extract 逻辑会把
    //    NO_LINK 当 empty 状态处理。
    const message = [
      "请返回用于通过飞书（Feishu）或 Lark 将本机 Agent 添加为机器人的配对链接。",
      "步骤：",
      "1. 查找本机飞书机器人配置中的 FEISHU_APP_ID（如环境变量或配置文件）。",
      "2. 按模板拼接：https://applink.feishu.cn/client/chat/open?appId=<FEISHU_APP_ID>",
      "   如果使用 Lark 国际版，则改用 https://applink.larksuite.com/client/chat/open?appId=<FEISHU_APP_ID>",
      "只回复最终 URL，必须以 https:// 开头，不要加任何引号、Markdown、代码块或说明。",
      "如果找不到 FEISHU_APP_ID 或本机未配置飞书机器人，直接回复 NO_LINK。",
    ].join("\n");

    await start(
      `${getApiBaseUrl()}/api/fastclaw/chat/stream`,
      { message, stream: true, agentRole: "researcher", sessionKey: "wcp-feishu-pair" },
      { userMsg: "生成飞书配对二维码" },
    );
  };

  const handleCopy = async () => {
    if (!qrValue) return;
    try {
      await navigator.clipboard.writeText(qrValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 环境不支持 clipboard（如非 HTTPS），直接 noop；用户可以手动复制下方文本
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <QrCode className="h-5 w-5 text-primary" aria-hidden />
        <h2 id="feishu-heading" className="text-lg font-semibold">
          {t("settings.feishu.heading")}
        </h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t("settings.feishu.body")}</p>

      <div className="mt-8 grid place-items-center">
        <button
          type="button"
          onClick={handleTrigger}
          disabled={isLoading}
          aria-busy={isLoading}
          aria-label={hasResult ? t("settings.feishu.ctaRegenerate") : t("settings.feishu.cta")}
          className={cn(
            "group relative rounded-2xl bg-white p-4 shadow-[var(--shadow-glow)] transition-transform",
            !isLoading && "hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          )}
        >
          {hasResult ? (
            <QRCodeSVG value={qrValue} size={176} level="M" bgColor="#ffffff" fgColor="#000000" />
          ) : (
            <div className={cn(!hasResult && !hasError ? "blur-md" : undefined)} aria-hidden>
              <FakeQr />
            </div>
          )}

          {/* 覆盖层：idle / loading / error / empty 不同状态 */}
          {!hasResult ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              {isLoading ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  {t("settings.feishu.loading")}
                </span>
              ) : hasError ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-destructive/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {t("settings.feishu.ctaRegenerate")}
                </span>
              ) : emptyResult ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                  <RefreshCw className="h-3 w-3" aria-hidden />
                  {t("settings.feishu.ctaRegenerate")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                  <QrCode className="h-3 w-3" aria-hidden />
                  {t("settings.feishu.cta")}
                </span>
              )}
            </div>
          ) : null}
        </button>
      </div>

      {/* 状态文案 */}
      <div className="mt-4 text-center text-xs">
        {hasResult ? (
          <p className="text-muted-foreground">{t("settings.feishu.ready")}</p>
        ) : hasError ? (
          <p className="text-destructive">
            {t("settings.feishu.error", { message: error ?? "unknown" })}
          </p>
        ) : emptyResult ? (
          <p className="text-muted-foreground">{t("settings.feishu.empty")}</p>
        ) : (
          <p className="text-muted-foreground">{t("settings.feishu.hint")}</p>
        )}
      </div>

      {/* empty：Hermes 明确说主机没配置飞书 App，给出在主机上运行的命令 */}
      {emptyResult ? <SetupCommandCard /> : null}

      {/* 链接 + 复制 */}
      {hasResult ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2 text-xs">
          <span className="flex-1 truncate font-mono" title={qrValue}>
            {qrValue}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-primary/15 hover:text-primary"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" aria-hidden />
                {t("settings.feishu.copied")}
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" aria-hidden />
                {t("settings.feishu.copy")}
              </>
            )}
          </button>
        </div>
      ) : null}

      <div className="mt-6 flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CircleDot
            className={cn(
              "h-3.5 w-3.5",
              hasResult ? "text-[oklch(0.74_0.18_155)]" : "text-muted-foreground",
            )}
            aria-hidden
          />
          {hasResult ? t("common.devicePairingReady") : t("common.qrPending")}
        </span>
      </div>
    </>
  );
}

/**
 * 从 FastClaw 回复里扒拉出"可配对字符串"。
 *
 * 把 transcript 里所有 assistant 文本段拼接后，优先抽成合法的 http/https URL，
 * 抽不到则退化为原始文本（仍能扫码转交）；再抽不到就返回 null，
 * 调用方会显示 "empty" 文案。
 */
function extractPairingPayload(
  items: ReturnType<typeof useFastclawStream>["items"],
): string | null {
  const raw = items
    .filter((it): it is Extract<typeof it, { kind: "assistant" }> => it.kind === "assistant")
    .map((it) => it.content)
    .join("")
    .trim();

  if (!raw) return null;

  // prompt 里约定"找不到回 NO_LINK"——把它归到 empty 分支
  if (/^no[_\s-]?link$/i.test(raw)) return null;

  // 首选抽出合法 URL；抽不到也回原文，至少能扫
  return firstUrl(raw) ?? raw;
}

function firstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"'`]+/i);
  return match ? match[0] : null;
}

/**
 * 当 FastClaw 告诉我们这台主机没配置飞书 App（返回 NO_LINK）时，给运维/开发同事
 * 一条可直接复制的命令。交互式向导只能在主机终端里跑——我们没办法
 * 从浏览器可靠地驱动 pty，因此这里只做"展示 + 复制"，不触发任何自动执行。
 */
function SetupCommandCard() {
  const { t } = useI18n();
  const command = "fastclaw gateway setup";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 非 HTTPS 场景 clipboard 不可用；静默失败，用户可手动选中文本
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/40 p-3">
      <div className="text-xs font-semibold">{t("settings.feishu.setupHeading")}</div>
      <p className="mt-1 text-xs text-muted-foreground">{t("settings.feishu.setupHint")}</p>
      <div className="mt-2 flex items-center gap-2 rounded-md bg-secondary/60 px-2 py-1.5">
        <code className="flex-1 truncate font-mono text-[11px]">{command}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-primary/15 hover:text-primary"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" aria-hidden />
              {t("settings.feishu.copied")}
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden />
              {t("settings.feishu.copyCommand")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Decorative pseudo-QR code rendered with CSS so it always stays crisp.
function FakeQr() {
  const cells: boolean[] = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21;
    const y = Math.floor(i / 21);
    const inMarker = (cx: number, cy: number) =>
      x >= cx &&
      x < cx + 7 &&
      y >= cy &&
      y < cy + 7 &&
      (x === cx ||
        x === cx + 6 ||
        y === cy ||
        y === cy + 6 ||
        (x >= cx + 2 && x <= cx + 4 && y >= cy + 2 && y <= cy + 4));
    if (inMarker(0, 0) || inMarker(14, 0) || inMarker(0, 14)) return true;
    if ((x < 8 && y < 8) || (x > 13 && y < 8) || (x < 8 && y > 13)) return false;
    return ((x * 73856093) ^ (y * 19349663)) % 3 === 0;
  });

  return (
    <div className="grid h-44 w-44 grid-cols-[repeat(21,1fr)] grid-rows-[repeat(21,1fr)] gap-[1px]">
      {cells.map((on, i) => (
        <div key={i} className={on ? "bg-black" : "bg-white"} />
      ))}
    </div>
  );
}
