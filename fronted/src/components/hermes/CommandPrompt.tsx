import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Sparkles,
  CornerDownLeft,
  Search,
  FileText,
  MessageSquare,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";

const quickActions = [
  { labelKey: "home.quickAction.searchPapers", icon: Search, to: "/search" as const },
  { labelKey: "home.quickAction.analyzePdf", icon: FileText, to: "/library" as const },
  { labelKey: "home.quickAction.ragChat", icon: MessageSquare, to: "/search" as const },
  { labelKey: "home.quickAction.manageTraining", icon: Cpu, to: "/workspace" as const },
] as const satisfies readonly {
  labelKey: MessageKey;
  icon: typeof Search;
  to: string;
}[];

const recent = [
  {
    titleKey: "home.recent.attention",
    metaKey: "home.recent.attentionMeta",
    tagKey: "common.pdf",
    icon: FileText,
    accent: "text-muted-foreground",
    to: { to: "/library/$paperId" as const, params: { paperId: "attention-is-all-you-need" } },
  },
  {
    titleKey: "home.recent.hermesV2",
    metaKey: "home.recent.hermesV2Meta",
    tagKey: "common.task",
    icon: Sparkles,
    accent: "text-[oklch(0.74_0.18_155)]",
    to: { to: "/workspace" as const, params: undefined },
  },
] as const satisfies readonly {
  titleKey: MessageKey;
  metaKey: MessageKey;
  tagKey: MessageKey;
  icon: typeof FileText;
  accent: string;
  to: { to: string; params: Record<string, string> | undefined };
}[];

export function CommandPrompt() {
  const [value, setValue] = useState("");
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    navigate({ to: "/search", search: { q: trimmed } });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-14">
      <div className="text-center">
        <h2 className="text-5xl font-semibold tracking-tight">{t("home.title")}</h2>
        <p className="mt-4 text-muted-foreground">{t("home.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-10 group relative" role="search">
        <div
          className="absolute -inset-px rounded-2xl opacity-60 blur-md transition-opacity group-focus-within:opacity-100"
          style={{ background: "var(--gradient-primary)" }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          <label htmlFor="command-prompt" className="sr-only">
            {t("home.inputLabel")}
          </label>
          <input
            id="command-prompt"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("home.inputPlaceholder")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
          />
          <button
            type="submit"
            aria-label={t("home.submit")}
            className="rounded-lg bg-secondary p-2 text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
            disabled={!value.trim()}
          >
            <CornerDownLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </form>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {quickActions.map(({ labelKey, icon: Icon, to }) => (
          <Link
            key={labelKey}
            to={to}
            className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-6 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-glow)]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-sm font-medium">{t(labelKey)}</span>
          </Link>
        ))}
      </div>

      <div className="mt-12">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t("home.recentHeading")}</h3>
          <button type="button" className="text-sm text-primary hover:underline">
            {t("common.viewAll")}
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {recent.map((r) => {
            const content = (
              <>
                <r.icon className={cn("h-5 w-5", r.accent)} aria-hidden />
                <div className="flex-1">
                  <div className="font-medium">{t(r.titleKey)}</div>
                  <div className="text-xs text-muted-foreground">{t(r.metaKey)}</div>
                </div>
                <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground">
                  {t(r.tagKey)}
                </span>
              </>
            );
            const cls =
              "flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40";

            return r.to.params ? (
              <Link key={r.titleKey} to={r.to.to} params={r.to.params} className={cls}>
                {content}
              </Link>
            ) : (
              <Link key={r.titleKey} to={r.to.to} className={cls}>
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
