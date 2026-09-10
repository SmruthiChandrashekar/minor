"""
ask_clarification.py — Handles conversational follow-up questions when a grievance lacks sufficient context.
"""

from backend.agent.state import GrievanceState


def ask_clarification_node(state: GrievanceState) -> dict:
    """
    Returns the generated clarifying question directly to the user
    without logging a ticket or assigning an SLA prematurely.
    """
    question = state.get("clarification_question") or (
        "I understand your concern. Could you share a few more details (such as the timing and project or wing location) "
        "so I can assist you accurately?"
    )

    return {
        "response": question,
        "chatbot_resolved": True,
        "severity": "LOW",
        "can_escalate": False,
        "routed": False,
        "sources": [],
    }
