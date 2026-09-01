"""
classify_severity.py — LLM-based severity classification node.

Classifies a user query as LOW or HIGH severity using the Groq LLM.
LOW → route to RAG for conversational response.
HIGH → route to department classification.
"""

import json
import logging
from backend.agent.state import GrievanceState

logger = logging.getLogger(__name__)


def classify_severity_node(state: GrievanceState) -> dict:
    """
    Classify the user's query severity using an LLM.

    Returns partial state update with 'severity' and 'severity_reason'.
    Defaults to 'low' on failure (safe fallback — user gets a RAG response).
    """
    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    user_message = state.get("user_message", "")
    messages = state.get("messages", [])

    if not user_message.strip():
        logger.warning("Empty user message — defaulting to low severity")
        return {
            "severity": "low",
            "severity_reason": "Empty query",
        }

    # Build conversation context (last 6 messages)
    history_text = ""
    for msg in messages[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    system_prompt = """You are a severity classifier for a corporate grievance and query management system.

Your task is to classify the user's message into exactly one severity level:

- LOW: General questions, policy inquiries, information requests, greetings, small talk,
  routine requests, minor concerns, or any query that can be answered from a knowledge base.
  Examples: "What is the leave policy?", "How do I apply for reimbursement?", "Hello",
  "What are the working hours?", "Can I report anonymously?"

- HIGH: Serious issues requiring departmental intervention, urgent matters, complaints about
  significant problems, reports of violations, harassment, safety threats, financial
  irregularities, compliance breaches, critical escalations, or anything that needs
  human attention from a specific department.
  Examples: "I want to report sexual harassment", "There is a safety violation at site",
  "Serious environmental compliance issue", "Financial reporting irregularities",
  "Employee being discriminated against", "Client has escalated a critical complaint"

IMPORTANT:
- When in doubt, classify as LOW (user will still get a helpful response).
- Do NOT classify simple questions or greetings as HIGH.
- Complaints and reports of serious issues are always HIGH.

Respond with ONLY a JSON object:
{"severity": "low" or "high", "reason": "Brief explanation"}"""

    prompt = f"""Conversation history:
{history_text}

Current user message: {user_message}

Classify the severity. Respond ONLY with JSON: {{"severity": "...", "reason": "..."}}"""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            max_tokens=200,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content.strip()
        result = json.loads(text)
        severity = result.get("severity", "low").lower()
        reason = result.get("reason", "")
    except json.JSONDecodeError as e:
        logger.error("Failed to parse severity JSON: %s", e)
        severity = "low"
        reason = "Classification parse error — defaulting to low"
    except Exception as e:
        logger.error("Severity classification LLM call failed: %s", e)
        severity = "low"
        reason = f"Classification error: {str(e)}"

    # Validate
    if severity not in ("low", "high"):
        logger.warning("Invalid severity '%s' — defaulting to low", severity)
        severity = "low"
        reason = f"Invalid severity value '{severity}' — defaulted to low"

    logger.info(
        "═══ SEVERITY CLASSIFICATION ═══\n"
        "  Query: %s\n"
        "  Severity: %s\n"
        "  Reason: %s",
        user_message[:100],
        severity.upper(),
        reason,
    )

    return {
        "severity": severity,
        "severity_reason": reason,
    }
