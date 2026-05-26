import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, KeyRound, Save, ServerCog, Sparkles } from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/fastclaw")({
  head: () => ({
    meta: [
      { title: "FastClaw Model API - Hermes AI" },
      {
        name: "description",
        content: "Configure FastClaw GLM and DeepSeek model API providers.",
      },
    ],
  }),
  component: FastClawConfigPage,
});

type ProviderKey = "glm" | "deepseek";

type ModelProvider = {
  key: ProviderKey;
  label: string;
  name: ProviderKey;
  apiBase: string;
  apiType: "openai-chat";
  authType: "bearer-token" | "api-key";
  apiKey: string;
  apiKeyEnv: string;
  models: string;
};

type FastClawProviderConfig = {
  activeModel: string;
  providers: Record<ProviderKey, ModelProvider>;
};

const PROVIDER_ORDER: ProviderKey[] = ["glm", "deepseek"];
const STORAGE_KEY = "hermes:fastclaw-model-providers";

const DEFAULT_CONFIG: FastClawProviderConfig = {
  activeModel: "glm/glm-5.1",
  providers: {
    glm: {
      key: "glm",
      label: "GLM",
      name: "glm",
      apiBase: "https://open.bigmodel.cn/api/paas/v4",
      apiType: "openai-chat",
      authType: "bearer-token",
      apiKey: "",
      apiKeyEnv: "GLM_API_KEY",
      models: ["glm-5.1", "glm-4.7", "glm-4.5-air"].join("\n"),
    },
    deepseek: {
      key: "deepseek",
      label: "DeepSeek",
      name: "deepseek",
      apiBase: "https://api.deepseek.com",
      apiType: "openai-chat",
      authType: "bearer-token",
      apiKey: "",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      models: ["deepseek-v4-pro", "deepseek-v4-flash"].join("\n"),
    },
  },
};

