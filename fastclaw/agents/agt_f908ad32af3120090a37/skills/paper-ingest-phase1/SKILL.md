---
name: paper-ingest-phase1
version: 2.0.0
description: "论文入库阶段 1：基础信息 + PDF 附件 + 摘要。从论文标题/链接出发，自动检索元数据、下载 PDF、通过 Warmth Connect Portal 后端 API 创建论文记录并上传附件。"
metadata:
  requires:
    tools: ["web_search", "exec"]
    backend: "http://localhost:8787"
---

# Paper Ingest Phase 1 — 基础信息 + PDF + 摘要（后端 API 版）

## 目标
给定论文标题、arXiv ID 或论文链接，完成 papers 表记录的创建，包含基础信息、PDF 附件和摘要。

## 适用场景
- 用户说"添加论文""入库""搜一下这篇论文并添加"
- 用户给出论文标题、arXiv 链接、DOI 等

## 后端服务约定
- 默认地址：`http://localhost:8787`
- 论文表：`papers`
- 分析表：`paper_analysis`（详情字段，阶段 2 写入）

## 完整字段映射

| API 字段 | 类型 | 阶段 | 说明 |
|---------|------|------|------|
| `title` | string | **阶段1** | 论文原始标题 |
| `authors` | string[] | **阶段1** | 作者列表 |
| `abstract` | string | **阶段1** | 中文翻译/总结摘要 |
| `field` | string | **阶段1** | 论文所属领域（CSLR/SLT/CV...） |
| `source` | string | **阶段1** | 会议/期刊名，**不带年份**（CVPR/ICCV/arXiv...） |
| `publishedYear` | int | **阶段1** | 年份（如 2025） |
| `paperUrl` | string(URL) | **阶段1** | 论文页面链接 |
| `pdfUrl` | string(URL) | **阶段1** | PDF 直链（外链） |
| `repoUrl` | string(URL) | **阶段1** | GitHub 仓库 |
| `pdfStoragePath` | string | **阶段1** | 由 PDF 上传接口自动写入 |

阶段 2 字段（写到 `paper_analysis` 表）：

| API 字段 (PATCH /api/papers/:id/analysis) | 说明 |
|------------------------------------------|------|
| `taskDefinition` | 研究问题/任务定义 |
| `researchQuestions` | 研究问题 |
| `methodOverview` | 方法概述 |
| `metrics` | 评估指标 |
| `conclusion` | 结论 / 结果一句话 |
| `notes` | 补充：局限性、复现难点、原理一句话等 |

## 执行步骤

### Step 1：检索论文元数据
1. 用 `web_search` 搜索论文标题
2. 从搜索结果中提取：标题、来源、年份、arXiv 链接、代码库链接
3. 判断领域（参考已入库论文的常见 `field` 值）

### Step 2：获取摘要
1. 从搜索结果中提取英文 abstract（arXiv / OpenReview 页面通常会返回）
2. 翻译为中文，保持信息完整
3. 格式：一段连续文本

### Step 3：下载 PDF
```bash
mkdir -p /tmp/ingest
cd /tmp/ingest
curl -sL -C - --max-time 120 -o "<safe-filename>.pdf" "https://arxiv.org/pdf/<arxiv-id>"
```
- 文件名用论文简称或 arxiv ID
- 验证文件头是 `%PDF-` 且 size > 10KB

### Step 4：创建论文记录

```bash
curl -X POST "http://localhost:8787/api/papers" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Uni-Sign: Toward Unified Sign Language Understanding at Scale",
    "authors": ["Zecheng Li", "Wengang Zhou", "Houqiang Li"],
    "abstract": "手语预训练因能提升各类手语理解（SLU）任务的表现而受到越来越多关注。为此，作者提出 Uni-Sign...",
    "field": "SLT",
    "source": "ICLR",
    "publishedYear": 2025,
    "paperUrl": "https://arxiv.org/abs/2501.15187",
    "pdfUrl": "https://arxiv.org/pdf/2501.15187",
    "repoUrl": "https://github.com/ZechengLi19/Uni-Sign"
  }'
```

成功响应：
```json
{
  "success": true,
  "data": {
    "id": "<PAPER_ID>",
    "title": "...",
    ...
  }
}
```

记录返回的 `data.id` 作为 paperId。

### Step 5：上传 PDF

```bash
curl -X POST "http://localhost:8787/api/papers/<PAPER_ID>/pdf" \
  -F "file=@/tmp/ingest/<safe-filename>.pdf"
```

### Step 6：回读验证
```bash
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq
```

确认：
- 所有字段已正确写入
- `paper.pdfStoragePath` 不为 null（说明 PDF 上传成功）

## 字段值规范

### `source` 字段（不带年份）
推荐选项：CVPR / ICCV / ECCV / TPAMI / IJCV / NeurIPS / ICLR / ICML / EMNLP / WACV / arXiv / CVF / OpenReview / ACL Anthology / ACM / Unknown

### `field` 字段
推荐：CSLR / SLT / Sign Language / Action Recognition / Multimodal Learning / Computer Vision / NLP / LLM / Speech Enhancement / ASR

### `publishedYear` 字段
**必须是 integer 类型**，不是字符串。zod 校验为 `z.number().int()`。

### URL 字段
所有 URL 字段必须是合法的 `https://...` 或 `http://...` 格式（zod `z.string().url()` 校验）。

## 错误处理

| 情况 | 处理 |
|------|------|
| 搜索不到论文 | 告知用户，不创建空记录 |
| 代码库找不到 | `repoUrl` 字段不传（默认 null） |
| PDF 下载失败 | 仍创建记录，告知用户 PDF 上传失败可后续补 |
| 后端 422 校验失败 | 检查字段类型（year 必须 int，URL 必须合法） |
| 后端 5xx | 检查后端日志，可能数据库连接异常 |
| arXiv 限流 | 改用 web_search 搜索摘要 |

## 前置条件
- 后端服务运行中（`curl http://localhost:8787/health` 返回 200）
- 网络可访问 arXiv / web_search

## 与旧版（飞书 Bitable 版）差异

| 维度 | 旧版（lark-cli） | 新版（后端 API） |
|------|-----------------|-----------------|
| 数据存储 | 飞书多维表格 | 本地 SQLite (`data/app.db`) |
| 创建命令 | `feishu_bitable_app_table_record action=create` | `POST /api/papers` |
| 字段命名 | 中文（如`标题`/`摘要`/`领域`） | 英文 camelCase（`title`/`abstract`/`field`） |
| URL 字段格式 | `{"link":"...", "text":"网站名"}` | 纯 URL 字符串 |
| 多选字段 | 飞书数组（如`领域: ["SLT","CSLR"]`） | 当前为单字符串（待后端扩展为 JSON 数组） |
| PDF 上传 | `lark-cli base +record-upload-attachment` | `POST /api/papers/<id>/pdf -F file=@...` |
| 来源字段 | `来源`（SingleSelect，避免带年份变体） | `source`（字符串） + `publishedYear`（int） |
| 字段动态创建 | 飞书自动 | 不需要（schema 预定义） |
| 阶段 2 字段 | 同表多列 | 独立 `paper_analysis` 表 + `PATCH /api/papers/<id>/analysis` |
