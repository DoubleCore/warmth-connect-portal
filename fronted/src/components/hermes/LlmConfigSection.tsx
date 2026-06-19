import { useEffect, useState } from "react";
import { Cpu, Pencil, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { ApiError, isNetworkError } from "@/lib/api-client";
import { getLlmConfig, updateLlmConfig } from "@/api/llm-config";
import type { ApiType, UpdateLlmConfigInput } from "@/types/llm-config";

/**
 * Settings card: user-supplied LLM API endpoint / key / type / model that drives
 * the FastClaw research/deploy/analyse agents. On save the backend writes the
 * FastClaw db, then we ask the Electron shell to restart the gateway so it
 * reloads the new config. Outside the desktop shell (plain web) the restart is
 * skipped with a hint.
 */
export function LlmConfigSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const cfgQuery = useQuery({
    queryKey: ["llm-config"],
    queryFn: getLlmConfig,
    retry: (count, err) => (isNetworkError(err) ? false : count < 2),
  });

  const cfg = cfgQuery.data;

  const [isEditing, setIsEditing] = useState(false);
  const [apiBase, setApiBase] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiType, setApiType] = useState<ApiType>("anthropic-messages");
  const [model, setModel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [restartNote, setRestartNote] = useState<string | null>(null);

  // Seed the form from fetched config when not actively editing. apiKey stays
  // blank (server only returns a masked value); blank on submit = keep existing.
  useEffect(() => {
    if (isEditing) return;
    setApiBase(cfg?.apiBase ?? "");
    setApiType(cfg?.apiType ?? "anthropic-messages");
    setModel(cfg?.model ?? "");
    setApiKey("");
  }, [cfg, isEditing]);

  const mutation = useMutation({
    mutationFn: (input: UpdateLlmConfigInput) => updateLlmConfig(input),
    onSuccess: async (result) => {
      queryClient.setQueryData(["llm-config"], result.config);
      setIsEditing(false);
      setFormError(null);
      setApiKey("");
      if (result.needsRestart) {
        const restart = window.hermesDesktop?.restartFastclaw;
        if (restart) {
          setRestartNote(t("settings.llm.restarting"));
          try {
            const r = await restart();
            setRestartNote(r?.ok ? t("settings.llm.restartOk") : t("settings.llm.restartFailed"));
          } catch {
            setRestartNote(t("settings.llm.restartFailed"));
          }
        } else {
          // Plain web (not the desktop shell) — can't restart the gateway here.
          setRestartNote(t("settings.llm.restartManual"));
        }
      }
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const base = apiBase.trim();
    const m = model.trim();
    if (!/^https?:\/\//i.test(base)) {
      setFormError(t("settings.llm.error.badUrl"));
      return;
    }
    if (m.length === 0) {
      setFormError(t("settings.llm.error.noModel"));
      return;
    }
    // Require a key only when none is configured yet; otherwise blank keeps it.
    if (!cfg?.configured && apiKey.trim().length === 0) {
      setFormError(t("settings.llm.error.noKey"));
      return;
    }
    setFormError(null);
    setRestartNote(null);
    mutation.mutate({ apiBase: base, apiKey: apiKey.trim(), apiType, model: m });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormError(null);
    mutation.reset();
  };

  return (
    <section aria-labelledby="llm-heading" className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" aria-hidden />
          <h2 id="llm-heading" className="text-lg font-semibold">
            {t("settings.llm.heading")}
          </h2>
        </div>
        {!isEditing && !cfgQuery.isLoading && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {t("settings.llm.edit")}
          </Button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{t("settings.llm.subtitle")}</p>

      {cfgQuery.isError && !isNetworkError(cfgQuery.error) && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {t("settings.llm.error.loadFailed", { message: errMsg(cfgQuery.error) })}
        </div>
      )}

      {isEditing ? (
        <form onSubmit={handleSave} className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="llm-apibase">{t("settings.llm.apiBase")}</Label>
            <Input
              id="llm-apibase"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="https://api.anthropic.com"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="llm-apikey">{t("settings.llm.apiKey")}</Label>
            <Input
              id="llm-apikey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                cfg?.configured && cfg.apiKeyMasked
                  ? t("settings.llm.apiKeyKeep", { masked: cfg.apiKeyMasked })
                  : t("settings.llm.apiKeyPlaceholder")
              }
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="llm-apitype">{t("settings.llm.apiType")}</Label>
            <Select value={apiType} onValueChange={(v) => setApiType(v as ApiType)}>
              <SelectTrigger id="llm-apitype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic-messages">Anthropic (messages)</SelectItem>
                <SelectItem value="openai">OpenAI 兼容</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="llm-model">{t("settings.llm.model")}</Label>
            <Input
              id="llm-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-opus-4-7"
            />
          </div>

          {formError && <p className="text-xs text-destructive">{formError}</p>}

          {mutation.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {t("settings.llm.error.saveFailed", { message: errMsg(mutation.error) })}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={mutation.isPending}>
              {t("settings.llm.cancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("settings.llm.saving")}
                </>
              ) : (
                t("settings.llm.save")
              )}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="mt-6 space-y-4">
          <Row label={t("settings.llm.apiBase")} value={cfg?.apiBase ?? null} />
          <Row label={t("settings.llm.apiKey")} value={cfg?.apiKeyMasked ?? null} mono />
          <Row label={t("settings.llm.model")} value={cfg?.model ?? null} />
          {!cfg?.configured && !cfgQuery.isLoading && (
            <p className="text-xs italic text-muted-foreground/70">{t("settings.llm.empty")}</p>
          )}
        </dl>
      )}

      {restartNote && <p className="mt-3 text-xs text-muted-foreground">{restartNote}</p>}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={
          "mt-2 min-h-[2.625rem] rounded-lg border border-dashed border-border/70 bg-background/30 px-4 py-2.5 text-sm " +
          (value ? "text-foreground" : "italic text-muted-foreground/70") +
          (mono ? " font-mono" : "")
        }
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
