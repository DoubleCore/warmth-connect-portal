---
name: larkcli-bitable-lite-tag-backfill
description: 用 lark-cli 以“精简模式”回填论文标签：仅写入数据集/评价指标（可选复现数据集），不做摘要，严格复用现有选项。
version: 1.0.0
---

# larkcli-bitable-lite-tag-backfill

## 适用场景
- 用户明确要求“先别做 abstract/翻译，只做标签”。
- 目标是快速把论文记录补齐为可检索状态。
- 字段为多选标签（如：`数据集`、`评价指标`、`复现数据集`）。

## 核心原则（强约束）
1. **只写标签，不写长文本**：本模式不处理 `摘要`。
2. **只用现有选项**：先读字段选项，禁止随意新增选项或改格式。
3. **少而准**：每篇只保留核心评测标签（通常 2~6 个），避免冗余堆砌。
4. **过滤误抽**：
   - 数据集侧过滤：`pretrain/pretraining/corpus/unlabeled/synthetic`（若仅用于预训练或辅助）
   - 指标侧过滤：`loss/objective/reward/regularization`（非最终结果指标）
5. **无 PDF 不写入**：若记录 `地址` 为空，直接跳过该记录，不回填标签。
6. **PDF 下载受限回退**：若附件下载 403/权限受限，可回退使用 `原链接` 可解析文本；仍无法可靠提取时保持空值，并在结果汇报中输出待人工补录清单。

## 标准流程

### 1) 解析 wiki 获取 base_token
```bash
lark-cli wiki spaces get_node --params '{"token":"<WIKI_TOKEN>"}'
```
取 `data.node.obj_token`。

### 2) 读取字段与现有选项（必须）
```bash
lark-cli base +field-list --base-token <BASE_TOKEN> --table-id <TABLE_ID> --limit 200
lark-cli base +field-search-options --base-token <BASE_TOKEN> --table-id <TABLE_ID> --field-id <数据集field_id> --limit 500
lark-cli base +field-search-options --base-token <BASE_TOKEN> --table-id <TABLE_ID> --field-id <评价指标field_id> --limit 500
# 如需
lark-cli base +field-search-options --base-token <BASE_TOKEN> --table-id <TABLE_ID> --field-id <复现数据集field_id> --limit 500
```

### 3) 拉取目标记录
```bash
lark-cli base +record-list --base-token <BASE_TOKEN> --table-id <TABLE_ID> --view-id <VIEW_ID> --limit 500
```
保留：`record_id`、`标题`、`原链接`、现有标签字段值。

### 4) 标签归一与筛选
- 先做名称归一（示例）：`MS COCO -> COCO`、`Pascal VOC -> PASCAL VOC`（以表内已有选项为准）。
- 仅保留“用于最终评测汇报”的数据集和指标。
- **IEEE 受限回退**：若 IEEE 原页/PDF 受限，优先尝试公开镜像（如 `par.nsf.gov/servlets/purl/<id>`）提取章节中的 Datasets/Metrics 证据；仍不可得再用兜底项。
- **OpenReview PDF 403 回退**：若终端侧访问 `openreview.net/pdf` 或附件链接返回 403，但浏览器页可正常打开论文页，可在浏览器上下文中：
  1. 进入对应 `forum?id=...` 页面；
  2. 用浏览器侧 `fetch('/pdf?id=...')` 或附件链接拉取 PDF；
  3. 动态加载 `pdf.js`（如 `unpkg` 上的 `pdfjs-dist@3.x build/pdf.min.js` + worker）；
  4. 直接解析前几页/结果表页正文，抽取数据集与指标证据。
  该回退适合“终端 403、但浏览器 session 可读”的 OpenReview 论文。
- 候选若在现有选项中找不到：
  - 默认**不新增**；
  - **保持空值**，并在结果汇报中输出“待人工补录清单”（不要写兜底占位标签）。
  - 但如果用户明确要求继续补全、且候选标签是可由论文正文直接确认的规范数据集/指标名，可尝试用 `record-upsert` 直接写入该字符串；当前环境下飞书多选列可能会**自动把新字符串加入字段 options**。执行后必须立刻：
    1. `record-get` 回读目标记录；
    2. `field-get` 或全量 `field-search-options` 回读字段选项；
    3. 确认没有意外新增脏选项/拆分项后，才算成功。

### 5) 写回记录
```bash
lark-cli base +record-upsert \
  --base-token <BASE_TOKEN> \
  --table-id <TABLE_ID> \
  --record-id <RECORD_ID> \
  --json '{"数据集":["COCO"],"评价指标":["mAP","Recall@1"]}'
```

> 注意：`--json` 直接传字段对象，不要套 `{"fields":...}`。

### 6) 回读验证（抽样）
```bash
lark-cli base +record-get --base-token <BASE_TOKEN> --table-id <TABLE_ID> --record-id <RECORD_ID>
```
检查：
- 字段写入成功
- 选项未被意外新增
- 未引入明显误抽项

## 高频坑位
- **坑1：把摘要流程混进来** → lite 模式禁止写 `摘要`。
- **坑2：直接写新标签** → 必须先 `+field-search-options`；无匹配默认不新增。
- **坑2.1：误信 `+field-search-options --keyword` 的过滤结果** → 当前环境下该接口可能返回整列全部选项，且偶发 `i/o timeout`；判断某个候选标签是否真实存在时，**不要只看 `--keyword` 返回**，应优先拉全量 options 后在本地精确比对。
- **坑3：多选列写入杂项** → 预训练语料、loss/objective 不应进入目标列。
- **坑4：标签过多** → 控制核心标签，优先“主评测数据集 + 主结果指标”。

## 推荐结果汇报模板
- 处理记录数：N
- 成功写回：X
- 因无现有选项而跳过：Y
- 过滤掉的误抽项数：Z
- 抽样复核：通过/异常（附 record_id）
