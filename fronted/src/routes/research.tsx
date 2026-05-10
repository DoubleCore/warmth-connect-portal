import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CornerDownLeft, Loader2, Sparkles } from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { CommandConversation } from "@/components/hermes/CommandConversation";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useMainCommandStream } from "@/hooks/command-stream-context";

/**
 * Command Center 的"研究会话"子页面。
 *
 * 职责：
 *   - 把 MainCommandStreamProvider 里共享的 phase / transcript / confirmation 渲染成对话
 *   - 提供"追问"输入框，允许同一个 session 里接着发下一条指令
 *   - Reset 回主页
 *
 * 这不是 RAG Search。它只是 Command Center 的子视图：
 *   首页输入 → navigate(/research) → 这里继续显示过程 + 回答。
 */
export const Route = createFileRoute("/research")({
    head: () => ({
        meta: [
            { title: "Research — Hermes AI" },
            {
                name: "description",
                content: "Follow Hermes Agent through a live research session.",
            },
        ],
    }),
    component: ResearchPage,
});

function ResearchPage() {
    const { t } = useI18n();
    const command = useMainCommandStream();
    const [value, setValue] = useState("");

    const isBusy =
        command.phase === "connecting" ||
        command.phase === "streaming" ||
        command.phase === "awaiting_confirmation";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed || isBusy) return;
        setValue("");
        await command.run(trimmed);
    };

    const isEmpty = command.phase === "idle" && command.transcript.length === 0;

    return (
        <Shell active="Command">
            <div className="mx-auto w-full max-w-4xl px-8 py-10">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <Link
                            to="/"
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                            {t("research.backToHome")}
                        </Link>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                            {t("research.title")}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">{t("research.subtitle")}</p>
                    </div>
                </div>

                {isEmpty ? (
                    <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
                        <h2 className="text-lg font-semibold">{t("research.empty.title")}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {t("research.empty.hint")}
                        </p>
                        <Link
                            to="/"
                            className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                            {t("research.empty.cta")}
                        </Link>
                    </div>
                ) : (
                    <CommandConversation
                        phase={command.phase}
                        transcript={command.transcript}
                        pendingConfirmation={command.pendingConfirmation}
                        error={command.error}
                        onConfirm={() => void command.respondConfirmation("confirm")}
                        onCancel={() => void command.respondConfirmation("cancel")}
                        onReset={command.reset}
                    />
                )}

                {/* 追问输入框：同一个 session 下的下一条指令 */}
                {!isEmpty ? (
                    <form onSubmit={handleSubmit} className="mt-6 group relative" role="search">
                        <div
                            className="absolute -inset-px rounded-2xl opacity-50 blur-md transition-opacity group-focus-within:opacity-100"
                            style={{ background: "var(--gradient-primary)" }}
                            aria-hidden
                        />
                        <div className="relative flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3">
                            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                            <label htmlFor="research-followup" className="sr-only">
                                {t("research.followupLabel")}
                            </label>
                            <input
                                id="research-followup"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={
                                    isBusy
                                        ? t("command.inputPlaceholderBusy")
                                        : t("research.followupPlaceholder")
                                }
                                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                                autoComplete="off"
                                disabled={isBusy}
                            />
                            <button
                                type="submit"
                                aria-label={t("research.followupSubmit")}
                                className="rounded-lg bg-secondary p-2 text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                                disabled={!value.trim() || isBusy}
                            >
                                {isBusy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                    <CornerDownLeft className="h-4 w-4" aria-hidden />
                                )}
                            </button>
                        </div>
                    </form>
                ) : null}
            </div>
        </Shell>
    );
}