function FastClawConfigPage() {
  const [config, setConfig] = useState<FastClawProviderConfig>(DEFAULT_CONFIG);
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>("glm");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setConfig(sanitizeConfig(JSON.parse(raw)));
    } catch {
      setConfig(DEFAULT_CONFIG);
    }
  }, []);

  const providerList = useMemo(
    () => PROVIDER_ORDER.map((key) => config.providers[key]),
    [config.providers],
  );
  const modelOptions = useMemo(() => buildModelOptions(config.providers), [config.providers]);
  const commandPreview = useMemo(() => buildCommands(config), [config]);

  const saveConfig = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const copyCommands = async () => {
    await navigator.clipboard.writeText(commandPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const updateProvider = (key: ProviderKey, patch: Partial<ModelProvider>) => {
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [key]: { ...prev.providers[key], ...patch, key, name: key },
      },
    }));
  };

  return (
    <Shell active="None">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-8 py-10">
        <nav
          className="flex items-center gap-2 text-sm text-muted-foreground"
          aria-label="Breadcrumb"
        >
          <Link to="/settings" className="hover:text-foreground">
            Settings
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden />
          <span className="text-foreground">FastClaw</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" aria-hidden />
              <h1 className="text-4xl font-semibold tracking-tight">FastClaw Model API</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              GLM and DeepSeek provider settings aligned with FastClaw provider configuration.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saved ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-[oklch(0.74_0.18_155)]">
                <Check className="h-3.5 w-3.5" aria-hidden />
                Saved
              </span>
            ) : null}
            <Button variant="outline" onClick={copyCommands}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Copied" : "Copy CLI"}
            </Button>
            <Button onClick={saveConfig}>
              <Save className="mr-2 h-4 w-4" aria-hidden />
              Save
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ServerCog className="h-5 w-5 text-primary" aria-hidden />
                  <h2 className="text-lg font-semibold">Provider Pages</h2>
                </div>
                <div className="flex gap-2">
                  {providerList.map((provider) => (
                    <Badge key={provider.key} variant="outline" className="font-mono">
                      {provider.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <Tabs
                value={selectedProvider}
                onValueChange={(value) => setSelectedProvider(value as ProviderKey)}
              >
                <TabsList className="grid w-full grid-cols-2">
                  {providerList.map((provider) => (
                    <TabsTrigger key={provider.key} value={provider.key}>
                      {provider.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {providerList.map((provider) => (
                  <TabsContent key={provider.key} value={provider.key} className="mt-6">
                    <ProviderPanel
                      provider={provider}
                      onChange={(patch) => updateProvider(provider.key, patch)}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-5 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                <h2 className="text-lg font-semibold">Default Model</h2>
              </div>

              <Field label="FastClaw model" id="active-model">
                <Input
                  id="active-model"
                  list="fastclaw-model-options"
                  value={config.activeModel}
                  onChange={(event) =>
                    setConfig((prev) => ({ ...prev, activeModel: event.target.value }))
                  }
                  placeholder="provider/model-id"
                  className="font-mono"
                />
                <datalist id="fastclaw-model-options">
                  {modelOptions.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </Field>
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <section className="rounded-2xl border border-border bg-card p-6 xl:sticky xl:top-6">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" aria-hidden />
                <h2 className="text-lg font-semibold">Generated CLI</h2>
              </div>
              <pre className="mt-4 max-h-[620px] overflow-auto rounded-xl border border-border bg-background/60 p-4 text-xs text-muted-foreground">
                <code>{commandPreview}</code>
              </pre>
            </section>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function ProviderPanel({
  provider,
  onChange,
}: {
  provider: ModelProvider;
  onChange: (patch: Partial<ModelProvider>) => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Provider name" id={`${provider.key}-name`}>
          <Input id={`${provider.key}-name`} value={provider.name} readOnly className="font-mono" />
        </Field>
        <Field label="API base URL" id={`${provider.key}-base`}>
          <Input
            id={`${provider.key}-base`}
            value={provider.apiBase}
            onChange={(event) => onChange({ apiBase: event.target.value })}
            placeholder="https://api.example.com/v1"
            className="font-mono"
          />
        </Field>
        <Field label="API key env" id={`${provider.key}-key-env`}>
          <Input
            id={`${provider.key}-key-env`}
            value={provider.apiKeyEnv}
            onChange={(event) => onChange({ apiKeyEnv: normalizeEnvName(event.target.value) })}
            placeholder="PROVIDER_API_KEY"
            className="font-mono"
          />
        </Field>
        <Field label="API key" id={`${provider.key}-key`}>
          <Input
            id={`${provider.key}-key`}
            type="password"
            value={provider.apiKey}
            onChange={(event) => onChange({ apiKey: event.target.value })}
            placeholder="sk-..."
            className="font-mono"
          />
        </Field>
        <Field label="API type" id={`${provider.key}-api-type`}>
          <Input
            id={`${provider.key}-api-type`}
            value={provider.apiType}
            readOnly
            className="font-mono"
          />
        </Field>
        <Field label="Auth type" id={`${provider.key}-auth-type`}>
          <Select
            value={provider.authType}
            onValueChange={(value) => onChange({ authType: value as ModelProvider["authType"] })}
          >
            <SelectTrigger id={`${provider.key}-auth-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bearer-token">Bearer token</SelectItem>
              <SelectItem value="api-key">API key header</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Model IDs" id={`${provider.key}-models`}>
        <Textarea
          id={`${provider.key}-models`}
          value={provider.models}
          onChange={(event) => onChange({ models: event.target.value })}
          rows={7}
          className="font-mono text-xs"
        />
      </Field>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function sanitizeConfig(input: unknown): FastClawProviderConfig {
  const source = isRecord(input) ? input : {};
  const storedProviders = isRecord(source.providers) ? source.providers : {};

  const providers = PROVIDER_ORDER.reduce(
    (acc, key) => {
      const stored = isRecord(storedProviders[key]) ? storedProviders[key] : {};
      const defaults = DEFAULT_CONFIG.providers[key];
      acc[key] = {
        ...defaults,
        apiBase: readString(stored.apiBase, defaults.apiBase),
        authType: stored.authType === "api-key" ? "api-key" : defaults.authType,
        apiKey: readString(stored.apiKey, defaults.apiKey),
        apiKeyEnv: readString(stored.apiKeyEnv, defaults.apiKeyEnv),
        models: readString(stored.models, defaults.models),
        key,
        name: key,
        label: defaults.label,
        apiType: "openai-chat",
      };
      return acc;
    },
    {} as Record<ProviderKey, ModelProvider>,
  );

  return {
    activeModel:
      typeof source.activeModel === "string" && source.activeModel.trim()
        ? source.activeModel
        : DEFAULT_CONFIG.activeModel,
    providers,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function buildModelOptions(providers: Record<ProviderKey, ModelProvider>) {
  return PROVIDER_ORDER.flatMap((key) =>
    splitModels(providers[key].models).map((model) => toProviderModel(key, model)),
  );
}

function buildCommands(config: FastClawProviderConfig) {
  const lines = [
    "# FastClaw GLM and DeepSeek provider configuration",
    ...PROVIDER_ORDER.flatMap((key) => {
      const provider = config.providers[key];
      const models = splitModels(provider.models);
      return [
        `fastclaw agents config <agent> set provider.${provider.name}.apiKeyEnv ${shellValue(provider.apiKeyEnv, "<api-key-env>")}`,
        ...(provider.apiKey.trim()
          ? [
              `fastclaw agents config <agent> set provider.${provider.name}.apiKey ${shellValue(
                provider.apiKey,
                "<api-key>",
              )}`,
            ]
          : []),
        `fastclaw agents config <agent> set provider.${provider.name}.apiBase ${shellValue(provider.apiBase, "<api-base-url>")}`,
        `fastclaw agents config <agent> set provider.${provider.name}.apiType ${provider.apiType}`,
        `fastclaw agents config <agent> set provider.${provider.name}.authType ${provider.authType}`,
        `fastclaw agents config <agent> set provider.${provider.name}.models '[]'`,
        ...models.map(
          (model) =>
            `fastclaw agents config <agent> set provider.${provider.name}.model ${shellValue(
              normalizeModelId(model),
              "<model-id>",
            )}`,
        ),
        "",
      ];
    }),
    `fastclaw agents config <agent> set model ${shellValue(config.activeModel, "<provider/model>")}`,
  ];

  return lines.join("\n").trim();
}

function splitModels(models: string) {
  return models
    .split(/[\n,]/)
    .map((item) => normalizeModelId(item))
    .filter(Boolean);
}

function normalizeModelId(value: string) {
  return value
    .trim()
    .replace(/^glm\//, "")
    .replace(/^deepseek\//, "");
}

function toProviderModel(provider: ProviderKey, model: string) {
  const normalized = normalizeModelId(model);
  return normalized.includes("/") ? normalized : `${provider}/${normalized}`;
}

function normalizeEnvName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

function shellValue(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return /^[A-Za-z0-9._~:/?#[\]@!$&()*+,;=%-]+$/.test(trimmed) ? trimmed : JSON.stringify(trimmed);
}
