"""
retrieve.py — Context-aware policy retrieval node.

Wraps the existing RAG pipeline (rag/query_data.py) with conversational
query rewriting. When the user asks a follow-up question like "What about
interns?", this node uses the LLM to rewrite it into a standalone query
like "What is the leave policy for interns?" before sending to RAG.
"""

import json
import logging
from backend.agent.state import GrievanceState

logger = logging.getLogger(__name__)


def _rewrite_query(client, user_message: str, messages: list[dict]) -> str:
    """
    Use LLM to rewrite a follow-up query into a standalone query.

    If the query is already standalone, returns it unchanged.
    Only rewrites when context from conversation history is needed.
    """
    if not messages:
        return user_message

    # Build recent conversation context
    history_text = ""
    for msg in messages[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    system_prompt = """You are a query rewriter. Given a conversation history and the latest user message,
determine if the user message is a follow-up that references previous context
(e.g., uses "it", "that", "this", "those", "they", or refers to a previous topic implicitly).

If YES: Rewrite the user message as a COMPLETE, STANDALONE query that includes the
relevant context from the conversation. The rewritten query should make sense without
any conversation history.

If NO: Return the original user message unchanged.

Respond with ONLY a JSON object:
{"rewritten": "the standalone query", "was_rewritten": true/false}

Examples:
- History: "What is the leave policy?" → User: "What about interns?"
  → {"rewritten": "What is the leave policy for interns?", "was_rewritten": true}
- History: "Tell me about POSH" → User: "Who handles such complaints?"
  → {"rewritten": "Who handles POSH / sexual harassment complaints?", "was_rewritten": true}
- User: "What is the reimbursement process?"
  → {"rewritten": "What is the reimbursement process?", "was_rewritten": false}"""

    prompt = f"""Conversation history:
{history_text}

Latest user message: {user_message}

Rewrite if needed. Respond ONLY with JSON."""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            max_tokens=500,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content.strip()
        result = json.loads(text)
        rewritten = result.get("rewritten", user_message)
        was_rewritten = result.get("was_rewritten", False)

        if was_rewritten:
            logger.info("Query rewritten: '%s' → '%s'", user_message, rewritten)
        return rewritten

    except Exception as e:
        logger.error("Query rewrite failed: %s — using original query", e)
        return user_message


def retrieve_node(state: GrievanceState) -> dict:
    """
    Retrieve relevant policy chunks using the existing RAG pipeline.

    Performs conversational query rewriting before retrieval to handle
    follow-up questions that reference previous conversation context.

    Stores results in state.policy_context, state.sources, and state.policy_answer.
    """
    from rag.query_data import get_rag_response, is_rag_ready, initialize_rag
    from groq import Groq
    import os

    # Ensure RAG is initialized
    if not is_rag_ready():
        try:
            initialize_rag()
        except Exception as e:
            logger.error("Failed to initialize RAG: %s", e)
            return {
                "policy_context": [],
                "sources": [],
                "policy_answer": "",
                "error": "Policy retrieval system is not available.",
            }

    user_message = state.get("user_message", "")
    messages = state.get("messages", [])

    # Step 1: Rewrite query for conversational context
    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    retrieval_query = _rewrite_query(client, user_message, messages)

    # Step 2: Run RAG retrieval
    try:
        rag_result = get_rag_response(retrieval_query)
        answer = rag_result.get("answer", "")
        sources = rag_result.get("sources", [])

        # Build structured policy context for downstream nodes
        policy_context = []
        for s in sources:
            policy_context.append({
                "policy_name": s.get("source", ""),
                "page": s.get("page", 1),
                "section": s.get("section", ""),
                "score": s.get("score", 0),
                "source_file": s.get("source_file", ""),
            })

        logger.info(
            "Retrieved %d policy sources for query: %s",
            len(sources),
            retrieval_query[:80],
        )

        return {
            "policy_context": policy_context,
            "sources": sources,
            "policy_answer": answer,
        }

    except Exception as e:
        logger.error("RAG retrieval failed: %s", e)
        return {
            "policy_context": [],
            "sources": [],
            "policy_answer": "",
            "error": f"Policy retrieval error: {str(e)}",
        }
