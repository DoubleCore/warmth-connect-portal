import { Link } from "@tanstack/react-router";
import {
  Plus,
  TerminalSquare,
  BookOpen,
  Cpu,
  Search,
  Settings,
  HelpCircle,
  LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";

const nav = [
  { to: "/", labelKey: "sidebar.commandCenter", icon: TerminalSquare },
  { to: "/library", labelKey: "sidebar.paperLibrary", icon: BookOpen },
  { to: "/workspace", labelKey: "sidebar.deviceManager", icon: Cpu },
  { to: "/search", labelKey: "sidebar.ragSearch", icon: Search },
  { to: "/settings", labelKey: "sidebar.settings", icon: Settings },
] as const satisfies readonly {
  to: string;
  labelKey: MessageKey;
  icon: typeof TerminalSquare;
}[];

export function Sidebar() {
  const { t } = useI18n();
  return (
    <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-6">
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-primary-foreground shadow-[var(--shadow-glow)]"
          style={{ background: "var(--gradient-primary)" }}
          aria-hidden
        >
          H
        </div>
        <div>
          <div className="font-semibold tracking-tight text-sidebar-foreground">
            {t("common.appName")}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[oklch(0.74_0.18_155)]">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[oklch(0.74_0.18_155)] animate-pulse"
              aria-hidden
            />
            {t("common.systemActive")}
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label={t("sidebar.newResearch")}
        className="mt-8 flex items-center justify-center gap-2 rounded-xl py-3 font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("sidebar.newResearch")}
      </button>

      <nav className="mt-6 flex flex-col gap-1" aria-label={t("sidebar.primaryNavLabel")}>
        {nav.map(({ to, labelKey, icon: Icon }) => {
          const baseCls =
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground";
          return (
            <Link
              key={to}
              to={to}
              className={baseCls}
              activeOptions={{ exact: true }}
              activeProps={{
                className: cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  "bg-sidebar-accent text-sidebar-accent-foreground",
                ),
              }}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 pt-6 text-sm text-muted-foreground">
        <Link
          to="/docs"
          className="flex items-center gap-3 rounded-lg px-3 py-2 hover:text-sidebar-foreground"
          activeProps={{
            className:
              "flex items-center gap-3 rounded-lg px-3 py-2 bg-sidebar-accent text-sidebar-accent-foreground",
          }}
        >
          <HelpCircle className="h-4 w-4" aria-hidden /> {t("sidebar.documentation")}
        </Link>
        <a
          className="flex items-center gap-3 rounded-lg px-3 py-2 hover:text-sidebar-foreground"
          href="#"
        >
          <LifeBuoy className="h-4 w-4" aria-hidden /> {t("sidebar.support")}
        </a>
      </div>
    </aside>
  );
}
