# FastClaw Agent 配置文件

本目录包含三个（实际生效）+ 一个备用 FastClaw Agent 的完整身份文件，
用于 Warmth Connect Portal 的 AI 功能。

## v2 重要变更：飞书 → 后端数据库

> 本次更新统一把所有"写入飞书多维表格"的 skill（`larkcli-bitable-*` 系列、`larkcli-wiki-*`、
> 旧版 `pdf-backfill`）替换为 **`backend-*` 系列**，全部通过后端 REST API
> （`http://localhost:8787`）读写本地 SQLite 数据库（`data/app.db`）。
>
> 详细差异说明见：`F:\Hermes\hermes_skill\openclaw-main\MIGRATION_GUIDE_LARK_TO_BACKEND_DB.md`

## 三个生效的 Agent

| Agent ID | 显示名 | 别名（IDENTITY 中文） | 职责 |
|----------|--------|--------------------|------|
| `agt_f908ad32af3120090a37` | researcher | 论文搜索官 | 搜索论文 + 下载 PDF + 入库 |
| `agt_18b2eb56cb44f511848e` | paperanalyse | 论文分析官 | 6 字段结构化分析 + 写入数据库 |
| `agt_44d05b7677054cebfdad` | deploy | 论文部署官 | 部署到 GPU + 训练 + 监控 + 复现记录 |

> `rag-assistant`（单篇论文深度问答）通常运行在前端 RAG 模块中，不一定单独建 agent，
> 但配置文件保留作为参考。

## 目录结构

```
fastclaw-agents/
├── paper-searcher/       ← researcher agent (论文搜索 + 下载 + 入库)
│   ├── SOUL.md
│   ├── IDENTITY.md
│   ├── USER.md
│   ├── TOOLS.md          ← 已更新：列出 backend-* skill
│   └── AGENTS.md
│
├── paper-analyzer/       ← paperanalyse agent (论文结构化分析)
│   ├── SOUL.md
│   ├── IDENTITY.md
│   ├── USER.md
│   ├── TOOLS.md          ← 已更新：列出 backend-* skill
│   └── AGENTS.md
│
├── paper-deployer/       ← deploy agent (论文部署 + 训练 + 监控)
│   ├── SOUL.md
│   ├── IDENTITY.md
│   ├── USER.md
│   ├── TOOLS.md          ← 已更新：列出 backend-* skill
│   └── AGENTS.md
│
├── rag-assistant/        ← 备用：单篇论文深度问答（一般跑在前端）
│   ├── SOUL.md
│   ├── IDENTITY.md
│   ├── USER.md
│   ├── TOOLS.md
│   └── AGENTS.md
│
├── install-skills-per-agent.bat   ← 已更新：清理旧版 + 安装 backend-* skill
├── upload-all.bat                  ← 上传 IDENTITY/SOUL/TOOLS 等给 fastclaw
├── setup-agents.bat                ← 一键创建 agent
├── install-fastclaw-autostart.bat
└── uninstall-fastclaw-autostart.bat
```

## 各 Agent 已装的 Skill 包（v2）

### researcher / paper-searcher（论文搜索官）
- `literature-search`
- `literature-search-openalex`
- `academic-deep-research`
- `google-scholar-search-skill`
- `paper-ingest-phase1`（v2 后端 API 版）
- **`backend-pdf-backfill`**（替代 `pdf-backfill`）

### paperanalyse / paper-analyzer（论文分析官）
- `paper-summarize-academic`
- `literature-review`
- `pdf-caption-first-key-figure-extraction`
- `slt-relatedwork-strict-inpaper`
- **`backend-abstract-sentence-extract`**（替代 `larkcli-bitable-abstract-sentence-extract`）
- **`backend-abstract-wash`**（替代 `larkcli-bitable-abstract-wash`）
- **`backend-tag-backfill`**（替代 `larkcli-bitable-lite-tag-backfill`）
- **`backend-principle-one-sentence`**（替代 `larkcli-bitable-principle-one-sentence`）
- **`backend-three-field-wash`**（替代 `larkcli-bitable-three-field-wash`）
- **`backend-doc-authoring`**（替代 `larkcli-wiki-doc-authoring`）

