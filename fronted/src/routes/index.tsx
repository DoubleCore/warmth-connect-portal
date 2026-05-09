import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/hermes/Shell";
import { CommandPrompt } from "@/components/hermes/CommandPrompt";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <Shell active="Command">
      <CommandPrompt />
    </Shell>
  );
}
