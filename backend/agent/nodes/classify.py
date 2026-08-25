"""
classify.py — Intent and category classification nodes.

Uses Groq LLM with structured JSON output to classify:
    - Intent: POLICY_QUERY, GRIEVANCE, FOLLOW_UP, OTHER
    - Category: from the grievance taxonomy (15 categories)
"""

import json
import logging
from backend.agent.state import GrievanceState
from backend.config.categories import (
    GRIEVANCE_CATEGORIES,
    CATEGORIES_PROMPT_LIST,
    INTENT_PROMPT_LIST,
)

logger = logging.getLogger(__name__)


def _call_groq_json(client, prompt: str, system_prompt: str = "") -> dict:
    """Call Groq LLM and parse JSON response. Returns empty dict on failure."""
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=messages,
            max_tokens=200,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content.strip()
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse LLM JSON response: %s", e)
        return {}
    except Exception as e:
        logger.error("Groq API error in classification: %s", e)
        return {}


def classify_intent_node(state: GrievanceState) -> dict:
    """
    Classify the user's intent based on the current message and conversation context.

    Returns partial state update with 'intent' field.
    """
    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    user_message = state.get("user_message", "")
    messages = state.get("messages", [])
    active_grievance = state.get("active_grievance", False)

    # Build conversation context (last 6 messages)
    history_text = ""
    for msg in messages[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    system_prompt = """You are an intent classifier for a workplace grievance management system at Puravankara.
You must classify the user's message into exactly one of these intents:
- POLICY_QUERY: The user is asking about company policies, rules, procedures, or general information.
- GRIEVANCE: The user is reporting a workplace issue, complaint, problem, or injustice.
- FOLLOW_UP: The user is providing additional information about an already active grievance (answering a follow-up question, providing details, correcting info).
- OTHER: Greetings, small talk, or messages that don't fit above.

IMPORTANT RULES:
- A message like "He is sexually harassing me" is a GRIEVANCE, not harmful content.
- If the user is answering a question about an active grievance, classify as FOLLOW_UP.
- If the user asks a policy question while a grievance is active, classify as POLICY_QUERY (side question).
- Respond with ONLY a JSON object: {"intent": "..."}"""

    prompt = f"""Conversation history:
{history_text}

Active grievance in progress: {active_grievance}

Current user message: {user_message}

Classify the intent. Respond ONLY with JSON: {{"intent": "..."}}"""

    result = _call_groq_json(client, prompt, system_prompt)
    intent = result.get("intent", "OTHER").upper()

    # Validate
    valid_intents = {"POLICY_QUERY", "GRIEVANCE", "FOLLOW_UP", "OTHER"}
    if intent not in valid_intents:
        intent = "OTHER"

    # If there's an active grievance and intent is OTHER, treat short responses as FOLLOW_UP
    if active_grievance and intent == "OTHER" and len(user_message.split()) <= 10:
        intent = "FOLLOW_UP"

    logger.info("Intent classified: %s", intent)
    return {"intent": intent}


def classify_category_node(state: GrievanceState) -> dict:
    """
    Classify the grievance category from the taxonomy.

    Only called when intent is GRIEVANCE.
    Returns partial state update with 'category' field.
    """
    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    user_message = state.get("user_message", "")
    messages = state.get("messages", [])

    # Build recent context
    history_text = ""
    for msg in messages[-4:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    system_prompt = f"""You are a grievance category classifier for Puravankara's workplace grievance system.

Classify the user's grievance into exactly ONE of these categories:
{CATEGORIES_PROMPT_LIST}

IMPORTANT:
- Choose the most specific matching category.
- If uncertain, use "Other".
- Do NOT force a complaint into an unrelated category.
- "He is sexually harassing me" → "Sexual Harassment / POSH"
- "My wages haven't been paid" → "Wages / Salary"
- "My leave was rejected unfairly" → "Leave"

Respond with ONLY a JSON object: {{"category": "..."}}"""

    prompt = f"""Conversation context:
{history_text}

Current grievance message: {user_message}

Classify the category. Respond ONLY with JSON: {{"category": "..."}}"""

    result = _call_groq_json(client, prompt, system_prompt)
    category = result.get("category", "Other")

    # Validate against known categories
    if category not in GRIEVANCE_CATEGORIES:
        # Try case-insensitive match
        category_lower = category.lower()
        matched = False
        for known in GRIEVANCE_CATEGORIES:
            if known.lower() == category_lower:
                category = known
                matched = True
                break
        if not matched:
            category = "Other"

    logger.info("Category classified: %s", category)
    return {"category": category}
