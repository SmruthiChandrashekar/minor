"""
graph.py — LangGraph StateGraph builder for the multi-account severity
classification, department routing, and conversational RAG agent.

Builds and compiles the conversation graph. Provides run_agent() to
process a single user message through the graph and return the response.

Workflow (ternary severity):
    START → classify_severity
      ├── LOW    → rag_retrieve → generate_response → END  (chatbot path)
      ├── MEDIUM → classify_department → dept_{X} → END    (L1 human path)
      └── HIGH   → classify_department → dept_{X} → END    (L2 human path)
"""

import logging
from langgraph.graph import StateGraph, END

from backend.agent.state import GrievanceState
from backend.agent.nodes.classify_severity import classify_severity_node
from backend.agent.nodes.classify_department import classify_department_node
from backend.agent.nodes.retrieve import retrieve_node
from backend.agent.nodes.generate_response import generate_response_node
from backend.agent.nodes.department_router import department_route_node
from backend.agent.edges.routing import (
    route_after_severity,
    route_to_department,
)

logger = logging.getLogger(__name__)


def build_graph() -> StateGraph:
    """
    Construct the LangGraph StateGraph with the severity classification
    and department routing workflow.

    Graph topology:
        START
          ↓
        classify_severity
          ↓ (conditional)
          ├── LOW    → rag_retrieve → generate_response → END
          ├── MEDIUM → classify_department → dept_{X} → END  (L1, 48h SLA)
          └── HIGH   → classify_department → dept_{X} → END  (L2, 24h SLA)
    """
    graph = StateGraph(GrievanceState)

    # ── Add Nodes ─────────────────────────────────────────────────────────
    graph.add_node("classify_severity", classify_severity_node)
    graph.add_node("classify_department", classify_department_node)
    graph.add_node("rag_retrieve", retrieve_node)
    graph.add_node("generate_response", generate_response_node)

    # Department routing nodes — all use the same reusable function
    graph.add_node("dept_hr", department_route_node)
    graph.add_node("dept_ic", department_route_node)
    graph.add_node("dept_crm", department_route_node)
    graph.add_node("dept_csd", department_route_node)
    graph.add_node("dept_esg", department_route_node)
    graph.add_node("dept_investors", department_route_node)

    # ── Entry Point ───────────────────────────────────────────────────────
    graph.set_entry_point("classify_severity")

    # ── Conditional Edges ─────────────────────────────────────────────────

    # After classify_severity → route by severity (3-way)
    graph.add_conditional_edges(
        "classify_severity",
        route_after_severity,
        {
            "rag_retrieve": "rag_retrieve",
            "classify_department": "classify_department",
        },
    )

    # After RAG retrieval → generate conversational response
    graph.add_edge("rag_retrieve", "generate_response")

    # After classify_department → route to specific department
    graph.add_conditional_edges(
        "classify_department",
        route_to_department,
        {
            "dept_hr": "dept_hr",
            "dept_ic": "dept_ic",
            "dept_crm": "dept_crm",
            "dept_csd": "dept_csd",
            "dept_esg": "dept_esg",
            "dept_investors": "dept_investors",
        },
    )

    # Terminal nodes → END
    graph.add_edge("generate_response", END)
    graph.add_edge("dept_hr", END)
    graph.add_edge("dept_ic", END)
    graph.add_edge("dept_crm", END)
    graph.add_edge("dept_csd", END)
    graph.add_edge("dept_esg", END)
    graph.add_edge("dept_investors", END)

    return graph


# ── Compiled Graph (singleton) ────────────────────────────────────────────
_compiled_graph = None


def get_compiled_graph():
    """Return the compiled graph (lazily built once)."""
    global _compiled_graph
    if _compiled_graph is None:
        graph = build_graph()
        _compiled_graph = graph.compile()
        logger.info("LangGraph severity/department agent compiled successfully")
    return _compiled_graph


def run_agent(
    user_message: str,
    session_id: str = "",
    messages: list[dict] | None = None,
    existing_state: dict | None = None,
) -> dict:
    """
    Run a single user message through the severity classification
    and department routing graph.

    Args:
        user_message:   The current user message.
        session_id:     Chat session ID for persistence.
        messages:       Conversation history as list of {"role": ..., "content": ...}.
        existing_state: Previously persisted state (if any, for backward compat).

    Returns:
        dict with keys: response, sources, severity, severity_reason,
                        department, department_reason, routed,
                        grievance_id, assigned_to, initial_handler,
                        assigned_tier, assigned_queue, sla_hours,
                        chatbot_resolved, error
    """
    compiled = get_compiled_graph()

    # Build initial state
    state: GrievanceState = {
        "user_message": user_message,
        "session_id": session_id,
        "messages": messages or [],
        "policy_context": [],
        "sources": [],
        "error": "",
        "response": "",
        "policy_answer": "",
        "severity": "",
        "severity_reason": "",
        "department": "",
        "department_reason": "",
        "routed": False,
        "grievance_id": "",
        "assigned_to": "",
        "initial_handler": "",
        "assigned_tier": "",
        "assigned_queue": "",
        "sla_hours": 0,
        "chatbot_resolved": True,
    }

    try:
        # Run the graph
        logger.info(
            "═══ AGENT INVOCATION ═══\n"
            "  Session: %s\n"
            "  Query: %s",
            session_id or "(no session)",
            user_message[:100],
        )

        result = compiled.invoke(state)

        return {
            "response": result.get("response", "I'm sorry, I couldn't process your request."),
            "sources": result.get("sources", []),
            "severity": result.get("severity", ""),
            "severity_reason": result.get("severity_reason", ""),
            "department": result.get("department", ""),
            "department_reason": result.get("department_reason", ""),
            "routed": result.get("routed", False),
            "grievance_id": result.get("grievance_id", ""),
            "assigned_to": result.get("assigned_to", ""),
            "initial_handler": result.get("initial_handler", ""),
            "assigned_tier": result.get("assigned_tier", ""),
            "assigned_queue": result.get("assigned_queue", ""),
            "sla_hours": result.get("sla_hours", 0),
            "chatbot_resolved": result.get("chatbot_resolved", True),
            "error": result.get("error", ""),
        }

    except Exception as e:
        logger.error("Agent graph execution failed: %s", e, exc_info=True)
        return {
            "response": "I apologize, but I encountered an issue processing your request. Please try again.",
            "sources": [],
            "severity": "",
            "severity_reason": "",
            "department": "",
            "department_reason": "",
            "routed": False,
            "grievance_id": "",
            "assigned_to": "",
            "initial_handler": "",
            "assigned_tier": "",
            "assigned_queue": "",
            "sla_hours": 0,
            "chatbot_resolved": True,
            "error": str(e),
        }
