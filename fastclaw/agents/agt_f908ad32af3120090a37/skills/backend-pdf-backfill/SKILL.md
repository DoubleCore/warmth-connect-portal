---
name: backend-pdf-backfill
description: 通过 Warmth Connect Portal 后端 API 补全论文库中缺失的 PDF。适用于"补 PDF""补全缺失附件""检查哪些论文没上传 PDF 并补上"等场景。从 arXiv、CVF、ECVA、OpenReview、ACL Anthology、ACM 等来源检索可下载 PDF，再上传到对应 paperId。
version: 2.0.0
---

# Backend PDF Backfill

## 概述

这个 skill 用于给后端 `papers` 表批量补全缺失的 PDF 文件。

目标是最少打断用户，按"找缺失记录 → 搜 PDF → 下载 → 上传 → 回查"的顺序完成；优先使用稳定、可直接下载的官方 PDF 来源，不编造链接。

## 适用对象

- 后端服务运行中（默认 `http://localhost:8787`）
- `papers` 表中已有论文记录（有 `id`、`title`、`paperUrl`），但 `pdfStoragePath` 为空。

## 工作流

### Step 1. 列出缺失 PDF 的论文

```bash
# 拉所有论文（默认分页）
curl -s "http://localhost:8787/api/papers?limit=500" | \
  jq '.data.items[] | {id, title, paperUrl, pdfUrl}'
```

注意：列表接口默认不返回 `pdfStoragePath`。需要逐个 GET detail 才能确认是否已上传：

```bash
# 检查具体论文是否已上传 PDF
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq '.data.paper.pdfStoragePath'
```

或者更可靠的方式：HEAD 请求 PDF 端点，看是否 200 还是 redirect / 404：
```bash
curl -sI "http://localhost:8787/api/papers/<PAPER_ID>/pdf" | head -1
# 200 = 已有本地 PDF
# 302 = 只有外链 pdfUrl，需上传本地副本
# 404 = 完全没有
```

### Step 2. 为每篇论文寻找最稳妥的 PDF 来源

优先顺序：

1. **paperUrl 可直接转 PDF 时，优先用 paperUrl 体系**
   - arXiv `abs` → 转 `pdf`
   - CVF html 页面 → 对应 `_paper.pdf`
   - ACL Anthology 页面通常可直接找到 PDF
   - OpenReview：`forum?id=...` → `pdf?id=...`
   - ECVA/ECCV 页面可找到对应 PDF
   - IJCAI：`/proceedings/<year>/<n>` 转 `/<4位补零n>.pdf`
   - AAAI OJS：先打开 article 页面，优先抓 `/article/download/...`
   - ACM 若 paperUrl 是 `doi/pdf/...`，直接下载；否则尝试 `https://dl.acm.org/doi/pdf/<doi>`
   - IEEE：优先 `stamp.jsp?arnumber=<id>`，若返回 HTML/418/付费墙提示，判定受限，不要上传伪 PDF

2. **paperUrl 不够用时，用标题搜索 PDF**
   - `web_search` 查询：`"<title>" pdf`
   - 优先 arXiv/CVF/ECVA/ACL/OpenReview

### Step 3. 下载 PDF 到本地

arXiv PDF 下载在某些网络环境下不稳定，必须用多策略回退。

```bash
mkdir -p /tmp/pdf_backfill
cd /tmp/pdf_backfill

# 策略1：curl 断点续传（最推荐）
curl -sL -C - --max-time 120 -o "<PAPER_ID>.pdf" "https://arxiv.org/pdf/<arxiv-id>"

# 策略2：wget（备选）
wget -q --timeout=60 --tries=3 -U "Mozilla/5.0" -O "<PAPER_ID>.pdf" "https://arxiv.org/pdf/<arxiv-id>"
```

**下载验证（必须执行）**：

```python
import fitz, os
p = '/tmp/pdf_backfill/<PAPER_ID>.pdf'
assert os.path.getsize(p) > 10000, "文件太小，可能是 HTML 错误页"
doc = fitz.open(p)
assert len(doc) > 0, "0 页 = 截断，需续传"
doc.close()

# 验证文件头是 %PDF-
with open(p, 'rb') as f:
    assert f.read(5) == b'%PDF-', "不是 PDF 文件（可能是 403 HTML）"
```

### Step 4. 上传到后端

```bash
curl -X POST "http://localhost:8787/api/papers/<PAPER_ID>/pdf" \
  -F "file=@/tmp/pdf_backfill/<PAPER_ID>.pdf"
```

