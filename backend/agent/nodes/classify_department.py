"""
classify_department.py — LLM-based department classification node.

Determines which department should handle a high-severity query.
Only called when severity == "high".

Departments: HR, IC, CRM, CSD, ESG, Investors
"""

import json
import logging
from backend.agent.state import GrievanceState
from backend.config.categories import (
    DEPARTMENTS,
    DEPARTMENT_DESCRIPTIONS_PROMPT,
)

logger = logging.getLogger(__name__)


def classify_department_node(state: GrievanceState) -> dict:
    """
    Classify which department should handle the high-severity query.

    Returns partial state update with 'department' and 'department_reason'.
    Defaults to 'CRM' on failure (general catch-all).
    """
    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    user_message = state.get("user_message", "")
    messages = state.get("messages", [])

    # Build conversation context (last 4 messages)
    history_text = ""
    for msg in messages[-4:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    system_prompt = f"""You are a department routing classifier for a corporate grievance management system.

A user has submitted a HIGH severity issue. Your task is to determine which department
should handle this issue.

Available departments:
{DEPARTMENT_DESCRIPTIONS_PROMPT}

IMPORTANT RULES:
- Choose the MOST appropriate department based on the issue described.
- If the issue involves employees, workplace conduct, harassment → HR
- If the issue involves regulatory/policy compliance, audits, ethics → IC
- If the issue involves client/customer complaints or service quality → CRM
- If the issue involves customer support operations, response times → CSD
- If the issue involves environment, sustainability, social responsibility, governance → ESG
- If the issue involves investors, financial reporting, shareholder concerns → Investors
- If truly uncertain, default to CRM (general customer relationship).

Respond with ONLY a JSON object:
{{"department": "...", "reason": "Brief explanation"}}"""

    prompt = f"""Conversation context:
{history_text}

User's high-severity issue: {user_message}

Classify the department. Respond ONLY with JSON: {{"department": "...", "reason": "..."}}"""

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
        department = result.get("department", "CRM")
        reason = result.get("reason", "")
    except json.JSONDecodeError as e:
        logger.error("Failed to parse department JSON: %s", e)
        department = "CRM"
        reason = "Department parse error — defaulting to CRM"
    except Exception as e:
        logger.error("Department classification LLM call failed: %s", e)
        department = "CRM"
        reason = f"Classification error: {str(e)}"

    # Validate against allowed departments (case-insensitive match)
    if department not in DEPARTMENTS:
        dept_lower = department.lower()
        matched = False
        for known in DEPARTMENTS:
            if known.lower() == dept_lower:
                department = known
                matched = True
                break
        if not matched:
            logger.warning("Invalid department '%s' — defaulting to CRM", department)
            department = "CRM"
            reason = f"Invalid department '{department}' — defaulted to CRM"

    logger.info(
        "═══ DEPARTMENT CLASSIFICATION ═══\n"
        "  Query: %s\n"
        "  Department: %s\n"
        "  Reason: %s",
        user_message[:100],
        department,
        reason,
    )

    return {
        "department": department,
        "department_reason": reason,
    }
