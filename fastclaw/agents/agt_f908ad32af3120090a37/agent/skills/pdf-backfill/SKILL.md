---
name: pdf-backfill
description: 补全飞书多维表格中缺失的论文 PDF 附件。适用于用户要求“补 PDF”“补全缺失附件”“给论文表回填 PDF”“检查哪些论文没上传 PDF 并补上”这类场景，尤其适合已存在论文记录、但 `地址`/PDF 附件字段为空的表。默认面向飞书 Wiki/Base 里的论文库，先找缺失记录，再从 arXiv、CVF、ECVA、OpenReview、ACL Anthology、ACM 等来源检索可下载 PDF，最后上传回对应记录。
---

# PDF Backfill

## 概述

这个 skill 用于给飞书论文表批量补全缺失的 PDF 附件。

目标是最少打断用户，按“定位表 → 找缺失记录 → 搜 PDF → 下载 → 上传回记录 → 回查”的顺序完成；优先使用稳定、可直接下载的官方 PDF 来源，不编造链接。

## 默认适用对象

默认论文表：

- base/app token: `CGWZbukMaaNwsfsZePycnot1nNe`
- table id: `tblBzFxvANiHTytq`
- PDF 字段：`地址`
- 标题字段：`标题`
- 原链接字段：`原链接`

如果用户给了新的 Wiki/Base 链接，以用户提供的目标为准。

## 工作流

### Step 1. 定位目标表

如果用户给的是 wiki 链接，先解析 wiki 节点，拿到真实 bitable token。

优先从 URL 中提取：
- base token
- table id
- view id（如果有）

如果是默认论文库且用户没有指定别的表，可直接使用默认 token/table。

### Step 2. 列出记录并找出缺失 PDF 的条目

使用 `feishu_bitable_app_table_record.list` 读取至少这些字段：
- `标题`
- `地址`
- `原链接`

把以下情况视为“待补全”：
- `地址` 字段不存在
- `地址` 为空数组

把以下情况视为“通常已存在，不优先处理”：
- `地址` 已有附件，即使返回里 `size=0` 或 `type` 为空，也先当作已上传，除非用户明确要求重传/修复损坏附件

### Step 3. 为每篇论文寻找最稳妥的 PDF 来源

优先顺序：

1. **原链接可直接转 PDF 时，优先用原链接体系**
   - arXiv `abs` → 转 `pdf`
   - CVF html 页面 → 对应 `_paper.pdf`
   - ACL Anthology 页面通常可直接找到 PDF
   - OpenReview：`forum?id=...` 可稳定转为 `pdf?id=...`
   - ECVA/ECCV 页面可找到对应 PDF
   - IJCAI：`/proceedings/<year>/<n>` 常可转为 `/<4位补零n>.pdf`
   - AAAI OJS：先打开 article 页面，优先抓取 `/article/download/...` 链接
   - ACM 若原链接已是 `doi/pdf/...`，可直接下载；否则尝试 `https://dl.acm.org/doi/pdf/<doi>`
   - IEEE：优先尝试 `stamp.jsp?arnumber=<id>`，若返回 HTML/418/“You do not have access to this PDF”，判定为受限，不要上传伪 PDF

2. **原链接不够用时，用标题搜索 PDF**
   - `web_search` 查询：`"<title>" pdf`
   - 优先选择官方来源或 arXiv/CVF/ECVA/ACL/OpenReview/ACM

3. **多个来源都可用时，优先官方会议/期刊 PDF，其次 arXiv**

### Step 4. 下载 PDF 到本地

arXiv PDF 下载在当前网络环境下**极不稳定**，wget/curl 经常超时或截断。必须使用多策略回退。

用 `exec` 下载到临时目录，例如 `/tmp/paper_fill/`。

**推荐下载策略（按优先级）：**
```bash
# 策略1：curl 断点续传（最推荐，可多次 -C - 续传直到完整）
curl -sL -C - --max-time 120 -o /tmp/paper_fill/<safe>.pdf "https://arxiv.org/pdf/<arxiv-id>"

# 策略2：wget（简单但容易超时）
wget -q --timeout=60 --tries=3 -U "Mozilla/5.0" -O /tmp/paper_fill/<safe>.pdf "https://arxiv.org/pdf/<arxiv-id>"
```

