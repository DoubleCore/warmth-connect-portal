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
  ActivitySquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type NavEntry = {
  to: string;
  labelKey: MessageKey;
  icon: typeof TerminalSquare;
  /** 同一根节点下的缩进子项，与父项共享视觉分组但单独路由 */
  children?: ReadonlyArray<{
    to: string;
    labelKey: MessageKey;
    icon: typeof TerminalSquare;
  }>;
};

const nav: readonly NavEntry[] = [
  {
    to: "/",
    labelKey: "sidebar.commandCenter",
    icon: TerminalSquare,
    children: [{ to: "/research", labelKey: "sidebar.research", icon: Search }],
  },
  {
    to: "/library",
    labelKey: "sidebar.analyzePdf",
    icon: BookOpen,
    children: [{ to: "/search", labelKey: "sidebar.ragSearch", icon: Search }],
  },
  {
    to: "/workspace",
    labelKey: "sidebar.deviceManager",
    icon: Cpu,
    children: [{ to: "/manager", labelKey: "sidebar.trainingManager", icon: ActivitySquare }],
  },
  { to: "/settings", labelKey: "sidebar.settings", icon: Settings },
];

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

      <Link
        to="/"
        aria-label={t("sidebar.newResearch")}
        className="mt-8 flex items-center justify-center gap-2 rounded-xl py-3 font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("sidebar.newResearch")}
      </Link>

      <nav className="mt-6 flex flex-col gap-1" aria-label={t("sidebar.primaryNavLabel")}>
        {nav.map(({ to, labelKey, icon: Icon, children }) => {
          const baseCls =
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground";
          return (
            <div key={to} className="flex flex-col gap-1">
              <Link
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
              {children?.map((child) => {
                const childCls =
                  "ml-6 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground";
                const ChildIcon = child.icon;
                return (
                  <Link
                    key={child.to}
                    to={child.to}
                    className={childCls}
                    activeOptions={{ exact: true }}
                    activeProps={{
                      className: cn(
                        "ml-6 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                        "bg-sidebar-accent text-sidebar-accent-foreground",
                      ),
                    }}
                  >
                    <ChildIcon className="h-3.5 w-3.5" aria-hidden />
                    {t(child.labelKey)}
                  </Link>
                );
              })}
            </div>
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
