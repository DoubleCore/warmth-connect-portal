# arXiv Download & Metadata Strategies

## arXiv API 批量获取摘要

当有多个 arXiv ID 时，优先用 API 批量获取元数据+摘要，比逐篇 web_search 快得多。

```bash
# 单篇
curl -sL --max-time 15 "https://export.arxiv.org/api/query?id_list=1810.04805"

# 批量（逗号分隔，每批 ≤10 篇，间隔 3 秒）
curl -sL --max-time 30 "https://export.arxiv.org/api/query?id_list=1810.04805,2005.14165,1910.10683&max_results=25"
```

### 关键注意事项

1. **必须用 HTTPS + `-L`**：HTTP 会 301 重定向，curl 不加 `-L` 会拿到空响应
2. **用正则而非 XML 解析**：arXiv XML 偶有格式问题导致 `ET.parse` 失败，用 `<summary>(.*?)</summary>` 正则提取更鲁棒
3. **限流**：每批 ≤10 篇，间隔 3 秒；`export.arxiv.org` 会返回 `Rate exceeded.` 文本
4. **arxiv ID 提取**：API 返回的 `<id>` 是 `http://arxiv.org/abs/1810.04805v2` 格式，需 split `/abs/` 再 split `v` 获取纯 ID

### Python 批量获取示例

```python
import re, time, subprocess

def fetch_arxiv_abstracts(arxiv_ids):
    abstracts = {}
    for aid in arxiv_ids:
        r = subprocess.run(
            ['curl', '-sL', '--max-time', '15',
             f'https://export.arxiv.org/api/query?id_list={aid}'],
            capture_output=True, text=True, timeout=20
        )
        m = re.search(r'<summary>(.*?)</summary>', r.stdout, re.DOTALL)
        if m:
            abstracts[aid] = m.group(1).strip().replace('\n', ' ')
        time.sleep(0.5)
    return abstracts
```

## arXiv PDF 下载稳定性

### 推荐批量下载流程

1. 先用 `curl -C - --max-time 120` 尝试下载
2. 用 PyMuPDF 验证 `len(doc) > 0`
3. 如果 `pages=0`，再次 `curl -C -` 续传
4. 最多重试 5 次，仍失败则跳过（记录仍创建，PDF 后续补传）
5. 批量场景：先统一下载所有 PDF，再逐个上传到后端

### PDF 完整性验证

```python
import fitz
doc = fitz.open(pdf_path)
pages = len(doc)
# pages > 0: 完整或部分可用
# pages = 0: 截断，需续传
doc.close()
```

### 常见失败模式

- **0B 文件**：网络完全不通，rm 后重试
- **小文件（<100KB）**：可能是 HTML 错误页，检查 `file` 命令输出
- **大文件但 pages=0**：PDF 截断，用 `curl -C -` 续传
- **`Rate exceeded.`**：export.arxiv.org 限流，等 30 秒后重试

## 上传到后端

```bash
curl -X POST "http://localhost:8787/api/papers/<PAPER_ID>/pdf" \
  -F "file=@/tmp/pdf_backfill/<PAPER_ID>.pdf"
```

后端会把文件存到 `PDF_STORAGE_DIR`（默认 `storage/pdfs/`），并把生成的相对路径写入 `papers.pdfStoragePath`。
