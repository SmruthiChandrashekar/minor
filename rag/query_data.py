# query_data.py — Grounded RAG Pipeline for Puravankara HR Policies

import os
import time
import re
import threading
import warnings
from dotenv import load_dotenv
import chromadb
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.embeddings import Embeddings
from groq import Groq

# Filter out verbose deprecation warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="huggingface_hub")
warnings.filterwarnings("ignore", message=".*LangChainDeprecationWarning.*")

# Load environment variables
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
load_dotenv()
load_dotenv(os.path.join(ROOT_DIR, ".env"))
load_dotenv(os.path.join(ROOT_DIR, "backend", ".env"))

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_final")

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# Vector matches farther than this (Chroma L2 distance) are treated as unrelated
VECTOR_MAX_DISTANCE = 1.3
# BM25 matches below this score are treated as unrelated
BM25_MIN_SCORE = 1.0
# Vector ranks count 1.5x in the fusion: complaints are usually paraphrased,
# and keyword-only ranking sent "touched me inappropriately" to travel policy
VECTOR_WEIGHT = 1.5
# After the embedding service fails, skip it for this long instead of
# making every chat request wait on a timeout
EMBED_COOLDOWN_SECONDS = 60


class SpaceEmbeddings(Embeddings):
    """
    Same all-MiniLM-L6-v2 model as chroma_final, served by our Hugging Face
    Space (deploy/hf-embed-space). Used on Render, where PyTorch doesn't fit
    in memory. Configured with EMBED_URL and EMBED_KEY, plus HF_TOKEN for
    the Space's ZeroGPU quota.
    """

    def __init__(self, url: str, key: str, hf_token: str = ""):
        self._url = url.rstrip("/") + "/gradio_api/call/embed"
        self._key = key
        # The Space runs on ZeroGPU: calls sent with a token use that
        # account's GPU quota instead of the much smaller anonymous one
        self._headers = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}

    def _embed(self, texts: list[str]) -> list[list[float]]:
        import json
        import requests

        # Gradio's HTTP API: POST queues the call, GET streams the result
        start = requests.post(
            self._url, json={"data": [texts, self._key]}, headers=self._headers, timeout=(5, 25)
        )
        start.raise_for_status()
        event_id = start.json()["event_id"]

        # Allow time for ZeroGPU to attach a GPU from its shared pool
        result = requests.get(f"{self._url}/{event_id}", headers=self._headers, timeout=(5, 40))
        result.raise_for_status()
        event = None
        for line in result.text.splitlines():
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and event in ("complete", "error"):
                payload = json.loads(line.split(":", 1)[1])
                if event == "error":
                    raise RuntimeError(f"Embedding service error: {payload}")
                return payload[0]
        raise RuntimeError("Embedding service returned no result")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]


RAG_READY = False
_RAG_INITIALIZING = False
_init_lock = threading.Lock()
embedding_model = None
db = None
_embed_failed_at = 0.0


def _load_vector_store():
    """
    Open chroma_final for meaning-based search, if we have a way to embed
    queries: local sentence-transformers first, then the HF Space.
    Leaves db as None (BM25-only search) when neither is available.
    """
    global embedding_model, db

    if not os.path.exists(CHROMA_PATH):
        print("[INFO] No chroma_final index found — using BM25 search only.")
        return

    try:
        embedding_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        print("[INFO] Vector search using local sentence-transformers.")
    except Exception as emb_err:
        print(f"[INFO] Local sentence-transformers not available ({emb_err}).")
        embed_url = os.environ.get("EMBED_URL")
        if not embed_url:
            print("[INFO] EMBED_URL not set — using BM25 search only.")
            return
        embedding_model = SpaceEmbeddings(
            embed_url, os.environ.get("EMBED_KEY", ""), os.environ.get("HF_TOKEN", "")
        )
        print(f"[INFO] Vector search using embedding service at {embed_url}.")

    db = Chroma(
        client=chromadb.PersistentClient(path=CHROMA_PATH),
        embedding_function=embedding_model,
    )


