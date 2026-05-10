import { Bell, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { getProfile } from "@/api/profile";
import { isNetworkError } from "@/lib/api-client";

export type TopBarTab = "Command" | "Library" | "Workspace" | "None";

const tabs = [
  { tab: "Command", to: "/" as const, labelKey: "topbar.tabCommand" },
  { tab: "Library", to: "/library" as const, labelKey: "topbar.tabLibrary" },
  { tab: "Workspace", to: "/workspace" as const, labelKey: "topbar.tabWorkspace" },
] as const satisfies readonly {
  tab: Exclude<TopBarTab, "None">;
  to: string;
  labelKey: MessageKey;
}[];

export function TopBar({ active = "Command" }: { active?: TopBarTab }) {
  const { t } = useI18n();

  // Same queryKey as the Settings page so both views share one request.
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    // Don't retry transport failures — we'd rather show "Welcome" than spin.
    retry: (count, err) => (isNetworkError(err) ? false : count < 2),
    staleTime: 30_000,
  });

  const username = profileQuery.data?.username ?? null;
  const greeting = username
    ? t("topbar.greeting", { name: username })
    : t("topbar.greetingAnonymous");

  return (
    <header className="flex items-center justify-between border-b border-border px-8 py-5">
      <nav
        className="flex flex-1 items-center justify-center gap-8"
        aria-label={t("sidebar.primaryNavLabel")}
      >
        {tabs.map((entry) => {
          const isActive = entry.tab === active;
          const cls = cn(
            "relative pb-1 text-sm transition-colors",
            isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
          );
          return (
            <Link
              key={entry.tab}
              to={entry.to}
              className={cls}
              aria-current={isActive ? "page" : undefined}
            >
              {t(entry.labelKey)}
              {isActive && (
                <span
                  className="absolute -bottom-[1.35rem] left-0 right-0 h-0.5 rounded-full"
                  style={{ background: "var(--gradient-primary)" }}
                />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-4">
        <span className="hidden text-xs text-muted-foreground md:inline" aria-live="polite">
          {greeting}
        </span>
        <button
          type="button"
          aria-label={t("topbar.notifications")}
          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Bell className="h-5 w-5" aria-hidden />
        </button>
        <Link
          to="/settings"
          aria-label={t("topbar.settings")}
          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          activeProps={{ className: "rounded-lg p-2 bg-secondary text-primary" }}
        >
          <Settings className="h-5 w-5" aria-hidden />
        </Link>
        <div
          className="h-9 w-9 rounded-full ring-2 ring-primary/40"
          style={{ background: "linear-gradient(135deg,oklch(0.4_0.05_270),oklch(0.6_0.1_290))" }}
          role="img"
          aria-label={t("topbar.avatar")}
        />
      </div>
    </header>
  );
}
