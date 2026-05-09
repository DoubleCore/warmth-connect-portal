import { Bell, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = ["Command", "Library", "Workspace"] as const;

export function TopBar({ active = "Command" as (typeof tabs)[number] }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-8 py-5">
      <h1 className="text-xl font-semibold tracking-tight">Hermes Research</h1>
      <nav className="flex items-center gap-8">
        {tabs.map((t) => (
          <button
            key={t}
            className={cn(
              "relative pb-1 text-sm transition-colors",
              t === active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
            {t === active && (
              <span className="absolute -bottom-[1.35rem] left-0 right-0 h-0.5 rounded-full" style={{ background: "var(--gradient-primary)" }} />
            )}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-4">
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Bell className="h-5 w-5" />
        </button>
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Settings className="h-5 w-5" />
        </button>
        <div className="h-9 w-9 rounded-full ring-2 ring-primary/40" style={{ background: "linear-gradient(135deg,oklch(0.4_0.05_270),oklch(0.6_0.1_290))" }} />
      </div>
    </header>
  );
}