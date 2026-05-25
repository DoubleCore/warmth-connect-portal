---
name: literature-search
description: Find and compile academic literature with citation lists across Google Scholar, arXiv, PubMed, IEEE, ACM, Semantic Scholar, OpenAlex, Crossref, Scopus, and Web of Science. Use for requests like “find related literature,” “related work,” “citation list,” or “key papers on a topic.”
---

# Literature Search

## Overview

Find relevant academic papers on a given topic across major scholarly sources and return a clean citation list. This skill is the **default paper search entry point**.

When processing user input, first reason carefully about: topic scope, likely synonyms, venue patterns, likely canonical papers, and possible duplicate versions.

## Source Strategy

### Default search priority
For broad paper discovery, use this source order first:
1. **OpenAlex** for structured metadata search with citation counts, venue filtering, and concept-based discovery — **preferred for top-venue filtering and citation-ranked results** (see `literature-search-openalex` skill for detailed workflow)
2. **Google Scholar** for broad recall and citation visibility
3. **arXiv** for recent preprints and direct paper access
4. **Semantic Scholar** for metadata, citation counts, and related-paper expansion — ⚠️ rate-limited (429), avoid batch queries without API key
5. **Crossref** for metadata completion and DOI validation
6. **PubMed** for biomedical topics
7. **IEEE / ACM** for CS/engineering when needed
8. **Scopus / Web of Science** only when the user provides access

### Google Scholar policy
- Google Scholar is treated here as a **high-recall supplementary discovery source near the front of the search order**, especially useful for initial candidate finding.
- It has **no official API** and may rely on unstable scraping or indirect access paths.
- A local helper script is available in this skill directory: `google_scholar_search.py`.
- Use it to expand recall, surface citations, and find papers that API-first sources may miss.
- **Do not rely on Google Scholar alone** for final metadata validation.
- Validate important results with arXiv, Semantic Scholar, OpenAlex, Crossref, publisher pages, or DOI records.
- If Scholar-derived data is uncertain, say so explicitly.

## Workflow

1. **Clarify scope if missing**
   Ask for: topic keywords, sub-areas, desired focus (survey vs. foundational vs. recent), and any time range if not provided.

2. **Access constraints & methods**
   - Prefer official APIs and publicly accessible pages when available.
   - Google Scholar can be used for broad recall, but treat it as a discovery layer rather than a sole source of truth.
   - Scopus and Web of Science are subscription services; include them **only if the user provides access**. Otherwise note “not available.”

3. **Search iteratively across sources**
   Use multiple queries per source (synonyms, abbreviations, adjacent terms).
   Recommended search flow:
   - Start with **Google Scholar** and **arXiv** to get broad top candidates quickly
   - Prefer running `python3 google_scholar_search.py search --query "<topic>" --results <N>` first for Scholar-side candidate recall when local execution is appropriate
   - For a unified first-pass workflow, prefer `python3 literature_search_pipeline.py --query "<topic>" --scholar-results <N> --arxiv-results <N> --format json`
   - Use **Semantic Scholar** to expand, rank, and inspect citation structure
   - Use **OpenAlex / Crossref** to validate DOI and metadata
   - Add **PubMed** for biomedical topics
   - Add **IEEE / ACM** when venue-specific precision matters

4. **De-duplicate and triage**
   - Merge duplicate results across sources
   - Prefer journal/conference versions over preprints when both exist
   - Keep arXiv when it is the only accessible full-text source, but note if a formal version exists
   - Distinguish true duplicates from follow-up or extended versions by checking title, DOI, author list, year, and venue

5. **Rank and return**
   - Put the strongest candidates first
   - For broad discovery, prioritize papers that consistently appear near the top of **Google Scholar** and **arXiv** searches, then validate and refine with other sources
   - Output a bullet list with consistent fields: **Authors. Title. Venue. Year. DOI/URL**
   - If Google Scholar contributed materially, note: `来源补充：Google Scholar（非官方接口，已用其他来源尽量校验）`

6. **Optional follow-up**
   Offer to expand, filter (year, venue, subtopic), deduplicate more aggressively, or convert to BibTeX/CSV if requested.

## Output Format

- Bullet list
- Each entry: **Authors. Title. Venue. Year. DOI/URL**
- When useful, add short tags such as `foundational`, `recent`, `survey`, `arXiv only`, `metadata verified`, `scholar-top-ranked`

## Boundary

This skill is for **paper discovery, candidate ranking, metadata validation, and citation list generation**.
It is **not** the main skill for:
- deep multi-theme research reports → use `academic-deep-research`
- writing a literature review narrative → use `literature-review`
- single-paper deep reading → use `paper_summarize`
- paper ingestion into knowledge base → use `paper-ingest-phase1`

## Example User Prompts (trigger)

- “Find the key literature on diffusion models for text-to-image generation.”
- “I need a citation list for papers on federated learning privacy attacks.”
- “Find recent papers on CRISPR off-target detection methods.”
- “Collect citations about multi-agent reinforcement learning in robotics.”
- “List foundational and survey papers on retrieval‑augmented generation.”
- “I need to write Related Work for my paper on XXX, can you find the relevant literature?”
