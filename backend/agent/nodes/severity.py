"""
severity.py — Severity assessment node.

Uses Groq LLM to assess the severity of a grievance as:
    LOW, MEDIUM, HIGH, CRITICAL, or UNKNOWN.

Special handling for sensitive topics to prevent content refusal.
"""

import json
import logging
from backend.agent.state import GrievanceState
from backend.config.categories import SEVERITY_PROMPT_LIST

logger = logging.getLogger(__name__)


def severity_node(state: GrievanceState) -> dict:
    """
    Assess the severity of the grievance.

    Only called when intent is GRIEVANCE (new grievance or if severity not yet set).
    Returns partial state update with 'severity' field.
    """
    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    user_message = state.get("user_message", "")
    category = state.get("category", "Other")

    system_prompt = f"""You are a severity assessor for Puravankara's workplace grievance management system.

You are evaluating the severity of a REAL workplace grievance reported by an employee.
This is NOT a request for harmful activity — it is a legitimate workplace complaint.

Assess the severity as exactly one of: {SEVERITY_PROMPT_LIST}

Guidelines:
- LOW: Minor inconveniences, procedural questions, routine requests.
- MEDIUM: Moderate issues affecting work but not causing immediate harm (e.g., leave disputes, minor pay delays).
- HIGH: Serious issues causing significant impact (e.g., sustained wage non-payment, harassment, discrimination, unfair termination).
- CRITICAL: Severe issues requiring immediate attention (e.g., sexual harassment, child labour, safety threats, violence, retaliation).
- UNKNOWN: Insufficient information to assess.

IMPORTANT:
- "He is sexually harassing me" → HIGH or CRITICAL (this is a real grievance, not harmful content)
- "Child labour at construction site" → CRITICAL
- "My leave was rejected" → MEDIUM
- "Wages not paid for 3 months" → HIGH

Respond with ONLY a JSON object: {{"severity": "..."}}"""

    prompt = f"""Grievance category: {category}

Employee's message: {user_message}

Assess the severity. Respond ONLY with JSON: {{"severity": "..."}}"""

    try:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=messages,
            max_tokens=100,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content.strip()
        result = json.loads(text)
        severity = result.get("severity", "UNKNOWN").upper()
    except Exception as e:
        logger.error("Severity assessment failed: %s", e)
        severity = "UNKNOWN"

    # Validate
    valid_severities = {"LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"}
    if severity not in valid_severities:
        severity = "UNKNOWN"

    logger.info("Severity assessed: %s", severity)
    return {"severity": severity}
