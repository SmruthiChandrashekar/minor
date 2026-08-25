"""
graph.py — LangGraph StateGraph builder for the grievance agent.

Builds and compiles the conversation graph. Provides run_agent() to
process a single user message through the graph and return the response.

The graph stops after generating a response (follow-up question, policy
answer, or intake complete message) and resumes on the next user message.
"""

import logging
from langgraph.graph import StateGraph, END

from backend.agent.state import GrievanceState
from backend.agent.nodes.classify import classify_intent_node, classify_category_node
from backend.agent.nodes.severity import severity_node
from backend.agent.nodes.retrieve import retrieve_node
from backend.agent.nodes.intake import extract_info_node, analyze_requirements_node
from backend.agent.nodes.followup import (
    followup_node,
    policy_answer_node,
    intake_complete_node,
    other_response_node,
)
from backend.agent.edges.routing import (
    route_after_classify,
    route_after_analyze,
)

logger = logging.getLogger(__name__)


def build_graph() -> StateGraph:
    """
    Construct the LangGraph StateGraph with all nodes and conditional edges.

    Graph topology:
        START
          ↓
        classify_intent
          ↓ (conditional)
        ├─ POLICY_QUERY → retrieve_policy → policy_answer → END
        ├─ GRIEVANCE    → classify_category → assess_severity → retrieve_grievance → extract_info → analyze_requirements
        │                                                                                             ↓ (conditional)
        │                                                                                   ├─ MISSING → followup → END
        │                                                                                   └─ COMPLETE → intake_complete → END
        ├─ FOLLOW_UP    → extract_info → analyze_requirements → ...
        └─ OTHER        → other_response → END
    """
    graph = StateGraph(GrievanceState)

    # ── Add Nodes ─────────────────────────────────────────────────────────
    graph.add_node("classify_intent", classify_intent_node)
    graph.add_node("classify_category", classify_category_node)
    graph.add_node("assess_severity", severity_node)
    graph.add_node("retrieve_policy", retrieve_node)
    graph.add_node("retrieve_grievance", retrieve_node)
    graph.add_node("extract_info", extract_info_node)
    graph.add_node("analyze_requirements", analyze_requirements_node)
    graph.add_node("followup", followup_node)
    graph.add_node("policy_answer", policy_answer_node)
    graph.add_node("intake_complete", intake_complete_node)
    graph.add_node("other_response", other_response_node)

    # ── Entry Point ───────────────────────────────────────────────────────
    graph.set_entry_point("classify_intent")

    # ── Conditional Edges ─────────────────────────────────────────────────

    # After classify_intent → route by intent
    graph.add_conditional_edges(
        "classify_intent",
        route_after_classify,
        {
            "retrieve_policy": "retrieve_policy",
            "classify_category": "classify_category",
            "extract_info": "extract_info",
            "other_response": "other_response",
        },
    )

    # After classify_category → severity
    graph.add_edge("classify_category", "assess_severity")

    # After severity → retrieve for grievance context
    graph.add_edge("assess_severity", "retrieve_grievance")

    # After retrieve_policy → policy_answer
    graph.add_edge("retrieve_policy", "policy_answer")

    # After retrieve_grievance → extract_info
    graph.add_edge("retrieve_grievance", "extract_info")

    # After extract_info → analyze_requirements (LLM reads policy to decide what's missing)
    graph.add_edge("extract_info", "analyze_requirements")

    # After analyze_requirements → conditional: followup or intake_complete
    graph.add_conditional_edges(
        "analyze_requirements",
        route_after_analyze,
        {
            "followup": "followup",
            "intake_complete": "intake_complete",
        },
    )

    # Terminal nodes → END
    graph.add_edge("followup", END)
    graph.add_edge("policy_answer", END)
    graph.add_edge("intake_complete", END)
    graph.add_edge("other_response", END)

    return graph


# ── Compiled Graph (singleton) ────────────────────────────────────────────
_compiled_graph = None


def get_compiled_graph():
    """Return the compiled graph (lazily built once)."""
    global _compiled_graph
    if _compiled_graph is None:
        graph = build_graph()
        _compiled_graph = graph.compile()
        logger.info("LangGraph grievance agent compiled successfully")
    return _compiled_graph


def run_agent(
    user_message: str,
    session_id: str = "",
    messages: list[dict] | None = None,
    existing_state: dict | None = None,
) -> dict:
    """
    Run a single user message through the grievance agent graph.

    Args:
        user_message:   The current user message.
        session_id:     Chat session ID for persistence.
        messages:       Conversation history as list of {"role": ..., "content": ...}.
        existing_state: Previously persisted grievance state (if any).

    Returns:
        dict with keys: response, sources, intent, category, severity,
                        collected_information, missing_information, status,
                        active_grievance
    """
    compiled = get_compiled_graph()

    # Build initial state from existing state + new message
    state: GrievanceState = {
        "user_message": user_message,
        "session_id": session_id,
        "messages": messages or [],
        "policy_context": [],
        "sources": [],
        "error": "",
        "response": "",
        "policy_answer": "",
        "next_question": "",
    }

    # Restore persisted grievance state if available
    if existing_state:
        state["category"] = existing_state.get("category", "")
        state["severity"] = existing_state.get("severity", "")
        state["collected_information"] = existing_state.get("collected_information", {})
        state["missing_information"] = existing_state.get("missing_information", [])
        state["active_grievance"] = existing_state.get("active_grievance", False)
        state["status"] = existing_state.get("status", "ACTIVE")
        state["intent"] = existing_state.get("intent", "")
    else:
        state["category"] = ""
        state["severity"] = ""
        state["collected_information"] = {}
        state["missing_information"] = []
        state["active_grievance"] = False
        state["status"] = ""
        state["intent"] = ""

    try:
        # Run the graph
        result = compiled.invoke(state)

        return {
            "response": result.get("response", "I'm sorry, I couldn't process your request."),
            "sources": result.get("sources", []),
            "intent": result.get("intent", ""),
            "category": result.get("category", ""),
            "severity": result.get("severity", ""),
            "collected_information": result.get("collected_information", {}),
            "missing_information": result.get("missing_information", []),
            "status": result.get("status", ""),
            "active_grievance": result.get("active_grievance", False),
            "error": result.get("error", ""),
        }

    except Exception as e:
        logger.error("Agent graph execution failed: %s", e, exc_info=True)
        return {
            "response": "I apologize, but I encountered an issue processing your request. Please try again.",
            "sources": [],
            "intent": "",
            "category": "",
            "severity": "",
            "collected_information": existing_state.get("collected_information", {}) if existing_state else {},
            "missing_information": [],
            "status": "ERROR",
            "active_grievance": existing_state.get("active_grievance", False) if existing_state else False,
            "error": str(e),
        }
