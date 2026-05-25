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
import re, time
from hermes_tools import terminal

def fetch_arxiv_abstracts(arxiv_ids):
    """批量获取 arXiv 论文摘要"""
    abstracts = {}
    for aid in arxiv_ids:
        r = terminal(f'curl -sL --max-time 15 "https://export.arxiv.org/api/query?id_list={aid}"', timeout=20)
        output = r.get("output", "")
        m = re.search(r'<summary>(.*?)</summary>', output, re.DOTALL)
        if m:
            abstracts[aid] = m.group(1).strip().replace('\n', ' ')
        time.sleep(0.5)
    return abstracts
```

## arXiv PDF 下载稳定性

### 当前环境实测结果（2026-05）

| 方法 | 成功率 | 备注 |
|------|--------|------|
| `wget` 直接下载 | ~40% | 经常超时，大文件几乎必失败 |
| `curl` 单次下载 | ~40% | 同上，但支持 `-C -` 续传 |
| `curl -C -` 多次续传 | ~70% | 每次续传 120s，需 2-5 轮 |
| `curl` + Python requests 流式 | ~30% | 超时更严重 |
| 浏览器下载 | 未验证 | 理论上走代理更稳定 |

### 推荐批量下载流程

1. 先用 `curl -C - --max-time 120` 尝试下载
2. 用 PyMuPDF 验证 `len(doc) > 0`
3. 如果 `pages=0`，再次 `curl -C -` 续传
4. 最多重试 5 次，仍失败则跳过（记录仍创建，PDF 后续补传）
5. 批量场景：先统一下载所有 PDF，再逐个入库

### PDF 完整性验证

```python
import fitz
doc = fitz.open(pdf_path)
pages = len(doc)
# pages > 0: 完整或部分可用
# pages = 0: 截断，需续传
# 异常: 文件损坏或非 PDF
doc.close()
```

### 常见失败模式

- **0B 文件**：网络完全不通，rm 后重试
- **小文件（<100KB）**：可能是 arXiv 的 HTML 错误页，检查 `file` 命令输出
- **大文件但 pages=0**：PDF 截断，用 `curl -C -` 续传
- **`Rate exceeded.`**：export.arxiv.org 限流，等 30 秒后重试
