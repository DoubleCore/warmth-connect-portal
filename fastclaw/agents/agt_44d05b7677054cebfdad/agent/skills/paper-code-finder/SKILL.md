---
name: paper-code-finder
version: 2.0.0
description: 从 Warmth Connect Portal 后端论文库批量补全代码仓库 URL，并可进一步抽取 PyTorch/CUDA/复现数据集（待后端扩展字段）。
---

# paper-code-finder

从后端论文库（papers 表）中，为论文批量查找 GitHub 代码仓库，并把 URL 写回 `repoUrl` 字段。
进阶场景（PyTorch 版本、CUDA 版本、复现数据集）需要后端先扩展 schema。

## 触发条件

- 用户要求为论文库中的论文补充代码库链接
- 用户要求查找某篇论文的官方代码仓库
- 用户说"找代码 / 补代码库 / 补充 GitHub 链接"

## 前置条件

- 后端服务运行中（默认 `http://localhost:8787`）
- 论文已入库（papers 表有 `id`、`title`、`paperUrl`）

## 执行流程

### Step 1: 读取论文记录

```bash
# 拉所有论文
curl -s "http://localhost:8787/api/papers?limit=500" | jq '.data.items'

# 按字段筛选
curl -s "http://localhost:8787/api/papers?field=SLT&limit=500" | jq '.data.items'
```

### Step 2: 识别缺少代码库的记录

筛选 `repoUrl == null` 的记录：

```bash
curl -s "http://localhost:8787/api/papers?limit=500" | \
  jq '.data.items[] | select(.repoUrl == null) | {id, title, paperUrl}'
```

保留：`id` + `title` + `paperUrl`。

### Step 3: 查找 GitHub 链接（优先级）

1. 表内已有 `repoUrl` → 跳过
2. 论文已有本地 PDF（`pdfStoragePath` 非空）：先 GET PDF 解析（官方信号优先）
3. `paperUrl` 页面（CVF/ECVA/OpenReview/IJCAI 等）直接抽取 `github.com/<owner>/<repo>`
4. `paperUrl` 是 PDF 时，从 PDF 文本中抽取 GitHub 链接
5. GitHub 搜索（标题全称 + 简称）并做二次验证（README 是否出现论文标题关键词）
6. 仍找不到 → 留空（不要写伪链接）

### Step 3.5: 下载并解析本地 PDF（若存在）

```bash
mkdir -p /tmp/papers
curl -L -o "/tmp/papers/<PAPER_ID>.pdf" "http://localhost:8787/api/papers/<PAPER_ID>/pdf"
```

解析要点：
- 第一页底部（作者信息下方）经常直接给官方仓库链接
- Introduction 常见"code available at ..."语句
- 提取到子路径仓库时保留完整 URL（例如 `.../tree/main/subdir`）
- 后端 PDF 端点 404 时，回退到 `paperUrl` / arXiv 页面解析

### Step 4: 批量获取 README / requirements

```bash
for repo in <owner/repo_list>; do
  curl -fsSL "https://raw.githubusercontent.com/${repo}/main/README.md" -o "/tmp/readmes/${repo//\//_}.md" || \
  curl -fsSL "https://raw.githubusercontent.com/${repo}/master/README.md" -o "/tmp/readmes/${repo//\//_}.md"
done
```

同理可尝试 `requirements.txt`、`environment.yml`。

### Step 5: 提取环境信息（待后端扩展字段）

#### PyTorch 版本优先级
1. `requirements*.txt` 的 `torch==X.Y.Z`
2. `environment*.yml` 的 `pytorch=X.Y.Z`
3. README 安装命令中的 `torch==X.Y.Z`
4. `torch>=X.Y.Z`（标记为最低版本）

#### 复现数据集优先级
1. README 的 `Datasets / Data Preparation / Getting Started`
2. 配置文件中显式数据集名
3. 只写明确提及的数据集，不推断

> **当前 schema 限制**：`papers` 表暂无 `pytorchEnv` / `cudaVersion` / `reproductionDatasetsJson` 等字段。在后端扩展前，本步骤的产出只能写到 `paper_analysis.notes` 字段（前缀 `[环境]`）：
> ```bash
> curl -X PATCH "http://localhost:8787/api/papers/<PAPER_ID>/analysis" \
>   -H "Content-Type: application/json" \
>   -d '{"notes": "[环境] PyTorch=1.13.1 CUDA=11.7\n[复现数据集] Phoenix-2014, Phoenix-2014-T"}'
> ```

### Step 6: 写回知识库

```bash
curl -X PATCH "http://localhost:8787/api/papers/<PAPER_ID>" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/owner/repo"}'
```

关键点：
- 字段名严格按 zod 定义：`repoUrl`（驼峰）。
- URL 必须是合法 URL（zod `.url()` 校验），不能写"未找到公开代码库"等文本（会 422）。
- "未找到"请保持 null（不调用 PATCH）。

### Step 7: 验证

更新后抽样回读 2-3 条：

```bash
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq '.data.paper.repoUrl'
```

## 已知限制

1. 远程 PDF（arXiv 等）不稳定：建议先通过 PDF 上传端点把 PDF 上传到后端，再调用本 skill。
2. GitHub README 分支可能是 `master` 而非 `main`，需回退尝试。
3. 子目录仓库（如 `FangyunWei/SLRT/tree/main/NLA-SLR`）应保留子路径，不要简化为根仓库。
4. GitHub 匿名搜索/接口可能受限（429/403）；搜索结果需二次验证后再写回。
5. 当前 schema 不支持 PyTorch/CUDA/复现数据集独立字段，先写到 `analysis.notes`。

## 质量红线

- 不确定的候选仓库不要写入。
- PyTorch/CUDA 必须注明来源（requirements / env / README）。
- `>=` 版本必须标注为最低兼容版本，不得伪装成精确版本。
- 未找到的信息留空（不调用 PATCH），不编造。
