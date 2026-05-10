# Paper Watcher 三层技术架构方案

版本：v0.1  
目标：明确 Paper Watcher MVP 的三层架构、职责边界、数据流与第一版落地范围。

---

## 1. 项目定位

Paper Watcher 是一个面向科研论文管理的轻量级工作台。

第一版目标：

- 论文信息收集
- 论文数据库展示
- Abstract 知识库
- RAG 问答
- 前端工作台展示
- Herness 指令入口

核心原则：

> Herness 负责执行任务，后端负责存储和 RAG，前端负责展示和交互。

---

## 2. 总体三层架构

系统分为三层：

```text
第一层：Herness
后端的后端，负责任务执行、指令兜底、自动化流程。

第二层：Paper Watcher Backend
负责数据库、Abstract RAG、接口服务和仪表盘数据。

第三层：Frontend
负责落地页、指令中心、论文表、阅读页、分析页和工作台展示。
```

整体关系：

```text
用户
 ↓
Frontend
 ↓
Paper Watcher Backend
 ↓
Database / Abstract RAG

Herness
 ↓
调用 Backend API
 ↓
写入论文数据 / 触发 RAG / 获取问答结果
```

---

## 3. 第一层：Herness 层

### 3.1 定位

Herness 是系统的底层任务执行者，也可以理解为“后端的后端”。

它不负责页面展示，也不直接承担数据库管理页面的工作。

### 3.2 主要职责

Herness 负责：

- 接收自然语言指令
- 执行自动化任务
- 定时抓取论文信息
- 调用后端接口写入论文
- 调用后端接口触发 Abstract RAG 索引
- 调用后端问答接口获取知识库回答
- 作为系统兜底 Agent

### 3.3 不负责的内容

Herness 不负责：

- 前端页面展示
- 论文表格展示
- 数据库管理 UI
- 向量库内部管理
- 页面路由
- 用户界面交互细节

### 3.4 与后端的关系

Herness 通过 HTTP API 与 Paper Watcher Backend 通信。

典型调用：

```text
Herness 抓到论文
  ↓
POST /api/paper/papers
  ↓
后端写入数据库

Herness 抓完一批论文
  ↓
POST /api/paper/rag/index
  ↓
后端将 abstract 写入向量库

用户向 Herness 提问
  ↓
POST /api/paper/ask
  ↓
后端返回基于 abstract 的 RAG 回答
```

---

## 4. 第二层：Paper Watcher Backend

### 4.1 定位

Paper Watcher Backend 是系统的数据层和服务层。

它的核心任务是：

> 管理论文数据库，并基于论文 abstract 提供轻量 RAG 能力。

### 4.2 主要职责

后端负责：

- 论文数据入库
- 论文数据查询
- Dashboard 统计数据
- Abstract 向量化
- Abstract RAG 检索
- RAG 问答接口
- 系统事件记录
- 问答日志记录

### 4.3 不负责的内容

后端第一版不负责：

- 自动抓取 ArXiv
- 定时任务
- PDF 全文解析
- 图表解析
- 公式识别
- 复杂多 Agent 编排
- 复现代码生成
- 前端页面样式

### 4.4 后端技术建议

第一版建议使用：

```text
FastAPI                  接口服务
SQLite                   论文数据库
Chroma                   Abstract 向量库
SentenceTransformer      本地 embedding
OpenAI-compatible API    问答生成
```

### 4.5 后端目录建议

```text
/opt/paper-watcher/
├── app/
│   ├── server.py              # FastAPI 服务入口
│   ├── config.py              # 配置
│   ├── db.py                  # SQLite 数据库操作
│   ├── schemas.py             # 请求和响应模型
│   ├── abstract_indexer.py    # Abstract 向量化
│   ├── rag.py                 # RAG 检索
│   ├── llm.py                 # LLM 问答
│   └── events.py              # 系统事件记录
├── data/
│   ├── papers.db              # SQLite 数据库
│   └── chroma/                # Chroma 向量库
├── logs/
├── venv/
└── .env
```

---

## 5. 第三层：Frontend

### 5.1 定位

Frontend 是系统展示层。

它不负责真正的论文处理，也不直接操作数据库。

它的核心任务是：

> 把 Herness、数据库、RAG 和论文信息用页面展示出来。

### 5.2 页面结构

第一版前端包括以下页面：

```text
落地页
|
进入工作台
|
├── Herness 指令中心
├── 论文表
│   ├── 论文阅读页
│   └── 论文分析页
└── 工作台
    ├── RAG 人机对话
    ├── 设备管理
    └── 论文处理列表
```

---

## 6. 前端页面说明

### 6.1 落地页

落地页用于展示产品整体形象。

主要模块：

- Hero 主视觉
- 三层架构展示
- 功能卡片
- 系统预览
- 进入工作台按钮

核心文案方向：

```text
基于 Herness 的科研论文智能工作台。
支持论文收集、数据库展示、Abstract 知识库与 RAG 问答。
```

---

### 6.2 Herness 指令中心

这是前端的主入口之一。

页面形式类似 Lovable 的简洁输入框。

展示内容：

- 大输入框
- 提示语：今天你想做什么？
- 快捷指令按钮
- Herness 状态
- 最近任务记录

示例快捷指令：

- 查看今日新增论文
- 总结最近论文方向
- 查询某个研究主题
- 打开论文库

---

### 6.3 论文表页面

论文表是数据库展示页。

字段包括：

