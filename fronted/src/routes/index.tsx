import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/hermes/Shell";
import { CommandPrompt } from "@/components/hermes/CommandPrompt";
import { listPapers } from "@/api/papers";
import { listReproductionRecords } from "@/api/reproduction";

const RECENT_PAPERS_LIMIT = 3;

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    // Pre-warm the QueryClient so the homepage's Recent cards are already
    // populated on first paint. Failures are tolerated here — the CommandPrompt
    // component renders its own error states when the queries eventually fail
    // on the client.
    await Promise.allSettled([
      context.queryClient.ensureQueryData({
        queryKey: ["papers", { page: 1, pageSize: RECENT_PAPERS_LIMIT }],
        queryFn: () => listPapers({ page: 1, pageSize: RECENT_PAPERS_LIMIT }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["reproduction-records"],
        queryFn: listReproductionRecords,
      }),
    ]);
  },
  component: Index,
});

function Index() {
  return (
    <Shell active="Command">
      <CommandPrompt />
    </Shell>
  );
}
