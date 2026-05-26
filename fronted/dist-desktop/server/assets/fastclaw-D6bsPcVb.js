import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { ChevronRight, KeyRound, Check, Copy, Save, ServerCog, Sparkles } from "lucide-react";
import { c as cn, S as Shell } from "./Shell-D8Pakp7k.js";
import { cva } from "class-variance-authority";
import { B as Button } from "./button-toWkDJS-.js";
import { I as Input } from "./input-vKQKnUmL.js";
import { L as Label } from "./label-CEbNblBy.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-CgUVDSQ3.js";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import "clsx";
import "tailwind-merge";
import "./router-DbOKu9BE.js";
import "@tanstack/react-query";
import "zod";
import "@radix-ui/react-slot";
import "@radix-ui/react-label";
import "@radix-ui/react-select";
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Badge({ className, variant, ...props }) {
  return /* @__PURE__ */ jsx("div", { className: cn(badgeVariants({ variant }), className), ...props });
}
const Tabs = TabsPrimitive.Root;
const TabsList = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.List,
  {
    ref,
    className: cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className
    ),
    ...props
  }
));
TabsList.displayName = TabsPrimitive.List.displayName;
const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.Trigger,
  {
    ref,
    className: cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    ),
    ...props
  }
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;
const TabsContent = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.Content,
  {
    ref,
    className: cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    ),
    ...props
  }
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
const PROVIDER_ORDER = ["glm", "deepseek"];
const STORAGE_KEY = "hermes:fastclaw-model-providers";
const DEFAULT_CONFIG = {
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
      models: ["glm-5.1", "glm-4.7", "glm-4.5-air"].join("\n")
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
      models: ["deepseek-v4-pro", "deepseek-v4-flash"].join("\n")
    }
  }
};
function FastClawConfigPage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [selectedProvider, setSelectedProvider] = useState("glm");
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
  const providerList = useMemo(() => PROVIDER_ORDER.map((key) => config.providers[key]), [config.providers]);
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
  const updateProvider = (key, patch) => {
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [key]: {
          ...prev.providers[key],
          ...patch,
          key,
          name: key
        }
      }
    }));
  };
  return /* @__PURE__ */ jsx(Shell, { active: "None", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto flex w-full max-w-7xl flex-col gap-6 px-8 py-10", children: [
    /* @__PURE__ */ jsxs("nav", { className: "flex items-center gap-2 text-sm text-muted-foreground", "aria-label": "Breadcrumb", children: [
      /* @__PURE__ */ jsx(Link, { to: "/settings", className: "hover:text-foreground", children: "Settings" }),
      /* @__PURE__ */ jsx(ChevronRight, { className: "h-4 w-4", "aria-hidden": true }),
      /* @__PURE__ */ jsx("span", { className: "text-foreground", children: "FastClaw" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-start justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(KeyRound, { className: "h-5 w-5 text-primary", "aria-hidden": true }),
          /* @__PURE__ */ jsx("h1", { className: "text-4xl font-semibold tracking-tight", children: "FastClaw Model API" })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 max-w-3xl text-sm text-muted-foreground", children: "GLM and DeepSeek provider settings aligned with FastClaw provider configuration." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        saved ? /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1.5 text-xs text-[oklch(0.74_0.18_155)]", children: [
          /* @__PURE__ */ jsx(Check, { className: "h-3.5 w-3.5", "aria-hidden": true }),
          "Saved"
        ] }) : null,
        /* @__PURE__ */ jsxs(Button, { variant: "outline", onClick: copyCommands, children: [
          copied ? /* @__PURE__ */ jsx(Check, { className: "mr-2 h-4 w-4" }) : /* @__PURE__ */ jsx(Copy, { className: "mr-2 h-4 w-4" }),
          copied ? "Copied" : "Copy CLI"
        ] }),
        /* @__PURE__ */ jsxs(Button, { onClick: saveConfig, children: [
          /* @__PURE__ */ jsx(Save, { className: "mr-2 h-4 w-4", "aria-hidden": true }),
          "Save"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-6", children: [
        /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-border bg-card p-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-5 flex flex-wrap items-center justify-between gap-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(ServerCog, { className: "h-5 w-5 text-primary", "aria-hidden": true }),
              /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold", children: "Provider Pages" })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "flex gap-2", children: providerList.map((provider) => /* @__PURE__ */ jsx(Badge, { variant: "outline", className: "font-mono", children: provider.name }, provider.key)) })
          ] }),
          /* @__PURE__ */ jsxs(Tabs, { value: selectedProvider, onValueChange: (value) => setSelectedProvider(value), children: [
            /* @__PURE__ */ jsx(TabsList, { className: "grid w-full grid-cols-2", children: providerList.map((provider) => /* @__PURE__ */ jsx(TabsTrigger, { value: provider.key, children: provider.label }, provider.key)) }),
            providerList.map((provider) => /* @__PURE__ */ jsx(TabsContent, { value: provider.key, className: "mt-6", children: /* @__PURE__ */ jsx(ProviderPanel, { provider, onChange: (patch) => updateProvider(provider.key, patch) }) }, provider.key))
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-border bg-card p-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-5 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Sparkles, { className: "h-5 w-5 text-primary", "aria-hidden": true }),
            /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold", children: "Default Model" })
          ] }),
          /* @__PURE__ */ jsxs(Field, { label: "FastClaw model", id: "active-model", children: [
            /* @__PURE__ */ jsx(Input, { id: "active-model", list: "fastclaw-model-options", value: config.activeModel, onChange: (event) => setConfig((prev) => ({
              ...prev,
              activeModel: event.target.value
            })), placeholder: "provider/model-id", className: "font-mono" }),
            /* @__PURE__ */ jsx("datalist", { id: "fastclaw-model-options", children: modelOptions.map((model) => /* @__PURE__ */ jsx("option", { value: model }, model)) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("aside", { className: "flex flex-col gap-6", children: /* @__PURE__ */ jsxs("section", { className: "rounded-2xl border border-border bg-card p-6 xl:sticky xl:top-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(KeyRound, { className: "h-5 w-5 text-primary", "aria-hidden": true }),
          /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold", children: "Generated CLI" })
        ] }),
        /* @__PURE__ */ jsx("pre", { className: "mt-4 max-h-[620px] overflow-auto rounded-xl border border-border bg-background/60 p-4 text-xs text-muted-foreground", children: /* @__PURE__ */ jsx("code", { children: commandPreview }) })
      ] }) })
    ] })
  ] }) });
}
function ProviderPanel({
  provider,
  onChange
}) {
  return /* @__PURE__ */ jsxs("div", { className: "grid gap-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
      /* @__PURE__ */ jsx(Field, { label: "Provider name", id: `${provider.key}-name`, children: /* @__PURE__ */ jsx(Input, { id: `${provider.key}-name`, value: provider.name, readOnly: true, className: "font-mono" }) }),
      /* @__PURE__ */ jsx(Field, { label: "API base URL", id: `${provider.key}-base`, children: /* @__PURE__ */ jsx(Input, { id: `${provider.key}-base`, value: provider.apiBase, onChange: (event) => onChange({
        apiBase: event.target.value
      }), placeholder: "https://api.example.com/v1", className: "font-mono" }) }),
      /* @__PURE__ */ jsx(Field, { label: "API key env", id: `${provider.key}-key-env`, children: /* @__PURE__ */ jsx(Input, { id: `${provider.key}-key-env`, value: provider.apiKeyEnv, onChange: (event) => onChange({
        apiKeyEnv: normalizeEnvName(event.target.value)
      }), placeholder: "PROVIDER_API_KEY", className: "font-mono" }) }),
      /* @__PURE__ */ jsx(Field, { label: "API key", id: `${provider.key}-key`, children: /* @__PURE__ */ jsx(Input, { id: `${provider.key}-key`, type: "password", value: provider.apiKey, onChange: (event) => onChange({
        apiKey: event.target.value
      }), placeholder: "sk-...", className: "font-mono" }) }),
      /* @__PURE__ */ jsx(Field, { label: "API type", id: `${provider.key}-api-type`, children: /* @__PURE__ */ jsx(Input, { id: `${provider.key}-api-type`, value: provider.apiType, readOnly: true, className: "font-mono" }) }),
      /* @__PURE__ */ jsx(Field, { label: "Auth type", id: `${provider.key}-auth-type`, children: /* @__PURE__ */ jsxs(Select, { value: provider.authType, onValueChange: (value) => onChange({
        authType: value
      }), children: [
        /* @__PURE__ */ jsx(SelectTrigger, { id: `${provider.key}-auth-type`, children: /* @__PURE__ */ jsx(SelectValue, {}) }),
        /* @__PURE__ */ jsxs(SelectContent, { children: [
          /* @__PURE__ */ jsx(SelectItem, { value: "bearer-token", children: "Bearer token" }),
          /* @__PURE__ */ jsx(SelectItem, { value: "api-key", children: "API key header" })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsx(Field, { label: "Model IDs", id: `${provider.key}-models`, children: /* @__PURE__ */ jsx(Textarea, { id: `${provider.key}-models`, value: provider.models, onChange: (event) => onChange({
      models: event.target.value
    }), rows: 7, className: "font-mono text-xs" }) })
  ] });
}
function Field({
  label,
  id,
  children
}) {
  return /* @__PURE__ */ jsxs("div", { className: "grid gap-2", children: [
    /* @__PURE__ */ jsx(Label, { htmlFor: id, children: label }),
    children
  ] });
}
function sanitizeConfig(input) {
  const source = isRecord(input) ? input : {};
  const storedProviders = isRecord(source.providers) ? source.providers : {};
  const providers = PROVIDER_ORDER.reduce((acc, key) => {
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
      apiType: "openai-chat"
    };
    return acc;
  }, {});
  return {
    activeModel: typeof source.activeModel === "string" && source.activeModel.trim() ? source.activeModel : DEFAULT_CONFIG.activeModel,
    providers
  };
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function readString(value, fallback) {
  return typeof value === "string" ? value : fallback;
}
function buildModelOptions(providers) {
  return PROVIDER_ORDER.flatMap((key) => splitModels(providers[key].models).map((model) => toProviderModel(key, model)));
}
function buildCommands(config) {
  const lines = ["# FastClaw GLM and DeepSeek provider configuration", ...PROVIDER_ORDER.flatMap((key) => {
    const provider = config.providers[key];
    const models = splitModels(provider.models);
    return [`fastclaw agents config <agent> set provider.${provider.name}.apiKeyEnv ${shellValue(provider.apiKeyEnv, "<api-key-env>")}`, ...provider.apiKey.trim() ? [`fastclaw agents config <agent> set provider.${provider.name}.apiKey ${shellValue(provider.apiKey, "<api-key>")}`] : [], `fastclaw agents config <agent> set provider.${provider.name}.apiBase ${shellValue(provider.apiBase, "<api-base-url>")}`, `fastclaw agents config <agent> set provider.${provider.name}.apiType ${provider.apiType}`, `fastclaw agents config <agent> set provider.${provider.name}.authType ${provider.authType}`, `fastclaw agents config <agent> set provider.${provider.name}.models '[]'`, ...models.map((model) => `fastclaw agents config <agent> set provider.${provider.name}.model ${shellValue(normalizeModelId(model), "<model-id>")}`), ""];
  }), `fastclaw agents config <agent> set model ${shellValue(config.activeModel, "<provider/model>")}`];
  return lines.join("\n").trim();
}
function splitModels(models) {
  return models.split(/[\n,]/).map((item) => normalizeModelId(item)).filter(Boolean);
}
function normalizeModelId(value) {
  return value.trim().replace(/^glm\//, "").replace(/^deepseek\//, "");
}
function toProviderModel(provider, model) {
  const normalized = normalizeModelId(model);
  return normalized.includes("/") ? normalized : `${provider}/${normalized}`;
}
function normalizeEnvName(value) {
  return value.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}
function shellValue(value, fallback) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return /^[A-Za-z0-9._~:/?#[\]@!$&()*+,;=%-]+$/.test(trimmed) ? trimmed : JSON.stringify(trimmed);
}
export {
  FastClawConfigPage as component
};
