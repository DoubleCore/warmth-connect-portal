import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { User, Pencil, Loader2, Bot, Wand2, CheckCircle2, TriangleAlert, ChevronRight, SlidersHorizontal } from "lucide-react";
import { c as cn, S as Shell } from "./Shell-D8Pakp7k.js";
import { useState, useEffect } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { B as Button } from "./button-toWkDJS-.js";
import { I as Input } from "./input-vKQKnUmL.js";
import { L as Label } from "./label-CEbNblBy.js";
import { u as useI18n, g as getProfile, i as isNetworkError, e as updateProfile, A as ApiError, f as apiFetch, h as useTheme } from "./router-DbOKu9BE.js";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "@radix-ui/react-label";
import "zod";
const USERNAME_MAX = 120;
function ProfileSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: (count, err) => isNetworkError(err) ? false : count < 2
  });
  const username = profileQuery.data?.username ?? "";
  const updatedAtIso = profileQuery.data?.updatedAt ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState(null);
  useEffect(() => {
    if (!isEditing) setDraft(username);
  }, [username, isEditing]);
  const mutation = useMutation({
    mutationFn: (next) => updateProfile({ username: next }),
    onSuccess: (data) => {
      queryClient.setQueryData(["profile"], data);
      setIsEditing(false);
      setDraftError(null);
    }
  });
  const handleSave = (e) => {
    e.preventDefault();
    const value = draft.trim();
    if (value.length > USERNAME_MAX) {
      setDraftError(t("settings.profile.error.usernameMax"));
      return;
    }
    setDraftError(null);
    mutation.mutate(value);
  };
  const handleCancel = () => {
    setDraft(username);
    setDraftError(null);
    setIsEditing(false);
    mutation.reset();
  };
  const lastUpdated = updatedAtIso && updatedAtIso !== (/* @__PURE__ */ new Date(0)).toISOString() ? new Date(updatedAtIso).toLocaleString() : null;
  return /* @__PURE__ */ jsxs(
    "section",
    {
      "aria-labelledby": "profile-heading",
      className: "rounded-2xl border border-border bg-card p-6",
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(User, { className: "h-5 w-5 text-primary", "aria-hidden": true }),
            /* @__PURE__ */ jsx("h2", { id: "profile-heading", className: "text-lg font-semibold", children: t("settings.profile.heading") })
          ] }),
          !isEditing && !profileQuery.isLoading && /* @__PURE__ */ jsxs(
            Button,
            {
              type: "button",
              variant: "outline",
              size: "sm",
              onClick: () => setIsEditing(true),
              className: "gap-1.5",
              children: [
                /* @__PURE__ */ jsx(Pencil, { className: "h-3.5 w-3.5", "aria-hidden": true }),
                t("settings.profile.edit")
              ]
            }
          )
        ] }),
        profileQuery.isError && !isNetworkError(profileQuery.error) && /* @__PURE__ */ jsx("div", { className: "mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive", children: t("settings.profile.error.loadFailed", {
          message: errMsg$1(profileQuery.error)
        }) }),
        isEditing ? /* @__PURE__ */ jsxs("form", { onSubmit: handleSave, className: "mt-6 space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { htmlFor: "profile-username", children: t("settings.profile.username") }),
            /* @__PURE__ */ jsx(
              Input,
              {
                id: "profile-username",
                value: draft,
                onChange: (e) => {
                  setDraft(e.target.value);
                  if (draftError) setDraftError(null);
                },
                maxLength: USERNAME_MAX + 10,
                placeholder: t("settings.profile.usernamePlaceholder"),
                "aria-invalid": Boolean(draftError) || void 0,
                autoFocus: true
              }
            ),
            draftError && /* @__PURE__ */ jsx("p", { className: "text-xs text-destructive", children: draftError })
          ] }),
          mutation.isError && /* @__PURE__ */ jsx("div", { className: "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive", children: t("settings.profile.error.saveFailed", { message: errMsg$1(mutation.error) }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2", children: [
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "ghost",
                onClick: handleCancel,
                disabled: mutation.isPending,
                children: t("settings.profile.cancel")
              }
            ),
            /* @__PURE__ */ jsx(Button, { type: "submit", disabled: mutation.isPending, children: mutation.isPending ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin", "aria-hidden": true }),
              t("settings.profile.saving")
            ] }) : t("settings.profile.save") })
          ] })
        ] }) : /* @__PURE__ */ jsx("dl", { className: "mt-6 space-y-4", children: /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("dt", { className: "text-xs font-medium text-muted-foreground", children: t("settings.profile.username") }),
          /* @__PURE__ */ jsx(
            "dd",
            {
              className: "mt-2 min-h-[2.625rem] rounded-lg border border-dashed border-border/70 bg-background/30 px-4 py-2.5 text-sm " + (username ? "text-foreground" : "italic text-muted-foreground/70"),
              children: profileQuery.isLoading ? t("common.saved").length > 0 ? "…" : "" : username || t("settings.profile.empty")
            }
          ),
          lastUpdated && /* @__PURE__ */ jsx("p", { className: "mt-2 text-[10px] text-muted-foreground", children: t("settings.profile.updatedAt", { time: lastUpdated }) })
        ] }) })
      ]
    }
  );
}
function errMsg$1(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
async function listAgents() {
  return apiFetch("/api/agents");
}
async function updateAgent(id, input) {
  return apiFetch(`/api/agents/${encodeURIComponent(id)}`, {
    method: "PUT",
    json: input
  });
}
async function testAgent(id, message) {
  return apiFetch(`/api/agents/${encodeURIComponent(id)}/test`, {
    method: "POST",
    json: {}
  });
}
function AgentsSection() {
  const { t } = useI18n();
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
    retry: (count, err) => isNetworkError(err) ? false : count < 2
  });
  return /* @__PURE__ */ jsxs(
    "section",
    {
      "aria-labelledby": "agents-heading",
      className: "rounded-2xl border border-border bg-card p-6",
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Bot, { className: "h-5 w-5 text-primary", "aria-hidden": true }),
          /* @__PURE__ */ jsx("h2", { id: "agents-heading", className: "text-lg font-semibold", children: t("settings.agents.heading") })
        ] }),
        agentsQuery.isError && !isNetworkError(agentsQuery.error) && /* @__PURE__ */ jsx("div", { className: "mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive", children: t("settings.agents.loadFailed", { message: errMsg(agentsQuery.error) }) }),
        /* @__PURE__ */ jsx("div", { className: "mt-6 flex flex-col gap-4", children: agentsQuery.isLoading ? /* @__PURE__ */ jsx(SkeletonRow, {}) : agentsQuery.data && agentsQuery.data.length > 0 ? agentsQuery.data.map((agent) => /* @__PURE__ */ jsx(AgentCard, { agent }, agent.id)) : /* @__PURE__ */ jsx("p", { className: "text-sm italic text-muted-foreground", children: t("settings.agents.empty") }) })
      ]
    }
  );
}
function AgentCard({ agent }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(agent));
  const [error, setError] = useState(null);
  const [testBanner, setTestBanner] = useState(null);
  const saveMutation = useMutation({
    mutationFn: async (input) => updateAgent(agent.id, input),
    onSuccess: (next) => {
      queryClient.setQueryData(
        ["agents"],
        (prev) => prev ? prev.map((a) => a.id === next.id ? next : a) : prev
      );
      setEditing(false);
      setError(null);
    },
    onError: (err) => setError(errMsg(err))
  });
  const testMutation = useMutation({
    mutationFn: () => testAgent(agent.id),
    onSuccess: (result) => {
      setTestBanner(
        result.ok ? { kind: "success", message: t("settings.agents.test.success", { ms: result.durationMs }) } : {
          kind: "error",
          message: t("settings.agents.test.failed", {
            message: result.error ?? "unknown"
          })
        }
      );
    },
    onError: (err) => {
      setTestBanner({
        kind: "error",
        message: t("settings.agents.test.failed", { message: errMsg(err) })
      });
    }
  });
  const lastUpdated = agent.updatedAt && agent.updatedAt !== (/* @__PURE__ */ new Date(0)).toISOString() ? new Date(agent.updatedAt).toLocaleString() : null;
  const handleSubmit = (e) => {
    e.preventDefault();
    const input = {
      displayName: draft.displayName.trim() || void 0,
      model: draft.model.trim() || void 0,
      temperature: Number.isFinite(draft.temperature) ? draft.temperature : void 0,
      maxTokens: Number.isFinite(draft.maxTokens) ? draft.maxTokens : void 0,
      provider: {
        apiBase: draft.apiBase.trim() || void 0,
        // 三种语义：clearKey 勾上 → "" 清空；非空 → 写新 key；空且未勾 → 不改。
        apiKey: draft.clearKey ? "" : draft.apiKey === "" ? void 0 : draft.apiKey
      }
    };
    saveMutation.mutate(input);
  };
  const handleCancel = () => {
    setDraft(toDraft(agent));
    setEditing(false);
    setError(null);
    saveMutation.reset();
  };
  return /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-border bg-background/30 p-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "text-sm font-semibold", children: agent.displayName }),
        /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: agent.role })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(
          "span",
          {
            className: cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              agent.provider.apiKeyConfigured ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"
            ),
            children: agent.provider.apiKeyConfigured ? t("settings.agents.apiKeyConfigured") : t("settings.agents.apiKeyMissing")
          }
        ),
        !editing && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs(
            Button,
            {
              type: "button",
              variant: "outline",
              size: "sm",
              onClick: () => testMutation.mutate(),
              disabled: testMutation.isPending || !agent.provider.apiKeyConfigured,
              className: "gap-1.5",
              children: [
                testMutation.isPending ? /* @__PURE__ */ jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin", "aria-hidden": true }) : /* @__PURE__ */ jsx(Wand2, { className: "h-3.5 w-3.5", "aria-hidden": true }),
                testMutation.isPending ? t("settings.agents.testing") : t("settings.agents.test")
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            Button,
            {
              type: "button",
              variant: "outline",
              size: "sm",
              onClick: () => setEditing(true),
              className: "gap-1.5",
              children: [
                /* @__PURE__ */ jsx(Pencil, { className: "h-3.5 w-3.5", "aria-hidden": true }),
                t("settings.agents.edit")
              ]
            }
          )
        ] })
      ] })
    ] }),
    testBanner && /* @__PURE__ */ jsxs(
      "div",
      {
        className: cn(
          "mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
          testBanner.kind === "success" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-destructive/40 bg-destructive/5 text-destructive"
        ),
        children: [
          testBanner.kind === "success" ? /* @__PURE__ */ jsx(CheckCircle2, { className: "h-3.5 w-3.5", "aria-hidden": true }) : /* @__PURE__ */ jsx(TriangleAlert, { className: "h-3.5 w-3.5", "aria-hidden": true }),
          /* @__PURE__ */ jsx("span", { children: testBanner.message })
        ]
      }
    ),
    !editing ? /* @__PURE__ */ jsxs("dl", { className: "mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2", children: [
      /* @__PURE__ */ jsx(ReadField, { label: t("settings.agents.fields.model"), value: agent.model }),
      /* @__PURE__ */ jsx(ReadField, { label: t("settings.agents.fields.apiBase"), value: agent.provider.apiBase }),
      /* @__PURE__ */ jsx(
        ReadField,
        {
          label: t("settings.agents.fields.temperature"),
          value: String(agent.temperature)
        }
      ),
      /* @__PURE__ */ jsx(
        ReadField,
        {
          label: t("settings.agents.fields.maxTokens"),
          value: String(agent.maxTokens)
        }
      )
    ] }) : /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "mt-4 space-y-3", children: [
      /* @__PURE__ */ jsx(FieldRow, { label: t("settings.agents.fields.displayName"), children: /* @__PURE__ */ jsx(
        Input,
        {
          value: draft.displayName,
          onChange: (e) => setDraft({ ...draft, displayName: e.target.value }),
          maxLength: 120
        }
      ) }),
      /* @__PURE__ */ jsxs(FieldRow, { label: t("settings.agents.fields.model"), children: [
        /* @__PURE__ */ jsx(
          Input,
          {
            value: draft.model,
            onChange: (e) => setDraft({ ...draft, model: e.target.value }),
            placeholder: "openai/gpt-4o-mini"
          }
        ),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-[10px] text-muted-foreground", children: t("settings.agents.fields.modelHint") })
      ] }),
      /* @__PURE__ */ jsx(FieldRow, { label: t("settings.agents.fields.apiBase"), children: /* @__PURE__ */ jsx(
        Input,
        {
          value: draft.apiBase,
          onChange: (e) => setDraft({ ...draft, apiBase: e.target.value }),
          placeholder: "https://api.openai.com/v1",
          type: "url"
        }
      ) }),
      /* @__PURE__ */ jsxs(FieldRow, { label: t("settings.agents.fields.apiKey"), children: [
        /* @__PURE__ */ jsx(
          Input,
          {
            value: draft.apiKey,
            onChange: (e) => setDraft({ ...draft, apiKey: e.target.value }),
            placeholder: t("settings.agents.fields.apiKeyPlaceholder"),
            type: "password",
            autoComplete: "off",
            disabled: draft.clearKey
          }
        ),
        /* @__PURE__ */ jsxs("label", { className: "mt-1 flex items-center gap-2 text-[10px] text-muted-foreground", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              checked: draft.clearKey,
              onChange: (e) => setDraft({
                ...draft,
                clearKey: e.target.checked,
                apiKey: e.target.checked ? "" : draft.apiKey
              })
            }
          ),
          t("settings.agents.fields.apiKeyClear")
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsx(FieldRow, { label: t("settings.agents.fields.temperature"), children: /* @__PURE__ */ jsx(
          Input,
          {
            type: "number",
            step: 0.1,
            min: 0,
            max: 2,
            value: draft.temperature,
            onChange: (e) => setDraft({ ...draft, temperature: Number(e.target.value) })
          }
        ) }),
        /* @__PURE__ */ jsx(FieldRow, { label: t("settings.agents.fields.maxTokens"), children: /* @__PURE__ */ jsx(
          Input,
          {
            type: "number",
            step: 64,
            min: 64,
            max: 64e3,
            value: draft.maxTokens,
            onChange: (e) => setDraft({ ...draft, maxTokens: Number(e.target.value) })
          }
        ) })
      ] }),
      error && /* @__PURE__ */ jsx("div", { className: "rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive", children: t("settings.agents.error.saveFailed", { message: error }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2", children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            type: "button",
            variant: "ghost",
            onClick: handleCancel,
            disabled: saveMutation.isPending,
            children: t("settings.agents.cancel")
          }
        ),
        /* @__PURE__ */ jsx(Button, { type: "submit", disabled: saveMutation.isPending, children: saveMutation.isPending ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin", "aria-hidden": true }),
          t("settings.agents.saving")
        ] }) : t("settings.agents.save") })
      ] })
    ] }),
    !editing && lastUpdated && /* @__PURE__ */ jsx("p", { className: "mt-3 text-[10px] text-muted-foreground", children: t("settings.agents.updatedAt", { time: lastUpdated }) })
  ] });
}
function FieldRow({ label, children }) {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsx(Label, { children: label }),
    children
  ] });
}
function ReadField({ label, value }) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("dt", { className: "text-[10px] uppercase tracking-wider text-muted-foreground", children: label }),
    /* @__PURE__ */ jsx("dd", { className: "mt-0.5 break-all text-foreground", children: value })
  ] });
}
function SkeletonRow() {
  return /* @__PURE__ */ jsx("div", { className: "space-y-3", children: [0, 1, 2].map((i) => /* @__PURE__ */ jsx(
    "div",
    {
      className: "h-20 animate-pulse rounded-xl border border-border bg-background/30"
    },
    i
  )) });
}
function toDraft(agent) {
  return {
    displayName: agent.displayName,
    model: agent.model,
    apiBase: agent.provider.apiBase,
    apiKey: "",
    clearKey: false,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens
  };
}
function errMsg(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
function Toggle({
  on,
  onChange,
  label
}) {
  return /* @__PURE__ */ jsx("button", { type: "button", role: "switch", "aria-checked": on, "aria-label": label, onClick: () => onChange(!on), className: cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", on ? "bg-primary" : "bg-secondary"), children: /* @__PURE__ */ jsx("span", { "aria-hidden": true, className: cn("pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out", on ? "translate-x-[22px]" : "translate-x-0.5") }) });
}
function SettingsPage() {
  const {
    t,
    locale,
    setLocale
  } = useI18n();
  const {
    theme,
    setTheme
  } = useTheme();
  const darkMode = theme === "dark";
  const zhLocale = locale === "zh";
  return /* @__PURE__ */ jsx(Shell, { active: "None", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto w-full max-w-4xl px-8 py-10", children: [
    /* @__PURE__ */ jsxs("nav", { className: "flex items-center gap-2 text-sm text-muted-foreground", "aria-label": "Breadcrumb", children: [
      /* @__PURE__ */ jsx(Link, { to: "/", className: "hover:text-foreground", children: t("settings.breadcrumbSettings") }),
      /* @__PURE__ */ jsx(ChevronRight, { className: "h-4 w-4", "aria-hidden": true }),
      /* @__PURE__ */ jsx("span", { className: "text-foreground", children: t("settings.breadcrumbCurrent") })
    ] }),
    /* @__PURE__ */ jsx("h1", { className: "mt-2 text-4xl font-semibold tracking-tight", children: t("settings.title") }),
    /* @__PURE__ */ jsxs("div", { className: "mt-8 flex flex-col gap-6", children: [
      /* @__PURE__ */ jsx(ProfileSection, {}),
      /* @__PURE__ */ jsx(AgentsSection, {}),
      /* @__PURE__ */ jsxs("section", { "aria-labelledby": "prefs-heading", className: "rounded-2xl border border-border bg-card p-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(SlidersHorizontal, { className: "h-5 w-5 text-primary", "aria-hidden": true }),
          /* @__PURE__ */ jsx("h2", { id: "prefs-heading", className: "text-lg font-semibold", children: t("settings.prefs.heading") })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 space-y-3", children: [
          /* @__PURE__ */ jsx(PrefRow, { title: t("settings.prefs.darkTitle"), desc: t("settings.prefs.darkDesc"), on: darkMode, onChange: (next) => setTheme(next ? "dark" : "light") }),
          /* @__PURE__ */ jsx(PrefRow, { title: t("settings.prefs.localeTitle"), desc: t("settings.prefs.localeDesc"), on: zhLocale, onChange: (next) => setLocale(next ? "zh" : "en") })
        ] })
      ] })
    ] })
  ] }) });
}
function PrefRow({
  title,
  desc,
  on,
  onChange
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between rounded-xl border border-border bg-background/40 p-4", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: "font-medium", children: title }),
      /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: desc })
    ] }),
    /* @__PURE__ */ jsx(Toggle, { on, onChange, label: title })
  ] });
}
export {
  SettingsPage as component
};
