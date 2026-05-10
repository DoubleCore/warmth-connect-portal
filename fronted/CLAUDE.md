[根目录](../CLAUDE.md) > **fronted**

# Fronted — Hermes AI 前端模块

> 目录名拼写是 `fronted`（非 `frontend`），是项目初建时遗留的拼写偏差，不影响功能。

## 模块职责

Hermes AI 研究指挥中心的唯一前端模块。承载全部页面路由、业务组件、UI 组件库、样式系统、国际化/主题、前端 API 客户端和 Cloudflare Workers 部署配置。数据已从硬编码 mock 切换为通过 `src/api/*` 调用 `backend/` 提供的 JSON API。

## 入口与启动

| 文件                     | 说明                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `src/start.ts`           | TanStack Start 实例，注册 SSR `errorMiddleware` —— 抓到异常兜底渲染品牌化 500 页         |
| `src/server.ts`          | Cloudflare Workers `fetch` 入口，动态 import `@tanstack/react-start/server-entry`，并处理 h3 把 SSR 抛错吞成 `{"unhandled":true,"message":"HTTPError"}` 的情况 |
| `src/router.tsx`         | `getRouter()` 工厂：每次 SSR 请求创建全新 `QueryClient` + `createRouter`（带 scroll restoration） |
| `src/routes/__root.tsx`  | 根路由：`<html>` Shell（默认 `dark`）、`QueryClientProvider`、`ThemeProvider`、`I18nProvider`、404/Error 组件 |
| `src/routeTree.gen.ts`   | TanStack Router 插件自动生成的路由树，**不要手动修改**                                    |

启动流程：`bun run dev` → Vite dev server → `src/start.ts` 初始化 TanStack Start → `src/router.tsx` 创建路由器 → 渲染 `__root.tsx` Shell。

## 对外接口

### 前端路由

| 路径                       | 文件                              | 页面                                           |
| -------------------------- | --------------------------------- | ---------------------------------------------- |
| `/`                        | `src/routes/index.tsx`            | 命令中心首页（CommandPrompt）                  |
| `/library`                 | `src/routes/library.tsx`          | 论文库列表                                     |
| `/library/$paperId`        | `src/routes/library_.$paperId.tsx`| 论文详情 + AI 分析 + RAG 会话入口              |
| `/search`                  | `src/routes/search.tsx`           | RAG 语义搜索                                   |
| `/workspace`               | `src/routes/workspace.tsx`        | GPU 设备与复现任务仪表盘                       |
| `/docs`                    | `src/routes/docs.tsx`             | 文档中心                                       |
| `/settings`                | `src/routes/settings.tsx`         | 系统设置（profile / 主题 / 语言）              |

> `library_.$paperId.tsx` 的前缀下划线是 TanStack Router 的 "flat but non-nested" 约定，父布局不会继承到详情页。

### 后端 API 客户端

所有 HTTP 调用走 `src/lib/api-client.ts` 的 `apiFetch<T>()`：

- 通过 `VITE_API_BASE_URL`（默认 `http://localhost:8787`）拼 URL
- 自动拆解后端 `{ success, data }` / `{ success: false, error }` 信封
- 204 → `undefined`，`fetch` 级别失败 → `ApiError` with `code="NETWORK_ERROR"`（`isNetworkError()` 辅助判断）
- 保留服务器端 `X-Request-Id` 方便报错时给用户看

按模块切分，每个模块导出纯 Promise（与 TanStack Query 解耦）：

| 文件                       | 负责的后端路由                                   |
| -------------------------- | ------------------------------------------------ |
| `src/api/papers.ts`        | `/api/papers/**`（含 PDF 上传/下载）             |
| `src/api/rag.ts`           | `/api/papers/:id/rag/*`、`/api/rag/**`           |
| `src/api/devices.ts`       | `/api/devices/**`                                |
| `src/api/reproduction.ts`  | `/api/reproduction-records/**`                   |
| `src/api/profile.ts`       | `/api/profile/**`                                |
| `src/api/command.ts`       | `/api/command/**`（Hermes 指令中心）             |

## 关键依赖与配置

### 核心依赖

| 依赖                        | 版本     | 用途                                   |
| --------------------------- | -------- | -------------------------------------- |
| `@tanstack/react-start`     | ^1.167   | SSR 全栈框架                           |
| `@tanstack/react-router`    | ^1.168   | 文件路由                               |
| `@tanstack/router-plugin`   | ^1.167   | 自动生成 `routeTree.gen.ts`            |
| `@tanstack/react-query`     | ^5.83    | 服务端状态管理                         |
| `react` / `react-dom`       | ^19.2    | UI 框架                                |
| `tailwindcss`               | ^4.2     | 原子化 CSS（通过 `@tailwindcss/vite`） |
| `@cloudflare/vite-plugin`   | ^1.25    | Cloudflare Workers 部署                |
| `@lovable.dev/vite-tanstack-config` | ^1.5 | 预包装 Vite 配置（见下方）          |
| `react-hook-form` + `@hookform/resolvers` + `zod` | — | 表单校验           |
| `react-markdown` + `remark-gfm` | —    | RAG 回答渲染                           |
| `recharts`                  | ^2.15    | 仪表盘图表                             |
| `sonner`                    | ^2.0     | Toast 通知                             |
| `lucide-react`              | ^0.575   | 图标（shadcn/ui 默认）                 |

