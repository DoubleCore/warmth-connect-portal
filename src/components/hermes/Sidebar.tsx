import { Link, useLocation } from "@tanstack/react-router";
import { Plus, TerminalSquare, BookOpen, Cpu, Search, Settings, HelpCircle, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Command Center", icon: TerminalSquare, route: true },
  { to: "/library", label: "Paper Library", icon: BookOpen, route: true },
  { to: "/workspace", label: "Device Manager", icon: Cpu, route: true },
  { to: "/search", label: "RAG Search", icon: Search, route: true },
  { to: "/settings", label: "Settings", icon: Settings, route: true },
] as const;

export function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-primary-foreground shadow-[var(--shadow-glow)]" style={{ background: "var(--gradient-primary)" }}>
          H
        </div>
        <div>
          <div className="font-semibold tracking-tight text-sidebar-foreground">Hermes AI</div>
          <div className="flex items-center gap-1.5 text-xs text-[oklch(0.74_0.18_155)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.74_0.18_155)] animate-pulse" />
            System Active
          </div>
        </div>
      </div>

      <button
        className="mt-8 flex items-center justify-center gap-2 rounded-xl py-3 font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <Plus className="h-4 w-4" />
        New Research
      </button>

      <nav className="mt-6 flex flex-col gap-1">
        {nav.map(({ to, label, icon: Icon, route }) => {
          const active = pathname === to;
          const className = cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
          );
          return route ? (
            <Link key={to} to={to} className={className}>
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ) : (
            <a key={to} href={to} className={className}>
              <Icon className="h-4 w-4" />
              {label}
            </a>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 pt-6 text-sm text-muted-foreground">
        <Link
          to="/docs"
          className="flex items-center gap-3 rounded-lg px-3 py-2 hover:text-sidebar-foreground"
          activeProps={{ className: "flex items-center gap-3 rounded-lg px-3 py-2 bg-sidebar-accent text-sidebar-accent-foreground" }}
        >
          <HelpCircle className="h-4 w-4" /> Documentation
        </Link>
        <a className="flex items-center gap-3 rounded-lg px-3 py-2 hover:text-sidebar-foreground" href="#">
          <LifeBuoy className="h-4 w-4" /> Support
        </a>
      </div>
    </aside>
  );
}