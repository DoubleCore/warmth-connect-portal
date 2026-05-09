# 数据库与前端对齐设计文档

## 1. 文档目标

本文档只解决一个问题：

> 后端数据库如何设计，前端页面如何读取、展示和提交这些数据。

本文档不讨论指令中心、工具编排、长任务调度、权限网关、在线 PDF 阅读器等内容。

前端只通过后端 API 获取数据，不直接连接数据库。

---

## 2. 页面与数据关系总览

```text

首页

├── 指令入口卡片

├── 论文库入口卡片

└── 工作台入口卡片

论文库

├── 论文搜索区

├── 论文表

└── 论文简报与分析页

    ├── 左侧：论文摘要与简要信息区

    │   ├── 摘要

    │   ├── 标题

    │   ├── 作者

    │   ├── PDF 下载按钮

    │   ├── 领域

    │   ├── 来源

    │   └── 发表年

    └── 右侧：论文结构化分析区

        ├── 任务定义

        ├── 研究问题

        ├── 方法概述

        ├── 指标

        └── 结论 / 备注

RAG 问答

└── 针对指定论文进行问答

工作台

├── 设备管理

└── 论文训练列表管理 / 复现情况管理

```

---

## 3. 数据库设计原则

1. **前端页面有什么，数据库就保存什么**

   - 不提前设计复杂抽象。

   - 不为了未来能力增加过多中间表。

2. **论文是核心主表**

   - 论文基础信息统一存在 `papers` 表。

   - 论文分析结果单独存在 `paper_analysis` 表。

3. **PDF 不做在线阅读**

   - 数据库只保存 PDF 文件地址。

   - 前端只展示“下载 PDF”按钮。

4. **RAG 问答只绑定具体论文**

   - 问答记录必须带 `paper_id`。

   - 前端进入某篇论文后，可以针对该论文发起对话。

5. **工作台只做管理视图**

   - 设备管理对应 `devices` 表。

   - 论文复现 / 训练情况对应 `paper_reproduction_records` 表。

---

## 4. 核心数据表

## 4.1 papers：论文基础信息表

用于论文库、论文表、论文简报页左侧区域。

```sql

CREATE TABLE papers (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  title TEXT NOT NULL,

  authors TEXT[] DEFAULT '{}',

  abstract TEXT,

  field TEXT,

  source TEXT,

  published_year INTEGER,

  paper_url TEXT,

  pdf_url TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  updated_at TIMESTAMP DEFAULT NOW()

);

```

### 字段说明

| 字段 | 类型 | 前端用途 |

|---|---|---|

| id | UUID | 论文唯一 ID，用于跳转详情页 |

| title | TEXT | 论文标题 |

| authors | TEXT[] | 作者列表 |

| abstract | TEXT | 摘要，必须展示 |

| field | TEXT | 领域 |

| source | TEXT | 来源，例如 arXiv、ACL、NeurIPS |

| published_year | INTEGER | 发表年 |

| paper_url | TEXT | 原论文链接 |

| pdf_url | TEXT | PDF 下载地址 |

---

## 4.2 paper_analysis：论文结构化分析表

用于论文简报与分析页右侧区域。

```sql

CREATE TABLE paper_analysis (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,

  task_definition TEXT,

  research_questions TEXT,

  method_overview TEXT,

  metrics TEXT,

  conclusion TEXT,

  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE (paper_id)

);

```

### 字段说明

| 字段 | 类型 | 前端用途 |

|---|---|---|

| paper_id | UUID | 绑定论文 |

| task_definition | TEXT | 任务定义 |

| research_questions | TEXT | 研究问题 |

| method_overview | TEXT | 方法概述 |

| metrics | TEXT | 指标 |

| conclusion | TEXT | 结论 |

| notes | TEXT | 备注 |

---

## 4.3 rag_conversations：RAG 对话会话表

用于保存某篇论文下的一次问答会话。

```sql

CREATE TABLE rag_conversations (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,

  title TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  updated_at TIMESTAMP DEFAULT NOW()

);

```

### 字段说明

