

from query_data import get_rag_response
from groq import Groq

# =========================
# GROQ SETUP
# =========================
import os
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def call_llm(prompt):
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=150
        )
        return response.choices[0].message.content
    except Exception as e:
        print("GROQ ERROR:", e)   # 🔥 ADD THIS
        return "Error contacting LLM"


# =========================
# GLOBAL MEMORY
# =========================
chat_history = []
last_query = None


# =========================
# QUERY NORMALIZATION
# =========================
def normalize_query(text):
    text = text.lower()

    if "posh" in text:
        text = text.replace("posh", "sexual harassment policy workplace")

    if "leave" in text:
        text = text.replace("leave", "employee leave policy")

    return text


# =========================
# LIGHT REPHRASING
# =========================
def rewrite_query(query):
    rewritten = call_llm(f"""
Rephrase this query in clear and simple English.

Rules:
- Keep the meaning exactly the same
- Do NOT add extra information
- Keep it short and natural

Query: {query}

Rephrased Query:
""")
    return rewritten.strip()


# =========================
# RELEVANCE CHECK
# =========================
def is_related_llm(current, previous):
    if not previous:
        return False

    response = call_llm(f"""
Determine if Query 2 is a follow-up of Query 1.

Only say YES if Query 2 clearly depends on Query 1 
(e.g., uses words like "it", "that", "those", or refers to previous topic).

Otherwise say NO.

Query 1: {previous}
Query 2: {current}

Answer ONLY YES or NO.
""")

    return "yes" in response.lower()


# =========================
# STRONG FOLLOW-UP REWRITE
# =========================
def make_query_specific(current, previous):
    rewritten = call_llm(f"""
Rewrite this as a COMPLETE and SPECIFIC standalone query.

IMPORTANT:
- MUST include the main topic from previous query
- MUST NOT be vague
- MUST NOT use words like "it", "that", "those"

Previous topic: {previous}
User query: {current}

Final query:
""").strip()

    if " it" in rewritten.lower() or len(rewritten.split()) < 5:
        rewritten = previous + " " + current

    return rewritten


def handle_low(text):

    global chat_history, last_query

    text_lower = text.lower()

    # =========================
    # HANDLE VAGUE FOLLOW-UPS
    # =========================
    vague_followups = ["yes", "ok", "continue", "go on", "hmm"]

    if text_lower.strip() in vague_followups and last_query:
        text = last_query + " explain more"
        text_lower = text.lower()

    # =========================
    # SMALL TALK
    # =========================
    small_talk_phrases = [
        "hi", "hello", "hey",
        "how are you", "how ru", "what's up",
        "good morning", "good evening"
    ]
    words = text_lower.split()

    if any(phrase in words for phrase in small_talk_phrases):
        response = "Hello! How can I help you today?"
        chat_history.append({"user": text, "bot": response})
        last_query = text
        return response

    # =========================
    # SHORT / VAGUE → LLM ONLY
    # =========================
    if len(text.split()) <= 3:
        response = call_llm(f"""
You are a professional assistant for Puravankara.

Talk naturally and briefly.

User: {text}

Response:
""")

        chat_history.append({"user": text, "bot": response})
        last_query = text
        return response

    # =========================
    # BUILD MEMORY CONTEXT (ONLY FOR FALLBACK)
    # =========================
    history_text = ""
    for turn in chat_history[-5:]:
        history_text += f"User: {turn['user']}\nBot: {turn['bot']}\n"

    # =========================
    # NORMALIZE QUERY
    # =========================
    normalized_text = normalize_query(text)

    # =========================
    # FOLLOW-UP DETECTION
    # =========================
    if len(normalized_text.split()) <= 3:
        related = False
    else:
        related = is_related_llm(normalized_text, last_query)

    # =========================
    # FINAL QUERY BUILD
    # =========================
    if related:
        clean_query = make_query_specific(normalized_text, last_query)
    else:
        clean_query = normalized_text

    # =========================
    # LIGHT REPHRASING
    # =========================
    if len(clean_query.split()) <= 5:
        clean_query = rewrite_query(clean_query)

    # =========================
    # DEBUG
    # =========================
    print("\nFINAL QUERY:", clean_query, "\n")

    # =========================
    # TRY RAG
    # =========================
    rag_result = get_rag_response(clean_query)
    rag_answer = rag_result["answer"]
    rag_sources = rag_result["sources"]

    # =========================
    # RAG RESPONSE
    # =========================
    if rag_sources:
        source_text = "\n\n📄 Sources:\n"
        for s in rag_sources:
            source_text += f"- {s['source']} (p.{s['page']})\n"
        response = rag_answer + source_text
    else:
        response = rag_answer

    # =========================
    # SAVE MEMORY
    # =========================
    chat_history.append({
        "user": text,
        "bot": response
    })

    last_query = text

    return response



















