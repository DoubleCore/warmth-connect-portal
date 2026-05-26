import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { Plus, FlaskConical, TerminalSquare, Search, BookOpen, ActivitySquare, Cpu, Settings, Bot, HelpCircle, LifeBuoy, Bell } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { u as useI18n, g as getProfile, i as isNetworkError } from "./router-DbOKu9BE.js";
import { useQuery } from "@tanstack/react-query";
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
const nav = [
  {
    to: "/",
    labelKey: "sidebar.commandCenter",
    icon: TerminalSquare,
    children: [{ to: "/research", labelKey: "sidebar.research", icon: FlaskConical }]
  },
  {
    to: "/library",
    labelKey: "sidebar.analyzePdf",
    icon: BookOpen,
    children: [{ to: "/search", labelKey: "sidebar.ragSearch", icon: Search }]
  },
  {
    to: "/workspace",
    labelKey: "sidebar.deviceManager",
    icon: Cpu,
    children: [{ to: "/manager", labelKey: "sidebar.trainingManager", icon: ActivitySquare }]
  },
  { to: "/settings", labelKey: "sidebar.settings", icon: Settings },
  { to: "/fastclaw", labelKey: "sidebar.fastclawConfig", icon: Bot }
];
function Sidebar() {
  const { t } = useI18n();
  return /* @__PURE__ */ jsxs("aside", { className: "hidden lg:flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-primary-foreground shadow-[var(--shadow-glow)]",
          style: { background: "var(--gradient-primary)" },
          "aria-hidden": true,
          children: "H"
        }
      ),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "font-semibold tracking-tight text-sidebar-foreground", children: t("common.appName") }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-xs text-[oklch(0.74_0.18_155)]", children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: "h-1.5 w-1.5 rounded-full bg-[oklch(0.74_0.18_155)] animate-pulse",
              "aria-hidden": true
            }
          ),
          t("common.systemActive")
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(
      Link,
      {
        to: "/",
        "aria-label": t("sidebar.newResearch"),
        className: "mt-8 flex items-center justify-center gap-2 rounded-xl py-3 font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]",
        style: { background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" },
        children: [
          /* @__PURE__ */ jsx(Plus, { className: "h-4 w-4", "aria-hidden": true }),
          t("sidebar.newResearch")
        ]
      }
    ),
    /* @__PURE__ */ jsx("nav", { className: "mt-6 flex flex-col gap-1", "aria-label": t("sidebar.primaryNavLabel"), children: nav.map(({ to, labelKey, icon: Icon, children }) => {
      const baseCls = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground";
      return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxs(
          Link,
          {
            to,
            className: baseCls,
            activeOptions: { exact: true },
            activeProps: {
              className: cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                "bg-sidebar-accent text-sidebar-accent-foreground"
              )
            },
            children: [
              /* @__PURE__ */ jsx(Icon, { className: "h-4 w-4", "aria-hidden": true }),
              t(labelKey)
            ]
          }
        ),
        children?.map((child) => {
          const childCls = "ml-6 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground";
          const ChildIcon = child.icon;
          return /* @__PURE__ */ jsxs(
            Link,
            {
              to: child.to,
              className: childCls,
              activeOptions: { exact: true },
              activeProps: {
                className: cn(
                  "ml-6 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                  "bg-sidebar-accent text-sidebar-accent-foreground"
                )
              },
              children: [
                /* @__PURE__ */ jsx(ChildIcon, { className: "h-3.5 w-3.5", "aria-hidden": true }),
                t(child.labelKey)
              ]
            },
            child.to
          );
        })
      ] }, to);
    }) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-auto flex flex-col gap-1 pt-6 text-sm text-muted-foreground", children: [
      /* @__PURE__ */ jsxs(
        Link,
        {
          to: "/docs",
          className: "flex items-center gap-3 rounded-lg px-3 py-2 hover:text-sidebar-foreground",
          activeProps: {
            className: "flex items-center gap-3 rounded-lg px-3 py-2 bg-sidebar-accent text-sidebar-accent-foreground"
          },
          children: [
            /* @__PURE__ */ jsx(HelpCircle, { className: "h-4 w-4", "aria-hidden": true }),
            " ",
            t("sidebar.documentation")
          ]
        }
      ),
      /* @__PURE__ */ jsxs(
        "a",
        {
          className: "flex items-center gap-3 rounded-lg px-3 py-2 hover:text-sidebar-foreground",
          href: "#",
          children: [
            /* @__PURE__ */ jsx(LifeBuoy, { className: "h-4 w-4", "aria-hidden": true }),
            " ",
            t("sidebar.support")
          ]
        }
      )
    ] })
  ] });
}
const tabs = [
  { tab: "Command", to: "/", labelKey: "topbar.tabCommand" },
  { tab: "Library", to: "/library", labelKey: "topbar.tabLibrary" },
  { tab: "Workspace", to: "/workspace", labelKey: "topbar.tabWorkspace" }
];
function TopBar({ active = "Command" }) {
  const { t } = useI18n();
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    // Don't retry transport failures — we'd rather show "Welcome" than spin.
    retry: (count, err) => isNetworkError(err) ? false : count < 2,
    staleTime: 3e4
  });
  const username = profileQuery.data?.username ?? null;
  const greeting = username ? t("topbar.greeting", { name: username }) : t("topbar.greetingAnonymous");
  return /* @__PURE__ */ jsxs("header", { className: "flex items-center justify-between border-b border-border px-8 py-5", children: [
    /* @__PURE__ */ jsx(
      "nav",
      {
        className: "flex flex-1 items-center justify-center gap-8",
        "aria-label": t("sidebar.primaryNavLabel"),
        children: tabs.map((entry) => {
          const isActive = entry.tab === active;
          const cls = cn(
            "relative pb-1 text-sm transition-colors",
            isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
          );
          return /* @__PURE__ */ jsxs(
            Link,
            {
              to: entry.to,
              className: cls,
              "aria-current": isActive ? "page" : void 0,
              children: [
                t(entry.labelKey),
                isActive && /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: "absolute -bottom-[1.35rem] left-0 right-0 h-0.5 rounded-full",
                    style: { background: "var(--gradient-primary)" }
                  }
                )
              ]
            },
            entry.tab
          );
        })
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
      /* @__PURE__ */ jsx("span", { className: "hidden text-xs text-muted-foreground md:inline", "aria-live": "polite", children: greeting }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          "aria-label": t("topbar.notifications"),
          className: "rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground",
          children: /* @__PURE__ */ jsx(Bell, { className: "h-5 w-5", "aria-hidden": true })
        }
      ),
      /* @__PURE__ */ jsx(
        Link,
        {
          to: "/settings",
          "aria-label": t("topbar.settings"),
          className: "rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground",
          activeProps: { className: "rounded-lg p-2 bg-secondary text-primary" },
          children: /* @__PURE__ */ jsx(Settings, { className: "h-5 w-5", "aria-hidden": true })
        }
      ),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "h-9 w-9 rounded-full ring-2 ring-primary/40",
          style: { background: "linear-gradient(135deg,oklch(0.4_0.05_270),oklch(0.6_0.1_290))" },
          role: "img",
          "aria-label": t("topbar.avatar")
        }
      )
    ] })
  ] });
}
function Shell({
  children,
  active = "Command"
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex min-h-screen bg-background text-foreground", children: [
    /* @__PURE__ */ jsx(Sidebar, {}),
    /* @__PURE__ */ jsxs("div", { className: "flex min-h-screen flex-1 flex-col", children: [
      /* @__PURE__ */ jsx(TopBar, { active }),
      /* @__PURE__ */ jsx("main", { className: "flex-1", children })
    ] })
  ] });
}
export {
  Shell as S,
  cn as c
};
