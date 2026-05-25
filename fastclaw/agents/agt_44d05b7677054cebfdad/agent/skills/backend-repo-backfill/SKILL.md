---
name: backend-repo-backfill
version: 2.0.0
description: 通过 Warmth Connect Portal 后端 API 批量回填论文代码库 URL（GitHub）。适用场景：已有论文记录但 `repoUrl` 字段为空，需要从 PDF / 论文页 / GitHub 搜索补全。
tags: [repo-backfill, github, backend-api, http]
---

# backend-repo-backfill

## 适用场景
- 论文已经入库（papers 表有记录）
- 需要批量补 `repoUrl` 字段
- 规则：已有 `repoUrl` 跳过，只处理空值

## 标准流程

### 1) 拉取目标论文列表
```bash
# 拉所有论文（默认分页，可加 ?limit=500）
curl -s "http://localhost:8787/api/papers?limit=500" | jq '.data.items'

# 也可按字段/年份筛选
curl -s "http://localhost:8787/api/papers?field=SLT&limit=500" | jq
```

### 2) 过滤待处理记录
本地用 `jq` 筛选 `repoUrl == null` 的记录：

```bash
curl -s "http://localhost:8787/api/papers?limit=500" | \
  jq '.data.items[] | select(.repoUrl == null) | {id, title, paperUrl, pdfUrl}'
```

保留：`id`、`title`、`paperUrl`、`pdfUrl`。

### 3) 优先解析 PDF 附件（官方信号）
若论文有本地 PDF（`pdfStoragePath` 不空），先下载：

```bash
# 通过后端获取 PDF（自动走 pdfStoragePath 或 redirect 到 pdfUrl）
curl -L -o /tmp/paper-<PAPER_ID>.pdf "http://localhost:8787/api/papers/<PAPER_ID>/pdf"
```

解析策略：
- 先扫 **第一页底部**（常见 `Code / Project Page / GitHub`）
- 再扫 **Introduction(第1章)** 中的仓库声明（`Code is available at ...`）
- 提取 `github.com/<owner>/<repo>`（含子路径时保留完整 URL）

若本地 PDF 不可用，回退到 `paperUrl` 页面解析。

### 4) 写回单条记录
```bash
curl -X PATCH "http://localhost:8787/api/papers/<PAPER_ID>" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/owner/repo"}'
```

### 5) 写回后验证
抽样回读 2-3 条：
```bash
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq '.data.paper.repoUrl'
```

## 关键坑位

### 坑1：PATCH body 字段名
- ✅ 正确：`{"repoUrl": "https://..."}`（驼峰命名）
- ❌ 错误：`{"repo_url": "..."}` 或 `{"代码库": "..."}`
- 字段名严格按 `papers.dto.ts` 中 `updatePaperSchema` 定义

### 坑2：URL 必须是合法 URL
- 后端用 zod `z.string().url()` 校验，必须 `https://...` 或 `http://...` 开头
- ❌ 不能写"未找到公开代码库"等占位文本（会触发 422）
- ✅ 正确做法：未找到时不调用 PATCH，保持 null

### 坑3：子路径仓库不能丢
- 如 `https://github.com/FangyunWei/SLRT/tree/main/NLA-SLR`
- 不能简化成 `https://github.com/FangyunWei/SLRT`

### 坑4：PDF 路径
- 通过 `GET /api/papers/<id>/pdf` 获取 PDF（可能 redirect 到外部 pdfUrl）
- `-L` 跟随 302 重定向
- 大文件用 `-o` 写入本地，避免内存爆炸

### 坑5：批量任务的 rate limit
- 同一进程批量 PATCH 时，建议每条间隔 100ms 以上
- 远程 PDF（arXiv 等）下载有 rate limit，建议本地缓存

## 推荐输出模板
- 本轮处理总数
- 已有 repoUrl 跳过数
- 新补成功数
- 未找到数（保持 null）
- 未找到标题清单（供下轮深挖）
