[根目录](../CLAUDE.md) > **fronted**

# Fronted -- Hermes AI 前端模块

## 模块职责

Hermes AI 研究指挥中心的唯一前端模块，包含所有页面路由、业务组件、UI 组件库、样式系统和部署配置。当前为纯前端原型，数据为硬编码 mock。

## 入口与启动

| 文件 | 说明 |
|------|------|
| `src/start.ts` | TanStack Start 实例创建，注册 SSR 错误中间件 |
| `src/server.ts` | Cloudflare Workers 入口，包装 TanStack Start 的 server-entry，处理 SSR 错误降级 |
| `src/router.tsx` | 路由器创建，集成 QueryClient 和 routeTree |
| `src/routeTree.gen.ts` | 自动生成的路由树（不要手动修改） |

启动流程：`bun run dev` -> Vite dev server -> `src/start.ts` 初始化 TanStack Start -> `src/router.tsx` 创建路由器 -> 渲染 `__root.tsx` Shell。

## 对外接口

当前无后端 API 调用。所有数据来自 `src/lib/papers.ts` 的硬编码数组。

路由结构：

| 路径 | 文件 | 页面 |
|------|------|------|
| `/` | `src/routes/index.tsx` | 命令中心首页（CommandPrompt） |
| `/library` | `src/routes/library.tsx` | 论文库列表 |
| `/library/$paperId` | `src/routes/library.$paperId.tsx` | 论文详情 + AI 分析面板 |
| `/search` | `src/routes/search.tsx` | RAG 语义搜索 |
| `/workspace` | `src/routes/workspace.tsx` | GPU 设备与训练任务仪表盘 |
| `/docs` | `src/routes/docs.tsx` | 文档中心 |
| `/settings` | `src/routes/settings.tsx` | 系统设置 |

## 关键依赖与配置

### 核心依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@tanstack/react-start` | ^1.167 | SSR 全栈框架 |
| `@tanstack/react-router` | ^1.168 | 文件路由 |
| `@tanstack/react-query` | ^5.83 | 服务端状态管理 |
| `react` / `react-dom` | ^19.2 | UI 框架 |
| `tailwindcss` | ^4.2 | CSS 原子化 |
| `@cloudflare/vite-plugin` | ^1.25 | Cloudflare Workers 部署 |

### 配置文件

| 文件 | 说明 |
|------|------|
| `vite.config.ts` | Vite 配置，使用 `@lovable.dev/vite-tanstack-config` 封装 |
| `tsconfig.json` | TypeScript 配置，ES2022 目标，Bundler 模式，`@/*` 路径别名 |
| `eslint.config.js` | ESLint flat config |
| `.prettierrc` | Prettier 配置 |
| `.prettierignore` | Prettier 忽略规则 |
| `components.json` | shadcn/ui 配置（new-york style，slate 基色，lucide 图标） |
| `wrangler.jsonc` | Cloudflare Wrangler 部署配置 |

## 数据模型

当前仅有一个核心数据类型，定义在 `src/lib/papers.ts`：

```typescript
type Paper = {
  id: string;
  title: string;
  authors: string[];
  domains: string[];
  source: string;       // 如 "arXiv", "NeurIPS", "CVPR"
  year: number;
  abstract: string;
  analysis: {
    summary: string;
    task: { primary: string; datasets: string; goal: string };
    metrics: { label: string; value: string; note?: string }[];
    training: { cost: string; hardware: string };
  };
};
```

## 测试与质量

- **测试**：无。无测试文件、无测试框架配置。
- **Lint**：`bun run lint`，ESLint + Prettier 集成
- **格式化**：`bun run format`

## 常见问题 (FAQ)

**Q: 为什么项目目录叫 `fronted` 而不是 `frontend`？**
A: 这是项目初始创建时的拼写偏差，不影响功能但建议后续重命名。

**Q: `routeTree.gen.ts` 为什么总是变化？**
A: 它是 TanStack Router 插件自动生成的路由树，每次修改 `src/routes/` 下的文件都会重新生成。不要手动编辑它。

**Q: 添加新页面需要做什么？**
A: 在 `src/routes/` 下新建 `.tsx` 文件，导出 `Route` 常量（使用 `createFileRoute`），TanStack Router 插件会自动将其注册到路由树。

**Q: 如何添加新的 UI 组件？**
A: 运行 `npx shadcn@latest add <component>`，组件会被添加到 `src/components/ui/`，且自动配置好路径别名。

**Q: 为什么 vite.config.ts 里有注释说不要重复添加插件？**
A: `@lovable.dev/vite-tanstack-config` 已经内置了 tanstackStart、viteReact、tailwindcss、tsConfigPaths、cloudflare 等插件，手动再添加会导致重复插件报错。

## 相关文件清单

```
fronted/
  package.json              # 依赖与脚本
  vite.config.ts            # Vite 配置
  tsconfig.json             # TypeScript 配置
  eslint.config.js          # ESLint 配置
  .prettierrc               # Prettier 配置
  .prettierignore           # Prettier 忽略
  components.json           # shadcn/ui 配置
  wrangler.jsonc            # Cloudflare 部署配置
  bun.lock                  # Bun 锁文件
  src/
    start.ts                # TanStack Start 入口
    server.ts               # Cloudflare Workers SSR 入口
    router.tsx              # 路由器
    routeTree.gen.ts        # 自动生成路由树
    styles.css              # 全局样式 + 设计系统变量
    routes/
      __root.tsx            # 根路由（Shell + QueryClientProvider）
      index.tsx             # 首页 / 命令中心
      docs.tsx              # 文档中心
      library.tsx           # 论文库列表
      library.$paperId.tsx  # 论文详情
      search.tsx            # RAG 搜索
      settings.tsx          # 设置
      workspace.tsx         # 工作空间仪表盘
    components/
      hermes/
        Shell.tsx           # 布局 Shell（Sidebar + TopBar + main）
        Sidebar.tsx         # 左侧导航栏
        TopBar.tsx          # 顶部导航栏
        CommandPrompt.tsx   # 首页命令输入组件
      ui/                   # shadcn/ui 组件（40+ 个）
    lib/
      utils.ts              # cn() 工具函数
      papers.ts             # 论文数据类型与 mock 数据
      error-capture.ts      # SSR 错误捕获
      error-page.ts         # 错误页面 HTML 渲染
    hooks/
      use-mobile.tsx        # 移动端断点 Hook
```

## 变更记录 (Changelog)

| 日期 | 操作 | 说明 |
|------|------|------|
| 2026-05-09 | 创建 | 初次扫描生成 |
