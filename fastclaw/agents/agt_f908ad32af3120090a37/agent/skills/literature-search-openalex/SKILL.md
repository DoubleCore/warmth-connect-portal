---
name: literature-search-openalex
description: 用 OpenAlex API 搜索顶刊顶会学术论文。支持按研究方向、时间范围、会议/期刊筛选，按引用量排序。适用于"搜XX方向顶会论文"、"找推荐算法高引论文"等场景。
version: 1.0
---

# OpenAlex 学术论文搜索

## 触发条件
- 用户要求搜索某方向的顶刊顶会论文
- 需要按引用量、时间、会议/期刊筛选学术论文
- "搜XX方向论文"、"找XX领域高引论文"

## 核心原则
- **OpenAlex 优先**：免费、不限流、元数据完整（venue、引用量、作者、DOI）
- **Semantic Scholar 备用**：限流严重（429），仅适合单篇查询，不适合批量
- **arXiv 补充**：适合搜最新预印本，但 comment 字段（顶会信息）常为空

## 步骤

### 1. 确定 concept ID
用 OpenAlex concepts API 搜索研究方向的 concept ID：
- URL: `https://api.openalex.org/concepts?search=RESEARCH_TOPIC&per_page=5`
- 选 level=2 或 level=3 的概念（更具体）
- 记录 concept ID（如 `C557471498` = Recommender system）

### 2. 批量拉取论文（按引用量排序）
用 OpenAlex works API 批量拉取：
- URL: `https://api.openalex.org/works?filter=concepts.id:CONCEPT_ID,from_publication_date:YYYY-01-01&sort=cited_by_count:desc&per_page=200&select=id,title,authorships,publication_year,cited_by_count,primary_location,doi`

**关键参数**：
- `sort=cited_by_count:desc`（⚠️ 不是 `citation_count`，会报错）
- `per_page` 最大 200（更大值可能超时）
- `from_publication_date` 控制时间范围

### 3. 本地过滤顶会/顶刊
OpenAlex 的 `primary_location.source.id` filter 与 `search` 参数互斥，必须本地过滤。

顶会关键词列表：
- `sigir`, `kdd`, `web conference`, `www`, `neurips`, `icml`, `aaai`, `recsys`, `wsdm`, `iclr`, `cikm`, `icde`, `cvpr`, `iccv`, `eccv`, `acl`, `emnlp`, `naacl`

顶刊关键词列表：
- `acm transactions on recommender`, `ieee transactions on knowledge`, `acm computing surveys`, `acm transactions on information systems`, `nature`, `science`, `jmlr`, `tpami`

从 `primary_location.source.display_name` 中匹配关键词，分为顶会和顶刊两组。

### 4. 输出结构化结果
按顶会/顶刊分组，输出：标题、年份、引用量、venue、作者（前3+et al.）、DOI

## 关键问题：引用量排序偏向老论文

`sort=cited_by_count:desc` 天然偏向老论文——2022 年的论文比 2024/2025 年多积累了 2-3 年引用量，top 200 里老论文占绝对多数。

**解决方案**：按年份分别搜索，或在本地按 `publication_year` 分组后再排引用量：
- 方案 A：对每个目标年份分别发请求（`filter=...,publication_year:2024`）
- 方案 B：拉取大范围后本地按年份分组，每组内按引用量排序（推荐，减少 API 调用）

## 关键问题：顶会论文 venue 字段大量为空

OpenAlex 对会议论文的 `primary_location.source.display_name` 标注严重缺失——大量 SIGIR/KDD/WWW/RecSys 论文的 venue 字段为空，导致本地关键词过滤漏掉这些论文。

**解决方案**：对 venue 为空但高引的论文，通过 DOI 反查 Crossref 确认会议：
1. 收集 venue 为空但有 DOI 且引用量 ≥ 阈值（如 30）的论文
2. 批量调用 Crossref API：`https://api.crossref.org/works/{DOI}`
3. 从返回的 `container-title`（期刊/会议录名）或 `event.name`（会议名）提取 venue
4. 合并回主数据，重新做顶会/顶刊分类

