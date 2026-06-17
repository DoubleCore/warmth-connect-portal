/**
 * useFastclawStream — FastClaw SSE 事件流的共享核心。
 *
 * 把「读 SSE → 结构化 transcript」这套逻辑收敛成单一真相，给两条 FastClaw 链路复用：
 *   - Manager 部署页（经 use-fastclaw-deploy 包一层 localStorage 持久化）
 *   - 论文分析页（直接用本 hook）
 *
 * 之所以抽出来：后端现在端到端吐结构化事件（tool_start / tool_result / progress /
 * delta / done / error），如果让每个页面各写一遍 SSE 解析，迟早会像早先「拍扁成
 * emoji 文本」那样漂移。核心只有一份，事件契约就只有一处需要维护。
 *
 * 产出的不是一坨 markdown，而是有类型的 transcript 项：文本段（assistant）与工具
 * 卡片（tool）/ 进度（progress）交错排列，符合 ReAct「推理→调工具→再推理」的节奏。
 */

import { useCallback, useRef, useState } from "react";

export type FastclawTranscriptItem = { id: string; createdAt: number } & (
  | { kind: "system"; content: string }
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string }
  | { kind: "tool"; name: string; status: "running" | "done"; summary?: string }
  | { kind: "progress"; phase: string; detail?: string }
);

export type FastclawStreamPhase = "idle" | "streaming" | "completed" | "error";

/** 多轮上下文：只保留 user / assistant 文本，排除工具与进度项。 */
export type FastclawHistoryTurn = { role: "user" | "assistant"; content: string };

export type StartStreamOptions = {
  /** 作为 user 气泡先渲染出来的消息（不一定等于发给后端的 body）。 */
  userMsg?: string;
};

export type UseFastclawStreamReturn = {
  phase: FastclawStreamPhase;
  items: FastclawTranscriptItem[];
  error: string | null;
  /** 直接覆盖 transcript（持久化恢复 / 注入初始气泡用）。 */
  setItems: React.Dispatch<React.SetStateAction<FastclawTranscriptItem[]>>;
  /** 直接设置 phase（持久化恢复时把 streaming 降级为 completed 用）。 */
  setPhase: React.Dispatch<React.SetStateAction<FastclawStreamPhase>>;
  /** 直接设置 / 清除 error（持久化恢复时清掉陈旧错误用）。 */
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  /** 当前累计的多轮历史（user/assistant 文本），供包装层持久化。 */
  historyRef: React.MutableRefObject<FastclawHistoryTurn[]>;
  /** 发起一次流式请求。SSR 安全：只在用户触发时调用，挂载不请求。 */
  start: (url: string, body: Record<string, unknown>, opts?: StartStreamOptions) => Promise<void>;
  reset: () => void;
};

let seq = 0;
function nextId(): string {
  return `fc-${Date.now()}-${++seq}`;
}

export function useFastclawStream(): UseFastclawStreamReturn {
  const [phase, setPhase] = useState<FastclawStreamPhase>("idle");
  const [items, setItems] = useState<FastclawTranscriptItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<FastclawHistoryTurn[]>([]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setItems([]);
    setError(null);
    historyRef.current = [];
  }, []);

  const start = useCallback(
    async (url: string, body: Record<string, unknown>, opts?: StartStreamOptions) => {
      if (opts?.userMsg) {
        const userMsg = opts.userMsg;
        setItems((prev) => [
          ...prev,
          { id: nextId(), kind: "user", content: userMsg, createdAt: Date.now() },
        ]);
        historyRef.current.push({ role: "user", content: userMsg });
      }

      setPhase("streaming");
      setError(null);

      // 当前正在累积的 assistant 文本段 id。工具事件会把它关闭（置 null），
      // 让工具卡片之后的文本另起一个气泡——交错呈现 ReAct 过程。
      let activeTextId: string | null = null;
      let assembledText = "";

      const appendDelta = (content: string) => {
        assembledText += content;
        if (activeTextId === null) {
          const id = nextId();
          activeTextId = id;
          setItems((prev) => [...prev, { id, kind: "assistant", content, createdAt: Date.now() }]);
        } else {
          const id = activeTextId;
          setItems((prev) =>
            prev.map((it) =>
              it.id === id && it.kind === "assistant"
                ? { ...it, content: it.content + content }
                : it,
            ),
          );
        }
      };

      const closeTextSegment = () => {
        activeTextId = null;
      };

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let pendingEvent: string | null = null;

        const finishOk = () => {
          if (assembledText.trim()) {
            historyRef.current.push({ role: "assistant", content: assembledText });
          }
          setPhase("completed");
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // 同时兼容 \r\n / \n 行分隔。
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              pendingEvent = line.slice(6).trim();
              continue;
            }
            if (!line.startsWith("data:")) continue;

            const dataStr = line.slice(5).trimStart();
            const evt = pendingEvent ?? "delta";
            pendingEvent = null;

            if (evt === "done") {
              finishOk();
              return;
            }

            let data: Record<string, unknown> = {};
            try {
              data = dataStr ? (JSON.parse(dataStr) as Record<string, unknown>) : {};
            } catch {
              continue; // 跳过不可解析的帧
            }

            switch (evt) {
              case "delta": {
                const content = typeof data.content === "string" ? data.content : "";
                if (content) appendDelta(content);
                break;
              }
              case "tool_start": {
                closeTextSegment();
                const name =
                  (typeof data.displayName === "string" && data.displayName) ||
                  (typeof data.toolName === "string" && data.toolName) ||
                  "tool";
                setItems((prev) => [
                  ...prev,
                  { id: nextId(), kind: "tool", name, status: "running", createdAt: Date.now() },
                ]);
                break;
              }
              case "tool_result": {
                closeTextSegment();
                const name = (typeof data.toolName === "string" && data.toolName) || "tool";
                const summary = typeof data.summary === "string" ? data.summary : undefined;
                setItems((prev) => {
                  // 把最近一个同名 running 工具项收尾；找不到就补一张 done 卡。
                  for (let i = prev.length - 1; i >= 0; i -= 1) {
                    const it = prev[i];
                    if (it.kind === "tool" && it.name === name && it.status === "running") {
                      const next = prev.slice();
                      next[i] = { ...it, status: "done", summary };
                      return next;
                    }
                  }
                  return [
                    ...prev,
                    {
                      id: nextId(),
                      kind: "tool",
                      name,
                      status: "done",
                      summary,
                      createdAt: Date.now(),
                    },
                  ];
                });
                break;
              }
              case "progress": {
                const phaseName = typeof data.phase === "string" ? data.phase : "running";
                const iteration = typeof data.iteration === "number" ? data.iteration : undefined;
                const max = typeof data.max === "number" ? data.max : undefined;
                const detail =
                  iteration !== undefined && max !== undefined ? `${iteration}/${max}` : undefined;
                setItems((prev) => [
                  ...prev,
                  {
                    id: nextId(),
                    kind: "progress",
                    phase: phaseName,
                    detail,
                    createdAt: Date.now(),
                  },
                ]);
                break;
              }
              case "error": {
                const message =
                  typeof data.error === "string"
                    ? data.error
                    : typeof data.message === "string"
                      ? data.message
                      : "Stream error";
                setError(message);
                setPhase("error");
                return;
              }
              default:
                break;
            }
          }
        }

        // 流自然结束但没收到显式 done 事件。
        finishOk();
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setPhase("error");
      }
    },
    [],
  );

  return { phase, items, error, setItems, setPhase, setError, historyRef, start, reset };
}