'''from query_data import get_rag_response
from langchain_ollama import OllamaLLM

# =========================
# GLOBAL MEMORY
# =========================
chat_history = []
last_query = None

# =========================
# LLM
# =========================
llm = OllamaLLM(
    model="phi3:mini",
    num_predict=150
)

# =========================
# QUERY NORMALIZATION
# =========================
def normalize_query(text):
    text = text.lower()

    if "posh" in text:
        text = text.replace("posh", "sexual harassment policy workplace")

    if "leave" in text:
        text = text.replace("leave", "employee leave policy")

    return text


# =========================
# LIGHT REPHRASING
# =========================
def rewrite_query(query):
    rewritten = llm.invoke(f"""
Rephrase this query in clear and simple English.

Rules:
- Keep the meaning exactly the same
- Do NOT add extra information
- Keep it short and natural

Query: {query}

Rephrased Query:
""")
    return rewritten.strip()


# =========================
# RELEVANCE CHECK
# =========================
def is_related_llm(current, previous):
    if not previous:
        return False

    response = llm.invoke(f"""
Determine if Query 2 is a follow-up of Query 1.

Only say YES if Query 2 clearly depends on Query 1 
(e.g., uses words like "it", "that", "those", or refers to previous topic).

Otherwise say NO.

Query 1: {previous}
Query 2: {current}

Answer ONLY YES or NO.
""")

    return "yes" in response.lower()


# =========================
# 🔥 STRONG FOLLOW-UP REWRITE
# =========================
def make_query_specific(current, previous):
    rewritten = llm.invoke(f"""
Rewrite this as a COMPLETE and SPECIFIC standalone query.

IMPORTANT:
- MUST include the main topic from previous query
- MUST NOT be vague
- MUST NOT use words like "it", "that", "those"

Previous topic: {previous}
User query: {current}

Final query:
""").strip()

    # 🔥 fallback if still vague
    if " it" in rewritten.lower() or len(rewritten.split()) < 5:
        rewritten = previous + " " + current

    return rewritten


def handle_low(text):

    global chat_history, last_query

    text_lower = text.lower()

    # =========================
    # HANDLE VAGUE FOLLOW-UPS
    # =========================
    vague_followups = ["yes", "ok", "continue", "go on", "hmm"]

    if text_lower.strip() in vague_followups and last_query:
        text = last_query + " explain more"
        text_lower = text.lower()

    # =========================
    # SMALL TALK
    # =========================
    small_talk_phrases = [
        "hi", "hello", "hey",
        "how are you", "how ru", "what's up",
        "good morning", "good evening"
    ]
    words = text_lower.split()

    if any(phrase in words for phrase in small_talk_phrases):
        response = "Hello! How can I help you today?"
        chat_history.append({"user": text, "bot": response})
        last_query = text
        return response

    # =========================
    # SHORT / VAGUE → LLM ONLY
    # =========================
    if len(text.split()) <= 3:
        response = llm.invoke(f"""
You are a professional assistant for Puravankara.

Talk naturally and briefly.

User: {text}

Response:
""")

        chat_history.append({"user": text, "bot": response})
        last_query = text
        return response

    # =========================
    # BUILD MEMORY CONTEXT (ONLY FOR FALLBACK)
    # =========================
    history_text = ""
    for turn in chat_history[-5:]:
        history_text += f"User: {turn['user']}\nBot: {turn['bot']}\n"

    # =========================
    # NORMALIZE QUERY
    # =========================
    normalized_text = normalize_query(text)

    # =========================
    # FOLLOW-UP DETECTION
    # =========================
    if len(normalized_text.split()) <= 3:
        related = False
    else:
        related = is_related_llm(normalized_text, last_query)

    # =========================
    # 🔥 FINAL QUERY BUILD
    # =========================
    if related:
        clean_query = make_query_specific(normalized_text, last_query)
    else:
        clean_query = normalized_text

    # =========================
    # LIGHT REPHRASING
    # =========================
    if len(clean_query.split()) <= 5:
        clean_query = rewrite_query(clean_query)

    # =========================
    # 🔥 DEBUG (IMPORTANT)
    # =========================
    print("\nFINAL QUERY:", clean_query, "\n")

    # =========================
    # TRY RAG
    # =========================
    rag_result = get_rag_response(clean_query)
    rag_answer = rag_result["answer"]
    rag_sources = rag_result["sources"]

    # =========================
    # FALLBACK TO LLM
    # =========================
    if "not specified" in rag_answer.lower():

        prompt = f"""
You are a helpful assistant for Puravankara.

Rules:
- Answer workplace / HR related queries
- If it's a minor issue → give practical steps
- Be concise and natural

Previous conversation:
{history_text}

User message:
{text}

Response:
"""

        response = llm.invoke(prompt)

    else:
        if rag_sources:
            source_text = "\n\n📚 Sources:\n"
            for s in rag_sources:
                source_text += f"- {s['source']} (page {s['page']})\n"

            response = rag_answer + source_text
        else:
            response = rag_answer

    # =========================
    # SAVE MEMORY
    # =========================
    chat_history.append({
        "user": text,
        "bot": response
    })

    last_query = text

    return response'''