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
    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
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

    system_prompt = """You are an intelligent triage evaluator for an enterprise grievance and query management system.

Your task is two-fold:
1. CLASSIFY INTENT:
   - "QUERY": The user is asking for information, company policy details, how-to procedures, explanations (e.g., payslip breakdown, general questions, portal help), or general workplace advice.
   - "GRIEVANCE": The user is reporting an actual personal complaint, dissatisfaction, injustice, physical snag, dispute, misconduct, or financial discrepancy.

2. CLASSIFY SEVERITY (Apply practical common sense and proportionality — evaluate real-world impact):
   - For all "QUERY" messages, severity is always "LOW".
   - For "GRIEVANCE" messages, evaluate the actual scale and impact considering the conversation history:
     * "LOW": Minor, routine, isolated, or nominal issues where conversational explanation, reassurance, or guidance is the appropriate first step, with an option to escalate if unsatisfied.
     * "MEDIUM": Substantial, tangible grievances with verified loss, prolonged delays, unrectified physical snags, or clear policy/curfew breaches requiring human departmental investigation.
     * "HIGH": Critical risks: life-safety hazards, sexual harassment/POSH, extortion/bribery, systemic fraud, or acute structural dangers.

IMPORTANT:
- Use common sense: minor or everyday complaints belong in LOW so the conversational assistant can help first.
- Bribery, sexual harassment, life-safety hazards, and fraud are ALWAYS HIGH.

Respond with ONLY a JSON object (evaluate reasoning first):
{
  "reason": "1-2 sentences giving common-sense assessment of intent and impact",
  "intent": "QUERY" or "GRIEVANCE",
  "severity": "LOW" or "MEDIUM" or "HIGH"
}"""

    prompt = f"""Conversation history:
{history_text}

Current user message: {user_message}

Triage the user message. Respond ONLY with JSON: {{"reason": "...", "intent": "...", "severity": "..."}}"""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            max_tokens=600,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content.strip()
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
