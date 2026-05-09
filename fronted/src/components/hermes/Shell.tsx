import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar, type TopBarTab } from "./TopBar";

export function Shell({
  children,
  active = "Command",
}: {
  children: ReactNode;
  /** Highlighted tab in the top bar. */
  active?: TopBarTab;
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar active={active} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
