---
name: pdf-caption-first-key-figure-extraction
description: 从论文 PDF 中按“caption 先行”定位关键架构图/总览图，并输出图注+图框+合并框（含完整图注）的可复用流程。
---

# pdf-caption-first-key-figure-extraction

## 适用场景
- 用户要求从论文中抽取“关键架构图/总览图”
- 明确要求先找 caption（Figure/Fig. 编号）再找图
- 需要结构化输出：page_number / caption_text / caption_bbox / figure_bbox / merged_bbox / confidence / reason

## 核心流程（caption-first）
1) **先找 caption，不先找图**
   - 正则匹配：`(?m)^\s*(Figure|Fig\.?)\s*(\d+)\s*[:.\-]\s*(.+)`
   - 逐页扫描文本块，优先使用 `page.get_text("blocks")`，逐行匹配 caption 起始行。
   - 经验：`get_text("dict")` 的文本块有时会把换行拼接导致 caption 匹配漏检；`blocks` + 按行解析更稳。

2) **caption 不能只靠关键词打分**
   - 基础分：匹配 Figure/Fig 编号 +50
   - 关键词只能作为弱提示，不能直接决定最终选择；同篇论文多个图可能都带 `overview, architecture, framework, pipeline, method, system, workflow, overall`。
   - 惩罚词（避免误选表格/结果图）：`table, ablation, accuracy, wer, bleu, rouge, curve, results, comparison`
   - 最终必须结合图像视觉内容判断：是否存在完整方法链路、模块框、输入输出、箭头关系，且与论文方法主线一致。

3) **在 caption 邻域找 figure 主体**
   - 先看 caption 上方 band；若无有效图区，再看下方 band。
   - 候选对象类型：
     - 图片块（type=1）
     - 矢量块（type=3）
     - 图内短文本标签（短文本块）
   - 用并集得到 `figure_bbox`。

4) **多候选选择**
   - 综合分 = caption分 + 面积分 + Introduction/Method 邻近加分 - 惩罚分
   - 面积分来自 `figure_bbox / page_area`
   - 邻近加分：caption 与 Introduction/Method 标题位置接近时加分

5) **输出保证“图+图注完整”**
   - `merged_bbox = union(figure_bbox, caption_bbox) + padding`
   - 导出 clip 图像时必须使用 `merged_bbox`，避免只截图不带注释。

## 稳定实现要点（踩坑）
- **PyMuPDF 版本差异**：部分版本 `Rect.inflate()` 不可用。
  - 兼容写法：手动扩框
  - `Rect(x0-pad, y0-pad, x1+pad, y1+pad)`
- caption 可能跨行，不能只取首行；应从匹配行起拼接后续行生成 `caption_text`。
- 图区为空时要回退策略（上方失败→下方）；两者都失败则跳过该候选。

## Feishu 场景补充
- 若从飞书附件下载 PDF 出现 `HTTP 403`：
  - 先记录为权限问题，不要误判为“无 PDF”。
  - 回退到本地镜像 PDF（若已有）继续提取。
  - 或要求用户开通 Drive 附件读取权限后重跑。

## 推荐输出结构
```json
{
  "page_number": 4,
  "caption_text": "Figure 2. Overview of ...",
  "caption_bbox": [x0,y0,x1,y1],
  "figure_bbox": [x0,y0,x1,y1],
  "merged_bbox": [x0,y0,x1,y1],
  "confidence": 0.91,
  "reason": "caption匹配+关键词命中+面积较大+靠近方法章节，且非表格/结果图"
}
```

## 最小验证清单
- 抽样打开导出的 PNG：必须同时看到完整 figure 与完整 caption。
- 检查 top 候选是否命中 overview/architecture/framework 等关键词。
- 检查是否误选 Table/结果曲线图/消融图。