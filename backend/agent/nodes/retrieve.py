"""
retrieve.py — Policy retrieval node.

Wraps the existing Phase 1 RAG pipeline (rag/query_data.py).
Does NOT replace or duplicate the existing RAG implementation.
"""

import logging
from backend.agent.state import GrievanceState

logger = logging.getLogger(__name__)


def retrieve_node(state: GrievanceState) -> dict:
    """
    Retrieve relevant policy chunks using the existing RAG pipeline.

    Constructs a retrieval query from:
        - Current user message
        - Category (if available) for context enrichment
        - Relevant conversation context

    Stores results in state.policy_context and state.sources.
    """
    from rag.query_data import get_rag_response, is_rag_ready, initialize_rag

    # Ensure RAG is initialized
    if not is_rag_ready():
        try:
            initialize_rag()
        except Exception as e:
            logger.error("Failed to initialize RAG: %s", e)
            return {
                "policy_context": [],
                "sources": [],
                "error": "Policy retrieval system is not available.",
            }

    user_message = state.get("user_message", "")
    category = state.get("category", "")
    intent = state.get("intent", "")

    # Build retrieval query — enrich with category for better matching
    query_parts = [user_message]
    if category and category != "Other":
        query_parts.append(category)

    retrieval_query = " ".join(query_parts)

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

        # For policy queries, store the answer directly
        if intent == "POLICY_QUERY":
            return {
                "policy_context": policy_context,
                "sources": sources,
                "policy_answer": answer,
            }

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
            "error": f"Policy retrieval error: {str(e)}",
        }
