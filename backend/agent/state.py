"""
state.py — Central LangGraph state for the grievance agent.

This TypedDict defines the data that flows through every node in the graph.
It persists throughout a multi-turn conversation.

Updated for multi-account severity classification and department routing.
"""

from __future__ import annotations

from typing import Any
from typing_extensions import TypedDict


class GrievanceState(TypedDict, total=False):
    """
    Central state for the LangGraph conversation agent.

    Fields:
        messages:               Conversation history as list of {"role": ..., "content": ...} dicts.
        user_message:           The current user message being processed.

        severity:               Severity level: LOW, MEDIUM, HIGH.
        severity_reason:        LLM's reasoning for the severity classification.

        department:             Routed department: HR, IC, CRM, CSD, ESG, Investors.
        department_reason:      LLM's reasoning for the department classification.

        policy_context:         Retrieved policy chunks (list of dicts with content + metadata).
        policy_answer:          Generated grounded answer for policy queries.

        session_id:             Chat session identifier for persistence.

        response:               Final response text to return to the user.
        sources:                Source citations from RAG retrieval.
        error:                  Error message if something went wrong.

        # Tier / SLA routing
        initial_handler:        Initial handler: CHATBOT, L1, L2.
        assigned_tier:          Current human tier: L1, L2, L3, HEAD, or None.
        assigned_queue:         Queue name: e.g. crm_l1_queue, or None.
        sla_hours:              SLA duration in hours for the current tier.
        chatbot_resolved:       Whether the chatbot/RAG successfully resolved a LOW query.

        # Legacy fields (kept for backward compatibility with existing code paths)
        intent:                 Classified intent (legacy: POLICY_QUERY, GRIEVANCE, FOLLOW_UP, OTHER).
        category:               Grievance category from the taxonomy (legacy).
        collected_information:  Dict of field → value extracted so far (legacy).
        missing_information:    List of field names still required (legacy).
        next_question:          The next follow-up question to ask the user (legacy).
        status:                 Conversation status (legacy).
        active_grievance:       Whether a grievance intake is currently in progress (legacy).

        # Department routing
        routed:                 Whether the query was routed to a department.
        grievance_id:           ID of the created grievance record (if routed).
        assigned_to:            Admin name assigned to the grievance (if routed).
    """

    # Conversation
    messages: list[dict[str, str]]
    user_message: str

    # Severity Classification
    severity: str
    severity_reason: str

    # Department Classification & Routing
    department: str
    department_reason: str
    routed: bool
    grievance_id: str
    assigned_to: str

    # Tier / SLA Routing
    initial_handler: str
    assigned_tier: str
    assigned_queue: str
    sla_hours: int
    chatbot_resolved: bool

    # RAG / Policy
    policy_context: list[dict[str, Any]]
    policy_answer: str

    # Workflow
    session_id: str

    # Output
    response: str
    sources: list[dict[str, Any]]
    error: str

    # Legacy fields (preserved for backward compatibility)
    intent: str
    category: str
    collected_information: dict[str, Any]
    missing_information: list[str]
    next_question: str
    status: str
    active_grievance: bool
