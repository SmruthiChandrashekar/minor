"""
policy_indexer.py — Zero-Dependency BM25 Policy Search for Puravankara GRM.

Runs in-memory on CPU (<5MB RAM, ~2ms search latency).
Reads all 41+ OKF policy markdown documents from `rag/data/okf_policies/`.
Requires no external embedding models, PyTorch, or Hugging Face API keys.
"""

import os
import re
import math
from typing import List, Dict, Any

class PolicyChunk:
    def __init__(self, page_content: str, metadata: Dict[str, Any]):
        self.page_content = page_content
        self.metadata = metadata

class BM25PolicyIndex:
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.chunks: List[PolicyChunk] = []
        self.doc_tokens: List[List[str]] = []
        self.doc_len: List[int] = []
        self.avg_dl: float = 0.0
        self.idf: Dict[str, float] = {}
        self.k1 = 1.5
        self.b = 0.75
        self.is_built = False

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        """Simple clean tokenization: lowercase, alpha-numeric tokens."""
        return [w for w in re.findall(r'[a-z0-9]+', text.lower()) if len(w) > 1]

    def build_index(self):
        """Load markdown policy files and build inverted index."""
        if not os.path.exists(self.data_dir):
            return

        chunks: List[PolicyChunk] = []
        files = [
            os.path.join(self.data_dir, f)
            for f in os.listdir(self.data_dir)
            if f.endswith(".md")
        ]

        for fpath in files:
            try:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
            except Exception:
                continue

            metadata = {
                "source_file": os.path.basename(fpath),
                "policy_name": os.path.splitext(os.path.basename(fpath))[0],
                "policy_id": "",
                "department": "HR",
                "authority": "",
                "version": "",
                "tags": [],
                "page": 1,
                "section": ""
            }

            body = content
            # Extract YAML frontmatter if present
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    frontmatter = parts[1]
                    body = parts[2].strip()

                    # Simple regex frontmatter parser
                    title_m = re.search(r'^title:\s*(.+)$', frontmatter, re.M)
                    if title_m:
                        metadata["policy_name"] = title_m.group(1).strip().strip("'\"")

                    id_m = re.search(r'^id:\s*(.+)$', frontmatter, re.M)
                    if id_m:
                        metadata["policy_id"] = id_m.group(1).strip().strip("'\"")

                    dept_m = re.search(r'^department:\s*(.+)$', frontmatter, re.M)
                    if dept_m:
                        metadata["department"] = dept_m.group(1).strip().strip("'\"")

                    auth_m = re.search(r'^authority:\s*(.+)$', frontmatter, re.M)
                    if auth_m:
                        metadata["authority"] = auth_m.group(1).strip().strip("'\"")

                    ver_m = re.search(r'^version:\s*(.+)$', frontmatter, re.M)
                    if ver_m:
                        metadata["version"] = ver_m.group(1).strip().strip("'\"")

                    tags_m = re.findall(r'-\s+([a-zA-Z0-9_\-]+)', frontmatter)
                    if tags_m:
                        metadata["tags"] = tags_m

            # Split body into sections by headings (##, ### or ALL CAPS lines)
            sections = re.split(r'\n(?=#{1,4}\s+|[A-Z\s]{4,}:?\n)', body)
            page_num = 1
            for sec in sections:
                clean_sec = sec.strip()
                if len(clean_sec) < 40:
                    continue

                # Further split very large sections (>1200 chars) into paragraphs
                if len(clean_sec) > 1200:
                    paras = re.split(r'\n\n+', clean_sec)
                    curr_para = ""
                    for p in paras:
                        if len(curr_para) + len(p) < 900:
                            curr_para += "\n\n" + p if curr_para else p
                        else:
                            if curr_para.strip():
                                chunk_meta = dict(metadata)
                                chunk_meta["page"] = page_num
                                chunks.append(PolicyChunk(curr_para.strip(), chunk_meta))
                                page_num += 1
                            curr_para = p
                    if curr_para.strip():
                        chunk_meta = dict(metadata)
                        chunk_meta["page"] = page_num
                        chunks.append(PolicyChunk(curr_para.strip(), chunk_meta))
                else:
                    chunk_meta = dict(metadata)
                    chunk_meta["page"] = page_num
                    chunks.append(PolicyChunk(clean_sec, chunk_meta))
                    page_num += 1

        self.chunks = chunks
        num_docs = len(chunks)
        if num_docs == 0:
            self.is_built = True
            return

        # Tokenize and compute BM25 statistics
        doc_tokens = []
        df: Dict[str, int] = {}
        for c in chunks:
            # Weighted tokens: Title (3x) + Tags (2x) + Content (1x)
            text_to_index = (
                f"{c.metadata['policy_name']} " * 3 +
                f"{' '.join(c.metadata.get('tags', []))} " * 2 +
                c.page_content
            )
            tokens = self._tokenize(text_to_index)
            doc_tokens.append(tokens)
            for t in set(tokens):
                df[t] = df.get(t, 0) + 1

        self.doc_tokens = doc_tokens
        self.doc_len = [len(dt) for dt in doc_tokens]
        self.avg_dl = sum(self.doc_len) / num_docs if num_docs > 0 else 1.0

        # Calculate IDF
        self.idf = {}
        for term, freq in df.items():
            self.idf[term] = math.log((num_docs - freq + 0.5) / (freq + 0.5) + 1.0)

        self.is_built = True

    def search(self, query: str, top_k: int = 4) -> List[tuple]:
        """Search policy chunks using BM25 scoring."""
        if not self.is_built:
            self.build_index()

        q_tokens = self._tokenize(query)
        if not q_tokens or not self.chunks:
            return []

        scores = []
        for idx, (doc, d_len) in enumerate(zip(self.doc_tokens, self.doc_len)):
            score = 0.0
            # Term counts in document
            term_counts = {}
            for t in doc:
                if t in q_tokens:
                    term_counts[t] = term_counts.get(t, 0) + 1

            for q in q_tokens:
                if q in term_counts:
                    tf = term_counts[q]
                    idf = self.idf.get(q, 0.0)
                    numerator = idf * tf * (self.k1 + 1)
                    denominator = tf + self.k1 * (1 - self.b + self.b * (d_len / self.avg_dl))
                    score += numerator / denominator

            if score > 0.0:
                scores.append((self.chunks[idx], score))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]

# Global singleton index
_GLOBAL_INDEX = None

def get_policy_index() -> BM25PolicyIndex:
    global _GLOBAL_INDEX
    if _GLOBAL_INDEX is None or not _GLOBAL_INDEX.is_built:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        data_dir = os.path.join(base_dir, "data", "okf_policies")
        if not os.path.exists(data_dir):
            data_dir = os.path.join(base_dir, "data", "hr_policies_md")
        _GLOBAL_INDEX = BM25PolicyIndex(data_dir)
        _GLOBAL_INDEX.build_index()
    return _GLOBAL_INDEX
