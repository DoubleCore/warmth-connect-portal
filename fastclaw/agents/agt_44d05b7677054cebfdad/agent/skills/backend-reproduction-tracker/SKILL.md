---
name: backend-reproduction-tracker
version: 2.0.0
description: 用 Warmth Connect Portal 后端 API 管理论文复现进度，写入训练指标、训练修改记录、训练机箱与训练方式。适用于"记录复现结果""回填训练指标""写入修改记录"场景。
tags: [reproduction, backend-api, metrics, training-log, http]
triggers:
  - 复现指标
  - 训练修改记录
  - 写入复现结果
  - 记录训练修改
  - 复现记录
---

# 论文复现记录 — 指标与修改记录管理（后端 API 版）

## 概述
通过 warmth-connect-portal 后端 REST API 管理 `paper_reproduction_records` 表，为每篇论文记录复现后的评测指标和训练过程中的代码/环境修改，实现复现全流程可追溯。

## 前置条件
- 后端服务运行中（默认 `http://localhost:8787`）
- 数据库已迁移到最新版本
- `papers` 表中已存在目标论文（有 `paperId`）

## 核心字段

| 字段名（API） | 类型 | 用途 | 对应 DB 列 |
|--------------|------|------|------------|
| `paperId` | string (UUID) | 关联论文 ID | `paper_id` |
| `deviceId` | string (UUID) | 关联训练设备 ID | `device_id` |
| `status` | enum | 复现状态：`not_started`/`running`/`success`/`failed`/`paused` | `status` |
| `progress` | int(0-100) | 进度百分比 | `progress` |
| `resultSummary` | string | 复现指标（评测结果） | `result_summary` |
| `artifactUrl` | string | 训练产物 URL（如压缩包） | `artifact_url` |
| `trainingNotes` | string | 训练修改记录（多行文本） | `training_notes` |
| `trainingMethod` | string | 训练方式（远程SSH / 本地） | `training_method` |
| `reproductionMetrics` | string | 复现指标详细文本（同 resultSummary） | `reproduction_metrics` |
| `startedAt` | ISO timestamp | 训练开始时间 | `started_at` |
| `finishedAt` | ISO timestamp | 训练结束时间 | `finished_at` |

## 流程

### Step 1: 定位目标论文
按标题/关键词查询论文：

```bash
curl -s "http://localhost:8787/api/papers?keyword=GFSLT-VLP" | jq '.data.items[] | {id, title}'
```

记录 `id`（即 `paperId`）。

### Step 2: 查看现有复现记录
查询某篇论文是否已有复现记录：

```bash
curl -s "http://localhost:8787/api/reproduction-records?paperId=<PAPER_ID>" | jq
```

- 若已有记录，记录 `recordId` 用于后续更新
- 若没有，进入 Step 3 创建

### Step 3a: 创建复现记录（首次）
```bash
curl -X POST "http://localhost:8787/api/reproduction-records" \
  -H "Content-Type: application/json" \
  -d '{
    "paperId": "<PAPER_ID>",
    "deviceId": "<DEVICE_ID>",
    "status": "running",
    "progress": 30,
    "trainingMethod": "远程SSH"
  }'
```

返回的 `data.id` 即 `recordId`。

### Step 3b: 写入训练修改记录
```bash
curl -X PATCH "http://localhost:8787/api/reproduction-records/<RECORD_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "trainingNotes": "1. modeling.py: 修改MBart decoder初始化(原因: 默认权重不匹配)\n2. requirements: 新增sacrebleu==2.3.1\n3. config.yaml: batch_size 16→4(原因: 48GB GPU OOM)"
  }'
```

**修改记录格式规范**（编号列表，每条一行）：
1. **代码修改**: `文件名: 具体改动(原因)`
2. **依赖处理**: `包名: 安装方式(原因)`
3. **数据修正**: `数据文件: 修正内容(原因)`
4. **环境配置**: `环境: 具体配置`
5. **训练配置**: `训练配置: GPU/bs/epochs/lr/optimizer`
6. **OOM/调参**: `阶段: 原配置OOM, 改为新配置(原因)`