- 标题
- PDF
- 领域
- 来源
- 发表年
- 论文链接
- 论文摘要

操作包括：

- 查看详情
- 打开 PDF
- 查看分析

---

### 6.4 论文阅读页面

从论文表点击进入。

展示内容：

- 论文标题
- 作者
- 来源
- 发表年份
- PDF 链接
- 论文链接
- 完整摘要

这个页面只负责展示论文基础信息。

---

### 6.5 论文分析页面

论文分析页面展示结构化分析结果。

第一版只保留以下卡片：

- 摘要
- 任务定义
- 研究的问题
- 方法概述
- 指标

说明：

> 第一版分析可以基于 abstract 生成，不要求全文解析。

---

### 6.6 工作台页面

工作台参考 Scimate 的控制台感觉，但只保留最小模块。

包含：

- RAG 人机对话
- 设备管理
- 论文处理列表

---

### 6.7 RAG 人机对话

该页面只用于知识库问答。

展示内容：

- 聊天窗口
- 问题输入框
- 回答内容
- 引用论文列表

注意：

> RAG 回答只基于已入库论文 abstract。

---

### 6.8 设备管理

第一版可以作为占位页面。

展示内容：

- 设备名称
- 状态
- 最后更新时间

暂时不需要真实控制设备。

---

### 6.9 论文处理列表

该页面用于展示论文处理状态。

第一版建议叫：

> 论文处理列表

字段包括：

- 论文标题
- 处理类型
- 状态
- 时间

处理类型可以是：

- RAG 入库
- 论文分析
- 摘要生成

---

## 7. 核心数据流

### 7.1 论文入库流程

```text
Herness 获取论文信息
  ↓
调用 Backend API
  ↓
Backend 写入 papers 表
  ↓
论文出现在前端论文表
```

### 7.2 Abstract RAG 流程

```text
论文已入库
  ↓
Backend 读取 abstract
  ↓
生成 embedding
  ↓
写入 Chroma
  ↓
论文 rag_status 变为 indexed
```

### 7.3 问答流程

```text
用户在前端或 Herness 中提问
  ↓
调用 /api/paper/ask
  ↓
Backend 检索相关 abstract
  ↓
LLM 基于检索结果生成回答
  ↓
返回答案和引用论文
```

### 7.4 前端展示流程

```text
Frontend 请求 Backend API
  ↓
获取论文列表 / 详情 / RAG 回答 / Dashboard 数据
  ↓
页面展示
```

---

## 8. 后端核心接口

第一版后端需要提供以下接口：

```text
GET  /api/paper/health
GET  /api/paper/dashboard

POST /api/paper/papers
POST /api/paper/papers/batch
GET  /api/paper/papers
GET  /api/paper/papers/{paper_id}

POST /api/paper/rag/index
POST /api/paper/rag/reindex/{paper_id}

POST /api/paper/ask

GET  /api/paper/events
GET  /api/paper/qa-logs
```

---

## 9. 数据库核心表

第一版建议保留以下表：

```text
papers
rag_chunks
qa_logs
system_events
```

### 9.1 papers

存储论文基础信息。

核心字段：

- id
- arxiv_id
- title
- authors
- abstract
- pdf_url
- source_url
- published_at
- source
- rag_status
- summary_status
- created_at
- updated_at

### 9.2 rag_chunks

存储进入 RAG 的内容。

第一版只存 abstract。

核心字段：

- id
- paper_id
- chunk_type
- chunk_text
- chroma_id
- created_at

### 9.3 qa_logs

记录问答历史。

核心字段：

- id
- question
- answer
- source_paper_ids
- asked_by
- created_at

### 9.4 system_events

记录系统事件。

核心字段：

- id
- event_type
- message
- payload_json
- created_at

---

## 10. 第一版实现范围

### 10.1 第一版要做

- 落地页
- Herness 指令中心页面
- 论文表页面
- 论文阅读页面
- 论文分析页面
- 工作台页面
- RAG 人机对话页面
- 后端论文入库接口
- 后端论文查询接口
- Abstract RAG 索引接口
- Abstract RAG 问答接口

### 10.2 第一版不做

- PDF 全文解析
- 图表解析
- 公式识别
- 复杂知识图谱
- 自动复现
- 真实设备控制
- 多用户权限
- 复杂任务队列
- 前端复杂可视化

---

## 11. 职责边界总结

| 层级 | 负责什么 | 不负责什么 |
|---|---|---|
| Herness | 自动化、任务执行、指令兜底 | 页面展示、数据库 UI |
| Backend | 数据库、Abstract RAG、API | 定时抓取、前端样式、PDF 解析 |
| Frontend | 页面展示、用户交互 | 数据处理、RAG 内部逻辑、任务执行 |

---

## 12. MVP 成功标准

第一版完成后，需要达到：

1. 用户能进入落地页。
2. 用户能打开 Herness 指令中心。
3. 前端能展示论文表。
4. 用户能查看论文详情。
5. 用户能查看论文分析卡片。
6. 用户能在 RAG 页面提问。
7. 问答结果能返回引用论文。
8. 后端能存储论文 abstract。
9. 后端能把 abstract 写入向量库。
10. Herness 能通过 API 写入论文和调用问答。

---

## 13. 最终一句话架构说明

Paper Watcher 的三层架构是：

> Herness 作为底层任务执行和指令中心，Paper Watcher Backend 作为论文数据库与 Abstract RAG 服务，Frontend 作为面向用户的科研论文工作台展示层。
