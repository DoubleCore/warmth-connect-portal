---
name: larkcli-bitable-abstract-sentence-extract
description: 从飞书论文表批量下载PDF、提取英文Abstract，按指定语义模式（如"几个方面/模块/步骤"）抽取原文句子，人工复核后写回表格。适用于"从摘要里找某种类型的句子""提取方法结构描述""找baseline描述"等场景。
tags: [feishu, bitable, pdf, abstract, extraction, lark-cli]
---

# 从飞书论文表Abstract中抽取特定语义句子

## 触发场景
- "从摘要里找XX类型的句子"
- "提取方法有几个方面的描述"
- "找abstract里描述baseline/方法结构/贡献的原文句子"
- 任何需要从飞书论文表PDF的Abstract中按语义模式批量抽取原文句子的需求

## 流程

### 1. 获取论文列表与链接
```bash
lark-cli base +record-list --base-token <BASE> --table-id <TABLE> --view-id <VIEW> --limit 500
```
- 返回格式：`{"data": {"fields": [...], "data": [[val1, val2, ...], ...]}}`
- `fields` 与 `data` 子数组一一对应
- 记录每篇论文的 `record_id`、标题、链接（arXiv/CVF URL）

### 2. 批量下载PDF
**优先用arXiv直接链接下载**（飞书drive API常返回403）：
```bash
curl -sL -o paper_N.pdf "https://arxiv.org/pdf/<ARXIV_ID>"
```

**CVF论文PDF URL转换规则**：
- HTML: `/content/ICCV2023/html/...html`
- PDF: `/content/ICCV2023/papers/...pdf`
- ⚠️ 部分CVF论文PDF可能404（如C2ST），此时只能跳过或用浏览器获取

**飞书附件下载（备选，常403）**：
```bash
lark-cli drive +download --file-token <TOKEN> --output paper_N.pdf
```

### 3. 提取Abstract文本
用PyMuPDF从PDF前2页提取，正则匹配Abstract段落：
```python
import fitz, re

doc = fitz.open(pdf_path)
text = ''.join(doc[i].get_text() for i in range(min(2, len(doc))))
doc.close()

# 匹配Abstract段落
m = re.search(
    r'(?:Abstract|ABSTRACT)\s*\n?\s*(.*?)(?:\n\s*(?:Introduction|1\s*\.?\s*Introduction|Keywords|KEYWORDS))',
    text, re.DOTALL | re.IGNORECASE
)
abstract = m.group(1).strip() if m else text[:2000]
```

**文本清洗**（PDF提取的文本有断行问题）：
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
- ❌ "Specifically, ..." 不加过滤——可能是结果描述
- ✅ "Specifically, ..." + 含模块/步骤关键词 ——方法结构描述

#### 推荐模式（按"方法结构描述"场景）

| 模式类型 | 正则/规则 | 示例 |
|---------|----------|------|
| consists_of_N | `consists of/comprising/composed of` + 数词 + components/modules/stages | "SignLLM comprises two key modules" |
| N-component | 数词-连字符-component/module/stage | "two-stage", "three-branch" |
| composed_of | `is composed of/is built on/is structured as` | "which is composed of a Text2Gloss translator..." |
| enumerated | 句内含 ≥2 个 `(1)...(2)...` 或 `1)...2)...` | "(1) The VQ module... and (2) the CRA module..." |
| specifically_structure | `Specifically/In particular` + 含模块/步骤关键词 | "Specifically, besides the LSG module and TSG module..." |
| first_second | 句内同时含 `First,...Second,...` | "First, we propose... Second, we present..." |
| approach_involves | `Our approach/method/framework involves/contains` | "Our approach involves two stages" |

#### 抽取后必须人工复核
正则匹配会产生两类错误：
1. **假阳性**：匹配到结果描述（如"In particular, we achieved improvements..."）而非方法结构
2. **假阴性**：方法结构用隐式描述（如"First...Second...Furthermore"但没有"consists of"）

**复核方法**：打印每篇论文完整摘要 + 匹配结果，逐篇确认是否为真正的"方法结构描述"。

### 5. 翻译为中文（如需）
如果目标字段要求中文内容，需将提取的英文原文翻译成中文：
- 翻译应保留原句结构（如"两个模块：(1)...(2)..."）
- 术语保留英文原文（如"LSG模块"、"CND解码器"）
- 翻译结果保存到 `translations.json` 便于复核

### 6. 写回飞书表

**推荐用 `--json` + `--record-id` 方式写入**（避免中文shell转义问题）：

```python
import subprocess, json

def upsert_field(base_token, table_id, record_id, field_id, value):
    payload = json.dumps({field_id: value}, ensure_ascii=False)
    result = subprocess.run([
        'lark-cli', 'base', '+record-upsert',
        '--base-token', base_token,
        '--table-id', table_id,
        '--record-id', record_id,
        '--json', payload
    ], capture_output=True, text=True)
    return result
```

**用 field_id 而非字段名写入更可靠**：
```bash
# ✅ 推荐：用 field_id（如 fldvKrOMRD）
lark-cli base +record-upsert --record-id <RID> --json '{"fldvKrOMRD":"中文内容"}'

# ⚠️ 也可用中文字段名，但shell转义容易出问题
lark-cli base +record-upsert --record-id <RID> --fields '{"方法概述":"中文内容"}'
```

### 7. 回读验证
写完后必须用 `record-get` 回读验证：
```bash
lark-cli base +record-get --base-token <BASE> --table-id <TABLE> --record-id <RID>
```
- ⚠️ 验证脚本中务必 `import json`，否则解析lark-cli输出时会报 `NameError`

## 输出格式
最终输出应包含：
1. 每篇论文的标题 + 提取的原文句子 + 中文翻译
2. 无匹配的论文清单
3. PDF下载失败的论文清单
4. 回读验证结果（确认写入正确）
- lark-cli drive +download 的 `--output` 必须用相对路径（当前目录下），绝对路径触发 unsafe output path 校验

### 文本提取
- PyMuPDF(fitz)用系统Python（`/usr/bin/python3`），Hermes venv的python可能没有fitz
- PDF文本有断词（`fundamen-\ntally`）和换行问题，必须先clean再匹配
- Abstract边界识别：优先匹配到"Introduction/Keywords"，fallback取Abstract后200-3000字符

### 写回飞书表
- 中文内容写入飞书表时，直接在shell中传 `--fields '{"字段名":"中文"}'` 容易因编码/转义问题失败 → **用Python subprocess + `--json` 参数**，payload用 `json.dumps(..., ensure_ascii=False)` 生成
- 用 field_id（如 `fldvKrOMRD`）而非中文字段名写入更可靠，避免字段名编码问题
- 验证脚本中务必 `import json`，否则解析lark-cli JSON输出时报 `NameError`

### 匹配策略
- 第一轮用宽泛正则（含"we propose"），会产生大量假阳性
- 第二轮收紧：只保留真正描述方法组成/结构的句子
- 隐式结构（"First...Second...Finally"无"consists of"）是否纳入取决于用户需求，需确认
- 数据集论文、实证分析论文通常没有方法结构描述

## 输出格式
最终输出应包含：
1. 每篇论文的标题 + 提取的原文句子
2. 无匹配的论文清单
3. PDF下载失败的论文清单
4. 待用户确认后再写回飞书表