全部 Radix UI primitive 走 shadcn/ui 的 `src/components/ui/` 封装，不要直接从 `@radix-ui/*` 在业务里引用。

### 配置文件

| 文件                 | 说明                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `vite.config.ts`     | 只做一件事：把 TanStack Start 的 server entry 重定向到 `src/server.ts`；其他插件全部由 `@lovable.dev/vite-tanstack-config` 预装（tanstackStart / viteReact / tailwindcss / tsConfigPaths / cloudflare / componentTagger / `@` 别名 / React 去重）—— **不要再手动添加这些插件，会重复注册报错** |
| `tsconfig.json`      | ES2022 / Bundler moduleResolution / `@/*` → `./src/*`                                        |
| `eslint.config.js`   | flat config，`typescript-eslint` recommended + React Hooks + React Refresh + Prettier；禁用 `server-only` import；`no-unused-vars: off`；`react-refresh/only-export-components: warn` |
| `.prettierrc`        | printWidth 100 / 双引号 / 尾逗号 all                                                          |
| `components.json`    | shadcn/ui：new-york style / slate 基色 / `@/` 别名 / lucide 图标                              |
| `wrangler.jsonc`     | Cloudflare Wrangler 部署入口（运行时读 `src/server.ts` 打包出的 worker）                      |
| `.env.example`       | 只有一个变量：`VITE_API_BASE_URL`（默认 `http://localhost:8787`）                             |

### 路径别名

- `@/*` → `./src/*`（tsconfig paths + Vite 自动识别）
- 导入时 **不加** `.ts` / `.tsx` 扩展名（Bundler 模式）

## 数据模型

运行时数据类型全部在 `src/types/` 下，与后端 DTO 的字段名严格对齐：

| 文件                         | 类型                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `src/types/api.ts`           | 信封类型 `SuccessEnvelope<T>` / `ErrorEnvelope`           |
| `src/types/paper.ts`         | `Paper` / `PaperDetail` / `PaperAnalysis` / 分页结果      |
| `src/types/device.ts`        | `Device` / `DeviceStatus` 枚举                            |
| `src/types/reproduction.ts`  | `ReproductionRecord` / `ReproductionStatus`               |
| `src/types/rag.ts`           | `RagConversation` / `RagMessage`                          |
| `src/types/profile.ts`       | `UserProfile`                                             |
| `src/types/command.ts`       | `CommandSession` / `Command` / `CommandStreamEvent`       |

## 主题与国际化

| 能力    | 文件                                 | 说明                                                                 |
| ------- | ------------------------------------ | -------------------------------------------------------------------- |
| 主题    | `src/lib/theme/ThemeProvider.tsx`    | 默认 `dark`（与 `<html class="dark">` SSR 一致），localStorage 持久化 |
| i18n    | `src/lib/i18n/I18nProvider.tsx` + `messages.ts` | 轻量自研：Context + 字典；`<LangSync />` 在客户端同步 `<html lang>` |

新增颜色：**必须** 用 oklch 格式，同时在 `styles.css` 的 `@theme inline`、`:root` 与 `.dark` 中都登记。

## 组件组织

```
src/components/
  hermes/                       # 业务组件（和后端领域一一对应）
    Shell.tsx                   # Sidebar + TopBar + main 布局
    Sidebar.tsx / TopBar.tsx
    CommandPrompt.tsx           # 首页自然语言输入框
    CommandConversation.tsx     # Hermes 指令中心流式对话视图
    EntityCombobox.tsx          # 通用选择器（论文/设备）
    PdfUploadButton.tsx
    ProfileSection.tsx
    DeviceFormDialog.tsx / DeviceStatusPicker.tsx / DeviceDeleteButton.tsx
    ReproductionFormDialog.tsx  / ReproductionDeleteButton.tsx
  ui/                           # shadcn/ui 的 45 个组件，通过
                                # `npx shadcn@latest add <component>` 生成
```

## 自定义 Hooks

