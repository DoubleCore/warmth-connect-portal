---
name: paper-repo-search-methods
description: 论文代码仓库检索方法库（批量场景），含置信度分级、验证规则、写回策略。
---

# paper-repo-search-methods

用于"给论文表批量补代码仓库"的标准检索方法。核心目标：**可批量执行、低误填率、可持续迭代**。

## 触发条件
- 用户要求"给每篇论文找代码仓库"
- 用户要求"已有就跳过，缺失的补上"
- 后端 papers 表里已有标题/paperUrl，repoUrl 字段缺失

## 输出目标
- 有把握：`PATCH /api/papers/<id>` 写入 `repoUrl`
- 无把握：留空（不调 PATCH）
- 每轮结束输出：补了多少、留空多少、留空清单

## 6 层检索漏斗（按优先级）

1. **表内已有**：`repoUrl` 非空直接跳过
2. **本地 PDF 优先抽取（官方优先）**：若 `pdfStoragePath` 非空，先 `GET /api/papers/<id>/pdf` 下载并解析
   - 重点扫描：**第一页底部**（常见 `Code:` / `Project Page:` / `GitHub:`）
   - 重点扫描：**第1章/Introduction**（常见"Code is available at ..."）
3. **原链接抽取**：从 CVF/ECVA/OpenReview/IJCAI/AAAI 页面抽取 `github.com/<owner>/<repo>`
4. **原链接为 PDF 时全文抽取**：从正文中抽取 GitHub 链接
5. **GitHub repo 搜索**：`"<title>" + github`，候选去重
6. **候选仓库验证 + 兜底留空**：命中验证规则才写；不确定则留空，进入"待二次检索清单"

## 置信度分级（写回门槛）

### A 级（可直接写）
- **本地 PDF** 的第一页/Introduction 明确给出唯一 GitHub repo；或
- 原链接页面或 PDF 直接给出唯一 GitHub repo；或
- 仓库 README 明确写"official code for <论文标题>"

### B 级（可写，但建议备注）
- 搜索命中 1-2 个候选，且有明显标题关键词 + 任务关键词一致

### C 级（不写）
- 只命中通用项目/同名无关仓库
- 无法确认是否对应论文

## 候选验证要点（最少满足 2 条）
- README 出现论文标题关键短语
- 出现对应会议/年份（如 CVPR 2025）
- 出现任务关键词（CSLR/SLT/Sign Language Retrieval）
- 提供论文链接（arXiv/CVF/OpenReview）

## 常见误判规避
- 不要把"同名工具仓库"当论文代码（如 cosign 安全工具）
- 子目录项目要保留完整路径（如 `repo/tree/main/subdir`）
- 低质量镜像仓库不要优先于作者官方仓库

## 批量执行建议
- 每轮先处理"高置信度可自动写回"
- "中低置信度"单独列清单，下一轮人工确认或深挖
- 每次写回后抽样回读验证

## 实战补充

- **arXiv comment 是高价值信号**：部分论文会在 arXiv comment 里直接给代码仓库（含子路径），可作为 A 级证据写回
- **GitHub 搜索结果噪声很高**：列表仓库（awesome list / paper list）默认不写回，必须在 README 中出现明确论文标题或"official code for ..."再写
- **子路径仓库允许直接写回**：如 `github.com/org/repo/tree/master/subdir`，若来自论文官方信号（arXiv comment/README），保留完整路径，不要截断到根仓库
- **PDF 链路约束**：远程 PDF（arXiv 等）下载有 rate limit，建议先调 `POST /api/papers/<id>/pdf` 上传到后端再用 `GET /api/papers/<id>/pdf` 取本地副本

## 迭代机制（重要）
当后续发现新模式（新数据源、新验证信号、误判类型），立即补充到本 skill：
- 新增"可用信号"或"黑名单模式"
- 更新置信度门槛
- 记录失败案例与修复策略