**下载验证（必须执行）**：下载后用 PyMuPDF 验证页数，`pages=0` 表示截断需续传：
```python
import fitz
doc = fitz.open(pdf_path)
pages = len(doc)  # pages=0 = 截断，需续传或重试
doc.close()
```

约束：
- 文件名用安全英文名，避免空格和特殊字符
- 用 `curl -L --fail` 或等价方式下载
- 下载后检查文件存在且大小明显大于 0
- **必须校验文件头是 `%PDF-`**（避免把 403/登录页 HTML 当成 `.pdf` 上传）
- **批量下载时**：先统一下载所有 PDF，再逐个上传；不要边下载边上传导致超时
- 建议在上传前执行一次机器校验（示例）：

```bash
python3 - <<'PY'
import os,sys
p='''/tmp/paper_fill/<safe-name>.pdf'''
b=open(p,'rb').read(5) if os.path.exists(p) else b''
s=os.path.getsize(p) if os.path.exists(p) else 0
print('sig',b,'size',s)
# sig 必须是 b'%PDF-' 且 size > 10KB
PY
```

示例模式：

```bash
mkdir -p /tmp/paper_fill
curl -L --fail -o /tmp/paper_fill/<safe-name>.pdf <pdf-url>
ls -lh /tmp/paper_fill/<safe-name>.pdf
```

### Step 5. 上传到对应记录的 PDF 字段

对默认论文库，优先用 `lark-cli base +record-upload-attachment` 上传，因为它对附件字段最稳。

固定字段：
- field id: `fld4la8lmW`
- field name: `地址`

上传前可把文件复制到 `~/paper_fill_upload/`，再用相对路径调用 CLI。

示例模式：

```bash
lark-cli base +record-upload-attachment \
  --base-token <base-token> \
  --table-id <table-id> \
  --record-id <record-id> \
  --field-id fld4la8lmW \
  --file ./paper_fill_upload/<file>.pdf \
  --name <file>.pdf
```

### Step 6. 回查验证

上传后再次读取：
- `标题`
- `地址`

确认目标记录已经出现附件对象。

## 标准流程（强制执行）

> 下面这套是 **执行闸门**，不是建议项。凡是批量补 PDF，必须逐条通过。

### Gate A：候选链接闸门（下载前）
- 候选 URL 必须来自：原链接规则推断、官方页面、或可验证的同题 arXiv。
- 标题需做相似度校验（建议阈值 ≥0.72，或人工确认“同题同年同来源”）。
- 不能仅凭关键词相近就当作同一论文。

### Gate B：文件真伪闸门（上传前）
- 必须同时满足：
  1) 文件头为 `%PDF-`
  2) 文件大小 > 10KB（建议更高阈值）
- 任一不满足即判定为伪 PDF（常见是 403/登录页 HTML），**禁止上传**。

### Gate C：可写入闸门（上传时）
- `lark-cli base +record-upload-attachment --file` 只接受当前目录相对路径。
- 单附件超过上限（实测约 20MB）时，先压缩再传。
- 上传失败要重试（至少 1 次），并记录失败原因。

### Gate D：回查闸门（上传后）
- 重新读取记录，确认 `地址` 字段确实新增附件对象。
- 对关键批次做抽样“可下载+文件头校验”复核，防止脏附件混入。

### 事故级红线
- 禁止上传 0B 文件。
- 禁止上传 HTML/验证码页伪装的 `.pdf`。
- 禁止把不确定来源当作“已补全”。

## 搜索与匹配规则

### 推荐搜索式

```text
"<论文标题>" pdf
```

### 来源优先级

1. openaccess.thecvf.com
2. ecva.net
3. arxiv.org
4. openreview.net
5. aclanthology.org
6. dl.acm.org
7. ieeexplore.ieee.org

### 匹配原则

- 标题必须高度一致（建议做标题字符串相似度校验）
- 不要因为关键词相似就误传别的论文
- **替代来源（如 arXiv）仅在可确认是同一篇论文时使用**；无法确认时宁可留空并汇报
- 若搜索结果只有 supplemental，不要当主论文 PDF，除非用户明确也接受
- 上传前必须校验 `%PDF-` 文件头和最小体积阈值，禁止上传 0B/HTML 伪 PDF
- 若拿不准，就停下来汇报不确定项，不要硬传

