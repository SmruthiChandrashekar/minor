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



# ── Deterministic Severity Guardrail ─────────────────────────────────────────

def check_deterministic_severity_guardrails(text: str) -> tuple[str, str, str] | None:
    """
    Deterministic rule-based guardrail for severity classification.
    Catches life-safety, POSH, bribery, and other HIGH-severity triggers that
    small local models sometimes downgrade to MEDIUM.
    Returns (intent, severity, reason) or None if no guardrail fires.
    """
    t = text.lower()

    # POSH / Sexual harassment → always HIGH GRIEVANCE (unless purely an informational query about policy)
    is_informational = any(q in t for q in [
        "what is", "purpose of", "explain", "who is", "definition of",
        "policy document", "guideline", "tell me about"
    ])

    posh_indicators = [
        "sexual harassment", "touched me without", "inappropriate touching",
        "quid pro quo", "unwanted sexual advance", "sexually inappropriate",
        "posh complaint", "posh violation", "facing harassment", "harassed by"
    ]
    if not is_informational and "posh" in t:
        posh_indicators.append("posh")

    if any(k in t for k in posh_indicators):
        if not is_informational:
            return ("GRIEVANCE", "HIGH", "Deterministic guardrail: Sexual misconduct / POSH complaint detected.")

    # Physical site safety / emergency → always HIGH GRIEVANCE
    safety_indicators = [
        "unsafe working condition", "emergency response", "life safety",
        "scaffolding collapse", "site collapse", "site accident", "fall hazard",
        "fatal", "electric shock", "fire hazard", "toxic gas", "worker trapped",
        "no safety harness", "no helmets", "working without ppe", "without safety equipment",
        "welfare facilit", "site sanitation",
    ]
    if any(k in t for k in safety_indicators):
        return ("GRIEVANCE", "HIGH", "Deterministic guardrail: Physical site safety hazard or emergency detected.")

    # Bribery / fraud / corruption → always HIGH GRIEVANCE
    fraud_indicators = [
        "bribery", "bribe", "kickback", "corruption", "demanded cash",
        "whistleblower", "fraud", "embezzlement",
    ]
    if any(k in t for k in fraud_indicators):
        return ("GRIEVANCE", "HIGH", "Deterministic guardrail: Bribery / fraud / corruption report detected.")

    return None


# ── Main Node ─────────────────────────────────────────────────────────────────

def classify_severity_node(state: GrievanceState) -> dict:
    """
    Classify the user's query severity using an LLM.

    Deterministic guardrails are checked first (pre-LLM) to guarantee HIGH
    severity for life-safety, POSH, and bribery scenarios.
    Returns partial state update with 'severity' and 'severity_reason'.
    Defaults to 'LOW' on failure (safe fallback — user gets a RAG response).
    """
    from backend.agent.llm import get_llm, extract_response_text
    import re

    client, model_name = get_llm()
    # Use condensed statement from multi-turn rewriter if available, fallback to user_message
    user_message = (state.get("condensed_message") or state.get("user_message", "")).strip()
    messages = state.get("messages", [])

    if not user_message:
        logger.warning("Empty user message — defaulting to LOW severity")
        return {
            "severity": "LOW",
            "severity_reason": "Empty query",
        }

    # ── Deterministic guardrail (pre-LLM) ─────────────────────────────────────
    guardrail_result = check_deterministic_severity_guardrails(user_message)
    if guardrail_result:
        intent, severity, reason = guardrail_result
        logger.info(
            "═══ TRIAGE CLASSIFICATION (guardrail) ═══\n"
            "  Query: %s\n  Intent: %s | Severity: %s\n  Reason: %s",
            user_message[:100], intent, severity, reason,
        )
        return {"intent": intent, "severity": severity, "severity_reason": reason}

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
3. Physical safety hazards, unsafe working conditions, site emergencies, or worker welfare complaints are ALWAYS intent="GRIEVANCE" and severity="HIGH".
4. Bribery or corruption reports are ALWAYS intent="GRIEVANCE" and severity="HIGH".
5. Unresolved complaints with repeat delays are intent="GRIEVANCE" and severity="MEDIUM".
6. Construction site dust or noise affecting nearby community is intent="GRIEVANCE" and severity="MEDIUM".

CALIBRATION EXAMPLES (use these as anchors):
- "Unsafe working conditions, wages, sanitation, welfare facilities and emergency response" -> GRIEVANCE / HIGH (physical safety + emergency)
- "My manager touched me inappropriately at the team offsite" -> GRIEVANCE / HIGH (POSH)
- "Sales executive demanded 50k cash bribe" -> GRIEVANCE / HIGH (bribery)
- "Construction dust and noise affecting nearby residents at Purva Atmosphere" -> GRIEVANCE / MEDIUM
- "Bedroom wall seepage reported two weeks ago still unresolved" -> GRIEVANCE / MEDIUM
- "My leave balance in LMS is incorrect despite follow-ups" -> GRIEVANCE / MEDIUM
- "What is the Puravankara POSH policy?" -> QUERY / LOW
- "How do I apply for casual leave?" -> QUERY / LOW
- "Can I work from home on Fridays?" -> QUERY / LOW

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

    num_ctx = getattr(client, "_ollama_num_ctx", None)

    try:
        kwargs = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 150,
            "temperature": 0.0,
        }
        if num_ctx:
            kwargs["extra_body"] = {"options": {"num_ctx": num_ctx}}
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
            reason = "Critical severity mapped to HIGH"
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
