"""
routing.py — Conditional edge functions for LangGraph.

These functions inspect the current state and return the name of the
next node to visit. They implement the control flow of the agent.

New workflow:
    classify_severity
        ├── low → rag_retrieve → generate_response → END
        └── high → classify_department → dept_{department} → END
"""

from backend.agent.state import GrievanceState


def route_after_severity(state: GrievanceState) -> str:
    """
    After severity classification, decide the next node.

    low  → rag_retrieve (conversational RAG path)
    high → classify_department (department routing path)
    """
    severity = state.get("severity", "low")

    if severity == "high":
        return "classify_department"
    else:
        return "rag_retrieve"


def route_to_department(state: GrievanceState) -> str:
    """
    After department classification, route to the correct department node.

    Returns the node name for the classified department.
    Department nodes are named: dept_hr, dept_ic, dept_crm, dept_csd, dept_esg, dept_investors
    """
    department = state.get("department", "CRM")

    dept_node_map = {
        "HR": "dept_hr",
        "IC": "dept_ic",
        "CRM": "dept_crm",
        "CSD": "dept_csd",
        "ESG": "dept_esg",
        "Investors": "dept_investors",
    }

    node = dept_node_map.get(department, "dept_crm")
    return node


# ── Legacy edge functions (kept for backward compatibility) ───────────────

def route_after_classify(state: GrievanceState) -> str:
    """Legacy: After intent classification, decide the next node."""
    intent = state.get("intent", "OTHER")
    if intent == "POLICY_QUERY":
        return "retrieve_policy"
    elif intent == "GRIEVANCE":
        return "classify_category"
    elif intent == "FOLLOW_UP":
        return "extract_info"
    else:
        return "other_response"


def route_after_analyze(state: GrievanceState) -> str:
    """Legacy: After analyzing requirements, decide followup or complete."""
    missing = state.get("missing_information", [])
    status = state.get("status", "ACTIVE")
    if status == "INTAKE_COMPLETE" or not missing:
        return "intake_complete"
    else:
        return "followup"
