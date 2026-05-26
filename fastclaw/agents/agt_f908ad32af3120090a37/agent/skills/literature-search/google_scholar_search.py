#!/usr/bin/env python3
"""
Google Scholar helper for literature-search.

Purpose:
- keep Google Scholar capability colocated with literature-search
- support broad candidate recall before arXiv / metadata validation
- remain a fallback helper rather than a sole source of truth
"""

import argparse
import json
import sys
import time
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup


class GoogleScholarSearch:
    def __init__(self):
        self.base_url = "https://scholar.google.com/scholar"
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            )
        }

    def _fetch(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        search_url = self.base_url + "?" + "&".join(
            f"{k}={quote_plus(str(v))}" for k, v in params.items() if v is not None and v != ""
        )
        try:
            response = requests.get(search_url, headers=self.headers, timeout=15)
            if response.status_code != 200:
                return [{"error": f"Failed to fetch data. HTTP Status code: {response.status_code}"}]

            soup = BeautifulSoup(response.text, "html.parser")
            results = []
            for rank, item in enumerate(soup.find_all("div", class_="gs_ri"), 1):
                title_tag = item.find("h3", class_="gs_rt")
                title = title_tag.get_text(" ", strip=True) if title_tag else "No title available"
                link = title_tag.find("a")["href"] if title_tag and title_tag.find("a") else ""
                authors_tag = item.find("div", class_="gs_a")
                authors = authors_tag.get_text(" ", strip=True) if authors_tag else ""
                abstract_tag = item.find("div", class_="gs_rs")
                abstract = abstract_tag.get_text(" ", strip=True) if abstract_tag else ""
                results.append(
                    {
                        "rank": rank,
                        "source": "Google Scholar",
                        "title": title,
                        "authors": authors,
                        "abstract": abstract,
                        "url": link,
                        "warning": "Google Scholar is a non-official source. Validate metadata elsewhere.",
                    }
                )
            return results
        except requests.RequestException as e:
            return [{"error": f"Request failed: {str(e)}"}]
        except Exception as e:
            return [{"error": f"An error occurred: {str(e)}"}]

    def search_papers(self, query: str, num_results: int = 10) -> List[Dict[str, Any]]:
        results = self._fetch({"q": query})
        return results[:num_results]

    def search_papers_advanced(
        self,
        query: str,
        author: Optional[str] = None,
        year_start: Optional[int] = None,
        year_end: Optional[int] = None,
        num_results: int = 10,
    ) -> List[Dict[str, Any]]:
        results = self._fetch(
            {
                "q": query,
                "as_sauthors": author,
                "as_ylo": year_start,
                "as_yhi": year_end,
            }
        )
        return results[:num_results]

    def get_author_info(self, author_name: str) -> Dict[str, Any]:
        try:
            from scholarly import scholarly

            search_query = scholarly.search_author(author_name)
            author = next(search_query, None)
            if not author:
                return {"error": f"Author '{author_name}' not found"}

            author = scholarly.fill(author)
            return {
                "source": "Google Scholar",
                "warning": "Google Scholar author data is unofficial and may be incomplete.",
                "name": author.get("name", "N/A"),
                "affiliation": author.get("affiliation", "N/A"),
                "interests": author.get("interests", []),
                "citedby": author.get("citedby", 0),
                "homepage": author.get("homepage", ""),
                "publications": [
                    {
                        "title": pub.get("bib", {}).get("title", "N/A"),
                        "year": pub.get("bib", {}).get("pub_year", "N/A"),
                        "citations": pub.get("num_citations", 0),
                    }
                    for pub in author.get("publications", [])[:10]
                ],
            }
        except ImportError:
            return {"error": "scholarly library not installed. Install it with: pip install scholarly"}
        except Exception as e:
            return {"error": f"Failed to get author info: {str(e)}"}


class OutputHandler:
    @staticmethod
    def print_console(data: Any, format_type: str = "console") -> None:
        if format_type == "json":
            print(json.dumps(data, indent=2, ensure_ascii=False))
            return

        if isinstance(data, list):
            if not data:
                print("No results found.")
                return
            for i, item in enumerate(data, 1):
                if "error" in item:
                    print(f"Error: {item['error']}")
                    continue
                print(f"\n--- 结果 {i} ---")
                print(f"排序: {item.get('rank', i)}")
                print(f"标题: {item.get('title', 'N/A')}")
                print(f"作者: {item.get('authors', 'N/A')}")
                if item.get("abstract"):
                    abstract = " ".join(item["abstract"].split())
                    if len(abstract) > 300:
                        abstract = abstract[:300] + "..."
                    print(f"摘要: {abstract}")
                if item.get("url"):
                    print(f"链接: {item['url']}")
                if item.get("warning"):
                    print(f"提示: {item['warning']}")
            return

        if isinstance(data, dict):
            if "error" in data:
                print(f"Error: {data['error']}")
                return
            print(f"姓名: {data.get('name', 'N/A')}")
            if data.get("affiliation"):
                print(f"机构: {data.get('affiliation', 'N/A')}")
            if data.get("interests"):
                print(f"研究领域: {', '.join(data.get('interests', []))}")
            if data.get("citedby"):
                print(f"总引用数: {data.get('citedby', 'N/A')}")
            if data.get("homepage"):
                print(f"主页: {data.get('homepage', 'N/A')}")
            if data.get("warning"):
                print(f"提示: {data['warning']}")

    @staticmethod
    def write_file(data: Any, filepath: str) -> None:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"结果已保存到: {filepath}")


def main():
    parser = argparse.ArgumentParser(description="Google Scholar helper for literature-search")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    search_parser = subparsers.add_parser("search", help="Search papers by keywords")
    search_parser.add_argument("--query", required=True)
    search_parser.add_argument("--results", type=int, default=10)
    search_parser.add_argument("--format", choices=["console", "json"], default="console")
    search_parser.add_argument("--output")

    advanced_parser = subparsers.add_parser("advanced", help="Advanced search with filters")
    advanced_parser.add_argument("--query", required=True)
    advanced_parser.add_argument("--author")
    advanced_parser.add_argument("--year-start", type=int)
    advanced_parser.add_argument("--year-end", type=int)
    advanced_parser.add_argument("--results", type=int, default=10)
    advanced_parser.add_argument("--format", choices=["console", "json"], default="console")
    advanced_parser.add_argument("--output")

    author_parser = subparsers.add_parser("author", help="Get author information")
    author_parser.add_argument("--name", required=True)
    author_parser.add_argument("--format", choices=["console", "json"], default="console")
    author_parser.add_argument("--output")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    searcher = GoogleScholarSearch()
    output_handler = OutputHandler()

    if args.command == "search":
        result = searcher.search_papers(args.query, args.results)
    elif args.command == "advanced":
        result = searcher.search_papers_advanced(
            args.query,
            author=args.author,
            year_start=args.year_start,
            year_end=args.year_end,
            num_results=args.results,
        )
    else:
        result = searcher.get_author_info(args.name)

    if getattr(args, "output", None):
        output_handler.write_file(result, args.output)
    else:
        output_handler.print_console(result, getattr(args, "format", "console"))


if __name__ == "__main__":
    main()
