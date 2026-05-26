import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, Loader2, Pencil, TriangleAlert, Wand2 } from "lucide-react";

import { listAgents, testAgent, updateAgent } from "@/api/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, isNetworkError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import type { Agent, UpdateAgentInput } from "@/types/agent";

/**
 * Settings → Agents
 *
 * 三个固定 agent（论文搜索 / RAG 阅读 / 论文部署），每个一张卡片：
 *   - 默认状态：展示模型 / API Key 是否已配置 / 上次更新时间
 *   - 点"编辑"展开 inline 表单：displayName / model / apiBase / apiKey / temperature / maxTokens
 *   - 点"测试"调 POST /api/agents/:id/test，绿色横条显示耗时，红色横条显示错误
 *
 * 设计取舍：
 *   · 不开 modal：表单嵌入卡片本体，避免多层 z-index 与 keyboard nav 复杂度。
 *   · API Key 框默认空白且 placeholder 提示"留空保持不变"。点旁边的"清空"复选框
 *     才会真把已有 key 清掉（语义对应 backend 的"显式空串 → 清空"）。
 *   · 测试按钮在用户未保存的修改下仍然测试 *最近一次保存的配置*；这是有意的，避免
 *     "我以为我测的是表单，结果测的是落盘配置"。
 */
export function AgentsSection() {
  const { t } = useI18n();

  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
    retry: (count, err) => (isNetworkError(err) ? false : count < 2),
  });

  return (
    <section
      aria-labelledby="agents-heading"
      className="rounded-2xl border border-border bg-card p-6"
    >
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" aria-hidden />
        <h2 id="agents-heading" className="text-lg font-semibold">
          {t("settings.agents.heading")}
        </h2>
      </div>

      {agentsQuery.isError && !isNetworkError(agentsQuery.error) && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {t("settings.agents.loadFailed", { message: errMsg(agentsQuery.error) })}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {agentsQuery.isLoading ? (
          <SkeletonRow />
        ) : agentsQuery.data && agentsQuery.data.length > 0 ? (
          agentsQuery.data.map((agent) => <AgentCard key={agent.id} agent={agent} />)
        ) : (
          <p className="text-sm italic text-muted-foreground">{t("settings.agents.empty")}</p>
        )}
      </div>
    </section>
  );
}

// ---------- per-agent card ----------

