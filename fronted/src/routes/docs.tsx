import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Bot,
  Boxes,
  ChevronLeft,
  Database,
  ExternalLink,
  Layers,
  ListChecks,
  MessageSquareText,
  Monitor,
  Server,
  Workflow,
} from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "技术架构 — Hermes AI" },
      {
        name: "description",
        content: "Paper Watcher 三层技术架构说明：Hermes 任务执行、后端数据与 RAG、前端工作台。",
      },
    ],
  }),
  component: DocsPage,
});

// ---------------------------------------------------------------------------
// Sidebar navigation on the docs shell. Anchors go into the main article.
// ---------------------------------------------------------------------------

type DocsNavItem = { label: string; anchor: string };
type DocsNavSection = { title: string; items: DocsNavItem[] };

const navSections: DocsNavSection[] = [
  {
    title: "概览",
    items: [
      { label: "项目定位", anchor: "overview" },
      { label: "三层架构总览", anchor: "layers" },
    ],
  },
  {
    title: "分层职责",
    items: [
      { label: "Hermes — 任务层", anchor: "hermes" },
      { label: "Backend — 数据与 RAG 层", anchor: "backend" },
      { label: "Frontend — 展示层", anchor: "frontend" },
    ],
  },
  {
    title: "工作方式",
    items: [
      { label: "核心数据流", anchor: "dataflow" },
      { label: "后端接口", anchor: "api" },
      { label: "数据库核心表", anchor: "schema" },
    ],
  },
  {
    title: "交付范围",
    items: [
      { label: "MVP 范围", anchor: "scope" },
      { label: "职责边界速查", anchor: "responsibility" },
    ],
  },
];

const onThisPage = [
  { label: "项目定位", anchor: "overview" },
  { label: "三层架构总览", anchor: "layers" },
  { label: "Hermes 层", anchor: "hermes" },
  { label: "Backend 层", anchor: "backend" },
  { label: "Frontend 层", anchor: "frontend" },
  { label: "核心数据流", anchor: "dataflow" },
  { label: "后端接口", anchor: "api" },
  { label: "数据库核心表", anchor: "schema" },
  { label: "MVP 范围", anchor: "scope" },
];