### deploy / paper-deployer（论文部署官）
- `paper-code-finder`（v2 后端 API 版）
- `paper-repo-search-methods`
- `slr-paper-reproduction-setup`
- **`backend-repo-backfill`**（替代 `larkcli-bitable-repo-backfill`）
- **`backend-reproduction-tracker`**（替代 `larkcli-bitable-reproduction-tracker`）

## 使用方法

### 一键安装/更新 skill 包（推荐）

```cmd
F:\Hermes\warmth-connect-portal\backend\docs\fastclaw-agents\install-skills-per-agent.bat
```

该脚本会：
1. 清理三个 agent 中所有旧版飞书相关 skill（`larkcli-*` / 旧 `pdf-backfill`）
2. 把新版 `backend-*` skill 拷到对应 agent 目录
3. 同时更新非飞书的通用 skill

### 上传 Agent 配置文件（IDENTITY/SOUL/TOOLS）

通过 Web UI（推荐）：
1. 打开 http://localhost:18953
2. 进入对应 Agent → Customize 页面
3. 逐个复制粘贴每个 .md 文件的内容到对应的文本框
4. 点 Save

或通过 CLI（`upload-all.bat`）：
```cmd
F:\Hermes\warmth-connect-portal\backend\docs\fastclaw-agents\upload-all.bat
```

## 文件说明（FastClaw 加载顺序）

| 文件 | 作用 | 必填 |
|------|------|------|
| SOUL.md | 人格、语言偏好、核心原则 | ✅ |
| IDENTITY.md | Agent 名称、角色描述 | ✅ |
| USER.md | 当前对话者画像 | 推荐 |
| TOOLS.md | 工具使用文档（API 接口等） | ✅ |
| AGENTS.md | 多 Agent 协作规则 | 推荐 |

## 后端 API 速查

| 操作 | 端点 |
|------|------|
| 健康检查 | `GET /health` |
| 创建论文 | `POST /api/papers` |
| 列表/搜索 | `GET /api/papers?keyword=xxx&field=SLT&limit=500` |
| 论文详情 | `GET /api/papers/:id/detail` |
| 更新论文 | `PATCH /api/papers/:id` |
| 删除论文 | `DELETE /api/papers/:id` |
| 上传 PDF | `POST /api/papers/:id/pdf`（multipart, field=`file`） |
| 获取 PDF | `GET /api/papers/:id/pdf` |
| 写入分析 | `PATCH /api/papers/:id/analysis` |
| 设备列表 | `GET /api/devices` |
| 更新设备 | `PATCH /api/devices/:id` |
| 复现记录列表 | `GET /api/reproduction-records` |
| 创建复现 | `POST /api/reproduction-records` |
| 更新复现 | `PATCH /api/reproduction-records/:id` |

## 字段命名约定

后端使用英文 camelCase（与飞书的中文字段名不同），常见映射：

| 飞书旧字段 | 后端字段 | 表 |
|----------|---------|---|
| 标题 | `title` | papers |
| 摘要 | `abstract` | papers |
| 领域 | `field` | papers（待扩展为 JSON 数组） |
| 来源 | `source` | papers |
| 发表年 | `publishedYear` (int) | papers |
| 原链接 | `paperUrl` | papers |
| 代码库 | `repoUrl` | papers |
| 地址(PDF) | `pdfStoragePath` (本地相对路径) | papers |
| 任务定义 | `taskDefinition` | paper_analysis |
| 研究问题 | `researchQuestions` | paper_analysis |
| 方法概述 | `methodOverview` | paper_analysis |
| 评价指标 | `metrics` | paper_analysis |
| 结果一句话 | `conclusion` | paper_analysis |
| 局限性 / 原理一句话 | `notes`（多用途，前缀区分） | paper_analysis |
| 复现指标 | `resultSummary` / `reproductionMetrics` | paper_reproduction_records |
| 训练修改记录 | `trainingNotes` | paper_reproduction_records |
| 训练机箱 | `deviceId` (关联 devices 表) | paper_reproduction_records |
| 训练方式 | `trainingMethod` | paper_reproduction_records |
