"""
intake.py — LLM-driven information extraction and requirement analysis.

    extract_info_node:          Uses LLM to extract structured info from user messages.
    analyze_requirements_node:  Uses LLM + policy context to dynamically determine
                                what information is still missing based on the
                                actual policy document, NOT a hardcoded checklist.
"""

import json
import logging
from backend.agent.state import GrievanceState

logger = logging.getLogger(__name__)


def extract_info_node(state: GrievanceState) -> dict:
    """
    Extract information explicitly provided by the user.

    Merges newly extracted info with previously collected info.
    Handles corrections (latest message overrides previous values).
    Handles "I don't know" → sets field to "UNKNOWN".

    IMPORTANT: The LLM must NEVER invent missing information.
    """
    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    user_message = state.get("user_message", "")
    category = state.get("category", "Other")
    collected = dict(state.get("collected_information", {}))
    messages = state.get("messages", [])
    policy_answer = state.get("policy_answer", "")

    # Build recent conversation context
    history_text = ""
    for msg in messages[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    # Already collected info
    collected_str = json.dumps(collected, indent=2) if collected else "{}"

    system_prompt = f"""You are an information extraction assistant for a workplace grievance system at Puravankara.

Your job is to extract ONLY information explicitly stated by the user.
NEVER invent, assume, or fabricate any information that the user did not provide.

The grievance category is: {category}

Previously collected information:
{collected_str}

Relevant Policy Context:
{policy_answer if policy_answer else "None available"}

RULES:
1. Extract only what the user explicitly said in their message.
2. If the user says "I don't know" or "not sure" about a field, set it to "UNKNOWN".
3. If the user corrects previous information, use the corrected value.
4. If a field is not mentioned at all, do NOT include it in the output.
5. Return ONLY a valid JSON object with the extracted fields.
6. Use descriptive field names in snake_case (e.g., "employee_id", "leave_dates", "incident_description").
7. Values should be strings. Dates/periods can be descriptive (e.g., "July and August 2025").

Example: If user says "I'm EMP1024 from Site A", return:
{{"employee_id": "EMP1024", "site": "Site A"}}

Example: If user says "I don't know the exact date", return:
{{"incident_date": "UNKNOWN"}}"""

    prompt = f"""Conversation history:
{history_text}

Latest user message: {user_message}

Extract any new information from the latest message. Return ONLY a JSON object with the extracted fields."""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            max_tokens=300,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content.strip()
        newly_extracted = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse extraction JSON: %s", e)
        newly_extracted = {}
    except Exception as e:
        logger.error("Extraction LLM call failed: %s", e)
        newly_extracted = {}

    # Merge: new info overrides old (handles corrections)
    for field, value in newly_extracted.items():
        if value is not None and str(value).strip():
            collected[field] = value

    logger.info("Collected information: %s", collected)
    return {"collected_information": collected}


def analyze_requirements_node(state: GrievanceState) -> dict:
    """
    LLM-driven analysis: reads the retrieved policy context and conversation
    history to dynamically determine what information is still needed.

    This replaces the old rule-based check_missing_node.
    The LLM reads the ACTUAL policy document and decides what's required,
    rather than using a hardcoded field list.
    """
    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    category = state.get("category", "Other")
    collected = state.get("collected_information", {})
    policy_answer = state.get("policy_answer", "")
    user_message = state.get("user_message", "")
    messages = state.get("messages", [])

    collected_str = json.dumps(collected, indent=2) if collected else "{}"

    # Build conversation history for context
    history_text = ""
    for msg in messages[-8:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    system_prompt = f"""You are an intelligent grievance intake analyst at Puravankara.

Your task is to analyze the retrieved company policy and determine what additional information
is needed from the employee to properly process their "{category}" grievance.

RETRIEVED POLICY CONTEXT:
{policy_answer if policy_answer else "No specific policy retrieved."}

INFORMATION ALREADY COLLECTED:
{collected_str}

CONVERSATION SO FAR:
{history_text}

LATEST MESSAGE: {user_message}

INSTRUCTIONS:
1. Read the policy context carefully. Identify what specific details, documents, or information
   the policy requires to process this type of grievance.
2. Compare that against what has already been collected.
3. Determine what is STILL MISSING that the policy specifically requires.
4. If the employee has provided enough information to process the grievance according to the policy,
   return an empty list.
5. Each missing item should be a short, clear description of what you need (NOT a generic field name
   like "employee_id" — instead, write something like "Your employee ID so we can look up your records").

Respond with ONLY a valid JSON object in this exact format:
{{"missing": ["description of missing item 1", "description of missing item 2"], "reasoning": "brief explanation of why these items are needed based on the policy"}}

If nothing is missing, respond with:
{{"missing": [], "reasoning": "All required information has been collected per the policy."}}"""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
            ],
            max_tokens=400,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content.strip()
        result = json.loads(text)
        missing = result.get("missing", [])
        reasoning = result.get("reasoning", "")
        logger.info("Policy-based analysis — missing: %s, reasoning: %s", missing, reasoning)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse requirements JSON: %s", e)
        missing = ["a detailed description of your concern"]
    except Exception as e:
        logger.error("Requirements analysis LLM call failed: %s", e)
        missing = ["a detailed description of your concern"]

    # Determine status
    if not missing:
        status = "INTAKE_COMPLETE"
    else:
        status = "ACTIVE"

    return {
        "missing_information": missing,
        "status": status,
    }
