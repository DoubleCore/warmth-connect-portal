export type Paper = {
  id: string;
  title: string;
  authors: string[];
  domains: string[];
  source: string;
  year: number;
  abstract: string;
  analysis: {
    summary: string;
    task: { primary: string; datasets: string; goal: string };
    metrics: { label: string; value: string; note?: string }[];
    training: { cost: string; hardware: string };
  };
};

/**
 * Paper data source.
 *
 * This module is intentionally empty — the real list will come from the
 * backend `papers` module. Once the API endpoint is wired up, replace this
 * file with a `useQuery`-driven client (e.g. `@tanstack/react-query`) or a
 * route `loader` that fetches from `/api/papers`.
 */
export const papers: Paper[] = [];

export function getPaper(id: string): Paper | undefined {
  return papers.find((p) => p.id === id);
}