def initialize_rag():
    global RAG_READY, _RAG_INITIALIZING
    if RAG_READY:
        return

    with _init_lock:
        if RAG_READY:
            return
        _RAG_INITIALIZING = True
        try:
            print("[INFO] Warming up Policy RAG system...")
            start_time = time.time()
            from rag.policy_indexer import get_policy_index
            idx = get_policy_index()
            try:
                _load_vector_store()
            except Exception as e:
                print(f"[WARN] Vector store unavailable, using BM25 only: {e}")
            RAG_READY = True
            print(f"[OK] Policy RAG Ready (Indexed {len(idx.chunks)} chunks across Puravankara policies in {round(time.time() - start_time, 2)}s)\n")
        except Exception as e:
            print(f"[WARN] Policy index initialization error: {e}")
            RAG_READY = True
        finally:
            _RAG_INITIALIZING = False


def _vector_search(query: str, k: int) -> list:
    """Meaning-based matches from chroma_final, or [] if unavailable."""
    global _embed_failed_at
    if db is None or time.time() - _embed_failed_at < EMBED_COOLDOWN_SECONDS:
        return []
    try:
        results = db.similarity_search_with_score(query, k=k)
    except Exception as e:
        _embed_failed_at = time.time()
        print(f"[WARN] Vector search failed, using BM25 only for {EMBED_COOLDOWN_SECONDS}s: {e}")
        return []
    return [(doc, dist) for doc, dist in results if dist <= VECTOR_MAX_DISTANCE]


def search_policies(query: str, top_k: int = 4) -> list:
    """
    Hybrid policy search: BM25 keyword matches plus meaning-based vector
    matches, merged with reciprocal rank fusion. BM25 catches exact policy
    wording; vectors catch paraphrases ("touched me inappropriately" -> POSH).
    Falls back to BM25 alone when vector search is unavailable.

    Returns [(chunk, fused_score)] best first; chunks expose .page_content
    and .metadata.
    """
    if not RAG_READY:
        initialize_rag()

    from rag.policy_indexer import get_policy_index
    candidates = top_k * 2
    bm25_hits = [
        (doc, s) for doc, s in get_policy_index().search(query, top_k=candidates)
        if s >= BM25_MIN_SCORE
    ]
    vector_hits = _vector_search(query, candidates)

    fused = {}
    for weight, hits in ((1.0, bm25_hits), (VECTOR_WEIGHT, vector_hits)):
        # Both indexes contain duplicate chunks; count each once per list,
        # or duplicates outrank a single better match
        seen = set()
        for rank, (doc, _) in enumerate(hits):
            key = re.sub(r"\s+", " ", doc.page_content[:200]).strip()
            if key in seen:
                continue
            seen.add(key)
            entry = fused.setdefault(key, [doc, 0.0])
            entry[1] += weight / (60 + rank)

    ranked = sorted(fused.values(), key=lambda e: e[1], reverse=True)
    return [(doc, score) for doc, score in ranked[:top_k]]


def is_rag_ready():
    return RAG_READY


def is_rag_initializing():
    return _RAG_INITIALIZING


GROQ_MODEL = os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b")


def call_llm(prompt: str) -> str:
    global client
    if client is None:
        key = os.environ.get("GROQ_API_KEY")
        if key:
            client = Groq(api_key=key)
        else:
            return "Error: GROQ_API_KEY not configured."
    try:
        model = os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b")
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=600,
            temperature=0.0
        )
        content = response.choices[0].message.content.strip()
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        return content
    except Exception as e:
        print("GROQ ERROR:", e)
        return "Error contacting LLM"


def preprocess_query(query: str) -> str:
    """Normalize query terms and expand common acronyms for optimal vector similarity."""
    cleaned = query.strip()
    query_lower = cleaned.lower()

    if "posh" in query_lower and "sexual harassment" not in query_lower:
        cleaned = cleaned + " sexual harassment workplace policy"

    return cleaned


def deduplicate_results(results):
    """Remove exact duplicate chunks or near-identical text from search results."""
    seen_texts = set()
    deduped = []
    for doc, score in results:
        text_content = getattr(doc, "page_content", str(doc))
        text_key = re.sub(r'\s+', ' ', text_content[:200]).strip()
        if text_key not in seen_texts:
            seen_texts.add(text_key)
            deduped.append((doc, score))
    return deduped


