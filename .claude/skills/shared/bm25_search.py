#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shared BM25 search engine - ponytail: merged from 4 duplicate implementations
Replaces: slide_search_core.py, cip/core.py, logo/core.py, ui-ux-pro-max/scripts/core.py
"""

import csv
import re
from math import log
from pathlib import Path
from typing import Dict, List, Optional
from collections import defaultdict
from dataclasses import dataclass


@dataclass
class BM25Params:
    """BM25 algorithm parameters."""
    k1: float = 1.5
    b: float = 0.75


class BM25Search:
    """BM25 ranking algorithm for text search - ponytail: single shared implementation."""

    def __init__(self, params: Optional[BM25Params] = None):
        self.params = params or BM25Params()
        self.corpus: List[List[str]] = []
        self.doc_lengths: List[int] = []
        self.avgdl: float = 0.0
        self.idf: Dict[str, float] = {}
        self.doc_freqs: defaultdict = defaultdict(int)
        self.N: int = 0

    def tokenize(self, text: str) -> List[str]:
        """Lowercase, split, remove punctuation, filter short words."""
        text = re.sub(r'[^\w\s]', ' ', str(text).lower())
        return [w for w in text.split() if len(w) > 2]

    def fit(self, documents: List[str]) -> None:
        """Build BM25 index from documents."""
        self.corpus = [self.tokenize(doc) for doc in documents]
        self.N = len(self.corpus)
        if self.N == 0:
            return
        self.doc_lengths = [len(doc) for doc in self.corpus]
        self.avgdl = sum(self.doc_lengths) / self.N

        for doc in self.corpus:
            seen = set()
            for word in doc:
                if word not in seen:
                    self.doc_freqs[word] += 1
                    seen.add(word)

        for word, freq in self.doc_freqs.items():
            self.idf[word] = log((self.N - freq + 0.5) / (freq + 0.5) + 1)

    def score(self, query: str) -> List[tuple]:
        """Score all documents against query."""
        query_tokens = self.tokenize(query)
        scores: List[tuple] = []

        for idx, doc in enumerate(self.corpus):
            score = 0
            doc_len = self.doc_lengths[idx]
            term_freqs: defaultdict = defaultdict(int)
            for word in doc:
                term_freqs[word] += 1

            for token in query_tokens:
                if token in self.idf:
                    tf = term_freqs[token]
                    idf_val = self.idf[token]
                    numerator = tf * (self.params.k1 + 1)
                    denominator = tf + self.params.k1 * (1 - self.params.b + self.params.b * doc_len / self.avgdl)
                    score += idf_val * numerator / denominator

            scores.append((idx, score))

        return sorted(scores, key=lambda x: x[1], reverse=True)


def load_csv(filepath: Path) -> List[Dict]:
    """Load CSV and return list of dicts."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def search_csv(
    filepath: Path,
    search_cols: List[str],
    output_cols: List[str],
    query: str,
    max_results: int
) -> List[Dict]:
    """Core search function using BM25."""
    if not filepath.exists():
        return []

    data = load_csv(filepath)
    documents = [" ".join(str(row.get(col, "")) for col in search_cols) for row in data]

    bm25 = BM25Search()
    bm25.fit(documents)
    ranked = bm25.score(query)

    results: List[Dict] = []
    for idx, score in ranked[:max_results]:
        if score > 0:
            row = data[idx]
            results.append({col: row.get(col, "") for col in output_cols if col in row})

    return results


def detect_domain_general(query: str, domain_keywords: Dict[str, List[str]]) -> str:
    """Generic domain detection based on keyword matching."""
    query_lower = query.lower()
    scores = {domain: sum(1 for kw in keywords if kw in query_lower) for domain, keywords in domain_keywords.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else list(domain_keywords.keys())[0]
