import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/hermes/Sidebar";
import { TopBar } from "@/components/hermes/TopBar";
import { CommandPrompt } from "@/components/hermes/CommandPrompt";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar active="Command" />
        <main className="flex-1">
          <CommandPrompt />
        </main>
      </div>
    </div>
  );
}