### Step 3c: 写入复现指标
```bash
curl -X PATCH "http://localhost:8787/api/reproduction-records/<RECORD_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "success",
    "progress": 100,
    "resultSummary": "Phoenix-2014-T: BLEU4=23.41 / ROUGE_L=46.82 / METEOR=21.85 (论文: 23.92, 复现: 23.41, 差距: -0.51)",
    "reproductionMetrics": "Phoenix-2014-T: BLEU4=23.41 / ROUGE_L=46.82 / METEOR=21.85"
  }'
```

**指标格式规范**：
- 按数据集分段：`数据集: 指标1=数值 / 指标2=数值`
- 多数据集用换行分隔
- 与论文原始指标对比时，标注 `(论文: xx.xx, 复现: xx.xx, 差距: ±x.xx)`
- 若某指标未评测，标注 `未评测`

### Step 3d: 更新训练设备绑定
若需要切换训练设备（训练机箱）：

```bash
# 先查所有可用设备
curl -s "http://localhost:8787/api/devices" | jq '.data.items[] | {id, name, status}'

# 绑定新设备
curl -X PATCH "http://localhost:8787/api/reproduction-records/<RECORD_ID>" \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "<DEVICE_ID>"}'
```

### Step 4: 回读验证
```bash
curl -s "http://localhost:8787/api/reproduction-records/<RECORD_ID>" | jq
```

确认 `resultSummary`、`trainingNotes`、`status` 字段内容正确，特别注意换行符是否保留。

## 状态枚举

| status | 含义 | 通常对应 progress |
|--------|------|------------------|
| `not_started` | 未开始 | 0 |
| `running` | 训练中 | 1-99 |
| `success` | 复现成功 | 100 |
| `failed` | 复现失败 | 任意 |
| `paused` | 暂停（如 OOM 等待调整） | 任意 |

## 坑位与注意事项

1. **JSON 转义**：在 shell 中传 JSON 时，注意双引号转义和换行符 `\n`。建议用 Python `requests` 或写到临时文件再 `--data @file.json`：
   ```bash
   echo '{"trainingNotes": "1. ...\n2. ..."}' > /tmp/patch.json
   curl -X PATCH "http://localhost:8787/api/reproduction-records/<ID>" \
     -H "Content-Type: application/json" \
     --data @/tmp/patch.json
   ```

2. **同篇论文多次复现**：当前一篇论文可有多条 reproduction record（不同设备/不同尝试）。如需保持唯一，先 GET 列表确认是否要创建新记录还是更新已有。

3. **写前必须 GET 确认**：避免写错记录。同仓库多篇论文（如 SLRT 含 5 个子项目）容易混淆，建议 PATCH 前先 `GET /api/reproduction-records/<ID>` 看 `paperId` 关联的论文标题。

4. **status 与 progress 一致性**：写 `success` 时建议同时把 `progress` 设为 100；写 `failed` 时 progress 保持当前值即可。

5. **设备状态联动**：训练完成后建议同时把对应设备状态改回 `idle`：
   ```bash
   curl -X PATCH "http://localhost:8787/api/devices/<DEVICE_ID>" \
     -H "Content-Type: application/json" \
     -d '{"status": "idle"}'
   ```

6. **SLT Finetune OOM 风险**：GFSLT-VLP 的 SLT 阶段模型比 VLP 大（含 MBart decoder），默认 batch-size=16 在 48GB GPU 上 OOM，需降到 4。

## 与其他技能的衔接
- 复现环境搭建：`slr-paper-reproduction-setup`
- 论文信息入库：`paper-ingest-phase1`（已迁移版本）
- 代码库回填：`backend-repo-backfill`
- 设备管理：直接调 `GET/PATCH /api/devices`
