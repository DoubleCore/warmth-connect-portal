import { createContext, useContext, type ReactNode } from "react";
import { useCommandStream, type UseCommandStreamReturn } from "@/hooks/use-command-stream";

/**
 * Command Center 共享指令流。
 *
 * 之所以放到 __root 下的 Provider 里，是因为主页的输入框和 `/research` 子页面
 * 共享同一条指令：用户在主页发送后跳到 /research 看 Agent 过程和最终结果，
 * 期间两个页面只是同一条流的两个视图，如果每个页面各自 `useCommandStream()`
 * 就会丢会话/丢 transcript/在 /research 上看不到任何东西。
 *
 * 范围边界：只覆盖"主 Command Center"这一条共享流。Settings 里的飞书配对
 * 卡片有自己独立的 session（entry = "settings_feishu"），它仍然用
 * 局部的 `useCommandStream()`，不走这个 provider。
 */
const MainCommandStreamContext = createContext<UseCommandStreamReturn | null>(null);

export function MainCommandStreamProvider({ children }: { children: ReactNode }) {
    const command = useCommandStream({
        entry: "home",
        baseContext: { currentPage: "home" },
    });
    return (
        <MainCommandStreamContext.Provider value={command}>
            {children}
        </MainCommandStreamContext.Provider>
    );
}

export function useMainCommandStream(): UseCommandStreamReturn {
    const ctx = useContext(MainCommandStreamContext);
    if (!ctx) {
        throw new Error(
            "useMainCommandStream must be used inside <MainCommandStreamProvider>",
        );
    }
    return ctx;
}
