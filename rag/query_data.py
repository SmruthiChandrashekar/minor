# query_data.py (LLM optimized + timing logs ⏱️)

import os
import time
from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from groq import Groq

# Load secrets from backend/.env
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", ".env"))

# =========================
# GROQ SETUP
# =========================
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY not set in backend/.env")
client = Groq(api_key=GROQ_API_KEY)

def call_llm(prompt):
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=150,
            temperature=0.3
        )
        return response.choices[0].message.content
    except Exception as e:
        print("GROQ ERROR:", e)
        return "Error contacting LLM"


# =========================
# FIX PATH
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHROMA_PATH = os.path.join(BASE_DIR, "chroma")

# =========================
# GLOBAL STATE
# =========================
RAG_READY = False
embedding_model = None
db = None

def initialize_rag():
    global embedding_model, db, RAG_READY
    
    if RAG_READY:
        return

    print("⏱️  Warming up RAG system...")
    start_time = time.time()

    print("   → Loading embedding model...")
    embedding_model = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2"
    )

    print("   → Loading Chroma DB...")
    db = Chroma(
        persist_directory=CHROMA_PATH,
        embedding_function=embedding_model,
    )

    print("   → Running dummy retrieval...")
    db.similarity_search("test", k=1)

    RAG_READY = True
    print(f"✅ RAG Ready (Initialized in {round(time.time() - start_time, 2)}s)\n")

def is_rag_ready():
    return RAG_READY


# =========================
# MAIN FUNCTION
# =========================
def get_rag_response(query_text):

    total_start = time.time()

    # =========================
    # RETRIEVAL
    # =========================
    t1 = time.time()
    results = db.similarity_search_with_score(query_text, k=3)
    print(f"Retrieval time: {round(time.time() - t1, 3)} sec")

    # =========================
    # FILTERING
    # =========================
    t2 = time.time()
    filtered_results = []
    for doc, score in results[:3]:
        if score < 1.2:
            filtered_results.append((doc, score))

    if not filtered_results:
        filtered_results = results[:2]

    results = filtered_results
    print(f"Filtering time: {round(time.time() - t2, 3)} sec")

    # =========================
    # CONTEXT BUILDING
    # =========================
    t3 = time.time()
    context_text = ""
    sources = []

    for doc, score in results:
        print(f"Score: {score}")
        context_text += doc.page_content[:300] + "\n\n---\n\n"

        source_name = doc.metadata.get("source", "")
        url = doc.metadata.get("url", "")
        
        if url:
            source_name = url
        elif not source_name:
            source_name = "Web/Unknown"
        else:
            source_name = os.path.basename(source_name)

        page_number = doc.metadata.get("page", "Web/Unknown Page number")

        sources.append({
            "source": source_name,
            "page": page_number,
            "score": round(score, 3)
        })

    print(f"Context build time: {round(time.time() - t3, 3)} sec")

    # =========================
    # PROMPT + LLM
    # =========================
    t4 = time.time()
    prompt = f"""
You are an intelligent Assistant.

Critical Rules for Answering:
1. USE CONTEXT FIRST: If the provided context contains policy rules, limits, or relevant information, you MUST base your answer on it. 
2. LOGICAL DEDUCTION: If the user asks about a specific numerical value (like a gift amount) and the context provides a policy limit, explicitly state whether it violates the policy limit.
3. GENERAL KNOWLEDGE FALLBACK: If the provided context does NOT contain the answer (for example, general IT queries like "login not working" or common HR questions), use your general knowledge to provide a helpful troubleshooting guide or answer. If you use your general knowledge instead of the context, you MUST start your response with the exact tag [GENERAL_KNOWLEDGE]. Do NOT say "it is not specified" for general IT issues.
4. BE CONCISE: Use maxium 3 bullet points for readability and avoid long paragraphs.


Context:
{context_text}

Question:
{query_text}

Answer:
"""

    # 🔥 ONLY CHANGE: Groq instead of Ollama
    response_text = call_llm(prompt).strip()

    print(f"LLM time: {round(time.time() - t4, 3)} sec")

    # If the LLM declared it used general knowledge, hide the irrelevant sources
    if "[GENERAL_KNOWLEDGE]" in response_text:
        response_text = response_text.replace("[GENERAL_KNOWLEDGE]", "").strip()
        sources = []

    # =========================
    # TOTAL TIME
    # =========================
    print(f"Total time: {round(time.time() - total_start, 3)} sec\n")

    return {
        "answer": response_text,
        "sources": sources
    }


# =========================
# TEST LOOP
# =========================
if __name__ == "__main__":
    while True:
        query = input("\nAsk something: ")

        if query.lower() in ["exit", "quit"]:
            break

        result = get_rag_response(query)

        print("\n🧠 Answer:\n", result["answer"])
        print("\n📚 Sources:")
        for s in result["sources"]:
            print(s)

