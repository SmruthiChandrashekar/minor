"""
condense_query.py — Multi-turn conversational query contextualizer node.

Rewrites follow-up messages, answers to clarification questions, and pronoun-heavy
replies into a complete, standalone grievance or query statement.

- Turn 1 (no conversation history): Bypasses the LLM completely (0 ms latency).
- Turn 2+ (follow-up/clarification answer): Synthesizes the core grievance and
  new details into a single, self-contained statement.
"""

import logging
from backend.agent.state import GrievanceState

logger = logging.getLogger(__name__)

CONDENSE_SYSTEM_PROMPT = """You are an expert intake contextualizer for Puravankara Enterprise.
Your task is to rewrite the latest user message into a single, complete, standalone statement using context from previous messages.

RULES:
1. Clarification & Follow-up Integration: If the user is answering a clarifying question (e.g., providing location, unit/tower, timing, names, or incident details), combine the original problem statement with these new details into one self-contained sentence.
2. Resolve Pronouns & References: Replace words like "it", "he", "she", "they", "that issue", "my problem" with the exact subject referenced in history.
3. Topic Shifts: If the user changed the topic or asked an unrelated question (e.g., switched from a complaint to asking about leave policy), output the new message as-is without dragging in past issues.
4. Output Format: Output ONLY the standalone statement. Do NOT include preambles, greetings, quotes, conversational filler, or explanations.

EXAMPLES:
- History:
  USER: Someone is harassing me at work.
  ASSISTANT: I am sorry to hear that. Could you share what kind of behavior occurred or who was involved?
  USER: Last Tuesday in cafeteria, unwanted touching by my manager.
  Output: Employee reporting unwanted physical touching and harassment by their manager in the cafeteria last Tuesday.

- History:
  USER: Water is leaking from the roof.
  ASSISTANT: Which tower and apartment number is this in?
  USER: Tower B, 402. And it's ruining the wooden flooring.
  Output: Resident reporting active roof water leak in Tower B, Unit 402 causing damage to wooden flooring.

- History:
  USER: What is the privilege leave policy?
  ASSISTANT: Employees are eligible for 18 days of privilege leave per calendar year.
  USER: What about interns?
  Output: What is the leave policy for interns?

- History:
  USER: My bonus was credited short.
  ASSISTANT: Please share your employee ID and payout month.
  USER: Actually never mind that, when is the office closed for Diwali?
  Output: When is the office closed for Diwali?"""


def condense_query_node(state: GrievanceState) -> dict:
    """
    Contextualize the user's message using conversation history.
    Stores the standalone statement in state['condensed_message'].
    """
    user_message = (state.get("user_message") or "").strip()
    messages = state.get("messages", [])

    if not user_message:
        return {"condensed_message": ""}

    # ── Fast path: Turn 1 (no prior user/assistant exchange) ──────────────────
    # Check if there are any previous turns
    prior_turns = [m for m in messages if m.get("content", "").strip()]
    if not prior_turns:
        logger.debug("Turn 1 detected: bypassing query condensation.")
        return {"condensed_message": user_message}

    # ── Turn 2+: Contextualize with LLM ──────────────────────────────────────
    from backend.agent.llm import get_llm, extract_response_text
    import re

    client, model_name = get_llm()

    history_lines = []
    for msg in messages[-6:]:
        role = msg.get("role", "user").upper()
        content = msg.get("content", "").strip()
        if content:
            history_lines.append(f"{role}: {content}")
    history_text = "\n".join(history_lines)

    user_prompt = f"""CONVERSATION HISTORY:
{history_text}

LATEST USER MESSAGE:
{user_message}

STANDALONE STATEMENT:"""

    num_ctx = getattr(client, "_ollama_num_ctx", None)

    try:
        kwargs = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": CONDENSE_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": 150,
            "temperature": 0.0,
        }
        if num_ctx:
            kwargs["extra_body"] = {"options": {"num_ctx": num_ctx}}

        response = client.chat.completions.create(**kwargs)
        raw_text = extract_response_text(response.choices[0].message).strip()

        # Clean up quotes or prefixes if model included them
        clean_text = raw_text.strip('"\n\r ')
        clean_text = re.sub(r'^(?:Standalone Statement|Output):\s*', '', clean_text, flags=re.IGNORECASE).strip()

        if clean_text:
            logger.info("Query condensed: '%s' → '%s'", user_message, clean_text)
            return {"condensed_message": clean_text}

    except Exception as e:
        logger.warning("Query condensation failed (%s) — falling back to user_message", e)

    return {"condensed_message": user_message}