| Hook                           | 用途                                                   |
| ------------------------------ | ------------------------------------------------------ |
| `src/hooks/use-command-stream.ts` | 订阅 Hermes 指令中心 SSE 事件流并合并到 React 状态     |
| `src/hooks/use-debounce.ts`    | 通用 `useDebounce<T>`，搜索框使用                      |
| `src/hooks/use-mobile.tsx`     | 基于 `matchMedia` 的移动端断点 Hook                    |

## 测试与质量

- **测试**：无。无测试文件、无测试框架配置。
- **Lint**：`bun run lint`（ESLint + Prettier 集成）
- **格式化**：`bun run format`
- **构建**：`bun run build`（Vite + Cloudflare plugin）

## 常见问题 (FAQ)

**Q: 为什么项目目录叫 `fronted` 而不是 `frontend`？**
A: 项目初建时的拼写偏差，重命名会影响 Cloudflare 构建和历史 commit，暂时保留。

**Q: `routeTree.gen.ts` 为什么总是变化？**
A: 是 `@tanstack/router-plugin` 自动根据 `src/routes/` 文件生成的，只要新增/重命名路由文件就会刷新。不要手动改。

**Q: 怎么添加新页面？**
A: 在 `src/routes/` 下新建 `.tsx` 文件，用 `createFileRoute('/路径')` 定义并导出 `Route`。嵌套路由用 `.`，需要不继承父布局的层级用 `_.`（例 `library_.$paperId.tsx`）。

**Q: 怎么添加新的 UI 组件？**
A: `npx shadcn@latest add <component>`，会落到 `src/components/ui/`，自动用 `@/` 别名。业务组件放 `src/components/hermes/`，不要混进 `ui/`。

**Q: 为什么 `vite.config.ts` 只有几行？**
A: `@lovable.dev/vite-tanstack-config` 已内置所有插件（tanstackStart / viteReact / tailwindcss / tsConfigPaths / cloudflare / componentTagger / React 去重 / env 注入），再手动 add 会重复注册报错。需要扩展时用 `defineConfig({ vite: { ... } })`。

**Q: 后端挂了前端怎么表现？**
A: `apiFetch` 在 `fetch` 抛 TypeError 时包成 `ApiError` with `code="NETWORK_ERROR"`，UI 层用 `isNetworkError(err)` 判断并降级成空态（而不是红色报错）。

**Q: SSR 出错会看到什么？**
A: `src/start.ts` 的 `errorMiddleware` + `src/server.ts` 的 `normalizeCatastrophicSsrResponse` 会把异常兜底成 `src/lib/error-page.ts` 渲染的品牌化 500 页，不会把 h3 默认 JSON 泄漏到浏览器。

## 相关文件清单

```
fronted/
  package.json                     # 依赖与脚本
  vite.config.ts / tsconfig.json   # 构建/类型配置
  eslint.config.js / .prettierrc   # 代码风格
  components.json                  # shadcn/ui 配置
  wrangler.jsonc                   # Cloudflare 部署配置
  .env.example                     # VITE_API_BASE_URL
  src/
    start.ts                       # TanStack Start + 错误中间件
    server.ts                      # Cloudflare Worker 入口 + h3 兜底
    router.tsx                     # router + queryClient 工厂
    routeTree.gen.ts               # 自动生成（勿改）
    styles.css                     # Tailwind v4 + oklch 设计变量
    routes/
      __root.tsx                   # 根 Shell + Providers + 404/Error
      index.tsx                    # 命令中心首页
      library.tsx                  # 论文库列表
      library_.$paperId.tsx        # 论文详情（non-nested）
      search.tsx / workspace.tsx / docs.tsx / settings.tsx
    api/                           # 按后端模块切分的 HTTP 客户端
      papers.ts / rag.ts / devices.ts / reproduction.ts / profile.ts / command.ts
    components/
      hermes/                      # 业务组件
      ui/                          # shadcn/ui 组件（45 个）
    hooks/
      use-command-stream.ts / use-debounce.ts / use-mobile.tsx
    lib/
      api-client.ts                # apiFetch / ApiError / isNetworkError
      utils.ts                     # cn() 等工具
      error-capture.ts / error-page.ts  # SSR 错误兜底
      theme/ThemeProvider.tsx
      i18n/I18nProvider.tsx + messages.ts
    types/                         # 与后端 DTO 对齐的运行时类型
      api.ts / paper.ts / device.ts / reproduction.ts / rag.ts / profile.ts / command.ts
```

## 变更记录 (Changelog)

| 日期       | 操作 | 说明                                                                                        |
| ---------- | ---- | ------------------------------------------------------------------------------------------- |
| 2026-05-09 | 创建 | 初次扫描生成                                                                                |
| 2026-05-10 | 更新 | 补齐 `api/` / `hooks/` / `types/` / `lib/i18n` / `lib/theme`，对齐当前后端驱动的数据流与 Hermes 指令中心组件 |