function DocsPage() {
  return (
    <Shell active="None">
      {/* Docs-scoped breadcrumb bar */}
      <div className="flex items-center justify-between border-b border-border px-8 py-3 text-sm">
        <nav className="flex items-center gap-2" aria-label="Breadcrumb">
          <span className="text-muted-foreground">Docs</span>
          <span className="text-muted-foreground" aria-hidden>
            /
          </span>
          <span className="font-medium text-foreground">技术架构说明</span>
        </nav>
      </div>

      <div className="flex flex-1">
        {/* Left nav */}
        <aside
          className="hidden w-64 shrink-0 border-r border-border px-6 py-8 lg:block"
          aria-label="Docs navigation"
        >
          <div className="space-y-7">
            {navSections.map((section) => (
              <div key={section.title}>
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </div>
                <ul className="space-y-1.5">
                  {section.items.map((item) => (
                    <li key={item.anchor}>
                      <a
                        href={`#${item.anchor}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 px-10 py-10">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 架构概览
            </div>
            <h1 className="mt-4 text-5xl font-bold tracking-tight">Paper Watcher 三层技术架构</h1>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Hermes 作为底层任务执行与指令中心，Paper Watcher Backend 作为论文数据库与 Abstract RAG
              服务，Frontend 作为面向用户的科研论文工作台展示层。
            </p>

            {/* 01 Overview */}
            <Section id="overview" number="01" title="项目定位" />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Paper Watcher
              是一个面向科研论文管理的轻量级工作台。第一版聚焦于：论文信息收集、论文数据库展示、Abstract
              知识库、RAG 问答、前端工作台展示、Hermes 指令入口。
            </p>
            <Callout>
              <strong>核心原则：</strong>Hermes 负责执行任务，后端负责存储和
              RAG，前端负责展示和交互。
            </Callout>

            {/* 02 Layers overview */}
            <Section id="layers" number="02" title="三层架构总览" />
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <LayerCard
                icon={<Bot className="h-5 w-5 text-primary" />}
                tag="第一层"
                title="Hermes"
                desc="后端的后端。负责任务执行、指令兜底、自动化流程。"
              />
              <LayerCard
                icon={<Server className="h-5 w-5 text-[oklch(0.78_0.16_30)]" />}
                tag="第二层"
                title="Backend"
                desc="论文数据库、Abstract RAG、接口服务与仪表盘数据。"
              />
              <LayerCard
                icon={<Monitor className="h-5 w-5 text-[oklch(0.74_0.18_155)]" />}
                tag="第三层"
                title="Frontend"
                desc="落地页、指令中心、论文表、阅读页、分析页、工作台展示。"
              />
            </div>
            <CodeBlock
              lang="flow"
              lines={[
                { c: "muted", t: "# 调用链路" },
                { c: "code", t: "用户 → Frontend → Backend → Database / Abstract RAG" },
                { c: "spacer" },
                { c: "code", t: "Hermes → Backend API → 写论文 / 触发 RAG / 获取问答" },
              ]}
            />

            {/* 03 Hermes */}
            <Section id="hermes" number="03" title="Hermes — 任务执行层" />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Hermes 是系统的底层任务执行者，也可以理解为“后端的后端”。它不承担页面展示与数据库管理
              UI。
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <BulletCard
                title="负责"
                tone="primary"
                items={[
                  "接收自然语言指令",
                  "执行自动化任务 / 定时抓取",
                  "调用后端 API 写入论文",
                  "触发 Abstract RAG 索引",
                  "调用问答接口获取回答",
                  "作为系统兜底 Agent",
                ]}
              />
              <BulletCard
                title="不负责"
                tone="muted"
                items={[
                  "前端页面与路由",
                  "论文表 / 数据库管理 UI",
                  "向量库内部管理",
                  "用户界面交互细节",
                ]}
              />
            </div>
            <CodeBlock
              lang="hermes → backend"
              lines={[
                { c: "muted", t: "# 抓到一篇论文" },
                { c: "code", t: "POST /api/paper/papers" },
                { c: "spacer" },
                { c: "muted", t: "# 一批论文抓完" },
                { c: "code", t: "POST /api/paper/rag/index" },
                { c: "spacer" },
                { c: "muted", t: "# 用户提问" },
                { c: "code", t: "POST /api/paper/ask" },
              ]}
            />

            {/* 04 Backend */}
            <Section id="backend" number="04" title="Backend — 数据与 RAG 层" />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Paper Watcher Backend 是数据层与服务层。核心任务是管理论文数据库，并基于论文 abstract
              提供轻量 RAG 能力。
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <BulletCard
                title="负责"
                tone="primary"
                items={[
                  "论文数据入库 / 查询",
                  "Dashboard 统计数据",
                  "Abstract 向量化",
                  "Abstract RAG 检索",
                  "RAG 问答接口",
                  "事件与问答日志",
                ]}
              />
              <BulletCard
                title="不负责"
                tone="muted"
                items={[
                  "自动抓取 ArXiv",
                  "PDF 全文 / 图表 / 公式解析",
                  "复杂多 Agent 编排",
                  "复现代码生成",
                  "前端页面样式",
                ]}
              />
            </div>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              第一版技术选型建议：
            </p>
            <CodeBlock
              lang="stack"
              lines={[
                { c: "code", t: "FastAPI               · 接口服务" },
                { c: "code", t: "SQLite                · 论文数据库" },
                { c: "code", t: "Chroma                · Abstract 向量库" },
                { c: "code", t: "SentenceTransformer   · 本地 embedding" },
                { c: "code", t: "OpenAI-compatible API · 问答生成" },
              ]}
            />

            {/* 05 Frontend */}
            <Section id="frontend" number="05" title="Frontend — 展示与交互层" />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Frontend 不直接处理论文，也不直接操作数据库。它把 Hermes、数据库、RAG
              与论文信息用页面展示出来。
            </p>
            <CodeBlock
              lang="sitemap"
              lines={[
                { c: "code", t: "落地页" },
                { c: "code", t: "└─ 工作台" },
                { c: "code", t: "   ├─ Hermes 指令中心" },
                { c: "code", t: "   ├─ 论文表" },
                { c: "code", t: "   │  ├─ 论文阅读页" },
                { c: "code", t: "   │  └─ 论文分析页" },
                { c: "code", t: "   └─ 工作台面板" },
                { c: "code", t: "      ├─ RAG 对话" },
                { c: "code", t: "      ├─ 设备管理" },
                { c: "code", t: "      └─ 论文处理列表" },
              ]}
            />

            {/* 06 Data flow */}
            <Section id="dataflow" number="06" title="核心数据流" />
            <div className="mt-6 space-y-4">
              <FlowCard
                icon={<Workflow className="h-5 w-5 text-primary" />}
                title="论文入库"
                steps={[
                  "Hermes 获取论文信息",
                  "调用 Backend API",
                  "Backend 写入 papers 表",
                  "论文出现在前端论文表",
                ]}
              />
              <FlowCard
                icon={<Layers className="h-5 w-5 text-primary" />}
                title="Abstract RAG"
                steps={[
                  "论文已入库",
                  "Backend 读取 abstract 并生成 embedding",
                  "写入 Chroma 向量库",
                  "rag_status 变为 indexed",
                ]}
              />
              <FlowCard
                icon={<MessageSquareText className="h-5 w-5 text-primary" />}
                title="问答"
                steps={[
                  "用户在前端或 Hermes 中提问",
                  "调用 /api/paper/ask",
                  "Backend 检索相关 abstract",
                  "LLM 生成回答并附引用",
                ]}
              />
            </div>

            {/* 07 APIs */}
            <Section id="api" number="07" title="后端接口一览" />
            <CodeBlock
              lang="http"
              lines={[
                { c: "code", t: "GET  /api/paper/health" },
                { c: "code", t: "GET  /api/paper/dashboard" },
                { c: "spacer" },
                { c: "code", t: "POST /api/paper/papers" },
                { c: "code", t: "POST /api/paper/papers/batch" },
                { c: "code", t: "GET  /api/paper/papers" },
                { c: "code", t: "GET  /api/paper/papers/{paper_id}" },
                { c: "spacer" },
                { c: "code", t: "POST /api/paper/rag/index" },
                { c: "code", t: "POST /api/paper/rag/reindex/{paper_id}" },
                { c: "spacer" },
                { c: "code", t: "POST /api/paper/ask" },
                { c: "spacer" },
                { c: "code", t: "GET  /api/paper/events" },
                { c: "code", t: "GET  /api/paper/qa-logs" },
              ]}
            />

            {/* 08 Schema */}
            <Section id="schema" number="08" title="数据库核心表" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <TableCard
                icon={<Database className="h-5 w-5 text-primary" />}
                name="papers"
                desc="论文基础信息。"
                fields={[
                  "id, arxiv_id, title, authors",
                  "abstract, pdf_url, source_url",
                  "published_at, source",
                  "rag_status, summary_status",
                  "created_at, updated_at",
                ]}
              />
              <TableCard
                icon={<Boxes className="h-5 w-5 text-primary" />}
                name="rag_chunks"
                desc="进入 RAG 的内容；第一版只存 abstract。"
                fields={["id, paper_id", "chunk_type, chunk_text", "chroma_id", "created_at"]}
              />
              <TableCard
                icon={<MessageSquareText className="h-5 w-5 text-primary" />}
                name="qa_logs"
                desc="记录问答历史。"
                fields={["id, question, answer", "source_paper_ids", "asked_by", "created_at"]}
              />
              <TableCard
                icon={<Activity className="h-5 w-5 text-primary" />}
                name="system_events"
                desc="记录系统事件。"
                fields={["id, event_type", "message, payload_json", "created_at"]}
              />
            </div>

            {/* 09 Scope */}
            <Section id="scope" number="09" title="第一版实现范围" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <BulletCard
                title="第一版要做"
                tone="primary"
                items={[
                  "落地页 / 指令中心",
                  "论文表 / 阅读页 / 分析页",
                  "工作台 + RAG 对话",
                  "论文入库 / 查询 API",
                  "Abstract RAG 索引与问答",
                ]}
              />
              <BulletCard
                title="第一版不做"
                tone="muted"
                items={[
                  "PDF 全文 / 图表 / 公式解析",
                  "知识图谱 / 自动复现",
                  "真实设备控制",
                  "多用户权限",
                  "复杂任务队列",
                ]}
              />
            </div>

            {/* 10 Responsibility cheatsheet */}
            <Section id="responsibility" number="10" title="职责边界速查" />
            <div className="mt-6 overflow-hidden rounded-2xl border border-border">
              <div
                className="grid grid-cols-[100px_1fr_1fr] gap-4 border-b border-border bg-card/60 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                role="row"
              >
                <div>层级</div>
                <div>负责</div>
                <div>不负责</div>
              </div>
              {[
                {
                  layer: "Hermes",
                  owns: "自动化、任务执行、指令兜底",
                  skips: "页面展示、数据库 UI",
                },
                {
                  layer: "Backend",
                  owns: "数据库、Abstract RAG、API",
                  skips: "定时抓取、前端样式、PDF 解析",
                },
                {
                  layer: "Frontend",
                  owns: "页面展示、用户交互",
                  skips: "数据处理、RAG 内部逻辑、任务执行",
                },
              ].map((row) => (
                <div
                  key={row.layer}
                  className="grid grid-cols-[100px_1fr_1fr] items-start gap-4 border-b border-border bg-card px-5 py-3 text-sm last:border-0"
                >
                  <div className="font-semibold">{row.layer}</div>
                  <div className="text-foreground/85">{row.owns}</div>
                  <div className="text-muted-foreground">{row.skips}</div>
                </div>
              ))}
            </div>

            {/* Prev / next */}
            <div className="mt-12 flex items-center justify-between border-t border-border pt-6 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  上一篇
                </div>
                <div className="mt-1 text-muted-foreground">无</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  下一篇
                </div>
                <div className="mt-1 font-medium">后端接口详细说明</div>
              </div>
            </div>
          </div>
        </main>

        {/* Right rail */}
        <aside className="hidden w-64 shrink-0 px-6 py-10 xl:block" aria-label="On this page">
          <div>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              本页导航
            </div>
            <ul className="space-y-2 text-sm">
              {onThisPage.map((s, i) => (
                <li key={s.anchor}>
                  <a
                    href={`#${s.anchor}`}
                    className={cn(
                      "block transition-colors",
                      i === 0 ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              相关资源
            </div>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="#api"
                  className="flex items-center justify-between text-muted-foreground hover:text-foreground"
                >
                  后端接口速查 <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              </li>
              <li>
                <a
                  href="#schema"
                  className="flex items-center justify-between text-muted-foreground hover:text-foreground"
                >
                  数据库核心表 <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between text-muted-foreground hover:text-foreground"
                >
                  设计文档原文 <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </li>
            </ul>
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" aria-hidden />
              <div className="text-sm font-medium">MVP 成功标准</div>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground">
              <li>• 能进入落地页</li>
              <li>• 能打开 Hermes 指令中心</li>
              <li>• 论文表 / 详情 / 分析可用</li>
              <li>• RAG 问答可返回引用</li>
              <li>• 后端可入库并建立向量</li>
            </ul>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

function Section({ id, number, title }: { id: string; number: string; title: string }) {
  return (
    <div id={id} className="mt-14 flex items-center gap-4 scroll-mt-24">
      <span className="rounded-md bg-primary/15 px-2.5 py-1 text-sm font-semibold text-primary">
        {number}
      </span>
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border-l-4 border-primary/70 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground/85">
      {children}
    </div>
  );
}

function LayerCard({
  icon,
  tag,
  title,
  desc,
}: {
  icon: React.ReactNode;
  tag: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {tag}
        </span>
      </div>
      <div className="mt-3 text-lg font-semibold">{title}</div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function BulletCard({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "primary" | "muted";
  items: string[];
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        tone === "primary" ? "border-primary/30 bg-primary/5" : "border-border bg-card",
      )}
    >
      <div
        className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          tone === "primary" ? "text-primary" : "text-muted-foreground",
        )}
      >
        {title}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm leading-6 text-foreground/85">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

function FlowCard({
  icon,
  title,
  steps,
}: {
  icon: React.ReactNode;
  title: string;
  steps: string[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <ol className="mt-3 space-y-2 text-sm text-foreground/85">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TableCard({
  icon,
  name,
  desc,
  fields,
}: {
  icon: React.ReactNode;
  name: string;
  desc: string;
  fields: string[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        {icon}
        <code className="rounded bg-secondary px-2 py-0.5 font-mono text-sm font-semibold">
          {name}
        </code>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      <ul className="mt-3 space-y-1 font-mono text-[11px] leading-5 text-muted-foreground">
        {fields.map((f) => (
          <li key={f}>· {f}</li>
        ))}
      </ul>
    </div>
  );
}

type CodeLine = { c: "muted" | "code"; t: React.ReactNode } | { c: "spacer"; t?: undefined };

function CodeBlock({ lang, lines }: { lang: string; lines: CodeLine[] }) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-secondary/40">
      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs">
        <span className="text-muted-foreground">{lang}</span>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-6">
        {lines.map((l, i) => {
          if (l.c === "spacer") return <div key={i}>&nbsp;</div>;
          return (
            <div
              key={i}
              className={l.c === "muted" ? "text-muted-foreground" : "text-foreground/90"}
            >
              {l.t}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