成功响应：
```json
{
  "success": true,
  "data": {
    "id": "<PAPER_ID>",
    "pdfStoragePath": "<UUID>.pdf",
    ...
  }
}
```

### Step 5. 回查验证

```bash
# 验证 pdfStoragePath 已写入
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq '.data.paper.pdfStoragePath'

# 验证 PDF 端点返回 200（本地文件流）
curl -sI "http://localhost:8787/api/papers/<PAPER_ID>/pdf" | head -1
```

## 标准流程（强制执行）

> 下面是 **执行闸门**，不是建议项。凡是批量补 PDF，必须逐条通过。

### Gate A：候选链接闸门（下载前）
- 候选 URL 必须来自：paperUrl 规则推断、官方页面、或可验证的同题 arXiv。
- 标题需做相似度校验（建议 ≥0.72，或人工确认"同题同年同来源"）。
- 不能仅凭关键词相近就当作同一论文。

### Gate B：文件真伪闸门（上传前）
- 必须同时满足：
  1) 文件头为 `%PDF-`
  2) 文件大小 > 10KB
- 任一不满足即判定为伪 PDF（常见 403/登录页 HTML），**禁止上传**。

### Gate C：可写入闸门（上传时）
- POST `/api/papers/<id>/pdf` 接受 `multipart/form-data`，字段名固定为 `file`。
- 上传失败要重试（至少 1 次），并记录失败原因。

### Gate D：回查闸门（上传后）
- GET `/api/papers/<id>/detail`，确认 `pdfStoragePath` 不为 null。
- HEAD `/api/papers/<id>/pdf`，确认返回 200。

### 事故级红线
- 禁止上传 0B 文件。
- 禁止上传 HTML/验证码页伪装的 `.pdf`。
- 禁止把不确定来源当作"已补全"。

## 搜索与匹配规则

### 推荐搜索式
```text
"<论文标题>" pdf
```

### 来源优先级
1. openaccess.thecvf.com
2. ecva.net
3. arxiv.org
4. openreview.net
5. aclanthology.org
6. dl.acm.org
7. ieeexplore.ieee.org

### 匹配原则
- 标题必须高度一致
- 不要因为关键词相似就误传别的论文
- 替代来源（如 arXiv）仅在可确认是同一篇论文时使用
- supplemental PDF 不要当主论文 PDF
- 上传前必须校验 `%PDF-` 文件头和最小体积阈值

## 特殊情况处理

### 1. paperUrl 为空
直接用标题搜索。

### 2. paperUrl 是 HTML 页面
优先推断其 PDF 规律；推断不稳时再搜索。

### 3. 已有 pdfStoragePath
默认不覆盖。如需替换，调用 PATCH 把 `pdfStoragePath` 改为 null 后重新上传。

### 4. 大文件（> 20MB）
后端默认接受较大上传（受 Hono 限制），但建议先压缩：
```bash
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook \
  -dNOPAUSE -dQUIET -dBATCH \
  -sOutputFile=compressed.pdf original.pdf
```

### 5. 找不到可靠 PDF
保留记录不动，向用户列出失败清单：
- title
- 尝试过的来源
- 失败原因（无官方 PDF / 链接失效 / 搜索歧义 / 来源站点 403）

## 输出要求

完成后给用户一个简短结果：
- 本次补了多少篇（成功上传数）
- 哪些标题已完成
- 哪些还没补上
- 是否发现异常记录

并且必须增加 3 个质量指标：
- 伪 PDF 拦截数（文件头/体积闸门拦截）
- 上传失败数（含 5xx / 网络错误）
- 回查通过率（上传后 detail 可见 pdfStoragePath）

## 与旧版（飞书 Bitable 版）差异

| 维度 | 旧版（lark-cli） | 新版（后端 API） |
|------|-----------------|-----------------|
| 数据源 | `lark-cli base +record-list` | `GET /api/papers` |
| 缺失检测 | 字段 `地址` 为空 | `pdfStoragePath` 为 null |
| 上传命令 | `lark-cli base +record-upload-attachment` | `POST /api/papers/<id>/pdf -F file=@...` |
| 上传约束 | `--file` 必须相对路径，单文件 ≤ 20MB | `multipart/form-data`，字段名 `file` |
| 认证 | `lark-cli auth login --domain base` (常需代理) | 无 |
| 回查 | `lark-cli base +record-get` | `GET /api/papers/<id>/detail` |

## references/

- `references/arxiv-download-strategies.md` — arXiv API 批量摘要获取、PDF 下载稳定性实测、断点续传策略、完整性验证方法
