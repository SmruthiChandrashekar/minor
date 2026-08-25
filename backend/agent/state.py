"""
state.py — Central LangGraph state for the grievance agent.

This TypedDict defines the data that flows through every node in the graph.
It persists throughout a multi-turn conversation.
"""

from __future__ import annotations

from typing import Any
from typing_extensions import TypedDict


class GrievanceState(TypedDict, total=False):
    """
    Central state for the LangGraph grievance conversation agent.

    Fields:
        messages:               Conversation history as list of {"role": ..., "content": ...} dicts.
        user_message:           The current user message being processed.

        intent:                 Classified intent: POLICY_QUERY, GRIEVANCE, FOLLOW_UP, OTHER.
        category:               Grievance category from the taxonomy.
        severity:               Severity level: LOW, MEDIUM, HIGH, CRITICAL, UNKNOWN.

        policy_context:         Retrieved policy chunks (list of dicts with content + metadata).
        policy_answer:          Generated grounded answer for policy queries.

        collected_information:  Dict of field → value extracted so far.
        missing_information:    List of field names still required.

        next_question:          The next follow-up question to ask the user.

        status:                 Conversation status: ACTIVE, INTAKE_COMPLETE, POLICY_ANSWERED.
        session_id:             Chat session identifier for persistence.
        active_grievance:       Whether a grievance intake is currently in progress.

        response:               Final response text to return to the user.
        sources:                Source citations from RAG retrieval.
        error:                  Error message if something went wrong.
    """

    # Conversation
    messages: list[dict[str, str]]
    user_message: str

    # Classification
    intent: str
    category: str
    severity: str

    # RAG / Policy
    policy_context: list[dict[str, Any]]
    policy_answer: str

    # Intake
    collected_information: dict[str, Any]
    missing_information: list[str]

    # Follow-up
    next_question: str

    # Workflow
    status: str
    session_id: str
    active_grievance: bool

    # Output
    response: str
    sources: list[dict[str, Any]]
    error: str