**Crossref DOI 反查示例**：
```python
# DOI: 10.1145/3543507.3583251
# Crossref 返回:
#   container-title: "Proceedings of the ACM Web Conference 2023"
#   event.name: "WWW '23: The ACM Web Conference 2023"
```

**注意**：Crossref 也有速率限制，批量查询时每篇间隔 0.5-1 秒，40 篇约需 30-60 秒。

## 常见 DOI 前缀 → 会议映射（快速识别）

| DOI 前缀 | 会议 | 年份 |
|-----------|------|------|
| 10.1145/3543507 | WWW 2023 | 2023 |
| 10.1145/3539618 | SIGIR 2023 (46th) | 2023 |
| 10.1145/3580305 | KDD 2023 (29th) | 2023 |
| 10.1145/3539597 | WSDM 2023 (16th) | 2023 |
| 10.1145/3604915 | RecSys 2023 (17th) | 2023 |
| 10.1145/3583780 | CIKM 2023 (32nd) | 2023 |
| 10.1145/3616855 | WSDM 2024 (17th) | 2024 |
| 10.1145/3589334 | WWW 2024 | 2024 |
| 10.1145/3637528 | KDD 2024 (30th) | 2024 |
| 10.1609/aaai | AAAI (各年) | 各年 |

> ⚠️ 此表仅作快速参考，新年份会议的 DOI 前缀会变化，最终以 Crossref 反查结果为准。

## 踩坑记录

| 问题 | 原因 | 解决 |
|------|------|------|
| Semantic Scholar 返回 429 | 免费额度极低，1-2次/秒即限流 | 放弃批量查询，改用 OpenAlex |
| arXiv `co:` 字段搜顶会不准 | comment 字段非必填，大量论文缺失 | 仅用于搜最新预印本 |
| OpenAlex `citation_count` 报错 | 字段名错误 | 正确字段：`cited_by_count` |
| OpenAlex source filter + search 互斥 | API 限制 | 先拉大范围，本地按 venue 关键词过滤 |
| OpenAlex per_page=500 超时 | 数据量太大 | 限制 per_page=200，分批拉取 |
| 搜索词太宽泛返回无关结果 | 如 "deep learning" 匹配到医学论文 | 用 concept ID 精准过滤 + 本地排除非核心论文 |
| 引用量排序全是老论文 | 2022 年论文比 2024 多 2-3 年引用积累 | 按年份分组，每组内排引用量 |
| 顶会论文 venue 字段为空 | OpenAlex 对会议论文 venue 标注严重缺失 | 通过 DOI 反查 Crossref 的 container-title/event.name |
| OpenAlex 持续限流（空响应） | 短时间多次请求触发限流 | 请求间隔 3-5 秒，或 sleep 30 后重试 |
| Crossref query 模式太宽泛 | 搜 "recommender system" 返回 45 万篇 | 不用 query 模式，改用 DOI 精准反查 |
| DBLP API 返回空 | 限流或格式问题 | 不推荐作为主力，仅备用 |

## 多源补充策略

| 来源 | 用途 | 限制 |
|------|------|------|
| OpenAlex | 主力：元数据+引用量+venue | 无 |
| arXiv | 补充最新预印本（1-2天内） | 无顶会信息 |
| Semantic Scholar | 单篇详情查询（如需引用网络） | 限流严重，需 API key |
| Google Scholar | 验证/补充 | 需要代理或 serpapi |

## 扩展：按顶会 source ID 精准搜索
1. 先查 source ID：`https://api.openalex.org/sources?search=SIGIR+conference&per_page=5&select=id,display_name,type,works_count`
2. 用 source.id 过滤（注意不能与 search 同时用）：`https://api.openalex.org/works?filter=primary_location.source.id:SOURCE_ID,from_publication_date:2023-01-01&sort=cited_by_count:desc&per_page=50`
