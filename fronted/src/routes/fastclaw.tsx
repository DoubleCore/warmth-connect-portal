import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Brain,
  Check,
  ChevronRight,
  Copy,
  FileText,
  KeyRound,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fastclaw")({
  head: () => ({
    meta: [
      { title: "FastClaw Configuration - Hermes AI" },
      {
        name: "description",
        content: "Configure FastClaw agents, skills, markdown files, and model API providers.",
      },
    ],
  }),
  component: FastClawConfigPage,
});

type AgentConfig = {
  id: string;
  key: "deploy" | "paper-analyse" | "researcher";
  name: string;
  envVar: string;
  roleAliases: string;
  agentId: string;
  skillName: string;
  skillPath: string;
  skillMd: string;
  mdFileName: string;
  mdFilePath: string;
  mdContent: string;
  defaultModel: string;
};

type ModelProvider = {
  id: string;
  name: string;
  apiBase: string;
  apiType: "openai-chat" | "anthropic-messages";
  authType: "bearer-token" | "api-key";
  apiKey: string;
  models: string;
};

type FastClawConfig = {
  agents: AgentConfig[];
  providers: ModelProvider[];
  activeModel: string;
};

const STORAGE_KEY = "hermes:fastclaw-config";

const DEFAULT_CONFIG: FastClawConfig = {
  activeModel: "codex/gpt-5.5",
  providers: [
    {
      id: "provider-codex",
      name: "codex",
      apiBase: "http://127.0.0.1:3000/openai-codex-oauth/v1",
      apiType: "openai-chat",
      authType: "bearer-token",
      apiKey: "123456",
      models: "gpt-5.5, gpt-5.4, gpt-5.3-codex",
    },
    {
      id: "provider-kiro",
      name: "kiro",
      apiBase: "http://127.0.0.1:3000/claude-kiro-oauth",
      apiType: "anthropic-messages",
      authType: "api-key",
      apiKey: "123456",
      models: "claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5",
    },
  ],
  agents: [
    {
      id: "agent-deploy",
      key: "deploy",
      name: "Deployment Agent",
      envVar: "FASTCLAW_AGENT_DEPLOY",
      roleAliases: "deploy",
      agentId: "",
      skillName: "paper-reproduction-deploy",
      skillPath: "~/.fastclaw/agents/<agent-id>/agent/skills/paper-reproduction-deploy/SKILL.md",
      skillMd:
        "---\nname: paper-reproduction-deploy\ndescription: Prepare, deploy, and monitor research paper reproduction jobs on available compute devices.\n---\n\nUse this skill when Hermes needs to turn a paper, repository, device, and reproduction record into an executable training or reproduction run.\n\n1. Verify the paper metadata, repository URL, device status, and reproduction target.\n2. Produce setup commands, dependency checks, dataset preparation steps, and launch commands.\n3. Stream progress, failures, artifacts, and next actions back to Hermes.\n",
      mdFileName: "AGENTS.md",
      mdFilePath: "~/.fastclaw/agents/<agent-id>/agent/AGENTS.md",
      mdContent:
        "# Deployment Agent\n\nYou are the FastClaw deployment agent for Hermes. Focus on runnable reproduction plans, device-aware execution, logs, and recovery steps.\n",
      defaultModel: "codex/gpt-5.5",
    },
    {
      id: "agent-analyse",
      key: "paper-analyse",
      name: "Paper Analysis Agent",
      envVar: "FASTCLAW_AGENT_PAPER_ANALYSE",
      roleAliases: "analyse, reader",
      agentId: "",
      skillName: "paper-analysis-rag",
      skillPath: "~/.fastclaw/agents/<agent-id>/agent/skills/paper-analysis-rag/SKILL.md",
      skillMd:
        "---\nname: paper-analysis-rag\ndescription: Read papers, extract structured summaries, and answer questions with cited evidence from the local RAG corpus.\n---\n\nUse this skill when Hermes needs paper understanding, structured extraction, or grounded Q&A.\n\n1. Identify the active paper and available PDF/RAG sources.\n2. Extract task, method, datasets, metrics, implementation notes, and limitations.\n3. Prefer concise cited answers and note uncertainty when evidence is missing.\n",
      mdFileName: "AGENTS.md",
      mdFilePath: "~/.fastclaw/agents/<agent-id>/agent/AGENTS.md",
      mdContent:
        "# Paper Analysis Agent\n\nYou are the FastClaw paper analysis agent for Hermes. Keep answers evidence-based, structured, and tied to the current paper or corpus.\n",
      defaultModel: "kiro/claude-sonnet-4-5",
    },
    {
      id: "agent-researcher",
      key: "researcher",
      name: "Research Agent",
      envVar: "FASTCLAW_AGENT_RESEARCHER",
      roleAliases: "researcher, search",
      agentId: "",
      skillName: "paper-research-search",
      skillPath: "~/.fastclaw/agents/<agent-id>/agent/skills/paper-research-search/SKILL.md",
      skillMd:
        "---\nname: paper-research-search\ndescription: Search for papers, compare related work, and build research briefs for Hermes workflows.\n---\n\nUse this skill when Hermes needs discovery, literature comparison, or a research plan.\n\n1. Clarify the research question, scope, and constraints.\n2. Search and rank relevant papers, repositories, datasets, and benchmarks.\n3. Return a compact brief with recommended next papers and reproducibility notes.\n",
      mdFileName: "AGENTS.md",
      mdFilePath: "~/.fastclaw/agents/<agent-id>/agent/AGENTS.md",
      mdContent:
        "# Research Agent\n\nYou are the FastClaw research agent for Hermes. Prioritize high-signal discovery, comparison, and actionable next steps.\n",
      defaultModel: "codex/gpt-5.5",
    },
  ],
};

