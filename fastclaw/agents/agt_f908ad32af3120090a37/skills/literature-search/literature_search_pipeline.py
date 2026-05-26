#!/usr/bin/env python3
"""
Unified literature search pipeline for the literature-search skill.

Pipeline:
1. Google Scholar top N candidate recall
2. arXiv top N candidate recall
3. merge and deduplicate
4. output JSON or Markdown
"""

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

import requests

# local import from same skill directory
from google_scholar_search import GoogleScholarSearch

ARXIV_API = "http://export.arxiv.org/api/query"
ARXIV_NS = {"atom": "http://www.w3.org/2005/Atom"}


def normalize_title(title: str) -> str:
    title = (title or "").lower().strip()
    title = re.sub(r"\s+", " ", title)
    title = re.sub(r"[^\w\s]", "", title)
    return title


def extract_year(text: str) -> Optional[str]:
    m = re.search(r"\b(19|20)\d{2}\b", text or "")
    return m.group(0) if m else None


def search_arxiv(query: str, max_results: int = 10) -> List[Dict[str, Any]]:
    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    try:
        resp = requests.get(ARXIV_API, params=params, timeout=20)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        results = []
        for rank, entry in enumerate(root.findall("atom:entry", ARXIV_NS), 1):
            title = (entry.findtext("atom:title", default="", namespaces=ARXIV_NS) or "").strip()
            summary = (entry.findtext("atom:summary", default="", namespaces=ARXIV_NS) or "").strip()
            published = entry.findtext("atom:published", default="", namespaces=ARXIV_NS)
            year = published[:4] if published else None
            link = entry.findtext("atom:id", default="", namespaces=ARXIV_NS)
            authors = [a.findtext("atom:name", default="", namespaces=ARXIV_NS) for a in entry.findall("atom:author", ARXIV_NS)]
            results.append({
                "rank": rank,
                "source": "arXiv",
                "title": title,
                "authors": ", ".join([a for a in authors if a]),
                "abstract": summary,
                "url": link,
                "year": year,
                "tags": ["arxiv-top-ranked"],
            })
        return results
    except Exception as e:
        return [{"error": f"arXiv request failed: {e}"}]


def deduplicate(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []
    for item in records:
        if "error" in item:
            continue
        key = normalize_title(item.get("title", "")) or (item.get("url") or "")
        if not key:
            continue
        if key not in merged:
            merged[key] = {
                "title": item.get("title", ""),
                "authors": item.get("authors", ""),
                "abstract": item.get("abstract", ""),
                "year": item.get("year") or extract_year(item.get("authors", "")),
                "urls": [],
                "sources": [],
                "tags": [],
                "best_rank": item.get("rank", 9999),
            }
            order.append(key)

        row = merged[key]
        if item.get("url") and item.get("url") not in row["urls"]:
            row["urls"].append(item["url"])
        if item.get("source") and item.get("source") not in row["sources"]:
            row["sources"].append(item["source"])
        for tag in item.get("tags", []):
            if tag not in row["tags"]:
                row["tags"].append(tag)
        row["best_rank"] = min(row["best_rank"], item.get("rank", 9999))
        if not row.get("abstract") and item.get("abstract"):
            row["abstract"] = item.get("abstract")
        if not row.get("authors") and item.get("authors"):
            row["authors"] = item.get("authors")
        if not row.get("year") and item.get("year"):
            row["year"] = item.get("year")

    out = [merged[k] for k in order]
    out.sort(key=lambda x: x.get("best_rank", 9999))
    for item in out:
        if "Google Scholar" in item["sources"]:
            if "scholar-top-ranked" not in item["tags"]:
                item["tags"].append("scholar-top-ranked")
            item["source_note"] = "来源补充：Google Scholar（非官方接口，已尽量校验）"
        if "arXiv" in item["sources"] and "arxiv-top-ranked" not in item["tags"]:
            item["tags"].append("arxiv-top-ranked")
    return out


def to_markdown(records: List[Dict[str, Any]], query: str) -> str:
    lines = [f"# Literature Search Results", "", f"Query: {query}", ""]
    for idx, item in enumerate(records, 1):
        lines.append(f"## {idx}. {item.get('title', 'N/A')}")
        lines.append(f"- Authors: {item.get('authors', 'N/A')}")
        lines.append(f"- Year: {item.get('year', 'N/A')}")
        lines.append(f"- Sources: {', '.join(item.get('sources', []))}")
        if item.get("tags"):
            lines.append(f"- Tags: {', '.join(item.get('tags', []))}")
        if item.get("urls"):
            lines.append(f"- URLs: {' | '.join(item.get('urls', []))}")
        if item.get("source_note"):
            lines.append(f"- Note: {item['source_note']}")
        abstract = (item.get("abstract") or "").strip()
        if abstract:
            lines.append(f"- Abstract: {abstract[:500]}{'...' if len(abstract) > 500 else ''}")
        lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Unified literature search pipeline")
    parser.add_argument("--query", required=True, help="search topic")
    parser.add_argument("--scholar-results", type=int, default=10)
    parser.add_argument("--arxiv-results", type=int, default=10)
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    parser.add_argument("--output", help="output file path")
    args = parser.parse_args()

    scholar = GoogleScholarSearch()
    scholar_results = scholar.search_papers(args.query, args.scholar_results)
    for item in scholar_results:
        if "error" not in item:
            item.setdefault("tags", []).append("scholar-top-ranked")
            item["year"] = item.get("year") or extract_year(item.get("authors", ""))

    arxiv_results = search_arxiv(args.query, args.arxiv_results)
    errors = [x for x in scholar_results + arxiv_results if "error" in x]
    merged = deduplicate([x for x in scholar_results + arxiv_results if "error" not in x])

    payload: Dict[str, Any] = {
        "query": args.query,
        "scholar_count": len([x for x in scholar_results if "error" not in x]),
        "arxiv_count": len([x for x in arxiv_results if "error" not in x]),
        "merged_count": len(merged),
        "results": merged,
    }
    if errors:
        payload["errors"] = errors

    output_text = json.dumps(payload, indent=2, ensure_ascii=False) if args.format == "json" else to_markdown(merged, args.query)

    if args.output:
        Path(args.output).write_text(output_text, encoding="utf-8")
        print(args.output)
    else:
        print(output_text)


if __name__ == "__main__":
    main()
