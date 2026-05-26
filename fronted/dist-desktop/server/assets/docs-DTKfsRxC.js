import { jsxs, jsx } from "react/jsx-runtime";
import { ChevronLeft, Bot, Server, Monitor, Workflow, Layers, MessageSquareText, Database, Boxes, Activity, ArrowRight, ExternalLink, ListChecks } from "lucide-react";
import { S as Shell, c as cn } from "./Shell-D8Pakp7k.js";
import "@tanstack/react-router";
import "clsx";
import "tailwind-merge";
import "./router-DbOKu9BE.js";
import "@tanstack/react-query";
import "react";
import "zod";
const navSections = [{
  title: "概览",
  items: [{
    label: "项目定位",
    anchor: "overview"
  }, {
    label: "三层架构总览",
    anchor: "layers"
  }]
}, {
  title: "分层职责",
  items: [{
    label: "Hermes — 任务层",
    anchor: "hermes"
  }, {
    label: "Backend — 数据与 RAG 层",
    anchor: "backend"
  }, {
    label: "Frontend — 展示层",
    anchor: "frontend"
  }]
}, {
  title: "工作方式",
  items: [{
    label: "核心数据流",
    anchor: "dataflow"
  }, {
    label: "后端接口",
    anchor: "api"
  }, {
    label: "数据库核心表",
    anchor: "schema"
  }]
}, {
  title: "交付范围",
  items: [{
    label: "MVP 范围",
    anchor: "scope"
  }, {
    label: "职责边界速查",
    anchor: "responsibility"
  }]
}];
const onThisPage = [{
  label: "项目定位",
  anchor: "overview"
}, {
  label: "三层架构总览",
  anchor: "layers"
}, {
  label: "Hermes 层",
  anchor: "hermes"
}, {
  label: "Backend 层",
  anchor: "backend"
}, {
  label: "Frontend 层",
  anchor: "frontend"
}, {
  label: "核心数据流",
  anchor: "dataflow"
}, {
  label: "后端接口",
  anchor: "api"
}, {
  label: "数据库核心表",
  anchor: "schema"
}, {
  label: "MVP 范围",
  anchor: "scope"
}];
function DocsPage() {
  return /* @__PURE__ */ jsxs(Shell, { active: "None", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between border-b border-border px-8 py-3 text-sm", children: /* @__PURE__ */ jsxs("nav", { className: "flex items-center gap-2", "aria-label": "Breadcrumb", children: [
      /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "Docs" }),
      /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", "aria-hidden": true, children: "/" }),
      /* @__PURE__ */ jsx("span", { className: "font-medium text-foreground", children: "技术架构说明" })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-1", children: [
      /* @__PURE__ */ jsx("aside", { className: "hidden w-64 shrink-0 border-r border-border px-6 py-8 lg:block", "aria-label": "Docs navigation", children: /* @__PURE__ */ jsx("div", { className: "space-y-7", children: navSections.map((section) => /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", children: section.title }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-1.5", children: section.items.map((item) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("a", { href: `#${item.anchor}`, className: "flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground", children: item.label }) }, item.anchor)) })
      ] }, section.title)) }) }),
      /* @__PURE__ */ jsx("main", { className: "flex-1 px-10 py-10", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-3xl", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary", children: [
          /* @__PURE__ */ jsx(ChevronLeft, { className: "h-3.5 w-3.5", "aria-hidden": true }),
          " 架构概览"
        ] }),
        /* @__PURE__ */ jsx("h1", { className: "mt-4 text-5xl font-bold tracking-tight", children: "Paper Watcher 三层技术架构" }),
        /* @__PURE__ */ jsx("p", { className: "mt-6 text-base leading-relaxed text-muted-foreground", children: "Hermes 作为底层任务执行与指令中心，Paper Watcher Backend 作为论文数据库与 Abstract RAG 服务，Frontend 作为面向用户的科研论文工作台展示层。" }),
        /* @__PURE__ */ jsx(Section, { id: "overview", number: "01", title: "项目定位" }),
        /* @__PURE__ */ jsx("p", { className: "mt-4 text-sm leading-relaxed text-muted-foreground", children: "Paper Watcher 是一个面向科研论文管理的轻量级工作台。第一版聚焦于：论文信息收集、论文数据库展示、Abstract 知识库、RAG 问答、前端工作台展示、Hermes 指令入口。" }),
        /* @__PURE__ */ jsxs(Callout, { children: [
          /* @__PURE__ */ jsx("strong", { children: "核心原则：" }),
          "Hermes 负责执行任务，后端负责存储和 RAG，前端负责展示和交互。"
        ] }),
        /* @__PURE__ */ jsx(Section, { id: "layers", number: "02", title: "三层架构总览" }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 grid gap-4 sm:grid-cols-3", children: [
          /* @__PURE__ */ jsx(LayerCard, { icon: /* @__PURE__ */ jsx(Bot, { className: "h-5 w-5 text-primary" }), tag: "第一层", title: "Hermes", desc: "后端的后端。负责任务执行、指令兜底、自动化流程。" }),
          /* @__PURE__ */ jsx(LayerCard, { icon: /* @__PURE__ */ jsx(Server, { className: "h-5 w-5 text-[oklch(0.78_0.16_30)]" }), tag: "第二层", title: "Backend", desc: "论文数据库、Abstract RAG、接口服务与仪表盘数据。" }),
          /* @__PURE__ */ jsx(LayerCard, { icon: /* @__PURE__ */ jsx(Monitor, { className: "h-5 w-5 text-[oklch(0.74_0.18_155)]" }), tag: "第三层", title: "Frontend", desc: "落地页、指令中心、论文表、阅读页、分析页、工作台展示。" })
        ] }),
        /* @__PURE__ */ jsx(CodeBlock, { lang: "flow", lines: [{
          c: "muted",
          t: "# 调用链路"
        }, {
          c: "code",
          t: "用户 → Frontend → Backend → Database / Abstract RAG"
        }, {
          c: "spacer"
        }, {
          c: "code",
          t: "Hermes → Backend API → 写论文 / 触发 RAG / 获取问答"
        }] }),
        /* @__PURE__ */ jsx(Section, { id: "hermes", number: "03", title: "Hermes — 任务执行层" }),
        /* @__PURE__ */ jsx("p", { className: "mt-4 text-sm leading-relaxed text-muted-foreground", children: "Hermes 是系统的底层任务执行者，也可以理解为“后端的后端”。它不承担页面展示与数据库管理 UI。" }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 grid gap-4 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsx(BulletCard, { title: "负责", tone: "primary", items: ["接收自然语言指令", "执行自动化任务 / 定时抓取", "调用后端 API 写入论文", "触发 Abstract RAG 索引", "调用问答接口获取回答", "作为系统兜底 Agent"] }),
          /* @__PURE__ */ jsx(BulletCard, { title: "不负责", tone: "muted", items: ["前端页面与路由", "论文表 / 数据库管理 UI", "向量库内部管理", "用户界面交互细节"] })
        ] }),
        /* @__PURE__ */ jsx(CodeBlock, { lang: "hermes → backend", lines: [{
          c: "muted",
          t: "# 抓到一篇论文"
        }, {
          c: "code",
          t: "POST /api/paper/papers"
        }, {
          c: "spacer"
        }, {
          c: "muted",
          t: "# 一批论文抓完"
        }, {
          c: "code",
          t: "POST /api/paper/rag/index"
        }, {
          c: "spacer"
        }, {
          c: "muted",
          t: "# 用户提问"
        }, {
          c: "code",
          t: "POST /api/paper/ask"
        }] }),
        /* @__PURE__ */ jsx(Section, { id: "backend", number: "04", title: "Backend — 数据与 RAG 层" }),
        /* @__PURE__ */ jsx("p", { className: "mt-4 text-sm leading-relaxed text-muted-foreground", children: "Paper Watcher Backend 是数据层与服务层。核心任务是管理论文数据库，并基于论文 abstract 提供轻量 RAG 能力。" }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 grid gap-4 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsx(BulletCard, { title: "负责", tone: "primary", items: ["论文数据入库 / 查询", "Dashboard 统计数据", "Abstract 向量化", "Abstract RAG 检索", "RAG 问答接口", "事件与问答日志"] }),
          /* @__PURE__ */ jsx(BulletCard, { title: "不负责", tone: "muted", items: ["自动抓取 ArXiv", "PDF 全文 / 图表 / 公式解析", "复杂多 Agent 编排", "复现代码生成", "前端页面样式"] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-6 text-sm leading-relaxed text-muted-foreground", children: "第一版技术选型建议：" }),
        /* @__PURE__ */ jsx(CodeBlock, { lang: "stack", lines: [{
          c: "code",
          t: "FastAPI               · 接口服务"
        }, {
          c: "code",
          t: "SQLite                · 论文数据库"
        }, {
          c: "code",
          t: "Chroma                · Abstract 向量库"
        }, {
          c: "code",
          t: "SentenceTransformer   · 本地 embedding"
        }, {
          c: "code",
          t: "OpenAI-compatible API · 问答生成"
        }] }),
        /* @__PURE__ */ jsx(Section, { id: "frontend", number: "05", title: "Frontend — 展示与交互层" }),
        /* @__PURE__ */ jsx("p", { className: "mt-4 text-sm leading-relaxed text-muted-foreground", children: "Frontend 不直接处理论文，也不直接操作数据库。它把 Hermes、数据库、RAG 与论文信息用页面展示出来。" }),
        /* @__PURE__ */ jsx(CodeBlock, { lang: "sitemap", lines: [{
          c: "code",
          t: "落地页"
        }, {
          c: "code",
          t: "└─ 工作台"
        }, {
          c: "code",
          t: "   ├─ Hermes 指令中心"
        }, {
          c: "code",
          t: "   ├─ 论文表"
        }, {
          c: "code",
          t: "   │  ├─ 论文阅读页"
        }, {
          c: "code",
          t: "   │  └─ 论文分析页"
        }, {
          c: "code",
          t: "   └─ 工作台面板"
        }, {
          c: "code",
          t: "      ├─ RAG 对话"
        }, {
          c: "code",
          t: "      ├─ 设备管理"
        }, {
          c: "code",
          t: "      └─ 论文处理列表"
        }] }),
        /* @__PURE__ */ jsx(Section, { id: "dataflow", number: "06", title: "核心数据流" }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 space-y-4", children: [
          /* @__PURE__ */ jsx(FlowCard, { icon: /* @__PURE__ */ jsx(Workflow, { className: "h-5 w-5 text-primary" }), title: "论文入库", steps: ["Hermes 获取论文信息", "调用 Backend API", "Backend 写入 papers 表", "论文出现在前端论文表"] }),
          /* @__PURE__ */ jsx(FlowCard, { icon: /* @__PURE__ */ jsx(Layers, { className: "h-5 w-5 text-primary" }), title: "Abstract RAG", steps: ["论文已入库", "Backend 读取 abstract 并生成 embedding", "写入 Chroma 向量库", "rag_status 变为 indexed"] }),
          /* @__PURE__ */ jsx(FlowCard, { icon: /* @__PURE__ */ jsx(MessageSquareText, { className: "h-5 w-5 text-primary" }), title: "问答", steps: ["用户在前端或 Hermes 中提问", "调用 /api/paper/ask", "Backend 检索相关 abstract", "LLM 生成回答并附引用"] })
        ] }),
        /* @__PURE__ */ jsx(Section, { id: "api", number: "07", title: "后端接口一览" }),
        /* @__PURE__ */ jsx(CodeBlock, { lang: "http", lines: [{
          c: "code",
          t: "GET  /api/paper/health"
        }, {
          c: "code",
          t: "GET  /api/paper/dashboard"
        }, {
          c: "spacer"
        }, {
          c: "code",
          t: "POST /api/paper/papers"
        }, {
          c: "code",
          t: "POST /api/paper/papers/batch"
        }, {
          c: "code",
          t: "GET  /api/paper/papers"
        }, {
          c: "code",
          t: "GET  /api/paper/papers/{paper_id}"
        }, {
          c: "spacer"
        }, {
          c: "code",
          t: "POST /api/paper/rag/index"
        }, {
          c: "code",
          t: "POST /api/paper/rag/reindex/{paper_id}"
        }, {
          c: "spacer"
        }, {
          c: "code",
          t: "POST /api/paper/ask"
        }, {
          c: "spacer"
        }, {
          c: "code",
          t: "GET  /api/paper/events"
        }, {
          c: "code",
          t: "GET  /api/paper/qa-logs"
        }] }),
        /* @__PURE__ */ jsx(Section, { id: "schema", number: "08", title: "数据库核心表" }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 grid gap-4 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsx(TableCard, { icon: /* @__PURE__ */ jsx(Database, { className: "h-5 w-5 text-primary" }), name: "papers", desc: "论文基础信息。", fields: ["id, arxiv_id, title, authors", "abstract, pdf_url, source_url", "published_at, source", "rag_status, summary_status", "created_at, updated_at"] }),
          /* @__PURE__ */ jsx(TableCard, { icon: /* @__PURE__ */ jsx(Boxes, { className: "h-5 w-5 text-primary" }), name: "rag_chunks", desc: "进入 RAG 的内容；第一版只存 abstract。", fields: ["id, paper_id", "chunk_type, chunk_text", "chroma_id", "created_at"] }),
          /* @__PURE__ */ jsx(TableCard, { icon: /* @__PURE__ */ jsx(MessageSquareText, { className: "h-5 w-5 text-primary" }), name: "qa_logs", desc: "记录问答历史。", fields: ["id, question, answer", "source_paper_ids", "asked_by", "created_at"] }),
          /* @__PURE__ */ jsx(TableCard, { icon: /* @__PURE__ */ jsx(Activity, { className: "h-5 w-5 text-primary" }), name: "system_events", desc: "记录系统事件。", fields: ["id, event_type", "message, payload_json", "created_at"] })
        ] }),
        /* @__PURE__ */ jsx(Section, { id: "scope", number: "09", title: "第一版实现范围" }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 grid gap-4 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsx(BulletCard, { title: "第一版要做", tone: "primary", items: ["落地页 / 指令中心", "论文表 / 阅读页 / 分析页", "工作台 + RAG 对话", "论文入库 / 查询 API", "Abstract RAG 索引与问答"] }),
          /* @__PURE__ */ jsx(BulletCard, { title: "第一版不做", tone: "muted", items: ["PDF 全文 / 图表 / 公式解析", "知识图谱 / 自动复现", "真实设备控制", "多用户权限", "复杂任务队列"] })
        ] }),
        /* @__PURE__ */ jsx(Section, { id: "responsibility", number: "10", title: "职责边界速查" }),
        /* @__PURE__ */ jsxs("div", { className: "mt-6 overflow-hidden rounded-2xl border border-border", children: [
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[100px_1fr_1fr] gap-4 border-b border-border bg-card/60 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground", role: "row", children: [
            /* @__PURE__ */ jsx("div", { children: "层级" }),
            /* @__PURE__ */ jsx("div", { children: "负责" }),
            /* @__PURE__ */ jsx("div", { children: "不负责" })
          ] }),
          [{
            layer: "Hermes",
            owns: "自动化、任务执行、指令兜底",
            skips: "页面展示、数据库 UI"
          }, {
            layer: "Backend",
            owns: "数据库、Abstract RAG、API",
            skips: "定时抓取、前端样式、PDF 解析"
          }, {
            layer: "Frontend",
            owns: "页面展示、用户交互",
            skips: "数据处理、RAG 内部逻辑、任务执行"
          }].map((row) => /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[100px_1fr_1fr] items-start gap-4 border-b border-border bg-card px-5 py-3 text-sm last:border-0", children: [
            /* @__PURE__ */ jsx("div", { className: "font-semibold", children: row.layer }),
            /* @__PURE__ */ jsx("div", { className: "text-foreground/85", children: row.owns }),
            /* @__PURE__ */ jsx("div", { className: "text-muted-foreground", children: row.skips })
          ] }, row.layer))
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-12 flex items-center justify-between border-t border-border pt-6 text-sm", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground", children: "上一篇" }),
            /* @__PURE__ */ jsx("div", { className: "mt-1 text-muted-foreground", children: "无" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "text-right", children: [
            /* @__PURE__ */ jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground", children: "下一篇" }),
            /* @__PURE__ */ jsx("div", { className: "mt-1 font-medium", children: "后端接口详细说明" })
          ] })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs("aside", { className: "hidden w-64 shrink-0 px-6 py-10 xl:block", "aria-label": "On this page", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", children: "本页导航" }),
          /* @__PURE__ */ jsx("ul", { className: "space-y-2 text-sm", children: onThisPage.map((s, i) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("a", { href: `#${s.anchor}`, className: cn("block transition-colors", i === 0 ? "text-primary" : "text-muted-foreground hover:text-foreground"), children: s.label }) }, s.anchor)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-8", children: [
          /* @__PURE__ */ jsx("div", { className: "mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", children: "相关资源" }),
          /* @__PURE__ */ jsxs("ul", { className: "space-y-2 text-sm", children: [
            /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs("a", { href: "#api", className: "flex items-center justify-between text-muted-foreground hover:text-foreground", children: [
              "后端接口速查 ",
              /* @__PURE__ */ jsx(ArrowRight, { className: "h-3.5 w-3.5", "aria-hidden": true })
            ] }) }),
            /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs("a", { href: "#schema", className: "flex items-center justify-between text-muted-foreground hover:text-foreground", children: [
              "数据库核心表 ",
              /* @__PURE__ */ jsx(ArrowRight, { className: "h-3.5 w-3.5", "aria-hidden": true })
            ] }) }),
            /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs("a", { href: "https://github.com/", target: "_blank", rel: "noopener noreferrer", className: "flex items-center justify-between text-muted-foreground hover:text-foreground", children: [
              "设计文档原文 ",
              /* @__PURE__ */ jsx(ExternalLink, { className: "h-3.5 w-3.5", "aria-hidden": true })
            ] }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-8 rounded-2xl border border-border bg-card p-5", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(ListChecks, { className: "h-4 w-4 text-primary", "aria-hidden": true }),
            /* @__PURE__ */ jsx("div", { className: "text-sm font-medium", children: "MVP 成功标准" })
          ] }),
          /* @__PURE__ */ jsxs("ul", { className: "mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground", children: [
            /* @__PURE__ */ jsx("li", { children: "• 能进入落地页" }),
            /* @__PURE__ */ jsx("li", { children: "• 能打开 Hermes 指令中心" }),
            /* @__PURE__ */ jsx("li", { children: "• 论文表 / 详情 / 分析可用" }),
            /* @__PURE__ */ jsx("li", { children: "• RAG 问答可返回引用" }),
            /* @__PURE__ */ jsx("li", { children: "• 后端可入库并建立向量" })
          ] })
        ] })
      ] })
    ] })
  ] });
}
function Section({
  id,
  number,
  title
}) {
  return /* @__PURE__ */ jsxs("div", { id, className: "mt-14 flex items-center gap-4 scroll-mt-24", children: [
    /* @__PURE__ */ jsx("span", { className: "rounded-md bg-primary/15 px-2.5 py-1 text-sm font-semibold text-primary", children: number }),
    /* @__PURE__ */ jsx("h2", { className: "text-2xl font-bold tracking-tight", children: title })
  ] });
}
function Callout({
  children
}) {
  return /* @__PURE__ */ jsx("div", { className: "mt-6 rounded-xl border-l-4 border-primary/70 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground/85", children });
}
function LayerCard({
  icon,
  tag,
  title,
  desc
}) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      icon,
      /* @__PURE__ */ jsx("span", { className: "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", children: tag })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-3 text-lg font-semibold", children: title }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs leading-relaxed text-muted-foreground", children: desc })
  ] });
}
function BulletCard({
  title,
  tone,
  items
}) {
  return /* @__PURE__ */ jsxs("div", { className: cn("rounded-2xl border p-5", tone === "primary" ? "border-primary/30 bg-primary/5" : "border-border bg-card"), children: [
    /* @__PURE__ */ jsx("div", { className: cn("text-xs font-semibold uppercase tracking-wider", tone === "primary" ? "text-primary" : "text-muted-foreground"), children: title }),
    /* @__PURE__ */ jsx("ul", { className: "mt-3 space-y-1.5 text-sm leading-6 text-foreground/85", children: items.map((item) => /* @__PURE__ */ jsxs("li", { children: [
      "• ",
      item
    ] }, item)) })
  ] });
}
function FlowCard({
  icon,
  title,
  steps
}) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      icon,
      /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold", children: title })
    ] }),
    /* @__PURE__ */ jsx("ol", { className: "mt-3 space-y-2 text-sm text-foreground/85", children: steps.map((step, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx("span", { className: "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary", children: i + 1 }),
      /* @__PURE__ */ jsx("span", { children: step })
    ] }, step)) })
  ] });
}
function TableCard({
  icon,
  name,
  desc,
  fields
}) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      icon,
      /* @__PURE__ */ jsx("code", { className: "rounded bg-secondary px-2 py-0.5 font-mono text-sm font-semibold", children: name })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs leading-relaxed text-muted-foreground", children: desc }),
    /* @__PURE__ */ jsx("ul", { className: "mt-3 space-y-1 font-mono text-[11px] leading-5 text-muted-foreground", children: fields.map((f) => /* @__PURE__ */ jsxs("li", { children: [
      "· ",
      f
    ] }, f)) })
  ] });
}
function CodeBlock({
  lang,
  lines
}) {
  return /* @__PURE__ */ jsxs("div", { className: "mt-6 overflow-hidden rounded-xl border border-border bg-secondary/40", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between border-b border-border px-4 py-2 text-xs", children: /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: lang }) }),
    /* @__PURE__ */ jsx("pre", { className: "overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-6", children: lines.map((l, i) => {
      if (l.c === "spacer") return /* @__PURE__ */ jsx("div", { children: " " }, i);
      return /* @__PURE__ */ jsx("div", { className: l.c === "muted" ? "text-muted-foreground" : "text-foreground/90", children: l.t }, i);
    }) })
  ] });
}
export {
  DocsPage as component
};
