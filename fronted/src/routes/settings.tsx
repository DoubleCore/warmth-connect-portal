import { createFileRoute, Link } from "@tanstack/react-router";
import { SlidersHorizontal, QrCode, ChevronRight, CircleDot } from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { ProfileSection } from "@/components/hermes/ProfileSection";
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
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" aria-hidden />
              <h2 id="feishu-heading" className="text-lg font-semibold">
                {t("settings.feishu.heading")}
              </h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t("settings.feishu.body")}</p>

            <div className="mt-8 grid place-items-center">
              <div className="relative rounded-2xl bg-white p-4 shadow-[var(--shadow-glow)]">
                <div className="blur-md" aria-hidden>
                  <FakeQr />
                </div>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                    {t("common.qrPending")}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CircleDot className="h-3.5 w-3.5 text-[oklch(0.74_0.18_155)]" aria-hidden />
                {t("common.devicePairingReady")}
              </span>
            </div>
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
