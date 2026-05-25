---
name: backend-doc-authoring
description: 在 Warmth Connect Portal 后端的 storage 目录下创建 Markdown 文档（论文分析/Related Work 报告等），并通过后端 API 关联到论文记录。
version: 2.0.0
---

# 后端 Markdown 文档创建与验证 SOP

## 触发场景
- 用户要求把分析结果保存为"知识库文档"而不是数据表字段。
- 需要快速产出可阅读的结构化 Markdown 文档（如 Related Work 分组解读、综述报告）。
- 替代旧版 `larkcli-wiki-doc-authoring`（飞书 Wiki 文档）。

## 标准流程

### 1) 准备文档正文
- 在本地生成 Markdown 文件（推荐 `/tmp/<topic>.md` 或工作区临时目录）。
- 内容建议包含：选题、来源论文、分组逻辑、逐条分析、结论与模板。
- 文档头部加 frontmatter（可选）便于后端管理：

```markdown
---
title: SLT 相关工作综述
related_papers:
  - <paperId-1>
  - <paperId-2>
generated_at: 2026-05-20
---

# 综述正文
...
```

### 2) 保存到后端 storage 目录
当前后端默认 storage 路径在 `f:\Hermes\warmth-connect-portal\backend\storage\`。建议创建子目录 `documents/`：

```bash
# 直接写入 storage 目录（如果有写文件权限）
mkdir -p F:\Hermes\warmth-connect-portal\backend\storage\documents
copy /tmp/report.md F:\Hermes\warmth-connect-portal\backend\storage\documents\slt_review_2026-05-20.md
```

如果后端尚未提供文档 API，先把 Markdown 存到本地，待后端扩展后再迁入。

### 3) 关联到论文记录（可选）
如果文档关联了具体论文，把文档路径写入 `paper_analysis.notes`：

```bash
# 读已有 notes
EXISTING=$(curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq -r '.data.analysis.notes // ""')

# 拼接文档引用
DOC_REF="[综述文档] storage/documents/slt_review_2026-05-20.md (生成于 2026-05-20)"
NEW_NOTES="${DOC_REF}\n${EXISTING}"

curl -X PATCH "http://localhost:8787/api/papers/<PAPER_ID>/analysis" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'notes': sys.argv[1]}, ensure_ascii=False))" "$NEW_NOTES")"
```

### 4) 回读验证
```bash
# 验证文档文件存在
ls -lh F:\Hermes\warmth-connect-portal\backend\storage\documents\

# 验证关联写入
curl -s "http://localhost:8787/api/papers/<PAPER_ID>/detail" | jq '.data.analysis.notes'
```

### 5) 修订与版本
- 命名约定：`<topic>_<YYYY-MM-DD>.md`，每次修订生成新文件而非覆盖。
- 旧版本保留以便对比。

## 后续扩展（待后端实现）
若后端未来扩展文档管理接口，可改为：

```
POST   /api/documents              创建文档（body: {title, content, paperIds}）
GET    /api/documents              列表
GET    /api/documents/:id          详情
PATCH  /api/documents/:id          更新
DELETE /api/documents/:id          删除
```

届时本 skill 会切换为调用上述 API。

## 常见坑位
- **路径分隔符**：Windows 上 `\` 与 Unix 的 `/`，跨平台脚本统一用 `/` 或 `path.join`。
- **中文文件名**：避免，可能在某些 shell 环境下乱码。
- **大文件**：单 Markdown 超过 1MB 时考虑拆分章节。

## 与旧版（飞书 Wiki）差异

| 维度 | 旧版（lark-cli wiki） | 新版（后端 storage） |
|------|---------------------|---------------------|
| 存储位置 | 飞书云端 Wiki Space | 本地 `storage/documents/` |
| 创建命令 | `lark-cli docs +create --wiki-space ... --markdown ...` | 文件系统直接写 + 可选 PATCH analysis 关联 |
| 回读 | `lark-cli docs +fetch --doc <id>` | `Get-Content` / `cat` |
| 修改 | `lark-cli docs +update --mode overwrite` | 直接覆盖文件 |
| 协作分享 | 飞书 Wiki 链接 | 本地文件路径或后端 API（待扩展） |
| 富文本 | 飞书 post 格式 | 标准 Markdown |