function AgentCard({ agent }: { agent: Agent }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftState>(() => toDraft(agent));
  const [error, setError] = useState<string | null>(null);
  const [testBanner, setTestBanner] = useState<TestBanner | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (input: UpdateAgentInput) => updateAgent(agent.id, input),
    onSuccess: (next) => {
      queryClient.setQueryData<Agent[]>(["agents"], (prev) =>
        prev ? prev.map((a) => (a.id === next.id ? next : a)) : prev,
      );
      setEditing(false);
      setError(null);
    },
    onError: (err) => setError(errMsg(err)),
  });

  const testMutation = useMutation({
    mutationFn: () => testAgent(agent.id),
    onSuccess: (result) => {
      setTestBanner(
        result.ok
          ? { kind: "success", message: t("settings.agents.test.success", { ms: result.durationMs }) }
          : {
              kind: "error",
              message: t("settings.agents.test.failed", {
                message: result.error ?? "unknown",
              }),
            },
      );
    },
    onError: (err) => {
      setTestBanner({
        kind: "error",
        message: t("settings.agents.test.failed", { message: errMsg(err) }),
      });
    },
  });

  const lastUpdated =
    agent.updatedAt && agent.updatedAt !== new Date(0).toISOString()
      ? new Date(agent.updatedAt).toLocaleString()
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: UpdateAgentInput = {
      displayName: draft.displayName.trim() || undefined,
      model: draft.model.trim() || undefined,
      temperature: Number.isFinite(draft.temperature) ? draft.temperature : undefined,
      maxTokens: Number.isFinite(draft.maxTokens) ? draft.maxTokens : undefined,
      provider: {
        apiBase: draft.apiBase.trim() || undefined,
        // 三种语义：clearKey 勾上 → "" 清空；非空 → 写新 key；空且未勾 → 不改。
        apiKey: draft.clearKey ? "" : draft.apiKey === "" ? undefined : draft.apiKey,
      },
    };
    saveMutation.mutate(input);
  };

  const handleCancel = () => {
    setDraft(toDraft(agent));
    setEditing(false);
    setError(null);
    saveMutation.reset();
  };

  return (
    <div className="rounded-xl border border-border bg-background/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{agent.displayName}</div>
          <div className="text-xs text-muted-foreground">{agent.role}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              agent.provider.apiKeyConfigured
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300",
            )}
          >
            {agent.provider.apiKeyConfigured
              ? t("settings.agents.apiKeyConfigured")
              : t("settings.agents.apiKeyMissing")}
          </span>
          {!editing && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !agent.provider.apiKeyConfigured}
                className="gap-1.5"
              >
                {testMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" aria-hidden />
                )}
                {testMutation.isPending ? t("settings.agents.testing") : t("settings.agents.test")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                {t("settings.agents.edit")}
              </Button>
            </>
          )}
        </div>
      </div>

      {testBanner && (
        <div
          className={cn(
            "mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
            testBanner.kind === "success"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
              : "border-destructive/40 bg-destructive/5 text-destructive",
          )}
        >
          {testBanner.kind === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
          )}
          <span>{testBanner.message}</span>
        </div>
      )}

      {!editing ? (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <ReadField label={t("settings.agents.fields.model")} value={agent.model} />
          <ReadField label={t("settings.agents.fields.apiBase")} value={agent.provider.apiBase} />
          <ReadField
            label={t("settings.agents.fields.temperature")}
            value={String(agent.temperature)}
          />
          <ReadField
            label={t("settings.agents.fields.maxTokens")}
            value={String(agent.maxTokens)}
          />
        </dl>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <FieldRow label={t("settings.agents.fields.displayName")}>
            <Input
              value={draft.displayName}
              onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
              maxLength={120}
            />
          </FieldRow>
          <FieldRow label={t("settings.agents.fields.model")}>
            <Input
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              placeholder="openai/gpt-4o-mini"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("settings.agents.fields.modelHint")}
            </p>
          </FieldRow>
          <FieldRow label={t("settings.agents.fields.apiBase")}>
            <Input
              value={draft.apiBase}
              onChange={(e) => setDraft({ ...draft, apiBase: e.target.value })}
              placeholder="https://api.openai.com/v1"
              type="url"
            />
          </FieldRow>
          <FieldRow label={t("settings.agents.fields.apiKey")}>
            <Input
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder={t("settings.agents.fields.apiKeyPlaceholder")}
              type="password"
              autoComplete="off"
              disabled={draft.clearKey}
            />
            <label className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={draft.clearKey}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    clearKey: e.target.checked,
                    apiKey: e.target.checked ? "" : draft.apiKey,
                  })
                }
              />
              {t("settings.agents.fields.apiKeyClear")}
            </label>
          </FieldRow>

          <div className="grid grid-cols-2 gap-3">
            <FieldRow label={t("settings.agents.fields.temperature")}>
              <Input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={draft.temperature}
                onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
              />
            </FieldRow>
            <FieldRow label={t("settings.agents.fields.maxTokens")}>
              <Input
                type="number"
                step={64}
                min={64}
                max={64000}
                value={draft.maxTokens}
                onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) })}
              />
            </FieldRow>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {t("settings.agents.error.saveFailed", { message: error })}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={saveMutation.isPending}
            >
              {t("settings.agents.cancel")}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("settings.agents.saving")}
                </>
              ) : (
                t("settings.agents.save")
              )}
            </Button>
          </div>
        </form>
      )}

      {!editing && lastUpdated && (
        <p className="mt-3 text-[10px] text-muted-foreground">
          {t("settings.agents.updatedAt", { time: lastUpdated })}
        </p>
      )}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all text-foreground">{value}</dd>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-xl border border-border bg-background/30"
        />
      ))}
    </div>
  );
}

// ---------- helpers ----------

type DraftState = {
  displayName: string;
  model: string;
  apiBase: string;
  apiKey: string;
  clearKey: boolean;
  temperature: number;
  maxTokens: number;
};

type TestBanner = { kind: "success" | "error"; message: string };

function toDraft(agent: Agent): DraftState {
  return {
    displayName: agent.displayName,
    model: agent.model,
    apiBase: agent.provider.apiBase,
    apiKey: "",
    clearKey: false,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
  };
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
