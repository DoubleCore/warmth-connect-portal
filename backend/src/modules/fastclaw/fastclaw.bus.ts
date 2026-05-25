import type { FastClawEventRowWithSeq } from "./fastclaw.repository.js";

export type FastClawBusEvent = { kind: "event"; row: FastClawEventRowWithSeq } | { kind: "end" };

type Listener = (event: FastClawBusEvent) => void;

class FastClawRunEventBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(runId: string, listener: Listener): () => void {
    let set = this.listeners.get(runId);
    if (!set) {
      set = new Set();
      this.listeners.set(runId, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(runId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.listeners.delete(runId);
    };
  }

  publishEvent(runId: string, row: FastClawEventRowWithSeq): void {
    const set = this.listeners.get(runId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener({ kind: "event", row });
      } catch {
        // Ignore broken SSE subscribers.
      }
    }
  }

  publishEnd(runId: string): void {
    const set = this.listeners.get(runId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener({ kind: "end" });
      } catch {
        // Ignore broken SSE subscribers.
      }
    }
    this.listeners.delete(runId);
  }
}

export const fastclawRunEventBus = new FastClawRunEventBus();
