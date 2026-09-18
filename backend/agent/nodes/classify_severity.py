"""
classify_severity.py — LLM-based severity classification node.

Classifies a user query as LOW, MEDIUM, or HIGH severity using the Groq LLM.

Routing after classification:
    LOW    → rag_retrieve (chatbot/RAG path)
    MEDIUM → classify_department (L1 human handling)
    HIGH   → classify_department (L2 human handling)
"""

import json
import logging
from backend.agent.state import GrievanceState

logger = logging.getLogger(__name__)


def classify_severity_node(state: GrievanceState) -> dict:
    """
    Classify the user's query severity using an LLM.

    Returns partial state update with 'severity' and 'severity_reason'.
    Defaults to 'LOW' on failure (safe fallback — user gets a RAG response).
    """
    from backend.agent.llm import get_llm, extract_response_text
    import re

    client, model_name = get_llm()
    user_message = state.get("user_message", "")
    messages = state.get("messages", [])

    if not user_message.strip():
        logger.warning("Empty user message — defaulting to LOW severity")
        return {
            "severity": "LOW",
            "severity_reason": "Empty query",
        }

    # Build conversation context (last 6 messages)
    history_text = ""
    for msg in messages[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    system_prompt = """You are a triage classifier for a corporate grievance and query management system.

Your task is to classify the user's message into BOTH an INTENT and a SEVERITY LEVEL:

INTENT:
- QUERY: Informational questions, policy inquiries, how-to requests, clarifications, portal/LMS guidance, requests for links/forms/documents, or general FAQs. Queries can be answered directly from knowledge base/policy documents.
- GRIEVANCE: Complaints, reports of misconduct, payroll/salary disputes, harassment, safety violations, delayed handovers, unaddressed snags, or issues requiring investigation, escalation, or departmental action.

SEVERITY:
- LOW: Routine questions, policy lookups, attendance rules, leave policy queries, FAQs, minor portal issues, or general inquiries.
- MEDIUM: Unresolved discrepancies, delayed processing, unaddressed snags, repeated follow-ups, leave balance errors in LMS, or non-urgent disputes requiring L1 investigation.
- HIGH: Serious violations, physical/workplace safety hazards, sexual harassment (POSH), fraud, bribery, whistleblower disclosures, severe verbal abuse, illegal activities, or urgent executive attention.

IMPORTANT RULES:
1. All general informational / policy questions MUST have intent="QUERY" and severity="LOW".
2. Sexual harassment or POSH complaints are ALWAYS intent="GRIEVANCE" and severity="HIGH".
3. Physical safety hazards or site accidents are ALWAYS intent="GRIEVANCE" and severity="HIGH".
4. Bribery or corruption reports are ALWAYS intent="GRIEVANCE" and severity="HIGH".
5. Unresolved complaints with repeat delays are intent="GRIEVANCE" and severity="MEDIUM".

Respond ONLY with a JSON object:
{
    "reason": "<one sentence explanation>",
    "intent": "QUERY" | "GRIEVANCE",
    "severity": "LOW" | "MEDIUM" | "HIGH"
}"""

    prompt = f"""Conversation history:
{history_text}

Current user message: {user_message}

Triage the user message. Respond ONLY with JSON: {{"reason": "...", "intent": "...", "severity": "..."}}"""

    try:
        kwargs = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 600,
            "temperature": 0.0,
        }
        try:
            response = client.chat.completions.create(**kwargs, response_format={"type": "json_object"})
        except Exception:
            response = client.chat.completions.create(**kwargs)

        text = extract_response_text(response.choices[0].message).strip()
        if "```" in text:
            m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
            if m:
                text = m.group(1)
            else:
                m2 = re.search(r"(\{.*?\})", text, re.DOTALL)
                if m2:
                    text = m2.group(1)
        result = json.loads(text)
        intent = result.get("intent", "QUERY").strip().upper()
        severity = result.get("severity", "LOW").strip().upper()
        reason = result.get("reason", "")
    except json.JSONDecodeError as e:
        logger.error("Failed to parse severity JSON: %s", e)
        intent = "QUERY"
        severity = "LOW"
        reason = "Classification parse error — defaulting to QUERY / LOW"
    except Exception as e:
        logger.error("Severity classification LLM call failed: %s", e)
        intent = "QUERY"
        severity = "LOW"
        reason = f"Classification error: {str(e)}"

    # Validate intent
    if intent not in ("QUERY", "GRIEVANCE"):
        intent = "QUERY" if severity == "LOW" else "GRIEVANCE"

    # Validate severity
    if severity not in ("LOW", "MEDIUM", "HIGH"):
        if severity == "CRITICAL":
            severity = "HIGH"
            reason = f"Critical severity mapped to HIGH"
        else:
            severity = "LOW"

    # Queries are always LOW
    if intent == "QUERY":
        severity = "LOW"

    logger.info(
        "═══ TRIAGE CLASSIFICATION ═══\n"
        "  Query: %s\n"
        "  Intent: %s | Severity: %s\n"
        "  Reason: %s",
        user_message[:100],
        intent,
        severity,
        reason,
    )

    return {
        "intent": intent,
        "severity": severity,
        "severity_reason": reason,
    }
