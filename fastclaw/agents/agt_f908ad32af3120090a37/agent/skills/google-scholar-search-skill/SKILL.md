# Google Scholar Search (Deprecated / Fallback)

> 状态：**备用 skill**，后续可移除。

## 定位

这个 skill 不再作为默认论文检索入口。
默认请优先使用 **`literature-search`**。

## 现在的职责

仅在以下情况作为补充使用：
- 用户明确要求“用 Google Scholar 查”
- 主检索链路结果不足，需要补召回
- 需要借助 Google Scholar 的排序或引用线索做候选扩展

## 限制

- Google Scholar **没有官方 API**
- 依赖 scraping / 非官方访问方式
- 会受 anti-bot、频率限制、地区和时间波动影响
- 返回结果**不能单独作为最终元数据依据**

## 使用规则

1. 把它当作**补充召回源**，不要当主事实源。
2. 重要结果必须再用以下来源之一校验：
   - arXiv
   - Semantic Scholar
   - OpenAlex
   - Crossref
   - 期刊/会议官网
3. 若检索结果来自 Google Scholar，输出时应明确说明：
   - `来源补充：Google Scholar（非官方接口，已尽量校验）`

## 路由关系

- 默认论文检索入口：`literature-search`
- 文献综述组织：`literature-review`
- 深度研究：`academic-deep-research`
- 单篇总结：`paper_summarize`

## 迁移说明

Google Scholar 相关策略已经并入 `literature-search` 的检索策略中。
本 skill 仅保留为兼容旧习惯和特殊场景的备用入口。
