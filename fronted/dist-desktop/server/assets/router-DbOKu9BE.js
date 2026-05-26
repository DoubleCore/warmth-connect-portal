import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, useRouter, Link, Outlet, HeadContent, Scripts, createFileRoute, lazyRouteComponent, notFound, createRouter } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { z } from "zod";
import "clsx";
const appCss = "/assets/styles-Dddv5eqL.css";
const STORAGE_KEY$1 = "hermes:theme";
const DEFAULT_THEME = "dark";
const ThemeContext = createContext(void 0);
function readStoredTheme() {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY$1);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
  }
  return DEFAULT_THEME;
}
function applyThemeClass(theme) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (theme === "dark") el.classList.add("dark");
  else el.classList.remove("dark");
}
function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(DEFAULT_THEME);
  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyThemeClass(stored);
  }, []);
  const setTheme = useCallback((next) => {
    setThemeState(next);
    applyThemeClass(next);
    try {
      window.localStorage.setItem(STORAGE_KEY$1, next);
    } catch {
    }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);
  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return /* @__PURE__ */ jsx(ThemeContext.Provider, { value, children });
}
function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
const locales = ["en", "zh"];
const messages = {
  en: {
    "common.appName": "Hermes AI",
    "common.systemActive": "System Active",
    "common.pdf": "PDF",
    "common.task": "TASK",
    "common.saved": "Saved",
    "common.viewAll": "View All",
    "common.none": "None",
    "common.qrPending": "QR Pending",
    "common.devicePairingReady": "Device Pairing Ready",
    "sidebar.commandCenter": "Command Center",
    "sidebar.research": "Research",
    "sidebar.analyzePdf": "Analyze PDF",
    "sidebar.paperLibrary": "Paper Library",
    "sidebar.deviceManager": "Device Manager",
    "sidebar.trainingManager": "Manager",
    "sidebar.ragSearch": "RAG Search",
    "sidebar.settings": "Settings",
    "sidebar.fastclawConfig": "FastClaw Config",
    "sidebar.newResearch": "New Research",
    "sidebar.documentation": "Documentation",
    "sidebar.support": "Support",
    "sidebar.primaryNavLabel": "Main",
    "topbar.tabCommand": "Command",
    "topbar.tabLibrary": "Library",
    "topbar.tabWorkspace": "Workspace",
    "topbar.notifications": "Notifications",
    "topbar.settings": "Settings",
    "topbar.avatar": "User avatar",
    "topbar.greeting": "Hi, {name}",
    "topbar.greetingAnonymous": "Welcome",
    "home.title": "What shall we analyze today?",
    "home.subtitle": "Enter a command, natural language query, or drop a PDF.",
    "home.inputPlaceholder": "e.g. Summarize recent advancements in transformer architectures…",
    "home.inputLabel": "Ask Hermes",
    "home.submit": "Submit query",
    "home.quickAction.searchPapers": "Search Papers",
    "home.quickAction.analyzePdf": "Analyze PDF",
    "home.quickAction.ragChat": "RAG Search",
    "home.quickAction.manageTraining": "Manage Training",
    "home.recentHeading": "Recent Activity",
    "home.recent.attention": "Attention Is All You Need",
    "home.recent.attentionMeta": "Analyzed 2 hours ago • Extraction Complete",
    "home.recent.hermesV2": "Model Training: Hermes-V2",
    "home.recent.hermesV2Meta": "Running • Epoch 42/100 • Loss: 0.24",
    "home.recent.empty": "No recent activity yet.",
    "home.recent.loadError": "Could not load recent activity: {message}",
    "home.recent.retry": "Retry",
    "home.recent.tag.paper": "Paper",
    "home.recent.paperMeta": "{authors} · {year}",
    "home.recent.recordMeta": "{status} · {progress}%",
    "home.recent.unknownAuthor": "Unknown author",
    "research.backToHome": "Back to Command Center",
    "research.title": "Research Session",
    "research.subtitle": "Live transcript of Hermes Agent working on your request.",
    "research.newSession": "New session",
    "research.newSessionHint": "Start a fresh conversation with an empty context.",
    "research.panels.currentCommand": "Current Command",
    "research.panels.liveStream": "Live Stream",
    "research.panels.execution": "Execution Context",
    "research.panels.noCommand": "No command yet",
    "research.panels.noEvents": "Waiting for Hermes events…",
    "research.panels.eventCount": "{count} events received",
    "research.panels.turns": "Turns",
    "research.panels.channel": "Channel",
    "research.empty.title": "Nothing here yet",
    "research.empty.hint": "Send a command from the Command Center home page to start a session.",
    "research.empty.cta": "Go to Command Center",
    "research.followupLabel": "Follow-up instruction",
    "research.followupPlaceholder": "Ask a follow-up…",
    "research.followupSubmit": "Send follow-up",
    "manager.loading": "Loading training runs…",
    "manager.backToDevices": "Back to devices",
    "manager.titlePrefix": "Manage Training",
    "manager.switchRun": "Switch run",
    "manager.empty.title": "No training runs yet",
    "manager.empty.hint": "Start a reproduction from the Device Manager to see a live command console here.",
    "manager.empty.cta": "Go to Device Manager",
    "manager.panels.commandInterface": "Command Interface",
    "manager.panels.history": "History",
    "manager.panels.todayAt": "Today {time}",
    "manager.chat.systemBoot": "Training run {runId} initialized across {nodes} nodes. Waiting for dataset loading…",
    "manager.chat.userAskLoss": "What is the current loss on {node}?",
    "manager.chat.fetchingMetrics": "Fetching metrics for {node}",
    "manager.chat.metric": "Metric",
    "manager.chat.value": "Value",
    "manager.chat.inputPlaceholder": "Query metrics, pause training, adjust LR…",
    "manager.chat.send": "Send",
    "manager.chat.streaming": "Streaming…",
    "manager.chat.waitingDeploy": "Waiting for deployment task to start…",
    "manager.metrics.epoch": "Epoch",
    "manager.metrics.globalLoss": "Global Loss",
    "manager.metrics.globalLossHint": "(last 100 steps)",
    "manager.metrics.gpuUtil": "GPU Util Avg",
    "manager.metrics.gpuUtilHint": "{n} nodes",
    "manager.metrics.eta": "ETA",
    "manager.metrics.lossCurve": "Loss Curve",
    "manager.logs.heading": "Live Terminal Logs",
    "command.inputPlaceholderBusy": "Hermes is working on your last command…",
    "command.reset": "New command",
    "command.waitingFirstEvent": "Waiting for Hermes…",
    "command.phase.idle": "Idle",
    "command.phase.connecting": "Connecting",
    "command.phase.streaming": "Running",
    "command.phase.awaitingConfirmation": "Awaiting confirmation",
    "command.phase.completed": "Completed",
    "command.phase.failed": "Failed",
    "command.phase.cancelled": "Cancelled",
    "command.event.agentEmpty": "(Agent returned an empty message)",
    "command.event.toolStart": "Running tool: {name}",
    "command.event.toolResult": "{name} · {summary}",
    "command.event.needConfirmationInline": "Confirmation needed: {message}",
    "command.event.needConfirmationFallback": "Please review the pending action.",
    "command.event.finalCancelled": "Operation cancelled.",
    "command.event.finalDefault": "Done.",
    "command.event.errorInline": "Error: {message}",
    "command.confirmation.title": "Confirm this action",
    "command.confirmation.fallback": "Hermes is asking for your confirmation before proceeding.",
    "command.confirmation.confirm": "Confirm",
    "command.confirmation.cancel": "Cancel",
    "command.error.title": "Something went wrong",
    "command.error.code": "Code: {code}",
    "assistant.open": "Open assistant",
    "assistant.close": "Close",
    "assistant.minimize": "Minimize",
    "assistant.title": "Hermes Assistant",
    "assistant.subtitle": "Ask anything — works on every page.",
    "assistant.openFull": "Open full view",
    "assistant.newSession": "New chat",
    "assistant.send": "Send",
    "assistant.inputPlaceholder": "Ask Hermes…",
    "assistant.inputPlaceholderBusy": "Hermes is working…",
    "assistant.contextHint": "Context: {page}",
    "repro.status.not_started": "Not started",
    "repro.status.running": "Running",
    "repro.status.success": "Success",
    "repro.status.failed": "Failed",
    "repro.status.paused": "Paused",
    "library.title": "Library",
    "library.subtitle": "Browse, filter, and analyze imported research papers.",
    "library.searchLabel": "Search library",
    "library.searchPlaceholder": "Search titles, authors, or keywords…",
    "library.filter.domain": "Domain",
    "library.filter.source": "Source",
    "library.filter.year": "Year",
    "library.filter.clearAll": "Clear all",
    "library.filter.remove": "Remove filter {label}",
    "library.table.titleAuthors": "Title & Authors",
    "library.table.domain": "Domain",
    "library.table.source": "Source",
    "library.table.year": "Year",
    "library.table.actions": "Actions",
    "library.table.open": "Open",
    "library.emptyTitle": "No papers match your filters.",
    "library.emptyHint": "Try clearing filters or broadening your search term.",
    "library.rangeLabel": "Showing {start}–{end} of {total} papers",
    "library.noMatch": "No papers match",
    "library.etAl": " et al.",
    "library.pagination.previous": "Previous page",
    "library.pagination.next": "Next page",
    "library.pagination.label": "Library pagination",
    "library.loading": "Loading papers…",
    "library.loadError": "Could not load papers: {message}",
    "library.retry": "Retry",
    "paper.download": "Download PDF",
    "paper.upload": "Upload PDF",
    "paper.uploadHint": "Click or drop a PDF here",
    "paper.repoUrl": "Code Repository",
    "paper.repoUrlOpen": "Open repository",
    "paper.uploading": "Uploading…",
    "paper.uploadSuccess": "Uploaded",
    "paper.uploadError": "Upload failed: {message}",
    "paper.uploadTooLarge": "File exceeds the {limit} limit",
    "paper.uploadNotPdf": "Please choose a PDF file",
    "paper.uploadedFile": "{name} · {size}",
    "paper.backToLibrary": "Back to Library",
    "paper.notFound": "Paper not found",
    "paper.notFoundHint": "The paper you're looking for isn't in the library.",
    "paper.analysis.heading": "Analysis",
    "paper.analysis.subheading": "Extracted structured data",
    "paper.analysis.empty": "No analysis has been attached to this paper yet.",
    "paper.analysis.startRagChat": "Start RAG Chat",
    "paper.analysis.summary": "Summary",
    "paper.analysis.taskDefinition": "Task Definition",
    "paper.analysis.researchQuestions": "Research Questions",
    "paper.analysis.methodOverview": "Method Overview",
    "paper.analysis.metrics": "Metrics",
    "paper.analysis.conclusion": "Conclusion",
    "paper.analysis.notes": "Notes",
    "paper.abstract": "Abstract",
    "paper.abstractEmpty": "No abstract available.",
    "paper.meta.source": "Source",
    "paper.meta.year": "Year",
    "paper.meta.field": "Field",
    "paper.startReproduction": "Start Reproduction",
    "paper.startReproductionDesc": 'Select a GPU device to run reproduction for "{title}".',
    "paper.selectDevice": "Select Device",
    "paper.noDevice": "No device (manual)",
    "paper.cancel": "Cancel",
    "paper.creating": "Creating…",
    "paper.startNow": "Start Now",
    "workspace.title": "Workspace Dashboard",
    "workspace.subtitle": "Manage GPU resources and monitor active training tasks.",
    "workspace.devicesHeading": "Devices",
    "workspace.recordsHeading": "Reproduction Records",
    "workspace.stat.totalDevices": "Total Devices",
    "workspace.stat.idle": "Idle",
    "workspace.stat.running": "Running",
    "workspace.stat.offline": "Offline",
    "workspace.stat.error": "Error",
    "workspace.device.name": "Name",
    "workspace.device.type": "Type",
    "workspace.device.status": "Status",
    "workspace.device.location": "Location",
    "workspace.device.description": "Description",
    "workspace.device.actions": "Actions",
    "workspace.device.addBtn": "Add device",
    "workspace.device.dialogTitle": "Add new device",
    "workspace.device.dialogDesc": "Register a compute node or other device the lab can use.",
    "workspace.device.namePlaceholder": "e.g. GPU-Server-02",
    "workspace.device.typePlaceholder": "e.g. GPU Server",
    "workspace.device.locationPlaceholder": "e.g. Lab A",
    "workspace.device.descriptionPlaceholder": "Optional notes about this device.",
    "workspace.device.save": "Save",
    "workspace.device.saving": "Saving…",
    "workspace.device.cancel": "Cancel",
    "workspace.device.required": "This field is required.",
    "workspace.device.nameMax": "Keep the name under 120 characters.",
    "workspace.device.deleteBtn": "Delete device",
    "workspace.device.deleteTitle": "Delete this device?",
    "workspace.device.deleteDesc": "Reproduction records that used this device will keep their history, but their device reference will be cleared.",
    "workspace.device.deleteConfirm": "Delete",
    "workspace.device.deleteError": "Could not delete device: {message}",
    "workspace.device.createError": "Could not create device: {message}",
    "workspace.device.requestIdHint": "Request id: {rid}",
    "workspace.status.idle": "Idle",
    "workspace.status.running": "Running",
    "workspace.status.offline": "Offline",
    "workspace.status.error": "Error",
    "workspace.status.updateError": "Could not update status: {message}",
    "workspace.record.actions": "Actions",
    "workspace.record.addBtn": "Add record",
    "workspace.record.editBtn": "Edit",
    "workspace.record.deleteBtn": "Delete",
    "workspace.record.dialogTitleCreate": "New reproduction record",
    "workspace.record.dialogTitleEdit": "Edit reproduction record",
    "workspace.record.dialogDesc": "Track a reproduction or training run for a paper.",
    "workspace.record.paperRequired": "Please select a paper.",
    "workspace.record.progressRange": "Progress must be between 0 and 100.",
    "workspace.record.urlInvalid": "Enter a valid URL.",
    "workspace.record.save": "Save",
    "workspace.record.saving": "Saving…",
    "workspace.record.cancel": "Cancel",
    "workspace.record.saveError": "Could not save: {message}",
    "workspace.record.deleteTitle": "Delete this reproduction record?",
    "workspace.record.deleteDesc": "This action cannot be undone.",
    "workspace.record.deleteConfirm": "Delete",
    "workspace.record.deleteError": "Could not delete: {message}",
    "workspace.record.requestIdHint": "Request id: {rid}",
    "workspace.record.progressLabel": "Progress (%)",
    "workspace.record.resultSummaryLabel": "Result summary",
    "workspace.record.resultSummaryPlaceholder": "Describe the outcome and key metrics…",
    "workspace.record.artifactUrlLabel": "Artifact URL",
    "workspace.record.artifactUrlPlaceholder": "https://…",
    "workspace.record.trainingNotesLabel": "Training notes",
    "workspace.record.trainingNotesPlaceholder": "Hyperparameter tweaks, data cleaning, code diffs…",
    "workspace.record.startedAtLabel": "Started at",
    "workspace.record.finishedAtLabel": "Finished at",
    "workspace.record.deviceNone": "No device",
    "combobox.placeholder": "Select…",
    "combobox.searchPlaceholder": "Search…",
    "combobox.empty": "No matches.",
    "combobox.loading": "Loading…",
    "combobox.clear": "Clear selection",
    "workspace.record.paper": "Paper",
    "workspace.record.device": "Device",
    "workspace.record.status": "Status",
    "workspace.record.progress": "Progress",
    "workspace.record.startedAt": "Started",
    "workspace.record.finishedAt": "Finished",
    "workspace.loading": "Loading…",
    "workspace.empty": "Nothing here yet.",
    "workspace.loadError": "Could not load data: {message}",
    "search.pageTitle": "Search across all papers…",
    "search.pageTitleShort": "RAG Search",
    "search.modelLabel": "Model:",
    "search.globalSearchPlaceholder": "Global search…",
    "search.pageSubtitle": "Query the global corpus using natural language. Semantic retrieval powered by Hermes-7B.",
    "search.inputLabel": "RAG search query",
    "search.inputPlaceholder": "Find common themes in LLM efficiency",
    "search.chatPlaceholder": "Ask about research papers, datasets, or metrics…",
    "search.attach": "Attach a document",
    "search.submit": "Run search",
    "search.recent": "Recent",
    "search.resultsHeading": "Synthesized Results",
    "search.resultsCount": "Top {count} sources retrieved",
    "search.viewSource": "View Source",
    "search.relevance": "Relevance: {value}",
    "search.scope.heading": "Search Scope",
    "search.scope.papersIndexed": "Papers Indexed",
    "search.scope.totalTokens": "~Tokens",
    "search.scope.activeCollections": "Active Collections",
    "search.scope.moreCollections": "+{count} more",
    "search.scope.empty": "—",
    "search.scope.noCollections": "No active collections",
    "search.empty.title": "No results yet",
    "search.empty.hint": "Run a query once the backend is connected.",
    "search.recentEmpty": "No recent searches",
    "search.emptyConversation.title": "Ask the corpus anything",
    "search.emptyConversation.hint": "Type a question below. Hermes will search the indexed papers and cite the evidence inline.",
    "search.loadingReply": "Searching the corpus…",
    "search.replyError": "Retrieval failed: {message}",
    "search.panels.currentSource": "Current Source",
    "search.panels.dataExtraction": "Data Extraction",
    "search.panels.executionContext": "Execution Context",
    "search.panels.filter": "Filter",
    "search.panels.metric": "Metric",
    "search.panels.value": "Value",
    "search.panels.unit": "Unit",
    "search.panels.relevance": "Relevance Score",
    "search.panels.pages": "{n} Pages",
    "search.panels.ragOnline": "RAG Engine Online",
    "search.panels.latency": "Latency",
    "search.panels.contextWindow": "Context Window Usage",
    "search.panels.embeddings": "Embeddings",
    "search.panels.vectorDb": "Vector DB",
    "search.panels.exportData": "Export Data",
    "search.panels.shareResult": "Share Result",
    "search.panels.noSource": "No active source yet",
    "search.llmNotConfigured.title": "LLM not configured",
    "search.llmNotConfigured.hint": "Set LLM_API_KEY in backend/.env and restart the server to enable question answering. Keyword search still works.",
    "search.usedEmbedding.yes": "Embedding rerank",
    "search.usedEmbedding.no": "FTS ranking only",
    "search.referencesHeading": "Cited papers",
    "settings.breadcrumbSettings": "Settings",
    "settings.breadcrumbCurrent": "Preferences & Connectivity",
    "settings.title": "System Settings",
    "settings.profile.heading": "Profile Information",
    "settings.profile.name": "Full Name",
    "settings.profile.email": "Email Address",
    "settings.profile.institution": "Research Institution",
    "settings.profile.save": "Save Changes",
    "settings.profile.edit": "Edit",
    "settings.profile.cancel": "Cancel",
    "settings.profile.empty": "Not set",
    "settings.profile.error.nameRequired": "Full name is required",
    "settings.profile.error.nameMax": "Keep it under 120 characters",
    "settings.profile.error.emailInvalid": "Enter a valid email address",
    "settings.profile.error.institutionRequired": "Institution is required",
    "settings.profile.error.institutionMax": "Keep it under 200 characters",
    "settings.profile.username": "Username",
    "settings.profile.usernamePlaceholder": "How should we address you?",
    "settings.profile.saving": "Saving…",
    "settings.profile.saved": "Saved",
    "settings.profile.error.usernameMax": "Keep it under 120 characters",
    "settings.profile.error.loadFailed": "Could not load profile: {message}",
    "settings.profile.error.saveFailed": "Could not save: {message}",
    "settings.profile.updatedAt": "Last updated {time}",
    "settings.prefs.heading": "Preferences",
    "settings.prefs.darkTitle": "Dark Mode",
    "settings.prefs.darkDesc": "Switch between obsidian dark and white light themes",
    "settings.prefs.localeTitle": "Chinese Interface",
    "settings.prefs.localeDesc": "Display the UI in Simplified Chinese",
    "settings.agents.heading": "AI Agents",
    "settings.agents.empty": "No agents found.",
    "settings.agents.loadFailed": "Could not load agents: {message}",
    "settings.agents.apiKeyConfigured": "API Key configured",
    "settings.agents.apiKeyMissing": "API Key not set",
    "settings.agents.edit": "Edit",
    "settings.agents.test": "Test",
    "settings.agents.testing": "Testing…",
    "settings.agents.cancel": "Cancel",
    "settings.agents.save": "Save",
    "settings.agents.saving": "Saving…",
    "settings.agents.fields.displayName": "Display name",
    "settings.agents.fields.model": "Model",
    "settings.agents.fields.modelHint": "OpenAI-compatible model id, e.g. openai/gpt-4o-mini",
    "settings.agents.fields.apiBase": "Provider base URL",
    "settings.agents.fields.apiKey": "API Key",
    "settings.agents.fields.apiKeyPlaceholder": "Leave blank to keep the current key",
    "settings.agents.fields.apiKeyClear": "Clear API Key",
    "settings.agents.fields.temperature": "Temperature",
    "settings.agents.fields.maxTokens": "Max tokens",
    "settings.agents.error.saveFailed": "Could not save: {message}",
    "settings.agents.test.success": "Provider responded in {ms} ms",
    "settings.agents.test.failed": "Test failed: {message}",
    "settings.agents.updatedAt": "Last updated {time}",
    "settings.feishu.heading": "Connect on Feishu",
    "settings.feishu.body": "Scan to join our dedicated support channel and pair your mobile device.",
    "settings.feishu.cta": "Generate pairing QR code",
    "settings.feishu.ctaRegenerate": "Regenerate",
    "settings.feishu.loading": "Asking Hermes…",
    "settings.feishu.hint": "Click the placeholder to ask Hermes for a fresh link.",
    "settings.feishu.ready": "Scan with Feishu to pair",
    "settings.feishu.error": "Couldn't reach Hermes: {message}",
    "settings.feishu.empty": "Hermes didn't return a pairable link. Try again.",
    "settings.feishu.setupHeading": "Feishu app not configured on this host",
    "settings.feishu.setupHint": "Run the interactive wizard on the Hermes host, then click Regenerate.",
    "settings.feishu.copy": "Copy link",
    "settings.feishu.copied": "Link copied",
    "settings.feishu.copyCommand": "Copy command"
  },
  zh: {
    "common.appName": "Hermes AI",
    "common.systemActive": "系统运行中",
    "common.pdf": "PDF",
    "common.task": "任务",
    "common.saved": "已保存",
    "common.viewAll": "查看全部",
    "common.none": "无",
    "common.qrPending": "二维码待激活",
    "common.devicePairingReady": "设备配对就绪",
    "sidebar.commandCenter": "指挥中心",
    "sidebar.research": "研究会话",
    "sidebar.analyzePdf": "分析 PDF",
    "sidebar.paperLibrary": "论文库",
    "sidebar.deviceManager": "设备管理",
    "sidebar.trainingManager": "训练管理",
    "sidebar.ragSearch": "RAG 检索",
    "sidebar.settings": "系统设置",
    "sidebar.fastclawConfig": "FastClaw 配置",
    "sidebar.newResearch": "新建研究",
    "sidebar.documentation": "使用文档",
    "sidebar.support": "支持",
    "sidebar.primaryNavLabel": "主导航",
    "topbar.tabCommand": "指挥",
    "topbar.tabLibrary": "文献",
    "topbar.tabWorkspace": "工作台",
    "topbar.notifications": "通知",
    "topbar.settings": "设置",
    "topbar.avatar": "用户头像",
    "topbar.greeting": "你好，{name}",
    "topbar.greetingAnonymous": "欢迎",
    "home.title": "今天想分析什么？",
    "home.subtitle": "输入命令、自然语言问题，或拖入一篇 PDF。",
    "home.inputPlaceholder": "例如：总结 Transformer 架构的最新进展…",
    "home.inputLabel": "向 Hermes 提问",
    "home.submit": "提交",
    "home.quickAction.searchPapers": "搜索论文",
    "home.quickAction.analyzePdf": "分析 PDF",
    "home.quickAction.ragChat": "RAG 检索",
    "home.quickAction.manageTraining": "训练任务",
    "home.recentHeading": "最近活动",
    "home.recent.attention": "Attention Is All You Need",
    "home.recent.attentionMeta": "2 小时前已分析 • 抽取完成",
    "home.recent.hermesV2": "模型训练：Hermes-V2",
    "home.recent.hermesV2Meta": "运行中 • 第 42/100 轮 • Loss：0.24",
    "home.recent.empty": "暂无最近活动。",
    "home.recent.loadError": "加载最近活动失败：{message}",
    "home.recent.retry": "重试",
    "home.recent.tag.paper": "论文",
    "home.recent.paperMeta": "{authors} · {year}",
    "home.recent.recordMeta": "{status} · {progress}%",
    "home.recent.unknownAuthor": "未知作者",
    "research.backToHome": "返回指挥中心",
    "research.title": "研究会话",
    "research.subtitle": "实时查看 Hermes Agent 的执行过程与结果。",
    "research.newSession": "新建会话",
    "research.newSessionHint": "清空当前上下文，开一条全新的 Hermes 会话。",
    "research.panels.currentCommand": "当前指令",
    "research.panels.liveStream": "实时事件流",
    "research.panels.execution": "执行上下文",
    "research.panels.noCommand": "暂无指令",
    "research.panels.noEvents": "等待 Hermes 事件…",
    "research.panels.eventCount": "已接收 {count} 条事件",
    "research.panels.turns": "对话轮数",
    "research.panels.channel": "通道",
    "research.empty.title": "暂无进行中的会话",
    "research.empty.hint": "回到指挥中心首页发一条指令，再到这里查看过程。",
    "research.empty.cta": "去指挥中心",
    "research.followupLabel": "追问指令",
    "research.followupPlaceholder": "继续追问…",
    "research.followupSubmit": "发送追问",
    "manager.loading": "正在加载训练任务…",
    "manager.backToDevices": "返回设备管理",
    "manager.titlePrefix": "训练管理",
    "manager.switchRun": "切换任务",
    "manager.empty.title": "暂无训练任务",
    "manager.empty.hint": "在设备管理里启动一个复现任务，即可在这里看到命令控制台。",
    "manager.empty.cta": "去设备管理",
    "manager.panels.commandInterface": "命令接口",
    "manager.panels.history": "历史",
    "manager.panels.todayAt": "今天 {time}",
    "manager.chat.systemBoot": "训练任务 {runId} 已在 {nodes} 个节点上初始化，等待数据集加载…",
    "manager.chat.userAskLoss": "当前 {node} 的 loss 是多少？",
    "manager.chat.fetchingMetrics": "正在获取 {node} 的指标",
    "manager.chat.metric": "指标",
    "manager.chat.value": "数值",
    "manager.chat.inputPlaceholder": "查询指标、暂停训练、调整学习率…",
    "manager.chat.send": "发送",
    "manager.chat.streaming": "正在回复…",
    "manager.chat.waitingDeploy": "等待部署任务启动…",
    "manager.metrics.epoch": "Epoch",
    "manager.metrics.globalLoss": "全局 Loss",
    "manager.metrics.globalLossHint": "(最近 100 步)",
    "manager.metrics.gpuUtil": "GPU 利用率",
    "manager.metrics.gpuUtilHint": "{n} 个节点",
    "manager.metrics.eta": "剩余时间",
    "manager.metrics.lossCurve": "Loss 曲线",
    "manager.logs.heading": "实时日志",
    "command.inputPlaceholderBusy": "Hermes 正在执行上一条指令…",
    "command.reset": "新建指令",
    "command.waitingFirstEvent": "等待 Hermes 响应…",
    "command.phase.idle": "就绪",
    "command.phase.connecting": "连接中",
    "command.phase.streaming": "执行中",
    "command.phase.awaitingConfirmation": "等待确认",
    "command.phase.completed": "已完成",
    "command.phase.failed": "已失败",
    "command.phase.cancelled": "已取消",
    "command.event.agentEmpty": "（Agent 返回了空消息）",
    "command.event.toolStart": "调用工具：{name}",
    "command.event.toolResult": "{name} · {summary}",
    "command.event.needConfirmationInline": "需要确认：{message}",
    "command.event.needConfirmationFallback": "请确认以下操作。",
    "command.event.finalCancelled": "已取消本次操作。",
    "command.event.finalDefault": "完成。",
    "command.event.errorInline": "错误：{message}",
    "command.confirmation.title": "确认执行操作",
    "command.confirmation.fallback": "Hermes 请求你确认下面的操作。",
    "command.confirmation.confirm": "确认",
    "command.confirmation.cancel": "取消",
    "command.error.title": "出现问题",
    "command.error.code": "错误码：{code}",
    "assistant.open": "打开助手",
    "assistant.close": "关闭",
    "assistant.minimize": "最小化",
    "assistant.title": "Hermes 助手",
    "assistant.subtitle": "任意页面都能对话。",
    "assistant.openFull": "打开完整视图",
    "assistant.newSession": "新建会话",
    "assistant.send": "发送",
    "assistant.inputPlaceholder": "向 Hermes 提问…",
    "assistant.inputPlaceholderBusy": "Hermes 正在工作…",
    "assistant.contextHint": "上下文：{page}",
    "repro.status.not_started": "未开始",
    "repro.status.running": "运行中",
    "repro.status.success": "成功",
    "repro.status.failed": "失败",
    "repro.status.paused": "暂停",
    "library.title": "文献库",
    "library.subtitle": "浏览、筛选和分析已导入的研究论文。",
    "library.searchLabel": "搜索文献",
    "library.searchPlaceholder": "搜索标题、作者或关键词…",
    "library.filter.domain": "领域",
    "library.filter.source": "来源",
    "library.filter.year": "年份",
    "library.filter.clearAll": "清空筛选",
    "library.filter.remove": "移除筛选 {label}",
    "library.table.titleAuthors": "标题与作者",
    "library.table.domain": "领域",
    "library.table.source": "来源",
    "library.table.year": "年份",
    "library.table.actions": "操作",
    "library.table.open": "打开",
    "library.emptyTitle": "没有匹配的论文。",
    "library.emptyHint": "试着清空筛选条件或放宽关键词。",
    "library.rangeLabel": "共 {total} 篇，显示第 {start}–{end} 篇",
    "library.noMatch": "没有匹配的论文",
    "library.etAl": " 等",
    "library.pagination.previous": "上一页",
    "library.pagination.next": "下一页",
    "library.pagination.label": "文献库分页",
    "library.loading": "加载论文中…",
    "library.loadError": "加载失败：{message}",
    "library.retry": "重试",
    "paper.download": "下载 PDF",
    "paper.upload": "上传 PDF",
    "paper.uploadHint": "点击或拖拽 PDF 到此处",
    "paper.repoUrl": "代码仓库",
    "paper.repoUrlOpen": "打开仓库",
    "paper.uploading": "上传中…",
    "paper.uploadSuccess": "上传成功",
    "paper.uploadError": "上传失败：{message}",
    "paper.uploadTooLarge": "文件超过 {limit} 上限",
    "paper.uploadNotPdf": "请选择 PDF 文件",
    "paper.uploadedFile": "{name} · {size}",
    "paper.backToLibrary": "返回文献库",
    "paper.notFound": "未找到该论文",
    "paper.notFoundHint": "该论文不在文献库中。",
    "paper.analysis.heading": "结构化分析",
    "paper.analysis.subheading": "从论文抽取的结构化数据",
    "paper.analysis.empty": "尚未为该论文生成结构化分析。",
    "paper.analysis.startRagChat": "开始 RAG 对话",
    "paper.analysis.summary": "摘要总结",
    "paper.analysis.taskDefinition": "任务定义",
    "paper.analysis.researchQuestions": "研究问题",
    "paper.analysis.methodOverview": "方法概述",
    "paper.analysis.metrics": "指标",
    "paper.analysis.conclusion": "结论",
    "paper.analysis.notes": "备注",
    "paper.abstract": "摘要",
    "paper.abstractEmpty": "暂无摘要。",
    "paper.meta.source": "来源",
    "paper.meta.year": "年份",
    "paper.meta.field": "领域",
    "paper.startReproduction": "开始复现",
    "paper.startReproductionDesc": "选择一台 GPU 设备来运行「{title}」的复现任务。",
    "paper.selectDevice": "选择设备",
    "paper.noDevice": "不绑定设备（手动）",
    "paper.cancel": "取消",
    "paper.creating": "创建中…",
    "paper.startNow": "立即开始",
    "workspace.title": "工作台仪表盘",
    "workspace.subtitle": "管理 GPU 资源并监控训练任务。",
    "workspace.devicesHeading": "设备",
    "workspace.recordsHeading": "论文复现",
    "workspace.stat.totalDevices": "设备总数",
    "workspace.stat.idle": "空闲",
    "workspace.stat.running": "运行中",
    "workspace.stat.offline": "离线",
    "workspace.stat.error": "异常",
    "workspace.device.name": "名称",
    "workspace.device.type": "类型",
    "workspace.device.status": "状态",
    "workspace.device.location": "位置",
    "workspace.device.description": "描述",
    "workspace.device.actions": "操作",
    "workspace.device.addBtn": "新增设备",
    "workspace.device.dialogTitle": "新增设备",
    "workspace.device.dialogDesc": "登记一台计算节点或其他可供团队使用的设备。",
    "workspace.device.namePlaceholder": "例如：GPU-Server-02",
    "workspace.device.typePlaceholder": "例如：GPU Server",
    "workspace.device.locationPlaceholder": "例如：Lab A",
    "workspace.device.descriptionPlaceholder": "可选的备注信息。",
    "workspace.device.save": "保存",
    "workspace.device.saving": "保存中…",
    "workspace.device.cancel": "取消",
    "workspace.device.required": "此项必填。",
    "workspace.device.nameMax": "名称请控制在 120 字符内。",
    "workspace.device.deleteBtn": "删除设备",
    "workspace.device.deleteTitle": "确定删除这台设备？",
    "workspace.device.deleteDesc": "引用该设备的复现记录历史会保留，但设备字段会被清空。",
    "workspace.device.deleteConfirm": "删除",
    "workspace.device.deleteError": "删除失败：{message}",
    "workspace.device.createError": "新增失败：{message}",
    "workspace.device.requestIdHint": "请求 ID：{rid}",
    "workspace.status.idle": "空闲",
    "workspace.status.running": "运行中",
    "workspace.status.offline": "离线",
    "workspace.status.error": "异常",
    "workspace.status.updateError": "状态更新失败：{message}",
    "workspace.record.actions": "操作",
    "workspace.record.addBtn": "新增记录",
    "workspace.record.editBtn": "编辑",
    "workspace.record.deleteBtn": "删除",
    "workspace.record.dialogTitleCreate": "新增复现记录",
    "workspace.record.dialogTitleEdit": "编辑复现记录",
    "workspace.record.dialogDesc": "记录一次对某篇论文的复现或训练任务。",
    "workspace.record.paperRequired": "请选择论文。",
    "workspace.record.progressRange": "进度必须在 0 到 100 之间。",
    "workspace.record.urlInvalid": "请输入合法的 URL。",
    "workspace.record.save": "保存",
    "workspace.record.saving": "保存中…",
    "workspace.record.cancel": "取消",
    "workspace.record.saveError": "保存失败：{message}",
    "workspace.record.deleteTitle": "删除这条复现记录？",
    "workspace.record.deleteDesc": "操作不可逆。",
    "workspace.record.deleteConfirm": "删除",
    "workspace.record.deleteError": "删除失败：{message}",
    "workspace.record.requestIdHint": "请求 ID：{rid}",
    "workspace.record.progressLabel": "进度 (%)",
    "workspace.record.resultSummaryLabel": "结果摘要",
    "workspace.record.resultSummaryPlaceholder": "描述复现结果与关键指标…",
    "workspace.record.artifactUrlLabel": "产物链接",
    "workspace.record.artifactUrlPlaceholder": "https://…",
    "workspace.record.trainingNotesLabel": "训练修改记录",
    "workspace.record.trainingNotesPlaceholder": "超参数调整、数据清洗、代码改动点…",
    "workspace.record.startedAtLabel": "开始时间",
    "workspace.record.finishedAtLabel": "结束时间",
    "workspace.record.deviceNone": "不绑定设备",
    "combobox.placeholder": "请选择…",
    "combobox.searchPlaceholder": "搜索…",
    "combobox.empty": "未找到匹配项。",
    "combobox.loading": "加载中…",
    "combobox.clear": "清除选择",
    "workspace.record.paper": "论文",
    "workspace.record.device": "设备",
    "workspace.record.status": "状态",
    "workspace.record.progress": "进度",
    "workspace.record.startedAt": "开始时间",
    "workspace.record.finishedAt": "结束时间",
    "workspace.loading": "加载中…",
    "workspace.empty": "暂无数据。",
    "workspace.loadError": "加载失败：{message}",
    "search.pageTitle": "在所有论文中检索…",
    "search.pageTitleShort": "RAG Search",
    "search.modelLabel": "模型：",
    "search.globalSearchPlaceholder": "全局搜索…",
    "search.pageSubtitle": "用自然语言查询全局语料，由 Hermes-7B 驱动的语义检索。",
    "search.inputLabel": "RAG 查询输入",
    "search.inputPlaceholder": "例如：大模型效率方向的共同主题",
    "search.chatPlaceholder": "询问论文、数据集或指标…",
    "search.attach": "附加文档",
    "search.submit": "开始检索",
    "search.recent": "最近",
    "search.resultsHeading": "综合结果",
    "search.resultsCount": "共检索到 {count} 个来源",
    "search.viewSource": "查看来源",
    "search.relevance": "相关度：{value}",
    "search.scope.heading": "检索范围",
    "search.scope.papersIndexed": "已索引论文",
    "search.scope.totalTokens": "约 Token 数",
    "search.scope.activeCollections": "活跃合集",
    "search.scope.moreCollections": "另外 {count} 个",
    "search.scope.empty": "—",
    "search.scope.noCollections": "暂无活跃合集",
    "search.empty.title": "暂无结果",
    "search.empty.hint": "接入后端后提交查询即可看到结果。",
    "search.recentEmpty": "暂无最近检索",
    "search.emptyConversation.title": "向语料提问",
    "search.emptyConversation.hint": "在下方输入问题，Hermes 会在已索引的论文中检索并引用原文。",
    "search.loadingReply": "正在检索语料…",
    "search.replyError": "检索失败：{message}",
    "search.panels.currentSource": "当前来源",
    "search.panels.dataExtraction": "数据抽取",
    "search.panels.executionContext": "执行上下文",
    "search.panels.filter": "筛选",
    "search.panels.metric": "指标",
    "search.panels.value": "数值",
    "search.panels.unit": "单位",
    "search.panels.relevance": "相关度",
    "search.panels.pages": "{n} 页",
    "search.panels.ragOnline": "RAG 引擎已在线",
    "search.panels.latency": "延迟",
    "search.panels.contextWindow": "上下文使用",
    "search.panels.embeddings": "Embedding",
    "search.panels.vectorDb": "向量库",
    "search.panels.exportData": "导出数据",
    "search.panels.shareResult": "分享结果",
    "search.panels.noSource": "尚无活跃来源",
    "search.llmNotConfigured.title": "尚未配置 LLM",
    "search.llmNotConfigured.hint": "请在 backend/.env 填入 LLM_API_KEY 并重启后端以启用问答。关键词检索不受影响。",
    "search.usedEmbedding.yes": "Embedding 重排",
    "search.usedEmbedding.no": "仅 FTS 排序",
    "search.referencesHeading": "引用论文",
    "settings.breadcrumbSettings": "设置",
    "settings.breadcrumbCurrent": "偏好与连接",
    "settings.title": "系统设置",
    "settings.profile.heading": "个人信息",
    "settings.profile.name": "姓名",
    "settings.profile.email": "邮箱",
    "settings.profile.institution": "所属机构",
    "settings.profile.save": "保存修改",
    "settings.profile.edit": "编辑",
    "settings.profile.cancel": "取消",
    "settings.profile.empty": "未填写",
    "settings.profile.error.nameRequired": "请填写姓名",
    "settings.profile.error.nameMax": "长度请控制在 120 字符以内",
    "settings.profile.error.emailInvalid": "请输入正确的邮箱地址",
    "settings.profile.error.institutionRequired": "请填写所属机构",
    "settings.profile.error.institutionMax": "长度请控制在 200 字符以内",
    "settings.profile.username": "用户名",
    "settings.profile.usernamePlaceholder": "你想怎么被称呼？",
    "settings.profile.saving": "保存中…",
    "settings.profile.saved": "已保存",
    "settings.profile.error.usernameMax": "长度请控制在 120 字符以内",
    "settings.profile.error.loadFailed": "加载失败：{message}",
    "settings.profile.error.saveFailed": "保存失败：{message}",
    "settings.profile.updatedAt": "最近更新：{time}",
    "settings.prefs.heading": "偏好设置",
    "settings.prefs.darkTitle": "深色模式",
    "settings.prefs.darkDesc": "在深色与浅色主题之间切换",
    "settings.prefs.localeTitle": "中文界面",
    "settings.prefs.localeDesc": "将界面语言切换为简体中文",
    "settings.agents.heading": "AI Agent",
    "settings.agents.empty": "没有可配置的 Agent。",
    "settings.agents.loadFailed": "加载失败：{message}",
    "settings.agents.apiKeyConfigured": "API Key 已配置",
    "settings.agents.apiKeyMissing": "API Key 未配置",
    "settings.agents.edit": "编辑",
    "settings.agents.test": "测试",
    "settings.agents.testing": "测试中…",
    "settings.agents.cancel": "取消",
    "settings.agents.save": "保存",
    "settings.agents.saving": "保存中…",
    "settings.agents.fields.displayName": "显示名称",
    "settings.agents.fields.model": "模型",
    "settings.agents.fields.modelHint": "OpenAI 兼容的模型 ID，例如 openai/gpt-4o-mini",
    "settings.agents.fields.apiBase": "Provider Base URL",
    "settings.agents.fields.apiKey": "API Key",
    "settings.agents.fields.apiKeyPlaceholder": "留空保持原 Key 不变",
    "settings.agents.fields.apiKeyClear": "清空 API Key",
    "settings.agents.fields.temperature": "温度",
    "settings.agents.fields.maxTokens": "Max Tokens",
    "settings.agents.error.saveFailed": "保存失败：{message}",
    "settings.agents.test.success": "Provider {ms} ms 内响应正常",
    "settings.agents.test.failed": "测试失败：{message}",
    "settings.agents.updatedAt": "最近更新：{time}",
    "settings.feishu.heading": "飞书连接",
    "settings.feishu.body": "扫码加入支持频道，并配对你的移动设备。",
    "settings.feishu.cta": "生成配对二维码",
    "settings.feishu.ctaRegenerate": "重新生成",
    "settings.feishu.loading": "Hermes 正在生成…",
    "settings.feishu.hint": "点击占位图让 Hermes 生成新的配对链接。",
    "settings.feishu.ready": "使用飞书扫一扫完成配对",
    "settings.feishu.error": "连接 Hermes 失败：{message}",
    "settings.feishu.empty": "Hermes 未返回可配对的链接，请重试。",
    "settings.feishu.setupHeading": "该主机尚未配置飞书应用",
    "settings.feishu.setupHint": '在 Hermes 所在主机上运行下方命令完成交互式配置，然后点击"重新生成"。',
    "settings.feishu.copy": "复制链接",
    "settings.feishu.copied": "已复制",
    "settings.feishu.copyCommand": "复制命令"
  }
};
function format(template, vars) {
  if (!vars) return template;
  return template.replace(
    /\{(\w+)\}/g,
    (_, k) => vars[k] === void 0 ? `{${k}}` : String(vars[k])
  );
}
const STORAGE_KEY = "hermes:locale";
const I18nContext = createContext(void 0);
function readStoredLocale() {
  if (typeof window === "undefined") return "en";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && locales.includes(raw)) return raw;
  } catch {
  }
  return "en";
}
function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState("en");
  useEffect(() => {
    const stored = readStoredLocale();
    if (stored !== locale) setLocaleState(stored);
  }, [locale]);
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }
  }, [locale]);
  const setLocale = useCallback((next) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
    }
  }, []);
  const t = useCallback(
    (key, vars) => {
      const template = messages[locale][key] ?? messages.en[key] ?? key;
      return format(template, vars);
    },
    [locale]
  );
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return /* @__PURE__ */ jsx(I18nContext.Provider, { value, children });
}
function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
function NotFoundComponent() {
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-7xl font-bold text-foreground", children: "404" }),
    /* @__PURE__ */ jsx("h2", { className: "mt-4 text-xl font-semibold text-foreground", children: "Page not found" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "The page you're looking for doesn't exist or has been moved." }),
    /* @__PURE__ */ jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsx(
      Link,
      {
        to: "/",
        className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        children: "Go home"
      }
    ) })
  ] }) });
}
function ErrorComponent({ error, reset }) {
  console.error(error);
  const router2 = useRouter();
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight text-foreground", children: "This page didn't load" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "Something went wrong on our end. You can try refreshing or head back home." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 flex flex-wrap justify-center gap-2", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            router2.invalidate();
            reset();
          },
          className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          children: "Try again"
        }
      ),
      /* @__PURE__ */ jsx(
        "a",
        {
          href: "/",
          className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent",
          children: "Go home"
        }
      )
    ] })
  ] }) });
}
const Route$a = createRootRouteWithContext()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hermes AI — Research Command Center" },
      {
        name: "description",
        content: "Hermes AI: command center for research, paper analysis, RAG chat, and model training."
      },
      { name: "author", content: "Hermes AI" },
      { property: "og:title", content: "Hermes AI — Research Command Center" },
      {
        property: "og:description",
        content: "Command center for research, paper analysis, RAG chat, and model training."
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" }
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss
      }
    ]
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent
});
function RootShell({ children }) {
  return /* @__PURE__ */ jsxs("html", { lang: "en", className: "dark", children: [
    /* @__PURE__ */ jsx("head", { children: /* @__PURE__ */ jsx(HeadContent, {}) }),
    /* @__PURE__ */ jsxs("body", { children: [
      children,
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
function RootComponent() {
  const { queryClient } = Route$a.useRouteContext();
  return /* @__PURE__ */ jsx(QueryClientProvider, { client: queryClient, children: /* @__PURE__ */ jsx(I18nProvider, { children: /* @__PURE__ */ jsxs(ThemeProvider, { children: [
    /* @__PURE__ */ jsx(LangSync, {}),
    /* @__PURE__ */ jsx(Outlet, {})
  ] }) }) });
}
function LangSync() {
  useI18n();
  return null;
}
const $$splitComponentImporter$9 = () => import("./workspace-CH5v4t-E.js");
const Route$9 = createFileRoute("/workspace")({
  head: () => ({
    meta: [{
      title: "Workspace — Hermes AI"
    }, {
      name: "description",
      content: "Manage GPU resources and monitor active training tasks."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$9, "component")
});
class ApiError extends Error {
  status;
  code;
  details;
  requestId;
  constructor(status, code, message, details, requestId) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (details !== void 0) this.details = details;
    if (requestId !== void 0) this.requestId = requestId;
  }
}
function isEnvelope(body) {
  return typeof body === "object" && body !== null && "success" in body && typeof body.success === "boolean";
}
function getApiBaseUrl() {
  const raw = "http://localhost:8787";
  return raw.replace(/\/$/, "") || "http://localhost:8787";
}
function isNetworkError(err) {
  return err instanceof ApiError && err.code === "NETWORK_ERROR";
}
function buildUrl(path, query) {
  const base = path.startsWith("http") ? path : `${getApiBaseUrl()}${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === void 0 || v === null || v === "") continue;
    params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}
async function apiFetch(path, init = {}) {
  const { json, query, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  let body;
  if (json !== void 0) {
    body = JSON.stringify(json);
    if (!finalHeaders.has("Content-Type")) {
      finalHeaders.set("Content-Type", "application/json");
    }
  }
  const url = buildUrl(path, query);
  let res;
  try {
    res = await fetch(url, { ...rest, headers: finalHeaders, body });
  } catch (err2) {
    const message = err2 instanceof Error ? err2.message : "Network request failed";
    throw new ApiError(0, "NETWORK_ERROR", message);
  }
  if (res.status === 204) {
    return void 0;
  }
  const requestId = res.headers.get("X-Request-Id") ?? void 0;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) {
      throw new ApiError(
        res.status,
        "HTTP_ERROR",
        res.statusText || `Request failed with status ${res.status}`,
        void 0,
        requestId
      );
    }
    return void 0;
  }
  let parsed;
  try {
    parsed = await res.json();
  } catch {
    throw new ApiError(
      res.status,
      "PARSE_ERROR",
      "Failed to parse JSON response",
      void 0,
      requestId
    );
  }
  if (!isEnvelope(parsed)) {
    if (!res.ok) {
      throw new ApiError(res.status, "HTTP_ERROR", res.statusText, parsed, requestId);
    }
    return parsed;
  }
  if (parsed.success) {
    return parsed.data;
  }
  const err = parsed.error;
  throw new ApiError(
    res.status,
    err.code ?? "UNKNOWN",
    err.message ?? "Unknown error",
    err.details,
    err.requestId ?? requestId
  );
}
function apiUrl(path) {
  return path.startsWith("http") ? path : `${getApiBaseUrl()}${path}`;
}
async function getProfile() {
  return apiFetch("/api/profile");
}
async function updateProfile(input) {
  return apiFetch("/api/profile", {
    method: "PUT",
    json: input
  });
}
const $$splitComponentImporter$8 = () => import("./settings-bzf2lWO_.js");
const Route$8 = createFileRoute("/settings")({
  head: () => ({
    meta: [{
      title: "Settings — Hermes AI"
    }, {
      name: "description",
      content: "Profile, preferences, and connectivity settings."
    }]
  }),
  loader: async ({
    context
  }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ["profile"],
      queryFn: getProfile
    }).catch(() => void 0);
  },
  component: lazyRouteComponent($$splitComponentImporter$8, "component")
});
const $$splitComponentImporter$7 = () => import("./search-ve6I9cvc.js");
const searchSchema = z.object({
  q: z.string().optional(),
  paperId: z.string().optional()
});
const Route$7 = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{
      title: "RAG Search - Hermes AI"
    }, {
      name: "description",
      content: "FastClaw-assisted analysis over the research corpus."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
const $$splitComponentImporter$6 = () => import("./research-CRbzdHJp.js");
const Route$6 = createFileRoute("/research")({
  head: () => ({
    meta: [{
      title: "Research — FastClaw"
    }, {
      name: "description",
      content: "Follow the FastClaw paper research agent through a live session."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const $$splitComponentImporter$5 = () => import("./manager-Cp_Ch89T.js");
const Route$5 = createFileRoute("/manager")({
  validateSearch: (search) => ({
    runId: typeof search.runId === "string" ? search.runId : void 0
  }),
  head: () => ({
    meta: [{
      title: "Training Manager — Hermes AI"
    }, {
      name: "description",
      content: "Live command interface for running reproductions and training jobs."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const $$splitComponentImporter$4 = () => import("./library-BZn_63xL.js");
const Route$4 = createFileRoute("/library")({
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const $$splitComponentImporter$3 = () => import("./fastclaw-D6bsPcVb.js");
const Route$3 = createFileRoute("/fastclaw")({
  head: () => ({
    meta: [{
      title: "FastClaw Model API - Hermes AI"
    }, {
      name: "description",
      content: "Configure FastClaw GLM and DeepSeek model API providers."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import("./docs-DTKfsRxC.js");
const Route$2 = createFileRoute("/docs")({
  head: () => ({
    meta: [{
      title: "技术架构 — Hermes AI"
    }, {
      name: "description",
      content: "Paper Watcher 三层技术架构说明：Hermes 任务执行、后端数据与 RAG、前端工作台。"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const RECENT_PAPERS_LIMIT = 3;
async function listPapers(query = {}) {
  return apiFetch("/api/papers", { query });
}
async function getPaperDetail(paperId) {
  return apiFetch(`/api/papers/${encodeURIComponent(paperId)}/detail`);
}
async function uploadPaperPdf(paperId, file) {
  const form = new FormData();
  form.append("file", file);
  const url = apiUrl(`/api/papers/${encodeURIComponent(paperId)}/pdf`);
  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json();
  if (!json.success) {
    throw new ApiError(
      res.status,
      json.error.code,
      json.error.message,
      json.error.details,
      json.error.requestId
    );
  }
  return json.data;
}
function getPaperPdfUrl(paperId) {
  return apiUrl(`/api/papers/${encodeURIComponent(paperId)}/pdf`);
}
async function listReproductionRecords() {
  return apiFetch("/api/reproduction-records");
}
async function createReproductionRecord(input) {
  return apiFetch("/api/reproduction-records", {
    method: "POST",
    json: input
  });
}
async function updateReproductionRecord(id, input) {
  return apiFetch(`/api/reproduction-records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: input
  });
}
async function deleteReproductionRecord(id) {
  return apiFetch(`/api/reproduction-records/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}
const $$splitComponentImporter$1 = () => import("./index-Ce8uXA3u.js");
const Route$1 = createFileRoute("/")({
  loader: async ({
    context
  }) => {
    await Promise.allSettled([context.queryClient.ensureQueryData({
      queryKey: ["papers", {
        page: 1,
        pageSize: RECENT_PAPERS_LIMIT
      }],
      queryFn: () => listPapers({
        page: 1,
        pageSize: RECENT_PAPERS_LIMIT
      })
    }), context.queryClient.ensureQueryData({
      queryKey: ["reproduction-records"],
      queryFn: listReproductionRecords
    })]);
  },
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const detailQuery = (paperId) => ({
  queryKey: ["paper-detail", paperId],
  queryFn: () => getPaperDetail(paperId)
});
const $$splitComponentImporter = () => import("./library_._paperId-CvNLZ-fv.js");
const $$splitErrorComponentImporter = () => import("./library_._paperId-Cy9MjAfx.js");
const $$splitNotFoundComponentImporter = () => import("./library_._paperId-CJ8Ti3XN.js");
const Route = createFileRoute("/library_/$paperId")({
  loader: async ({
    params,
    context
  }) => {
    try {
      await context.queryClient.ensureQueryData(detailQuery(params.paperId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw notFound();
      throw err;
    }
  },
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, "notFoundComponent"),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, "errorComponent"),
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const WorkspaceRoute = Route$9.update({
  id: "/workspace",
  path: "/workspace",
  getParentRoute: () => Route$a
});
const SettingsRoute = Route$8.update({
  id: "/settings",
  path: "/settings",
  getParentRoute: () => Route$a
});
const SearchRoute = Route$7.update({
  id: "/search",
  path: "/search",
  getParentRoute: () => Route$a
});
const ResearchRoute = Route$6.update({
  id: "/research",
  path: "/research",
  getParentRoute: () => Route$a
});
const ManagerRoute = Route$5.update({
  id: "/manager",
  path: "/manager",
  getParentRoute: () => Route$a
});
const LibraryRoute = Route$4.update({
  id: "/library",
  path: "/library",
  getParentRoute: () => Route$a
});
const FastclawRoute = Route$3.update({
  id: "/fastclaw",
  path: "/fastclaw",
  getParentRoute: () => Route$a
});
const DocsRoute = Route$2.update({
  id: "/docs",
  path: "/docs",
  getParentRoute: () => Route$a
});
const IndexRoute = Route$1.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$a
});
const LibraryPaperIdRoute = Route.update({
  id: "/library_/$paperId",
  path: "/library/$paperId",
  getParentRoute: () => Route$a
});
const rootRouteChildren = {
  IndexRoute,
  DocsRoute,
  FastclawRoute,
  LibraryRoute,
  ManagerRoute,
  ResearchRoute,
  SearchRoute,
  SettingsRoute,
  WorkspaceRoute,
  LibraryPaperIdRoute
};
const routeTree = Route$a._addFileChildren(rootRouteChildren)._addFileTypes();
const getRouter = () => {
  const queryClient = new QueryClient();
  const router2 = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0
  });
  return router2;
};
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  ApiError as A,
  Route$7 as R,
  updateReproductionRecord as a,
  listReproductionRecords as b,
  createReproductionRecord as c,
  deleteReproductionRecord as d,
  updateProfile as e,
  apiFetch as f,
  getProfile as g,
  useTheme as h,
  isNetworkError as i,
  Route$5 as j,
  apiUrl as k,
  listPapers as l,
  RECENT_PAPERS_LIMIT as m,
  uploadPaperPdf as n,
  Route as o,
  detailQuery as p,
  getPaperPdfUrl as q,
  router as r,
  useI18n as u
};