| 字段 | 类型 | 前端用途 |

|---|---|---|

| id | UUID | 对话会话 ID |

| paper_id | UUID | 当前问答绑定的论文 |

| title | TEXT | 对话标题，可默认用第一条问题生成 |

---

## 4.4 rag_messages：RAG 对话消息表

用于保存用户问题和系统回答。

```sql

CREATE TABLE rag_messages (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id UUID NOT NULL REFERENCES rag_conversations(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),

  content TEXT NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()

);

```

### 字段说明

| 字段 | 类型 | 前端用途 |

|---|---|---|

| conversation_id | UUID | 绑定对话 |

| role | TEXT | user / assistant |

| content | TEXT | 消息正文 |

| created_at | TIMESTAMP | 消息时间 |

---

## 4.5 devices：设备管理表

用于工作台的设备管理页面。

```sql

CREATE TABLE devices (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,

  device_type TEXT,

  status TEXT NOT NULL DEFAULT 'idle',

  location TEXT,

  description TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  updated_at TIMESTAMP DEFAULT NOW()

);

```

### status 建议枚举

```text

idle       空闲

running    使用中

offline    离线

error      异常

```

### 字段说明

| 字段 | 类型 | 前端用途 |

|---|---|---|

| id | UUID | 设备 ID |

| name | TEXT | 设备名称 |

| device_type | TEXT | 设备类型 |

| status | TEXT | 当前状态 |

| location | TEXT | 设备位置 |

| description | TEXT | 备注说明 |

---

## 4.6 paper_reproduction_records：论文复现情况表

用于工作台的论文训练列表管理 / 复现情况管理。

```sql

CREATE TABLE paper_reproduction_records (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,

  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'not_started',

  progress INTEGER DEFAULT 0,

  result_summary TEXT,

  artifact_url TEXT,

  started_at TIMESTAMP,

  finished_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),

  updated_at TIMESTAMP DEFAULT NOW()

);

```

### status 建议枚举

```text

not_started   未开始

running       进行中

success       成功

failed        失败

paused        暂停

```

### 字段说明

| 字段 | 类型 | 前端用途 |

|---|---|---|

| paper_id | UUID | 绑定论文 |

| device_id | UUID | 使用的设备 |

| status | TEXT | 复现状态 |

| progress | INTEGER | 进度，0 到 100 |

| result_summary | TEXT | 结果摘要 |

| artifact_url | TEXT | 结果文件地址 |

| started_at | TIMESTAMP | 开始时间 |

| finished_at | TIMESTAMP | 结束时间 |

---

## 5. 前端页面与 API 对齐

## 5.1 论文库页面

### 页面功能

```text

论文库

├── 搜索框

├── 领域筛选

├── 来源筛选

├── 年份筛选

└── 论文表

```

### 前端需要的字段

```ts

type PaperListItem = {

  id: string;

  title: string;

  authors: string[];

  field: string | null;

  source: string | null;

  publishedYear: number | null;

  paperUrl: string | null;

  pdfUrl: string | null;

};

```

### API

```http

GET /api/papers

```

### Query 参数

| 参数 | 说明 |

|---|---|

| keyword | 按标题、作者、摘要搜索 |

| field | 领域筛选 |

| source | 来源筛选 |

| year | 年份筛选 |

| page | 当前页 |

| pageSize | 每页数量 |

### 返回示例

```json

{

  "items": [

    {

      "id": "paper-uuid",

      "title": "Example Paper Title",

      "authors": ["Alice", "Bob"],

      "field": "LLM Agent",

      "source": "arXiv",

      "publishedYear": 2024,

      "paperUrl": "https://example.com/paper",

      "pdfUrl": "https://example.com/paper.pdf"

    }

  ],

  "pagination": {

    "page": 1,

    "pageSize": 20,

    "total": 128

  }

}

```

---

## 5.2 论文简报与分析页

### 页面结构

```text

论文简报与分析页

├── 左侧：论文摘要与简要信息区

└── 右侧：论文结构化分析区

```

### 左侧：论文摘要与简要信息区

