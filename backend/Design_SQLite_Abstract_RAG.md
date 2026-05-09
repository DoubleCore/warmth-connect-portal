# SQLite + Abstract RAG 设计文档

## 1. 目标

本设计文档用于描述论文 RAG 模块的轻量实现方案。

当前目标不是做复杂论文全文阅读，也不是做完整后端权限系统，而是快速搭建一个可以工作的论文问答系统。

核心原则：

```text
轻量
可用
字段少
结构清晰
前端好接
后端好实现
```

本版本采用：

```text
SQLite
论文基础信息只保留 title + abstract
英文索引
Embedding 检索
大模型 API 生成回答
```

---

## 2. 不做什么

本版本明确不做以下内容：

```text
不解析 PDF 全文
不做 PDF 在线阅读
不做复杂权限控制
不做用户隔离
不做多租户
不做复杂任务队列
不做长任务编排
不做 Hermes / OpenClaw 工具链设计
不做设备调度逻辑
```

RAG 的知识来源只有论文的：

```text
title
abstract
```

---

## 3. 整体架构

```text
Frontend
  |
  | HTTP
  v
Backend API
  |
  | read / write
  v
SQLite Database
  |
  | title + abstract
  v
English Index + Embedding
  |
  | retrieved context
  v
LLM API
  |
  v
Answer + References
```

---

## 4. 数据来源

论文数据只保留两个核心字段：

```text
title
abstract
```

示例：

```json
{
  "title": "Attention Is All You Need",
  "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks..."
}
```

不保存作者、年份、来源、PDF、领域等字段。

如果后续前端需要展示更多论文信息，再单独扩展 `papers` 表。

---

## 5. SQLite 数据库设计

### 5.1 papers 表

用于保存论文基础信息。

```sql
CREATE TABLE papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER | 论文 ID |
| title | TEXT | 论文标题 |
| abstract | TEXT | 论文摘要 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

---

## 6. 英文索引设计

### 6.1 为什么需要英文索引

RAG 需要先从论文库中找到和用户问题相关的论文。

因为论文 title 和 abstract 基本是英文，所以第一版使用英文索引即可。

英文索引用于：

```text
关键词搜索
召回候选论文
提升检索速度
作为 embedding 检索的补充
```

---

### 6.2 SQLite FTS5 英文全文索引

使用 SQLite 的 FTS5 建立英文全文索引。

```sql
CREATE VIRTUAL TABLE paper_fts USING fts5(
  title,
  abstract,
  content='papers',
  content_rowid='id',
  tokenize='porter unicode61'
);
```

说明：

```text
FTS5      SQLite 内置全文搜索能力
porter    英文词干提取，例如 models / modeling / model 可归一
unicode61 基础英文分词 tokenizer
```

---

### 6.3 FTS 索引同步触发器

当 `papers` 表插入、更新、删除时，同步更新全文索引。

```sql
CREATE TRIGGER papers_ai AFTER INSERT ON papers BEGIN
  INSERT INTO paper_fts(rowid, title, abstract)
  VALUES (new.id, new.title, new.abstract);
END;

CREATE TRIGGER papers_ad AFTER DELETE ON papers BEGIN
  INSERT INTO paper_fts(paper_fts, rowid, title, abstract)
  VALUES ('delete', old.id, old.title, old.abstract);
END;

CREATE TRIGGER papers_au AFTER UPDATE ON papers BEGIN
  INSERT INTO paper_fts(paper_fts, rowid, title, abstract)
  VALUES ('delete', old.id, old.title, old.abstract);

  INSERT INTO paper_fts(rowid, title, abstract)
  VALUES (new.id, new.title, new.abstract);
