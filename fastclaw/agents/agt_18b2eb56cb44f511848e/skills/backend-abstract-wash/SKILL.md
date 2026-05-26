---
name: backend-abstract-wash
description: 通过后端 API 批量生成/清洗论文"摘要"字段，要求 100-150 字，按问题-方法-结果-意义四段逻辑写作。
version: 2.0.0
---

# backend-abstract-wash

## 适用场景
- 用户要求批量清洗论文表中的`abstract`字段（papers.abstract）。
- 默认处理与**手势/手语识别、连续手语识别（CSLR）、手语翻译（SLT）**相关记录。
- 若用户已明确给出"当前处理清单"，则以清单为准。
- 目标是把摘要统一为可入库、可检索、可读的结构化中文摘要。

## 强约束
1. **长度**：100-150字。
2. **结构**：必须包含四段逻辑：问题 → 方法 → 结果 → 意义。
3. **写法**：中文、紧凑、具体，不要空话；不确定的结果不要硬编。
4. **禁止内容**：
   - 不要写成"本文提出一种方法"后面没有信息。
   - 不要把方法细节堆成列表。
   - 不要把指标和数值塞进摘要里抢占结果字段。

## 推荐生成模板
- 第一句：点出任务痛点/研究问题。
- 第二句：概括核心方法与关键机制。
- 第三句：写主要实验结论或效果提升（能确认再写，不能确认就弱化为"取得较好效果"）。
- 第四句：写对领域/应用的意义。

## 证据优先级
1. PDF 正文 / 摘要页（通过 `GET /api/papers/<id>/pdf` 获取）
2. 已有 `paper.abstract` 或 `analysis.notes` 字段
3. 论文标题、关键词、方法名

## 标准流程

### Step 1: 拉取待处理论文列表
```bash
# 全量拉，再用 jq 筛选缺失/过短的 abstract
curl -s "http://localhost:8787/api/papers?limit=500" | \
  jq '.data.items[] | select(.abstract == null or (.abstract | length) < 50) | {id, title, paperUrl}'
```

### Step 2: 获取详情（含已有摘要）
```bash
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq
```

### Step 3: 获取 PDF 全文（如需）
```bash
curl -L -o /tmp/paper-<PAPER_ID>.pdf "http://localhost:8787/api/papers/<PAPER_ID>/pdf"
# 然后用 PyMuPDF / pdftotext 提取前 2 页
```

### Step 4: 生成摘要并写回
```bash
curl -X PATCH "http://localhost:8787/api/papers/<PAPER_ID>" \
  -H "Content-Type: application/json" \
  -d '{"abstract": "手语翻译因序列长度不匹配且数据稀缺而表现受限。本文提出GFSLT-VLP，在视觉-语言预训练阶段联合对齐手语视频与文本嵌入，再通过对比学习与CLIP式蒸馏迁移到下游SLT任务。在Phoenix-2014-T等数据集上BLEU4取得明显提升，为低资源序列翻译提供了通用预训练范式。"}'
```

### Step 5: 写回后校验
```bash
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq '.data.paper.abstract | length'
```

## 常见坑位
1. **过度泛化**：摘要里只写"有效提升性能"但没有研究对象和方法机制。
2. **结果写进摘要过满**：指标数值应尽量留给"结果一句话"字段。
3. **主题跑偏**：无关手势/手语论文不要套用该模板。
4. **硬编结论**：没有证据时不要写具体提升幅度。
5. **JSON 转义**：摘要中文含双引号或反斜杠时，建议用 `--data @file.json` 方式传：
   ```bash
   python3 -c 'import json; print(json.dumps({"abstract": "..."}, ensure_ascii=False))' > /tmp/p.json
   curl -X PATCH "http://localhost:8787/api/papers/<ID>" \
     -H "Content-Type: application/json" --data @/tmp/p.json
   ```

## 批量实施SOP
1. **先小样后批量**：先抽 3-5 条做生成与写回，人工复核通过后再全量跑。
2. **范围闸门**：仅处理手势/手语识别、CSLR、SLT 相关记录；无关主题直接跳过。
3. **证据闸门**：优先 PDF 正文；证据不足不写回。
4. **长度闸门**：每条摘要强制 100-150 字，超长先压缩再写回。
5. **结构闸门**：写回前逐条检查"问题→方法→结果→意义"四段逻辑是否完整。

## 写回后校验
- 抽样回读已写记录，核对：长度、结构、主题是否跑偏。
- 若发现误写，立即用 PATCH 覆盖修正。

## 输出要求
- 直接给出可写回的中文摘要。
- 如证据不足，保留"需核对原文摘要"清单，不要用占位句糊弄。

## 与旧版差异

| 维度 | 旧版（lark-cli） | 新版（后端 API） |
|------|-----------------|-----------------|
| 数据源 | `lark-cli base +record-list` | `GET /api/papers` |
| 字段名 | `摘要`（中文） | `abstract`（英文 camelCase） |
| 写入命令 | `+record-upsert --json '{"摘要":"..."}'` | `PATCH /api/papers/<id> {"abstract":"..."}` |
| PDF 来源 | `+drive download`（常 403） | `GET /api/papers/<id>/pdf`（本地） |