前端必须展示：

```text

摘要

标题

作者

PDF 下载按钮

领域

来源

发表年

论文链接

```

### 右侧：论文结构化分析区

前端展示：

```text

任务定义

研究问题

方法概述

指标

结论 / 备注

```

### API

```http

GET /api/papers/:paperId/detail

```

### 返回示例

```json

{

  "paper": {

    "id": "paper-uuid",

    "title": "Example Paper Title",

    "authors": ["Alice", "Bob"],

    "abstract": "This paper proposes...",

    "field": "LLM Agent",

    "source": "arXiv",

    "publishedYear": 2024,

    "paperUrl": "https://example.com/paper",

    "pdfUrl": "https://example.com/paper.pdf"

  },

  "analysis": {

    "taskDefinition": "The paper studies...",

    "researchQuestions": "How to...",

    "methodOverview": "The method uses...",

    "metrics": "Accuracy, F1, BLEU...",

    "conclusion": "The paper shows...",

    "notes": "Optional notes."

  }

}

```

---

## 5.3 PDF 下载

PDF 不做页面内阅读，只提供下载按钮。

### API

```http

GET /api/papers/:paperId/pdf

```

### 前端行为

```text

用户点击“下载 PDF”

↓

浏览器打开下载链接

↓

后端返回 PDF 文件或重定向到对象存储地址

```

### 后端返回方式

可以二选一：

#### 方式 A：后端重定向

```http

302 Location: https://object-storage.example.com/paper.pdf

```

#### 方式 B：后端直接返回文件

```http

Content-Type: application/pdf

Content-Disposition: attachment; filename="paper.pdf"

```

---

## 5.4 RAG 问答页面

### 页面功能

```text

RAG 问答

├── 当前论文信息

├── 对话消息列表

└── 输入框

```

### 前端需要先知道当前论文

```ts

type CurrentRagPaper = {

  id: string;

  title: string;

  authors: string[];

};

```

### 创建会话

```http

POST /api/papers/:paperId/rag/conversations

```

### 请求体

```json

{

  "title": "关于方法部分的问题"

}

```

### 返回

```json

{

  "id": "conversation-uuid",

  "paperId": "paper-uuid",

  "title": "关于方法部分的问题"

}

```

### 获取消息列表

```http

GET /api/rag/conversations/:conversationId/messages

```

### 返回

```json

{

  "items": [

    {

      "id": "message-uuid",

      "role": "user",

      "content": "这篇论文的核心方法是什么？",

      "createdAt": "2026-05-09T10:00:00Z"

    },

    {

      "id": "message-uuid",

      "role": "assistant",

      "content": "这篇论文的核心方法是...",

      "createdAt": "2026-05-09T10:00:05Z"

    }

  ]

}

```

### 发送问题

```http

POST /api/rag/conversations/:conversationId/messages

```

### 请求体

```json

{

  "content": "这篇论文用了什么指标？"

}

```

### 返回

```json

{

  "userMessage": {

    "id": "message-user-uuid",

    "role": "user",

    "content": "这篇论文用了什么指标？"

  },

  "assistantMessage": {

    "id": "message-assistant-uuid",

    "role": "assistant",

    "content": "这篇论文主要使用了..."

  }

}

```

---

## 5.5 工作台：设备管理

### 页面功能

```text

设备管理

├── 设备列表

├── 设备状态

└── 设备备注

```

### API

```http

GET /api/devices

```

### 返回示例

```json

{

  "items": [

    {

      "id": "device-uuid",

      "name": "GPU-Server-01",

      "deviceType": "GPU Server",

      "status": "idle",

      "location": "Lab A",

      "description": "A100 server"

    }

  ]

}

```

### 新建设备

```http

POST /api/devices

```

### 请求体

```json

{

  "name": "GPU-Server-01",

  "deviceType": "GPU Server",

  "status": "idle",

  "location": "Lab A",

  "description": "A100 server"

}

```

---

## 5.6 工作台：论文复现情况管理

### 页面功能