function FastClawConfigPage() {
  const [config, setConfig] = useState<FastClawConfig>(DEFAULT_CONFIG);
  const [selectedAgentId, setSelectedAgentId] = useState(DEFAULT_CONFIG.agents[0].id);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
    } catch {
      setConfig(DEFAULT_CONFIG);
    }
  }, []);

  const selectedAgent =
    config.agents.find((agent) => agent.id === selectedAgentId) ?? config.agents[0];
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

  const updateAgent = (id: string, patch: Partial<AgentConfig>) => {
    setConfig((prev) => ({
      ...prev,
      agents: prev.agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)),
    }));
  };

  const updateProvider = (id: string, patch: Partial<ModelProvider>) => {
    setConfig((prev) => ({
      ...prev,
      providers: prev.providers.map((provider) =>
        provider.id === id ? { ...provider, ...patch } : provider,
      ),
    }));
  };

  const addProvider = () => {
    const id = `provider-${Date.now()}`;
    setConfig((prev) => ({
      ...prev,
      providers: [
        ...prev.providers,
        {
          id,
          name: "custom",
          apiBase: "",
          apiType: "openai-chat",
          authType: "bearer-token",
          apiKey: "",
          models: "",
        },
      ],
    }));
  };

  const removeProvider = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      providers: prev.providers.filter((provider) => provider.id !== id),
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
              <Bot className="h-5 w-5 text-primary" aria-hidden />
              <h1 className="text-4xl font-semibold tracking-tight">FastClaw Configuration</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Configure the three Hermes-facing FastClaw agents, their skill files, agent markdown,
              and model API providers.
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

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                  <h2 className="text-lg font-semibold">Agent Files</h2>
                </div>
                <Badge variant="outline">3 agents</Badge>
              </div>

              <Tabs value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <TabsList className="grid w-full grid-cols-3">
                  {config.agents.map((agent) => (
                    <TabsTrigger key={agent.id} value={agent.id} className="min-w-0">
                      <span className="truncate">{agent.name}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                {config.agents.map((agent) => (
                  <TabsContent key={agent.id} value={agent.id} className="mt-6">
                    <AgentEditor
                      agent={agent}
                      modelOptions={modelOptions}
                      onChange={(patch) => updateAgent(agent.id, patch)}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" aria-hidden />
                  <h2 className="text-lg font-semibold">Model API Providers</h2>
                </div>
                <Button variant="outline" size="sm" onClick={addProvider}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden />
                  Add provider
                </Button>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="active-model">Global active model</Label>
                  <Input
                    id="active-model"
                    value={config.activeModel}
                    onChange={(event) =>
                      setConfig((prev) => ({ ...prev, activeModel: event.target.value }))
                    }
                    placeholder="provider/model-id"
                    className="font-mono"
                  />
                </div>

                {config.providers.map((provider) => (
                  <ProviderEditor
                    key={provider.id}
                    provider={provider}
                    canRemove={config.providers.length > 1}
                    onChange={(patch) => updateProvider(provider.id, patch)}
                    onRemove={() => removeProvider(provider.id)}
                  />
                ))}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <section className="rounded-2xl border border-border bg-card p-6 xl:sticky xl:top-6">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" aria-hidden />
                <h2 className="text-lg font-semibold">Runtime Mapping</h2>
              </div>
              <div className="mt-5 space-y-3">
                {config.agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={cn(
                      "rounded-xl border border-border bg-background/40 p-4",
                      selectedAgent.id === agent.id && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{agent.name}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {agent.envVar}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {agent.roleAliases}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                      <span className="truncate font-mono">id: {agent.agentId || "unset"}</span>
                      <span className="truncate font-mono">
                        model: {agent.defaultModel || config.activeModel}
                      </span>
                      <span className="truncate font-mono">skill: {agent.skillName}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" aria-hidden />
                <h2 className="text-lg font-semibold">Generated CLI</h2>
              </div>
              <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-border bg-background/60 p-4 text-xs text-muted-foreground">
                <code>{commandPreview}</code>
              </pre>
            </section>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function AgentEditor({
  agent,
  modelOptions,
  onChange,
}: {
  agent: AgentConfig;
  modelOptions: string[];
  onChange: (patch: Partial<AgentConfig>) => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Agent display name" id={`${agent.id}-name`}>
          <Input
            id={`${agent.id}-name`}
            value={agent.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>
        <Field label="FastClaw agent ID" id={`${agent.id}-agent-id`}>
          <Input
            id={`${agent.id}-agent-id`}
            value={agent.agentId}
            onChange={(event) => onChange({ agentId: event.target.value })}
            placeholder="agt_..."
            className="font-mono"
          />
        </Field>
        <Field label="Environment variable" id={`${agent.id}-env`}>
          <Input
            id={`${agent.id}-env`}
            value={agent.envVar}
            onChange={(event) => onChange({ envVar: event.target.value })}
            className="font-mono"
          />
        </Field>
        <Field label="Role aliases" id={`${agent.id}-roles`}>
          <Input
            id={`${agent.id}-roles`}
            value={agent.roleAliases}
            onChange={(event) => onChange({ roleAliases: event.target.value })}
            className="font-mono"
          />
        </Field>
        <Field label="Default model" id={`${agent.id}-model`}>
          {modelOptions.length > 0 ? (
            <Select
              value={agent.defaultModel}
              onValueChange={(value) => onChange({ defaultModel: value })}
            >
              <SelectTrigger id={`${agent.id}-model`} className="font-mono">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((model) => (
                  <SelectItem key={model} value={model}>
                    <span className="font-mono">{model}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${agent.id}-model`}
              value={agent.defaultModel}
              onChange={(event) => onChange({ defaultModel: event.target.value })}
              placeholder="provider/model-id"
              className="font-mono"
            />
          )}
        </Field>
        <Field label="Skill name" id={`${agent.id}-skill-name`}>
          <Input
            id={`${agent.id}-skill-name`}
            value={agent.skillName}
            onChange={(event) => onChange({ skillName: event.target.value })}
            className="font-mono"
          />
        </Field>
      </div>

      <Field label="Skill file path" id={`${agent.id}-skill-path`}>
        <Input
          id={`${agent.id}-skill-path`}
          value={agent.skillPath}
          onChange={(event) => onChange({ skillPath: event.target.value })}
          className="font-mono"
        />
      </Field>
      <Field label="SKILL.md" id={`${agent.id}-skill-md`}>
        <Textarea
          id={`${agent.id}-skill-md`}
          value={agent.skillMd}
          onChange={(event) => onChange({ skillMd: event.target.value })}
          rows={12}
          className="font-mono text-xs"
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <Field label="Markdown file" id={`${agent.id}-md-name`}>
          <Input
            id={`${agent.id}-md-name`}
            value={agent.mdFileName}
            onChange={(event) => onChange({ mdFileName: event.target.value })}
            className="font-mono"
          />
        </Field>
        <Field label="Markdown path" id={`${agent.id}-md-path`}>
          <Input
            id={`${agent.id}-md-path`}
            value={agent.mdFilePath}
            onChange={(event) => onChange({ mdFilePath: event.target.value })}
            className="font-mono"
          />
        </Field>
      </div>
      <Field
        label={`${agent.mdFileName || "Agent markdown"} content`}
        id={`${agent.id}-md-content`}
      >
        <Textarea
          id={`${agent.id}-md-content`}
          value={agent.mdContent}
          onChange={(event) => onChange({ mdContent: event.target.value })}
          rows={8}
          className="font-mono text-xs"
        />
      </Field>
    </div>
  );
}

function ProviderEditor({
  provider,
  canRemove,
  onChange,
  onRemove,
}: {
  provider: ModelProvider;
  canRemove: boolean;
  onChange: (patch: Partial<ModelProvider>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{provider.name || "Custom provider"}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {provider.apiBase || "No API base"}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          disabled={!canRemove}
          onClick={onRemove}
          aria-label="Remove provider"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Provider name" id={`${provider.id}-name`}>
          <Input
            id={`${provider.id}-name`}
            value={provider.name}
            onChange={(event) => onChange({ name: normalizeProviderName(event.target.value) })}
            placeholder="openai"
            className="font-mono"
          />
        </Field>
        <Field label="API base URL" id={`${provider.id}-base`}>
          <Input
            id={`${provider.id}-base`}
            value={provider.apiBase}
            onChange={(event) => onChange({ apiBase: event.target.value })}
            placeholder="https://api.openai.com/v1"
            className="font-mono"
          />
        </Field>
        <Field label="API key" id={`${provider.id}-key`}>
          <Input
            id={`${provider.id}-key`}
            type="password"
            value={provider.apiKey}
            onChange={(event) => onChange({ apiKey: event.target.value })}
            placeholder="sk-..."
            className="font-mono"
          />
        </Field>
        <Field label="Models" id={`${provider.id}-models`}>
          <Input
            id={`${provider.id}-models`}
            value={provider.models}
            onChange={(event) => onChange({ models: event.target.value })}
            placeholder="gpt-5.5, gpt-5.4"
            className="font-mono"
          />
        </Field>
        <Field label="API type" id={`${provider.id}-api-type`}>
          <Select
            value={provider.apiType}
            onValueChange={(value) => onChange({ apiType: value as ModelProvider["apiType"] })}
          >
            <SelectTrigger id={`${provider.id}-api-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai-chat">OpenAI Chat</SelectItem>
              <SelectItem value="anthropic-messages">Anthropic Messages</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Auth type" id={`${provider.id}-auth-type`}>
          <Select
            value={provider.authType}
            onValueChange={(value) => onChange({ authType: value as ModelProvider["authType"] })}
          >
            <SelectTrigger id={`${provider.id}-auth-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bearer-token">Bearer token</SelectItem>
              <SelectItem value="api-key">API key header</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function buildModelOptions(providers: ModelProvider[]) {
  return providers.flatMap((provider) =>
    splitModels(provider.models).map((model) => `${provider.name || "custom"}/${model}`),
  );
}

function buildCommands(config: FastClawConfig) {
  const lines: string[] = [
    "# FastClaw provider configuration",
    ...config.providers.flatMap((provider) => {
      const name = provider.name || "custom";
      return [
        `fastclaw agents config <agent> set provider.${name}.apiKey ${provider.apiKey || "<api-key>"}`,
        `fastclaw agents config <agent> set provider.${name}.apiBase ${provider.apiBase || "<api-base-url>"}`,
        `fastclaw agents config <agent> set provider.${name}.apiType ${provider.apiType}`,
        `fastclaw agents config <agent> set provider.${name}.authType ${provider.authType}`,
        ...splitModels(provider.models).map(
          (model) => `fastclaw agents config <agent> set provider.${name}.model ${model}`,
        ),
      ];
    }),
    `fastclaw agents config <agent> set model ${config.activeModel || "<provider/model>"}`,
    "",
    "# Hermes role bindings",
    ...config.agents.flatMap((agent) => [
      `${agent.envVar}=${agent.agentId || "agt_..."}`,
      `fastclaw agents config ${agent.agentId || "<agent-id>"} set model ${
        agent.defaultModel || config.activeModel || "<provider/model>"
      }`,
      `# skill: ${agent.skillPath}`,
      `# markdown: ${agent.mdFilePath}`,
    ]),
  ];

  return lines.join("\n");
}

function splitModels(models: string) {
  return models
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProviderName(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, "-");
}