## 特殊情况处理

### 1. 原链接为空

直接用标题搜索。

### 2. 原链接是 HTML 页面

优先推断其 PDF 规律；推断不稳时再搜索。

### 3. 已有附件但可能损坏

默认不覆盖。只有在用户明确说“重传”“修复损坏 PDF”“替换现有附件”时，才覆盖处理。

### 3.1 附件上传链路的硬性限制（lark-cli）

- `+record-upload-attachment --file` **必须是当前工作目录下的相对路径**。
  - ❌ 直接传绝对路径（如 `/tmp/paper_fill/a.pdf`）会报 `unsafe file path`
  - ✅ 先 `cd` 到文件目录，再传 `--file ./a.pdf`
- 单附件大小存在上限（实测约 **20MB**，超限会报 `file ... exceeds 20MB limit`）。
  - 超限时先压缩 PDF，再上传；可用 Ghostscript：

```bash
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook \
  -dNOPAUSE -dQUIET -dBATCH \
  -sOutputFile=compressed.pdf original.pdf
```

压缩后建议保留原论文文件名作为 `--name`，便于表格检索一致性。

### 4. 表里混入非目标领域论文

如果用户要求“把这张表里缺失的 PDF 都补全”，则正常补，不因主题不一致而跳过。

### 5. 找不到可靠 PDF

保留记录不动，并向用户列出失败清单：
- 标题
- 尝试过的来源
- 失败原因（无官方 PDF / 链接失效 / 搜索歧义 / 来源站点 403/418/付费墙）

若官方来源被 403/付费墙拦截，可用 **同题 arXiv 预印本**作为替代附件，但需要在结果汇报中明确“替代来源（非最终出版 PDF）”。

## 输出要求

完成后给用户一个简短结果：
- 本次补了多少篇（成功上传数）
- 哪些标题已完成
- 哪些还没补上
- 是否发现异常记录（例如表里已有附件但文件元信息异常）

并且必须增加 3 个质量指标：
- 伪 PDF 拦截数（文件头/体积闸门拦截）
- 上传失败数（含 403/超限/路径错误）
- 回查通过率（上传后记录可见）

不要输出大段空话。

## 注意事项

- 批量处理时，先统一列出缺失项，再批量检索和上传，减少来回调用
- 优先少量稳定批次，不要一口气做超大批量并发写入
- 不要把 supplemental PDF 当主论文 PDF
- 不要编造 DOI、PDF 链接或来源
- 对附件字段写入，优先走 CLI 上传链路，不要手搓不稳定格式

### lark-cli 身份与权限

- **Bot 身份**（`--as bot`，默认）缺少 `base:record:create` / `base:record:read` 权限，会报 `99991672 Access denied`
- **用户身份**（`--as user`）需要先完成设备授权登录：
  ```bash
  LARK_CLI_NO_PROXY=1 lark-cli auth login --domain base --no-wait
  # 返回 verification_url + user_code，用户在浏览器完成授权后：
  LARK_CLI_NO_PROXY=1 lark-cli auth login --device-code <code>
  ```
- ⚠️ `lark-cli auth login` 默认走 `HTTPS_PROXY`，代理不可用时会报 `proxyconnect tcp: connection refused`；加 `LARK_CLI_NO_PROXY=1` 绕过
- 授权后所有 `+record-*` 命令需加 `--as user`

## 失败模板

当有部分论文补不上时，用类似格式汇报：

- 已补：5 篇
- 未补：2 篇
  - `<title 1>`：只找到摘要页，未找到可靠 PDF
  - `<title 2>`：搜索结果歧义，需人工确认

## references/

- `references/arxiv-download-strategies.md` — arXiv API 批量摘要获取、PDF 下载稳定性实测、断点续传策略、完整性验证方法

如果后续这个 skill 需要支持更多来源站点或更复杂的 URL 规则，把站点到 PDF 的转换规则沉淀到 `references/source-mapping.md`，主 SKILL 保持精简。