```text

论文复现情况管理

├── 论文标题

├── 当前状态

├── 使用设备

├── 进度

├── 结果摘要

└── 结果文件

```

### API

```http

GET /api/reproduction-records

```

### 返回示例

```json

{

  "items": [

    {

      "id": "record-uuid",

      "paper": {

        "id": "paper-uuid",

        "title": "Example Paper Title"

      },

      "device": {

        "id": "device-uuid",

        "name": "GPU-Server-01"

      },

      "status": "running",

      "progress": 45,

      "resultSummary": null,

      "artifactUrl": null,

      "startedAt": "2026-05-09T10:00:00Z",

      "finishedAt": null

    }

  ]

}

```

### 新建复现记录

```http

POST /api/reproduction-records

```

### 请求体

```json

{

  "paperId": "paper-uuid",

  "deviceId": "device-uuid",

  "status": "not_started",

  "progress": 0

}

```

### 更新复现记录

```http

PATCH /api/reproduction-records/:recordId

```

### 请求体

```json

{

  "status": "success",

  "progress": 100,

  "resultSummary": "Successfully reproduced main result.",

  "artifactUrl": "https://example.com/result.zip"

}

```

---

## 6. 前端路由与数据接口对应

| 前端路由 | 页面 | 使用 API |

|---|---|---|

| `/` | 首页 | 可无 API |

| `/papers` | 论文库 | `GET /api/papers` |

| `/papers/:paperId` | 论文简报与分析页 | `GET /api/papers/:paperId/detail` |

| `/papers/:paperId/rag` | 指定论文 RAG 问答 | `POST /api/papers/:paperId/rag/conversations`、`GET/POST /api/rag/conversations/:id/messages` |

| `/workspace/devices` | 设备管理 | `GET/POST /api/devices` |

| `/workspace/reproduction` | 论文复现情况管理 | `GET/POST/PATCH /api/reproduction-records` |

---

## 7. 前端组件与数据字段对应

## 7.1 PaperTable

| UI 字段 | 数据字段 |

|---|---|

| 标题 | `paper.title` |

| 作者 | `paper.authors` |

| 领域 | `paper.field` |

| 来源 | `paper.source` |

| 发表年 | `paper.publishedYear` |

| 论文链接 | `paper.paperUrl` |

| PDF 下载 | `paper.pdfUrl` 或 `/api/papers/:id/pdf` |

---

## 7.2 PaperBriefPanel

左侧论文摘要与简要信息区。

| UI 字段 | 数据字段 |

|---|---|

| 摘要 | `paper.abstract` |

| 标题 | `paper.title` |

| 作者 | `paper.authors` |

| PDF 下载按钮 | `paper.pdfUrl` |

| 领域 | `paper.field` |

| 来源 | `paper.source` |

| 发表年 | `paper.publishedYear` |

| 论文链接 | `paper.paperUrl` |

---

## 7.3 PaperAnalysisPanel

右侧结构化分析区。

| UI 字段 | 数据字段 |

|---|---|

| 任务定义 | `analysis.taskDefinition` |

| 研究问题 | `analysis.researchQuestions` |

| 方法概述 | `analysis.methodOverview` |

| 指标 | `analysis.metrics` |

| 结论 | `analysis.conclusion` |

| 备注 | `analysis.notes` |

---

## 7.4 RagChatPanel

| UI 字段 | 数据字段 |

|---|---|

| 当前论文标题 | `paper.title` |

| 消息角色 | `message.role` |

| 消息内容 | `message.content` |

| 消息时间 | `message.createdAt` |

---

## 7.5 DeviceTable

| UI 字段 | 数据字段 |

|---|---|

| 设备名称 | `device.name` |

| 类型 | `device.deviceType` |

| 状态 | `device.status` |

| 位置 | `device.location` |

| 描述 | `device.description` |

---

## 7.6 ReproductionTable

| UI 字段 | 数据字段 |

|---|---|

| 论文标题 | `record.paper.title` |

| 设备 | `record.device.name` |

| 状态 | `record.status` |

| 进度 | `record.progress` |

