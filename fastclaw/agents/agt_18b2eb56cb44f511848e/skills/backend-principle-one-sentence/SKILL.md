---
name: backend-principle-one-sentence
description: 通过后端 API 批量生成/清洗论文"原理一句话"字段，要求 30-50 字，写成方法类型 + 任务 + 关键机制。
version: 2.0.0
---

# backend-principle-one-sentence

## 适用场景
- 用户要求批量清洗论文表中的`原理一句话`字段。
- 该字段当前归属：建议放在 `paper_analysis.notes` 或新增的 `paper.principleOneSentence` 字段。
- 默认处理与**手势/手语识别、CSLR、SLT**相关记录。
- 目标：把方法概括为一句可检索、可比较的"机制句"。

## 强约束
1. **长度**：30-50字。
2. **结构**：必须包含"方法类型 + 任务 + 关键机制"。
3. **动作词**：必须出现明确机制词（对齐、融合、蒸馏、约束、重建、解码、交互、建模、选择、增强）。
4. **禁止**：
   - 不要写成泛泛而谈的宣传语。
   - 不要只说"提出新方法/创新框架"。
   - 不要堆叠多个模块名而没有机制。

## 推荐句式
- `基于XX的YY方法，通过ZZ机制完成AA任务。`
- `一种XX式YY框架，借助ZZ对AA进行建模/对齐/解码。`
- `面向AA任务的XX方法，通过ZZ增强/约束/融合信息。`

## 标准流程

### Step 1: 找到目标论文与现有分析
```bash
curl -s "http://localhost:8787/api/papers?keyword=GFSLT" | jq '.data.items'

# 取详情（含 analysis）
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq
```

### Step 2: 读取证据
- 优先取 `paper.abstract`、`analysis.methodOverview`
- 如不够，本地 PDF 取方法段：
  ```bash
  curl -L -o /tmp/p.pdf "http://localhost:8787/api/papers/<PAPER_ID>/pdf"
  ```

### Step 3: 生成一句话并写回
约定：先写到 `paper_analysis` 的 `notes` 字段（前缀 `[原理] ` 便于检索），或后端如已新增专用字段则用专用字段。

**当前推荐方案：写到 analysis.notes**
```bash
# 先读已有 notes，避免覆盖其它内容
EXISTING=$(curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq -r '.data.analysis.notes // ""')

# 拼接
NEW_NOTES="[原理] 基于双流编码的SLT框架，通过视觉-语言对比预训练对齐手语序列与文本嵌入。\n${EXISTING}"

curl -X PATCH "http://localhost:8787/api/papers/<PAPER_ID>/analysis" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'notes': sys.argv[1]}, ensure_ascii=False))" "$NEW_NOTES")"
```

### Step 4: 回读校验
```bash
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq '.data.analysis.notes'
```

## 证据优先级
1. PDF 方法段落、图1/总览图、方法标题
2. `analysis.methodOverview`、`analysis.taskDefinition`
3. `paper.abstract` 中的方法描述

## 常见坑位
1. **只写任务不写机制**：如"用于手语识别的模型"不够。
2. **只写模块不写方法类型**：如"包含编码器、解码器、注意力模块"不够。
3. **机制抽象过度**：要能看出它到底怎么做。
4. **覆盖已有 notes**：写入前必须先 GET 已有 notes，再合并。

## 批量实施SOP
1. **先小样后批量**：先 3-5 条并回读核验。
2. **结构闸门**：写回前逐条检查"方法类型 + 任务 + 关键机制"。
3. **长度闸门**：严格 30-50 字。
4. **机制闸门**：必须出现可识别动作词。
5. **证据闸门**：证据不足留空，不硬造。

## 与旧版差异

| 维度 | 旧版（lark-cli） | 新版（后端 API） |
|------|-----------------|-----------------|
| 数据源 | `lark-cli base +record-list` | `GET /api/papers/<id>/detail` |
| 写入位置 | 飞书 `原理一句话` 字段 | `paper_analysis.notes` 或新增字段 |
| 写入命令 | `+record-upsert` | `PATCH /api/papers/<id>/analysis` |
