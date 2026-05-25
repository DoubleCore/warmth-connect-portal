---
name: backend-three-field-wash
description: 三字段清洗总入口（abstract / 原理一句话 / 结果一句话）。已拆分为三个独立子技能。
version: 2.0.0
---

# backend-three-field-wash

## 这是总入口，不再单独承担三字段混洗
本技能已拆分为三个独立技能包：
- `backend-abstract-wash`：abstract 字段
- `backend-principle-one-sentence`：原理一句话字段（写到 `analysis.notes` 或新增字段）
- 结果一句话：建议写到 `analysis.conclusion` 字段

## 适用方式
- 如果只处理一个字段，直接加载对应子技能。
- 如果需要批量清洗三字段，按顺序加载三个子技能。
- 默认处理与**手势/手语识别、CSLR、SLT**相关记录；用户给定明确清单时按清单执行。

## 总体原则
- 准确优先于流畅。
- 证据优先于猜测。
- 无法可靠提取时宁可留空，不硬编。
- 批量写回前先按证据强度分层：PDF 正文 > 已有 abstract > 二手摘要。

## 统一字段映射

| 飞书旧字段 | 后端字段 | 所属表 |
|----------|---------|-------|
| 摘要 | `abstract` | `papers` |
| 原理一句话 | `analysis.notes`（前缀 `[原理]`）或新字段 | `paper_analysis` |
| 结果一句话 | `analysis.conclusion` | `paper_analysis` |
| 研究问题 | `analysis.researchQuestions` | `paper_analysis` |
| 任务定义 | `analysis.taskDefinition` | `paper_analysis` |
| 方法概述 | `analysis.methodOverview` | `paper_analysis` |
| 评价指标 | `analysis.metrics` | `paper_analysis` |

## 统一校验方向
- abstract：100-150 字，问题/方法/结果/意义四段逻辑。
- 原理一句话：30-50 字，方法类型 + 任务 + 关键机制。
- 结果一句话：按数据集分段，每段都有指标 + 数值。

## 结果一句话严格格式
- 先写一句不重复数值的自然语言总结。
- 然后按"数据集 -> 该数据集对应的各指标及数值"分段列出。
- 推荐模板：
  ```
  一句总结。
  数据集A：指标1=数值；指标2=数值；指标3=数值。
  数据集B：指标1=数值；指标2=数值。
  ```
- 写到 `paper_analysis.conclusion` 字段：
  ```bash
  curl -X PATCH "http://localhost:8787/api/papers/<PAPER_ID>/analysis" \
    -H "Content-Type: application/json" \
    -d '{"conclusion": "一句总结。\n数据集A：BLEU4=23.41；ROUGE_L=46.82。\n数据集B：BLEU4=21.30。"}'
  ```

## 输出建议
- 优先输出"字段级结果"，不要把三个字段揉成混合输出。
- 若只加载本总入口，请先按字段拆分任务，再分别交给三个子技能。

## 研究问题/任务定义（双字段拆分）
适用于"把'研究问题/任务定义'从单字段拆成两个字段并批量回填"的场景。

- 字段拆分：
  - `analysis.researchQuestions`：论文特有痛点/核心矛盾。
  - `analysis.taskDefinition`：作者如何把痛点 operationalize 成可训练任务。
- 写作顺序：`现状范式 -> 具体失败点 -> 作者切入点 -> 任务化定义`。
- 批量执行流程：
  1) `GET /api/papers?field=SLT&limit=500` 拉取目标记录
  2) 生成两字段草稿
  3) 批量 `PATCH /api/papers/<id>/analysis`
  4) 抽样回读校验
  5) 再跑一轮全量空值检查

## 与旧版差异

| 维度 | 旧版（lark-cli） | 新版（后端 API） |
|------|-----------------|-----------------|
| 调用方式 | `lark-cli base +record-*` | `curl ... /api/papers/<id>/analysis` |
| 字段命名 | 中文飞书字段 | 英文 camelCase |
| 多字段写入 | 一次 `--json` 多字段 | 一次 PATCH 多字段（同一个 body） |
