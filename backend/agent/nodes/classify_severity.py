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

    system_prompt = """You are a severity classifier for a corporate grievance and query management system.

Your task is to classify the user's message into exactly one severity level:

- LOW: General questions, policy inquiries, information requests, greetings, routine service requests,
  portal access, or queries that can be answered from policy/knowledge base.
  Examples: "What is the leave policy?", "How do I apply for reimbursement?", "Hello",
  "Kindly share the AGM video conference link", "How do I update my bank mandate?", "Can I report anonymously?"

- MEDIUM: Moderate complaints or unresolved grievances requiring departmental investigation or L1 attention,
  repeated follow-ups, delayed handovers, unrectified physical snags, salary/leave balance discrepancies,
  or non-urgent customer/investor disputes.
  Examples: "Repeated delay in resolving customer snag for 3 weeks", "Unresolved leave balance discrepancy in LMS",
  "Delayed dividend credited or share transmission pending with RTA", "Registration delayed due to pending Khata approval",
  "Moderate construction dust or noise complaints during daytime"

- HIGH: Critical matters requiring immediate departmental intervention or senior escalation:
  1. Sexual harassment or POSH complaints (IC)
  2. Bribery, corruption, extortion, or kickback demands (e.g., sales rep demanding cash for flat handover)
  3. Life-safety risks, falls from height, workers without PPE, or structural collapse risks
  4. Major environmental damage, community flooding, toxic chemical discharge, or unauthorized tree felling
  5. Systemic financial fraud, accounting misrepresentation, or insider trading allegations
  6. Threats of legal action, statutory notices (RERA, SEBI, NGT, Labor Dept), or systemic customer harm
  Examples: "The sales executive asked for an under-the-table payment of 50k to fast-track registration",
  "My manager makes sexually suggestive remarks and makes me uncomfortable",
  "Workers at the 14th floor are working without safety harnesses and safety nets",
  "Construction debris has blocked the municipal canal causing severe flooding in residential areas",
  "Senior executives traded shares right before quarterly earnings disclosure"

IMPORTANT:
- Sexual harassment/POSH complaints are ALWAYS HIGH.
- Bribery, extortion, corruption, or kickback demands are ALWAYS HIGH.
- Life-safety risks, hazardous environmental violations, or fraud allegations are ALWAYS HIGH.
- Routine queries or informational requests are LOW.
- Unresolved grievances, persistent delays, or snags needing departmental intervention are MEDIUM.

Respond with ONLY a JSON object:
{"severity": "LOW" or "MEDIUM" or "HIGH", "reason": "Brief explanation"}"""

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
        severity = result.get("severity", "LOW").strip().upper()
        reason = result.get("reason", "")
    except json.JSONDecodeError as e:
        logger.error("Failed to parse severity JSON: %s", e)
        severity = "LOW"
        reason = "Classification parse error — defaulting to LOW"
    except Exception as e:
        logger.error("Severity classification LLM call failed: %s", e)
        severity = "LOW"
        reason = f"Classification error: {str(e)}"

    # Validate
    if severity not in ("LOW", "MEDIUM", "HIGH"):
        logger.warning("Invalid severity '%s' — defaulting to LOW", severity)
        # Handle legacy values
        if severity == "CRITICAL":
            severity = "HIGH"
            reason = f"Critical severity mapped to HIGH"
        else:
            severity = "LOW"
            reason = f"Invalid severity value — defaulted to LOW"

    logger.info(
        "═══ SEVERITY CLASSIFICATION ═══\n"
        "  Query: %s\n"
        "  Severity: %s\n"
        "  Reason: %s",
        user_message[:100],
        severity,
        reason,
    )

    return {
        "severity": severity,
        "severity_reason": reason,
    }
