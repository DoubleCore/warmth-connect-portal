import { Bell, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Command", to: "/" as const },
  { label: "Library", to: "/library" as const },
  { label: "Workspace", to: "#workspace" as const },
];

export function TopBar({ active = "Command" }: { active?: "Command" | "Library" | "Workspace" }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-8 py-5">
      <h1 className="text-xl font-semibold tracking-tight">Hermes Research</h1>
      <nav className="flex items-center gap-8">
        {tabs.map((t) => {
          const isActive = t.label === active;
          const cls = cn(
            "relative pb-1 text-sm transition-colors",
            isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
          );
          const inner = (
            <>
              {t.label}
              {isActive && (
                <span className="absolute -bottom-[1.35rem] left-0 right-0 h-0.5 rounded-full" style={{ background: "var(--gradient-primary)" }} />
              )}
            </>
          );
          return t.to.startsWith("#") ? (
            <a key={t.label} href={t.to} className={cls}>{inner}</a>
          ) : (
            <Link key={t.label} to={t.to} className={cls}>{inner}</Link>
          );
        })}
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