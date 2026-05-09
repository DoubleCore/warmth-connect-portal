import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  User,
  SlidersHorizontal,
  QrCode,
  ChevronRight,
  CircleDot,
  Pencil,
} from "lucide-react";
import { z } from "zod";
import { Shell } from "@/components/hermes/Shell";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
import type { MessageKey } from "@/lib/i18n/messages";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hermes AI" },
      { name: "description", content: "Profile, preferences, and connectivity settings." },
    ],
  }),
  component: SettingsPage,
});

type ProfileFormData = {
  name: string;
  email: string;
  institution: string;
};
type ProfileFormErrors = Partial<Record<keyof ProfileFormData, string>>;

const emptyProfile: ProfileFormData = { name: "", email: "", institution: "" };

/** Build a zod schema whose error messages come from the current i18n. */
function buildProfileSchema(t: (key: MessageKey) => string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("settings.profile.error.nameRequired"))
      .max(120, t("settings.profile.error.nameMax")),
    email: z.string().trim().email(t("settings.profile.error.emailInvalid")),
    institution: z
      .string()
      .trim()
      .min(1, t("settings.profile.error.institutionRequired"))
      .max(200, t("settings.profile.error.institutionMax")),
  });
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  // Track: h-6 w-11 (24×44). Knob: h-5 w-5 (20×20). 2px padding each side
  // => off translates 2px, on translates 22px (= 44 − 20 − 2).
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

  // Committed profile — displayed in read-only mode.
  // No PII defaults; each user enters their own values.
  const [profile, setProfile] = useState<ProfileFormData>(emptyProfile);

  // Draft state is only used while the form is in edit mode.
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileFormData>(emptyProfile);
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const startEditing = () => {
    setDraft(profile);
    setErrors({});
    setSavedAt(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(profile);
    setErrors({});
    setIsEditing(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const schema = buildProfileSchema(t);
    const result = schema.safeParse(draft);
    if (!result.success) {
      const nextErrors: ProfileFormErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof ProfileFormData | undefined;
        if (key && !nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      setSavedAt(null);
      return;
    }
    setErrors({});
    setProfile(result.data);
    setDraft(result.data);
    setSavedAt(Date.now());
    setIsEditing(false);
  };

  const updateDraft = <K extends keyof ProfileFormData>(key: K, value: ProfileFormData[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

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
            {/* Profile */}
            <section
              aria-labelledby="profile-heading"
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" aria-hidden />
                  <h2 id="profile-heading" className="text-lg font-semibold">
                    {t("settings.profile.heading")}
                  </h2>
                </div>
                {!isEditing && (
                  <div className="flex items-center gap-3">
                    {savedAt && (
                      <span className="text-xs text-[oklch(0.74_0.18_155)]" role="status">
                        {t("common.saved")}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={startEditing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      {t("settings.profile.edit")}
                    </button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <form onSubmit={handleSubmit} noValidate className="mt-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label={t("settings.profile.name")}
                      value={draft.name}
                      onChange={(v) => updateDraft("name", v)}
                      error={errors.name}
                      autoComplete="name"
                    />
                    <Field
                      label={t("settings.profile.email")}
                      type="email"
                      value={draft.email}
                      onChange={(v) => updateDraft("email", v)}
                      error={errors.email}
                      autoComplete="email"
                    />
                    <div className="sm:col-span-2">
                      <Field
                        label={t("settings.profile.institution")}
                        value={draft.institution}
                        onChange={(v) => updateDraft("institution", v)}
                        error={errors.institution}
                        autoComplete="organization"
                      />
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="rounded-lg border border-border bg-background/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      {t("settings.profile.cancel")}
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      style={{
                        background: "var(--gradient-primary)",
                        boxShadow: "var(--shadow-glow)",
                      }}
                    >
                      {t("settings.profile.save")}
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                  <ReadField
                    label={t("settings.profile.name")}
                    value={profile.name}
                    placeholder={t("settings.profile.empty")}
                  />
                  <ReadField
                    label={t("settings.profile.email")}
                    value={profile.email}
                    placeholder={t("settings.profile.empty")}
                  />
                  <div className="sm:col-span-2">
                    <ReadField
                      label={t("settings.profile.institution")}
                      value={profile.institution}
                      placeholder={t("settings.profile.empty")}
                    />
                  </div>
                </dl>
              )}
            </section>

            {/* Preferences */}
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

          {/* Right: Feishu */}
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

/** Read-only field shown in view mode. */
function ReadField({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string;
  placeholder: string;
}) {
  const trimmed = value.trim();
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-2 min-h-[2.625rem] rounded-lg border border-dashed border-border/70 bg-background/30 px-4 py-2.5 text-sm",
          trimmed ? "text-foreground" : "italic text-muted-foreground/70",
        )}
      >
        {trimmed || placeholder}
      </dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  error?: string;
  autoComplete?: string;
}) {
  const id = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const errorId = `${id}-error`;
  return (
    <label htmlFor={id} className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "mt-2 w-full rounded-lg border bg-background/50 px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2",
          error
            ? "border-destructive focus:border-destructive focus:ring-destructive/30"
            : "border-border focus:border-primary focus:ring-primary/30",
        )}
      />
      {error && (
        <span id={errorId} role="alert" className="mt-1 block text-xs text-destructive">
          {error}
        </span>
      )}
    </label>
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
