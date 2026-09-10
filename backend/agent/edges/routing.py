"""
routing.py — Conditional edge functions for LangGraph.

These functions inspect the current state and return the name of the
next node to visit. They implement the control flow of the agent.

Workflow:
    classify_severity
        ├── LOW    → rag_retrieve → generate_response → END
        ├── MEDIUM → classify_department → dept_{department} → END
        └── HIGH   → classify_department → dept_{department} → END
"""

from backend.agent.state import GrievanceState


def route_after_context_check(state: GrievanceState) -> str:
    """
    Decide whether we have sufficient context to proceed with triage
    or need to ask a clarifying question first.
    """
    if not state.get("context_sufficient", True):
        return "ask_clarification"
    return "classify_severity"


def route_after_severity(state: GrievanceState) -> str:
    """
    After triage classification, decide the next node.

    - All queries (intent == "QUERY") -> rag_retrieve (chatbot path: Policy RAG or General Knowledge)
    - Low-severity grievances (intent == "GRIEVANCE" and severity == "LOW") -> rag_retrieve (chatbot path with escalation option)
    - Medium or High grievances -> classify_department (human L1/L2 path)
    """
    intent = state.get("intent", "QUERY").strip().upper()
    severity = state.get("severity", "LOW").strip().upper()

    if intent == "GRIEVANCE" and severity in ("MEDIUM", "HIGH"):
        return "classify_department"
    else:
        # All queries or low-severity grievances go to chatbot/RAG
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


# ── Legacy edge functions (kept for backward compatibility) ───────────

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
