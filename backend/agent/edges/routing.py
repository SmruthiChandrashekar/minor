"""
routing.py — Conditional edge functions for LangGraph.

These functions inspect the current state and return the name of the
next node to visit. They implement the control flow of the agent.
"""

from backend.agent.state import GrievanceState


def route_after_classify(state: GrievanceState) -> str:
    """
    After intent classification, decide the next node.

    POLICY_QUERY → retrieve (then policy_answer)
    GRIEVANCE    → classify_category
    FOLLOW_UP    → extract_info (continue existing grievance)
    OTHER        → other_response
    """
    intent = state.get("intent", "OTHER")

    if intent == "POLICY_QUERY":
        return "retrieve_policy"
    elif intent == "GRIEVANCE":
        return "classify_category"
    elif intent == "FOLLOW_UP":
        return "extract_info"
    else:
        return "other_response"


def route_after_category(state: GrievanceState) -> str:
    """After category classification, always go to severity."""
    return "assess_severity"


def route_after_severity(state: GrievanceState) -> str:
    """After severity assessment, go to retrieve for policy context."""
    return "retrieve_grievance"


def route_after_retrieve_policy(state: GrievanceState) -> str:
    """After retrieval for a POLICY_QUERY, go to policy_answer."""
    return "policy_answer"


def route_after_retrieve_grievance(state: GrievanceState) -> str:
    """After retrieval for a GRIEVANCE, go to extract_info."""
    return "extract_info"


def route_after_analyze(state: GrievanceState) -> str:
    """
    After analyzing requirements (LLM-driven), decide whether to ask
    a follow-up or complete intake.

    Missing items     → followup
    Nothing missing   → intake_complete
    """
    missing = state.get("missing_information", [])
    status = state.get("status", "ACTIVE")

    if status == "INTAKE_COMPLETE" or not missing:
        return "intake_complete"
    else:
        return "followup"
