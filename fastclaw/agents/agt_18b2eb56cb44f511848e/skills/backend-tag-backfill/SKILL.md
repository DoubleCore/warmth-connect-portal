---
name: backend-tag-backfill
description: 通过后端 API 以"精简模式"回填论文标签：仅写入 field（领域）、source（来源）、publishedYear，不做摘要。
version: 2.0.0
---

# backend-tag-backfill

## 适用场景
- 用户明确要求"先别做 abstract/翻译，只做标签"。
- 目标是快速把论文记录补齐为可检索状态。
- 字段：`field`（领域）、`source`（来源）、`publishedYear`（年份）。

> 注：当前 `papers` 表的 `field` / `source` 是单字符串字段；旧版飞书表中"数据集"、"评价指标"、"复现数据集"是多选，迁移到后端时需要后端先扩展 schema（参见 `MIGRATION_GUIDE_LARK_TO_BACKEND_DB.md`）。在 schema 扩展之前，本 skill 仅处理已有的三个标签字段。

## 核心原则（强约束）
1. **只写标签，不写长文本**：本模式禁止处理 `abstract`。
2. **少而准**：每篇只保留核心标签。
3. **字段值规范**：
   - `field`：从已有论文统计的常见值中选（CSLR / SLT / Sign Language / Action Recognition / Multimodal Learning 等）
   - `source`：会议/期刊名，**不带年份**（CVPR / ICCV / NeurIPS / ICLR / arXiv 等）
   - `publishedYear`：4 位数字
4. **过滤误抽**：
   - `field` 不要混入 `pretrain/pretraining/corpus`（属于训练范式而非领域）
5. **无 PDF/无证据时不写入**：保持 null，避免污染数据。

## 标准流程

### 1) 探查现有标签分布（避免引入新值）
```bash
# 列出所有不同的 source 和 field
curl -s "http://localhost:8787/api/papers?limit=500" | \
  jq '.data.items | [.[].source] | unique' 

curl -s "http://localhost:8787/api/papers?limit=500" | \
  jq '.data.items | [.[].field] | unique'
```

### 2) 拉取目标记录（按缺失字段筛选）
```bash
# 缺失 field
curl -s "http://localhost:8787/api/papers?limit=500" | \
  jq '.data.items[] | select(.field == null) | {id, title, paperUrl}'

# 缺失 source
curl -s "http://localhost:8787/api/papers?limit=500" | \
  jq '.data.items[] | select(.source == null) | {id, title, paperUrl}'
```

### 3) 标签归一与筛选
- 名称归一示例：`MS COCO -> COCO`、`Pascal VOC -> PASCAL VOC`（以表内已有值为准）。
- 仅保留"用于最终评测汇报"的数据集和指标。
- 候选若在现有值中找不到：
  - 默认**不新增**；
  - **保持空值**，并在结果汇报中输出"待人工补录清单"。
  - 用户明确要求新增时，可用 PATCH 直接写入新字符串值。

### 4) 写回记录
```bash
curl -X PATCH "http://localhost:8787/api/papers/<PAPER_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "field": "SLT",
    "source": "ICLR",
    "publishedYear": 2025
  }'
```

### 5) 回读验证（抽样）
```bash
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | \
  jq '.data.paper | {field, source, publishedYear}'
```

## 高频坑位
- **坑1：把摘要流程混进来** → lite 模式禁止写 `abstract`。
- **坑2：source 带年份** → 写 `"ICLR"` 不写 `"ICLR 2025"`。
- **坑3：publishedYear 用字符串** → 必须 number（`2025` 不是 `"2025"`）。
- **坑4：field 写预训练/loss 等非领域词** → field 是研究领域，不是技术细节。

## 推荐结果汇报模板
- 处理记录数：N
- 成功写回：X
- 因证据不足而跳过：Y
- 抽样复核：通过/异常（附 paperId）

## 与旧版差异

| 维度 | 旧版（lark-cli） | 新版（后端 API） |
|------|-----------------|-----------------|
| 数据源 | 飞书 bitable | `GET /api/papers` |
| 字段（领域） | `领域`（多选 MultiSelect） | `field`（单字符串，待扩展为 JSON 数组） |
| 字段（来源） | `来源`（单选 SingleSelect） | `source`（字符串） |
| 字段（年份） | `发表年`（Text） | `publishedYear`（integer） |
| 标签选项管理 | `+field-search-options` 自动 | 后端无选项概念，直接写字符串 |
| 写入命令 | `+record-upsert --json` | `PATCH /api/papers/<id>` |
