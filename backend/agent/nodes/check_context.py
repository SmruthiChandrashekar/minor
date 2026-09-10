"""
check_context.py — Context sufficiency evaluator node for Puravankara agent.

Checks if the user message is a QUERY or a GRIEVANCE:
- For all QUERIES: context_sufficient is ALWAYS True (queries answer immediately).
- For GRIEVANCES:
  * Evaluates whether the user has provided enough operational context
    (e.g., time of day/curfew details, project/wing, specific transaction/amount)
    to assess severity and route accurately.
  * Obvious critical reports (sexual harassment, physical safety hazard, bribery/extortion)
    are ALWAYS treated as context_sufficient = True to avoid delaying urgent issues.
  * Ambiguous complaints (e.g. "too much noise coming from construction", "salary issue", "water leak")
    trigger context_sufficient = False and produce a polite, targeted clarifying question.
"""

import json
import logging
from backend.agent.state import GrievanceState

logger = logging.getLogger(__name__)


def check_context_node(state: GrievanceState) -> dict:
    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    user_message = state.get("user_message", "")
    messages = state.get("messages", [])

    if not user_message.strip():
        return {
            "intent": "QUERY",
            "context_sufficient": True,
            "clarification_question": "",
        }

    # Check if the assistant just asked a clarifying question in the immediately preceding turn.
    # If so, the user is now replying to it, so we proceed directly to triage/resolution
    # to avoid ever trapping the user in an infinite questioning loop.
    last_assistant_msg = ""
    for msg in reversed(messages):
        if msg.get("role") == "assistant":
            last_assistant_msg = msg.get("content", "")
            break
        elif msg.get("role") == "user":
            continue

    prior_was_clarification = (
        bool(last_assistant_msg)
        and ("?" in last_assistant_msg)
        and any(q in last_assistant_msg.lower() for q in ["could you", "please provide", "please share", "can you", "what", "when", "where", "which"])
        and not any(r in last_assistant_msg.lower() for r in ["registered", "classified as", "ticket", "grievance has been"])
    )
    if prior_was_clarification:
        logger.info("User is responding to a prior clarifying question — proceeding to triage.")
        return {
            "intent": "GRIEVANCE",
            "context_sufficient": True,
            "clarification_question": "",
        }

    # Build conversation context (last 6 messages)
    history_text = ""
    for msg in messages[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    system_prompt = """You are an intelligent intake evaluator for Puravankara Enterprise.

Your objective is to evaluate whether the user's statement provides enough concrete, actionable context for an enterprise team to understand and address it, or whether clarification is needed first.

1. INTENT EVALUATION:
   - "QUERY": The user is asking for information, company policy details, how-to instructions, procedures, or general advice (e.g. "What is POSH policy?", "Can I work remotely?", "Explain PF deduction").
     * Queries ALWAYS have context_sufficient = true. They must be answered directly.
   - "GRIEVANCE": The user is reporting an actual personal problem, complaint, physical defect/snag, workplace friction, dispute, or discrepancy.

2. CONTEXT SUFFICIENCY EVALUATION (Applies to GRIEVANCES):
   Evaluate whether you have the basic operational facts (who, what, where, when) needed to categorize severity and investigate responsibly:
   - SUFFICIENT CONTEXT (context_sufficient = true):
     * The user provided concrete details (e.g. specific timings, project/wing/unit location, names, amounts, or a clear narrative of what occurred).
     * OR the grievance describes an acute, specific incident with actionable facts (e.g., "my manager touched me inappropriately at the team offsite", "sales executive demanded 50k cash bribe") where enough detail exists to escalate immediately.
     * OR the user has already answered a follow-up question in the conversation history.
   - INSUFFICIENT CONTEXT (context_sufficient = false):
     * The user provided only a brief, high-level symptom, abstract phrase, or vague complaint without essential operational facts (e.g., "someone is harassing me", "facing harassment in office", "inappropriate behaviour", "water is leaking", "salary cut", "door broken").
     * Without more details, any severity rating or formal department routing would be a blind guess.
     * For sensitive matters like harassment or personal misconduct that lack context:
       - Do NOT sound interrogative, bureaucratic, or demand proof/witnesses.
       - Formulate a supportive, reassuring, and gentle clarifying question to understand basic context (such as whether it involves a colleague or manager, and whether it is workplace bullying or personal/sexual conduct), while reassuring the user of confidentiality.
     * For operational or property complaints that lack context:
       - Formulate a friendly, natural clarifying question asking for the missing details (e.g. location, timing).

Respond with ONLY a JSON object:
{
  "reason": "1-2 sentences evaluating context sufficiency",
  "intent": "QUERY" or "GRIEVANCE",
  "context_sufficient": true or false,
  "clarification_question": "If context_sufficient is false, a natural, professional question asking for missing details. If true, empty string."
}"""

    prompt = f"""Conversation history:
{history_text}

Current user message: {user_message}

Evaluate intent and context sufficiency. Respond ONLY with JSON."""

    import time
    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=800,
                temperature=0.0,
                response_format={"type": "json_object"},
            )
            text = response.choices[0].message.content.strip()
            result = json.loads(text)
            intent = result.get("intent", "QUERY").strip().upper()
            context_sufficient = bool(result.get("context_sufficient", True))
            clarification_question = result.get("clarification_question", "").strip()
            reason = result.get("reason", "")
            break
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                logger.warning("Groq 429 rate limit hit, retrying in 5s (attempt %d)...", attempt + 1)
                time.sleep(5)
                continue
            logger.error("Context sufficiency check failed: %s", e)
            is_short = len(user_message.strip().split()) <= 6
            intent = "GRIEVANCE"
            context_sufficient = not is_short
            clarification_question = "Could you please share a few more details so I can assist you accurately?" if not context_sufficient else ""
            reason = f"Fallback: {e}"
            break

    # Enforce: Queries are always context_sufficient = True
    if intent == "QUERY":
        context_sufficient = True
        clarification_question = ""

    # If context is not sufficient, ensure we have a fallback clarifying question
    if not context_sufficient and not clarification_question:
        clarification_question = (
            "I understand your concern. To help address this properly, could you please provide a few more details "
            "such as the project/unit location and the specific timing or nature of the issue?"
        )

    logger.info(
        "═══ CONTEXT SUFFICIENCY EVALUATION ═══\n"
        "  User Message: %s\n"
        "  Intent: %s | Sufficient: %s\n"
        "  Reason: %s\n"
        "  Clarification: %s",
        user_message[:100],
        intent,
        context_sufficient,
        reason,
        clarification_question,
    )

    return {
        "intent": intent,
        "context_sufficient": context_sufficient,
        "clarification_question": clarification_question,
    }
