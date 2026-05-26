---
name: backend-abstract-sentence-extract
description: 从后端论文库批量下载本地PDF、提取英文Abstract、按指定语义模式（如"几个方面/模块/步骤"）抽取原文句子，人工复核后写回。
tags: [backend-api, pdf, abstract, extraction]
---

# 从论文库 Abstract 中抽取特定语义句子（后端 API 版）

## 触发场景
- "从摘要里找XX类型的句子"
- "提取方法有几个方面的描述"
- "找abstract里描述baseline/方法结构/贡献的原文句子"
- 任何需要从论文 Abstract 中按语义模式批量抽取原文句子的需求

## 流程

### 1. 获取论文列表
```bash
curl -s "http://localhost:8787/api/papers?limit=500" | \
  jq '.data.items[] | {id, title, paperUrl, pdfUrl}'
```

记录每篇论文的 `id`（paperId）、`title`、`paperUrl`、`pdfUrl`。

### 2. 批量下载 PDF
**优先用后端 PDF 端点**（自动走本地存储或 redirect 到外部）：
```bash
curl -L -o paper_<PAPER_ID>.pdf "http://localhost:8787/api/papers/<PAPER_ID>/pdf"
```

如后端无 PDF（404），再回退到 arXiv 直链：
```bash
curl -sL -o paper_N.pdf "https://arxiv.org/pdf/<ARXIV_ID>"
```

**CVF 论文 PDF URL 转换规则**：
- HTML: `/content/ICCV2023/html/...html`
- PDF: `/content/ICCV2023/papers/...pdf`

### 3. 提取 Abstract 文本
用 PyMuPDF 从 PDF 前 2 页提取，正则匹配 Abstract 段落：

```python
import fitz, re

doc = fitz.open(pdf_path)
text = ''.join(doc[i].get_text() for i in range(min(2, len(doc))))
doc.close()

m = re.search(
    r'(?:Abstract|ABSTRACT)\s*\n?\s*(.*?)(?:\n\s*(?:Introduction|1\s*\.?\s*Introduction|Keywords|KEYWORDS))',
    text, re.DOTALL | re.IGNORECASE
)
abstract = m.group(1).strip() if m else text[:2000]
```

**文本清洗**（PDF 提取的文本有断行问题）：
```python
def clean_text(text):
    text = re.sub(r'(\w)-\n(\w)', r'\1\2', text)  # 断词修复
    text = re.sub(r'\n', ' ', text)                # 换行转空格
    text = re.sub(r'\s+', ' ', text)               # 多空格合并
    return text.strip()
```

### 4. 按语义模式抽取句子

#### 关键教训：正则匹配需要精调，不能太宽泛
- ❌ "we propose X" 太宽泛——这只是方法命名，不是结构描述
- ✅ "consists of N components/modules" ——真正的结构描述

#### 推荐模式（按"方法结构描述"场景）

| 模式类型 | 正则/规则 | 示例 |
|---------|----------|------|
| consists_of_N | `consists of/comprising/composed of` + 数词 + components/modules/stages | "SignLLM comprises two key modules" |
| N-component | 数词-连字符-component/module/stage | "two-stage", "three-branch" |
| composed_of | `is composed of/is built on/is structured as` | "which is composed of a Text2Gloss translator..." |
| enumerated | 句内含 ≥2 个 `(1)...(2)...` | "(1) The VQ module... and (2) the CRA module..." |
| specifically_structure | `Specifically/In particular` + 含模块/步骤关键词 | "Specifically, besides the LSG module and TSG module..." |
| first_second | 句内同时含 `First,...Second,...` | "First, we propose... Second, we present..." |

#### 抽取后必须人工复核
正则匹配会产生两类错误：
1. **假阳性**：匹配到结果描述（如"In particular, we achieved improvements..."）而非方法结构
2. **假阴性**：方法结构用隐式描述（如"First...Second...Furthermore"但没有"consists of"）

### 5. 翻译为中文（如需）
- 翻译应保留原句结构（如"两个模块：(1)...(2)..."）
- 术语保留英文原文（如"LSG模块"、"CND解码器"）

### 6. 写回后端

写到 `paper_analysis.notes` 字段（多个值用换行分隔，前缀标识来源）：

```python
import subprocess, json, requests

def upsert_analysis(paper_id, abstract_extract):
    # 先读已有 analysis
    detail = requests.get(f"http://localhost:8787/api/papers/{paper_id}/detail").json()
    existing_notes = (detail.get("data", {}).get("analysis") or {}).get("notes") or ""
    
    new_line = f"[摘要句抽取] {abstract_extract}"
    new_notes = f"{new_line}\n{existing_notes}".strip()
    
    return requests.patch(
        f"http://localhost:8787/api/papers/{paper_id}/analysis",
        json={"notes": new_notes}
    )
```

或者写到 `analysis.methodOverview`（如果该字段为空）：

```bash
curl -X PATCH "http://localhost:8787/api/papers/<PAPER_ID>/analysis" \
  -H "Content-Type: application/json" \
  -d '{"methodOverview": "包含两个模块：(1)..."}'
```

### 7. 回读验证
```bash
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq '.data.analysis'
```

## 输出格式
最终输出应包含：
1. 每篇论文的标题 + 提取的原文句子 + 中文翻译
2. 无匹配的论文清单
3. PDF 下载失败的论文清单
4. 回读验证结果

## 注意事项

### 文本提取
- PyMuPDF(fitz) 用系统 Python（`/usr/bin/python3`），venv 可能没装
- PDF 文本有断词（`fundamen-\ntally`）和换行问题，必须先 clean 再匹配
- Abstract 边界识别：优先匹配到"Introduction/Keywords"，fallback 取后 200-3000 字符

### 写入后端
- 中文 JSON 用 Python `requests` 库，自动处理 UTF-8
- 写入前必须先 GET 已有 `analysis.notes`，避免覆盖

### 匹配策略
- 第一轮用宽泛正则，会产生大量假阳性
- 第二轮收紧：只保留真正描述方法组成/结构的句子
- 数据集论文、实证分析论文通常没有方法结构描述

## 与旧版差异

| 维度 | 旧版（lark-cli） | 新版（后端 API） |
|------|-----------------|-----------------|
| 数据源 | `lark-cli base +record-list` | `GET /api/papers` |
| PDF 来源 | `lark-cli drive +download`（403 高） | `GET /api/papers/<id>/pdf`（本地优先） |
| 写入 | `+record-upsert --json '{"方法概述":"..."}'` | `PATCH /api/papers/<id>/analysis` |
| 写入字段 | 飞书自定义字段（中文名） | `methodOverview` / `notes`（英文 camelCase） |
