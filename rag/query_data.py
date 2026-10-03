# query_data.py — Grounded RAG Pipeline for Puravankara HR Policies

import os
import time
import re
from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from groq import Groq

# Load environment variables
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(os.path.dirname(BASE_DIR), "backend", ".env")
load_dotenv(ENV_PATH)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError(f"GROQ_API_KEY not set in {ENV_PATH}")

client = Groq(api_key=GROQ_API_KEY)
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_final")

RAG_READY = False
embedding_model = None
db = None


def initialize_rag():
    global embedding_model, db, RAG_READY
    if RAG_READY:
        return

    print("[INFO] Warming up Policy RAG system...")
    start_time = time.time()

    embedding_model = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2"
    )

    db = Chroma(
        persist_directory=CHROMA_PATH,
        embedding_function=embedding_model,
    )

    try:
        db.similarity_search("leave policy", k=1)
    except Exception as e:
        print("Warmup search error:", e)

    RAG_READY = True
    print(f"[OK] Policy RAG Ready (Initialized in {round(time.time() - start_time, 2)}s)\n")


def is_rag_ready():
    return RAG_READY


GROQ_MODEL = os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b")


def call_llm(prompt: str) -> str:
    try:
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=600,
            temperature=0.0
        )
        # Handle reasoning models (e.g. Qwen) that wrap thoughts in <think> tags
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
    """Remove exact duplicate chunks or near-identical text from vector search results."""
    seen_texts = set()
    deduped = []
    for doc, score in results:
        text_key = re.sub(r'\s+', ' ', doc.page_content[:200]).strip()
        if text_key not in seen_texts:
            seen_texts.add(text_key)
            deduped.append((doc, score))
    return deduped


def get_rag_response(query_text: str):
    if not RAG_READY:
        initialize_rag()

    total_start = time.time()
    clean_query = preprocess_query(query_text)

    # 1. RETRIEVAL (k=6)
    results = db.similarity_search_with_score(clean_query, k=6)

    # 2. DEDUPLICATION
    results = deduplicate_results(results)

    # 3. RELEVANCE THRESHOLD FILTERING
    MAX_DISTANCE_THRESHOLD = 1.05
    filtered_results = []

    for doc, score in results:
        if score <= MAX_DISTANCE_THRESHOLD:
            filtered_results.append((doc, score))

    # NO FALLBACK TO ARBITRARY IRRELEVANT CHUNKS
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
1. State the relevant policy name and section clearly at the start.
2. Keep the answer clear, structured, and concise (under 200 words).
3. Use bullet points for requirements, criteria, or eligibility steps.
4. If policy tables or clauses state "Nil", "N/A", "0", or "None", explicitly clarify this means zero entitlement or non-applicability.

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