END;
```

---

## 7. Embedding 设计

### 7.1 为什么还需要 Embedding

FTS 适合关键词匹配，但 RAG 更需要语义检索。

例如用户问：

```text
Which papers are about sequence modeling?
```

即使某篇论文没有完全出现这个短语，也可能在语义上相关。

因此第一版建议同时使用：

```text
FTS5 英文关键词索引
Embedding 语义向量
```

实际检索时可以：

```text
先用 FTS5 召回候选论文
再用 embedding 做相似度排序
```

这样比全量向量搜索更轻，也更适合 SQLite。

---

### 7.2 paper_embeddings 表

SQLite 本身没有内置向量类型，所以第一版可以把 embedding 存成 JSON 字符串。

```sql
CREATE TABLE paper_embeddings (
  paper_id INTEGER PRIMARY KEY,
  embedding_text TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| paper_id | INTEGER | 对应 papers.id |
| embedding_text | TEXT | 用于生成 embedding 的文本 |
| embedding_json | TEXT | embedding 数组 JSON |
| embedding_model | TEXT | 使用的 embedding 模型 |
| created_at | TEXT | 创建时间 |

---

### 7.3 embedding_text 格式

不要只放 abstract，建议把 title 和 abstract 拼在一起。

```text
Title: {title}

Abstract:
{abstract}
```

示例：

```text
Title: Attention Is All You Need

Abstract:
The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...
```

这样检索质量会比只放 abstract 更好。

---

## 8. RAG 写入流程

### 8.1 新增论文流程

```text
1. 前端提交 title + abstract
2. 后端写入 papers 表
3. SQLite trigger 自动同步 paper_fts
4. 后端拼接 embedding_text
5. 调用 embedding API
6. 将 embedding 写入 paper_embeddings
7. 返回论文 ID
```

---

### 8.2 新增论文 API

```http
POST /api/papers
```

请求：

```json
{
  "title": "Attention Is All You Need",
  "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks..."
}
```

返回：

```json
{
  "id": 1,
  "title": "Attention Is All You Need",
  "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks..."
}
```

---

## 9. RAG 查询流程

### 9.1 用户提问流程

```text
1. 用户输入问题
2. 后端对问题做英文关键词检索
3. 从 paper_fts 中召回候选论文
4. 后端调用 embedding API 生成 query embedding
5. 对候选论文的 embedding 做 cosine similarity
6. 选出 Top K 篇论文
7. 把 Top K 的 title + abstract 作为上下文
8. 调用大模型 API
9. 返回回答和引用论文
```

---

### 9.2 查询 API

```http
POST /api/rag/query
```

请求：

```json
{
  "question": "Which papers are related to Transformer architecture?",
  "top_k": 5
}
```

返回：

```json
{
  "answer": "The most relevant paper is 'Attention Is All You Need', which introduces the Transformer architecture...",
  "references": [
    {
      "id": 1,
      "title": "Attention Is All You Need",
      "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...",
      "score": 0.91
    }
  ]
}
```

---

## 10. 检索实现方案

### 10.1 FTS5 候选召回

```sql
SELECT 
  p.id,
  p.title,
  p.abstract,
  bm25(paper_fts) AS rank
FROM paper_fts
JOIN papers p ON p.id = paper_fts.rowid
WHERE paper_fts MATCH ?
ORDER BY rank
LIMIT 30;
```

说明：

```text
FTS5 先召回 30 篇候选论文
再用 embedding 从 30 篇里选 Top K
```

---

### 10.2 英文查询预处理

用户问题可能是自然语言，需要简单处理成 FTS 查询。

输入：

```text
Which papers are related to Transformer architecture?
```

可以提取关键词：

```text
papers related Transformer architecture
```

MVP 做法：

```text
直接使用用户问题作为 MATCH 查询
如果报错或匹配太少，再 fallback 到 LIKE 搜索
```

---

### 10.3 Embedding 相似度排序

从数据库取出候选论文的 `embedding_json` 后，在后端计算 cosine similarity。

伪代码：

```ts
function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

---

## 11. Prompt 设计

大模型 API 的输入应该包含：

```text
系统角色
用户问题
检索到的论文 title + abstract
回答要求
```

推荐 prompt：

```text
You are a research paper assistant.

You must answer the user's question only based on the provided paper titles and abstracts.
If the provided abstracts are not enough to answer the question, say that the abstracts do not provide enough information.

User question:
{question}

Relevant papers:

[1]
Title: {title}
Abstract: {abstract}

[2]
Title: {title}
Abstract: {abstract}

Answer requirements:
1. Answer the question directly.
2. Cite the paper numbers like [1], [2].
3. Do not invent details that are not in the abstracts.
```

---

## 12. 前端页面对接

### 12.1 论文录入页

用于录入论文 title 和 abstract。

页面结构：

```text
论文录入页
├── Title 输入框
├── Abstract 输入框
└── Submit 按钮
```

调用接口：

```text
POST /api/papers
```

---

### 12.2 论文列表页

展示已录入论文。

页面结构：

```text
论文列表页
├── 搜索框
├── 论文列表
│   ├── title
│   └── abstract preview
└── 点击查看详情
```

调用接口：

```text
GET /api/papers
GET /api/papers/search?q=xxx
```

---

### 12.3 RAG 问答页

页面结构：

```text
RAG 问答页
├── 问题输入框
├── Submit 按钮
├── AI 回答区
└── 引用论文区
    ├── title
    ├── abstract
    └── score
```

调用接口：

```text
POST /api/rag/query
```

---

## 13. API 汇总

### 13.1 创建论文

```http
POST /api/papers
```

请求：

```json
{
  "title": "string",
  "abstract": "string"
}
```

---

### 13.2 获取论文列表

```http
GET /api/papers
```

返回：

```json
{
  "items": [
    {
      "id": 1,
      "title": "string",
      "abstract": "string"
    }
  ]
}
```

---

### 13.3 搜索论文

```http
GET /api/papers/search?q=transformer
```

返回：

```json
{
  "items": [
    {
      "id": 1,
      "title": "string",
      "abstract": "string",
      "rank": -1.23
    }
  ]
}
```

---

### 13.4 RAG 问答

```http
POST /api/rag/query
```

请求：

```json
{
  "question": "string",
  "top_k": 5
}
```

返回：

```json
{
  "answer": "string",
  "references": [
    {
      "id": 1,
      "title": "string",
      "abstract": "string",
      "score": 0.91
    }
  ]
}
```

---

## 14. 推荐后端目录结构

```text
backend/
├── app/
│   ├── main.ts
│   ├── db/
│   │   ├── sqlite.ts
│   │   └── schema.sql
│   ├── papers/
│   │   ├── paper.routes.ts
│   │   ├── paper.service.ts
│   │   └── paper.repository.ts
│   ├── rag/
│   │   ├── rag.routes.ts
│   │   ├── rag.service.ts
│   │   ├── retriever.ts
│   │   └── prompt.ts
│   └── llm/
│       ├── embedding.client.ts
│       └── chat.client.ts
└── data/
    └── app.sqlite
```

---

## 15. 最小 MVP 实现顺序

### 第一步：SQLite 表

完成：

```text
papers
paper_fts
paper_embeddings
```

---

### 第二步：论文录入

完成：

```text
POST /api/papers
写入 title + abstract
自动建立 FTS 索引
调用 embedding API
保存 embedding
```

---

### 第三步：论文搜索

完成：

```text
GET /api/papers/search?q=xxx
基于 FTS5 搜索 title + abstract
```

---

### 第四步：RAG 问答

完成：

```text
POST /api/rag/query
FTS 召回
Embedding 排序
LLM API 生成回答
返回 answer + references
```

---

## 16. 调用方式说明

本版本不额外设计复杂安全机制。

默认假设：

```text
前端可以直接调用后端 API
后端可以直接调用 embedding API
后端可以直接调用 LLM API
后端可以直接读写 SQLite
```

部署时只需要保证 `.env` 中配置好大模型 API Key。

示例：

```env
LLM_API_KEY=your_api_key
EMBEDDING_MODEL=text-embedding-model
CHAT_MODEL=chat-model
SQLITE_PATH=./data/app.sqlite
```

---

## 17. 最终结论

本版本 RAG 系统只围绕一个最小闭环：

```text
title + abstract
  ↓
SQLite
  ↓
English FTS5 index
  ↓
Embedding
  ↓
LLM API
  ↓
RAG answer
```

前端只需要关心：

```text
录入论文
查看论文
搜索论文
RAG 提问
展示回答和引用
```

后端只需要关心：

```text
存 title + abstract
建英文索引
生成 embedding
检索相关 abstract
调用大模型 API
返回答案
```

这是当前最轻便、最容易落地的实现方式。