def get_rag_response(query_text: str):
    if not RAG_READY:
        initialize_rag()

    total_start = time.time()
    clean_query = preprocess_query(query_text)

    # 1. RETRIEVE: hybrid BM25 + vector search (BM25 only if vectors unavailable)
    filtered_results = search_policies(clean_query, top_k=4)

    # If no relevant policy documents matched
    if not filtered_results:
        return {
            "answer": "The available Puravankara policy documents do not provide sufficient information to answer your question.",
            "sources": []
        }

    # 4. CONTEXT BUILDING WITH CLEAR STRUCTURE
    context_blocks = []
    sources = []
    seen_sources = set()

    for doc, score in filtered_results[:4]:
        policy_id = doc.metadata.get("policy_id", "")
        policy_name = doc.metadata.get("policy_name", "Puravankara Policy")
        department = doc.metadata.get("department", "HR")
        authority = doc.metadata.get("authority", "")
        version = doc.metadata.get("version", "")
        source_file = doc.metadata.get("source_file", doc.metadata.get("source", "Policy Document"))
        page = doc.metadata.get("page", 1)
        section = doc.metadata.get("section", "")

        header_info = f"Policy: {policy_name}"
        if policy_id and policy_id != "LEGACY":
            header_info += f" [{policy_id}]"
        if department:
            header_info += f" | Dept: {department}"
        if authority:
            header_info += f" | Authority: {authority}"

        block = f"--- OKF POLICY SOURCE ---\n{header_info}\nPage: {page}"
        if section:
            block += f"\nSection: {section}"
        block += f"\nContent:\n{doc.page_content}\n"
        context_blocks.append(block)

        source_key = (policy_name, page)
        if source_key not in seen_sources:
            seen_sources.add(source_key)
            sources.append({
                "source": policy_name,
                "policy_id": policy_id,
                "department": department,
                "authority": authority,
                "version": version,
                "source_file": source_file,
                "page": page,
                "section": section,
                "score": round(float(score), 3)
            })

    context_text = "\n".join(context_blocks)

    # 5. STRICT GROUNDED GENERATION PROMPT (Anti-Hallucination Framework)
    prompt = f"""### ROLE & SCOPE ASSIGNMENT:
You are Purva, the official AI Policy Guide for Puravankara Enterprise. You are strictly an informational intake and policy guidance assistant, NOT an authorized policy author or arbitrary knowledge engine.

### CONTENT GROUNDING (CLOSED-WORLD RULE):
Answer the user's question using ONLY the factual content inside the [PURAVANKARA POLICY CONTEXT] below.
If the answer is NOT explicitly stated in the context, output EXACTLY:
"The available Puravankara policy documents do not provide sufficient information to answer your question."
Do NOT extrapolate, deduce, or assume unstated company rules or entitlements.

### SPECIFICITY & STRUCTURE:
1. State the relevant policy title and section name clearly at the start (e.g., "Policy: Leave Policy", "Section: Annual Leave").
2. DO NOT output internal technical codes, metadata IDs, or document identifiers (such as [POL-IC-001], [POL-HR-001]) in the user-facing text. Use only the human-readable policy title.
3. Keep the answer clear, structured, and concise (under 200 words).
4. Use bullet points for requirements, criteria, or eligibility steps.
5. If policy tables or clauses state "Nil", "N/A", "0", or "None", explicitly clarify this means zero entitlement or non-applicability.

### INSTRUCTIONAL DOS & DON'TS:
- DO quote verified clauses and terms directly from the context.
- DO refer users to the official "Puravankara Resident App" or "Facility Management / HR Desk" for administrative submissions.
- DO NOT invent, hallucinate, or output placeholder phone numbers (e.g. 9876543210, 1800-xxx), email addresses, or personnel names.
- DO NOT mention general industry practices or external company rules.

[PURAVANKARA POLICY CONTEXT]:
{context_text}

[USER QUESTION]:
{query_text}

Answer:"""

    response_text = call_llm(prompt)

    if "do not provide sufficient information" in response_text.lower():
        sources = []

    print(f"Total RAG Execution Time: {round(time.time() - total_start, 3)}s")

    return {
        "answer": response_text,
        "sources": sources
    }


if __name__ == "__main__":
    initialize_rag()
    while True:
        q = input("\nAsk policy question: ")
        if q.lower() in ["exit", "quit"]:
            break
        res = get_rag_response(q)
        print("\n🧠 Answer:\n", res["answer"])
        print("\n📚 Sources:")
        for s in res["sources"]:
            print(s)
