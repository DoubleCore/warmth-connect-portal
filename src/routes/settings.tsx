import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { User, SlidersHorizontal, QrCode, ChevronRight, CircleDot } from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hermes AI" },
      { name: "description", content: "Profile, preferences, and connectivity settings." },
    ],
  }),
  component: SettingsPage,
});

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-secondary",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          on ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function SettingsPage() {
  const { isDark, setTheme } = useTheme();
  const [enLocale, setEnLocale] = useState(true);
  const [name, setName] = useState("Dr. Aris Vane");
  const [email, setEmail] = useState("aris.vane@institute.org");
  const [institution, setInstitution] = useState("Advanced Institute for Algorithmic Studies");

  return (
    <Shell active="Workspace">
      <div className="mx-auto w-full max-w-7xl px-8 py-10">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Settings</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">Preferences &amp; Connectivity</span>
        </nav>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">System Settings</h1>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            {/* Profile */}
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Profile Information</h2>
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field label="Full Name" value={name} onChange={setName} />
                <Field label="Email Address" value={email} onChange={setEmail} type="email" />
                <div className="sm:col-span-2">
                  <Field label="Research Institution" value={institution} onChange={setInstitution} />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  className="rounded-lg px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
                  style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
                >
                  Save Changes
                </button>
              </div>
            </section>

            {/* Preferences */}
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Preferences</h2>
              </div>
              <div className="mt-6 space-y-3">
                <PrefRow
                  title="Obsidian Theme (Dark Mode)"
                  desc="Enforce high-contrast dark environment"
                  on={isDark}
                  onChange={(v) => setTheme(v ? "dark" : "light")}
                />
                <PrefRow
                  title="English Localization"
                  desc="Force UI language to English (US)"
                  on={enLocale}
                  onChange={setEnLocale}
                />
              </div>
            </section>
          </div>

          {/* Right: Feishu */}
          <aside className="rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-6 lg:self-start">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Connect on Feishu</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Scan to join our dedicated support channel and pair your mobile device.
            </p>

            <div className="mt-8 grid place-items-center">
              <div className="relative rounded-2xl bg-white p-4 shadow-[var(--shadow-glow)]">
                <div className="blur-md">
                  <FakeQr />
                </div>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                    QR Pending
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CircleDot className="h-3.5 w-3.5 text-[oklch(0.74_0.18_155)]" />
                Device Pairing Ready
              </span>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-border bg-background/50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
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
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

// Decorative pseudo-QR code rendered with CSS so it always crisp.
function FakeQr() {
  // 21x21 deterministic pattern
  const cells: boolean[] = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21;
    const y = Math.floor(i / 21);
    // Three position markers (corners)
    const inMarker = (cx: number, cy: number) =>
      x >= cx && x < cx + 7 && y >= cy && y < cy + 7 &&
      (x === cx || x === cx + 6 || y === cy || y === cy + 6 ||
        (x >= cx + 2 && x <= cx + 4 && y >= cy + 2 && y <= cy + 4));
    if (inMarker(0, 0) || inMarker(14, 0) || inMarker(0, 14)) return true;
    if ((x < 8 && y < 8) || (x > 13 && y < 8) || (x < 8 && y > 13)) return false;
    // Pseudo-random
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