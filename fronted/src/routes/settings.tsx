import { createFileRoute, Link } from "@tanstack/react-router";
import { SlidersHorizontal, ChevronRight } from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { ProfileSection } from "@/components/hermes/ProfileSection";
import { AgentsSection } from "@/components/hermes/AgentsSection";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
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
      <div className="mx-auto w-full max-w-4xl px-8 py-10">
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

        <div className="mt-8 flex flex-col gap-6">
          <ProfileSection />
          <AgentsSection />

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