| 结果摘要 | `record.resultSummary` |

| 结果文件 | `record.artifactUrl` |

| 开始时间 | `record.startedAt` |

| 结束时间 | `record.finishedAt` |

---

## 8. 推荐后端目录结构

```text

backend/

├── src/

│   ├── app.ts

│   ├── db/

│   │   ├── client.ts

│   │   └── migrations/

│   ├── modules/

│   │   ├── papers/

│   │   │   ├── papers.routes.ts

│   │   │   ├── papers.controller.ts

│   │   │   ├── papers.service.ts

│   │   │   └── papers.repository.ts

│   │   ├── rag/

│   │   │   ├── rag.routes.ts

│   │   │   ├── rag.controller.ts

│   │   │   ├── rag.service.ts

│   │   │   └── rag.repository.ts

│   │   ├── devices/

│   │   │   ├── devices.routes.ts

│   │   │   ├── devices.controller.ts

│   │   │   ├── devices.service.ts

│   │   │   └── devices.repository.ts

│   │   └── reproduction/

│   │       ├── reproduction.routes.ts

│   │       ├── reproduction.controller.ts

│   │       ├── reproduction.service.ts

│   │       └── reproduction.repository.ts

│   └── shared/

│       ├── dto.ts

│       ├── errors.ts

│       └── pagination.ts

└── package.json

```

---

## 9. 推荐前端目录结构

```text

frontend/

├── src/

│   ├── pages/

│   │   ├── HomePage.tsx

│   │   ├── PaperLibraryPage.tsx

│   │   ├── PaperDetailPage.tsx

│   │   ├── PaperRagPage.tsx

│   │   ├── DeviceManagementPage.tsx

│   │   └── ReproductionManagementPage.tsx

│   ├── components/

│   │   ├── papers/

│   │   │   ├── PaperSearchBar.tsx

│   │   │   ├── PaperTable.tsx

│   │   │   ├── PaperBriefPanel.tsx

│   │   │   └── PaperAnalysisPanel.tsx

│   │   ├── rag/

│   │   │   └── RagChatPanel.tsx

│   │   └── workspace/

│   │       ├── DeviceTable.tsx

│   │       └── ReproductionTable.tsx

│   ├── api/

│   │   ├── papers.ts

│   │   ├── rag.ts

│   │   ├── devices.ts

│   │   └── reproduction.ts

│   └── types/

│       ├── paper.ts

│       ├── rag.ts

│       ├── device.ts

│       └── reproduction.ts

```

---

## 10. MVP 实现顺序

## 第一阶段：论文库

1. 建 `papers` 表

2. 实现 `GET /api/papers`

3. 实现论文搜索和论文表

4. 实现 `GET /api/papers/:paperId/detail`

5. 实现论文摘要与简要信息区

6. 实现 PDF 下载按钮

## 第二阶段：论文分析

1. 建 `paper_analysis` 表

2. 实现论文结构化分析展示

3. 支持后台写入或人工编辑分析内容

## 第三阶段：RAG 问答

1. 建 `rag_conversations`

2. 建 `rag_messages`

3. 实现指定论文问答页面

4. 保存用户问题和系统回答

## 第四阶段：工作台

1. 建 `devices`

2. 建 `paper_reproduction_records`

3. 实现设备管理页面

4. 实现论文复现情况管理页面

---

## 11. 验收标准

1. 前端论文库可以展示论文表。

2. 论文表可以搜索、筛选、分页。

3. 点击论文后进入论文简报与分析页。

4. 左侧展示摘要和论文简要信息。

5. 左侧不展示 PDF 阅读器。

6. PDF 只通过按钮下载。

7. 右侧展示结构化分析内容。

8. RAG 问答必须绑定具体论文。

9. 工作台可以展示设备列表。

10. 工作台可以展示论文复现情况。

11. 前端所有展示字段都能在数据库中找到对应字段。

12. API 返回字段命名和前端 TypeScript 类型一致。

---

## 12. 最终边界

本设计只关注：

```text

数据库

API

前端页面

字段映射

```

