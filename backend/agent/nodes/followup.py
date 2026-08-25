"""
followup.py — Follow-up question, policy answer, intake-complete, and other nodes.

    followup_node:          Uses LLM + policy context to generate a natural,
                            policy-grounded follow-up question.
    policy_answer_node:     Generates a grounded answer for policy queries.
    intake_complete_node:   Sets the final response when all info is collected.
    other_response_node:    Handles greetings and small talk.
"""

import logging
from backend.agent.state import GrievanceState

logger = logging.getLogger(__name__)


def followup_node(state: GrievanceState) -> dict:
    """
    Generate ONE natural follow-up question based on the policy context
    and the dynamically determined missing information.

    The missing_information list comes from analyze_requirements_node,
    which reads the actual policy document to decide what's needed.
    """
    missing = state.get("missing_information", [])
    category = state.get("category", "Other")
    collected = state.get("collected_information", {})
    policy_answer = state.get("policy_answer", "")
    user_message = state.get("user_message", "")
    messages = state.get("messages", [])

    if not missing:
        return {
            "response": "Thank you. I have all the information needed to process your grievance.",
            "status": "INTAKE_COMPLETE",
            "active_grievance": True,
        }

    # The first missing item is what we ask about
    next_missing = missing[0]

    # Build conversation history for context
    history_text = ""
    for msg in messages[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    from groq import Groq
    import os
    import json

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    collected_str = json.dumps(collected, indent=2) if collected else "{}"

    system_prompt = f"""You are an empathetic grievance assistant at Puravankara.
The employee is filing a grievance under the category "{category}".

RETRIEVED POLICY CONTEXT:
{policy_answer if policy_answer else "No specific policy context available."}

INFORMATION ALREADY COLLECTED:
{collected_str}

CONVERSATION HISTORY:
{history_text}

EMPLOYEE'S LATEST MESSAGE: "{user_message}"

THE NEXT PIECE OF INFORMATION NEEDED (determined from the policy):
"{next_missing}"

YOUR TASK:
1. Acknowledge the employee's latest message naturally (don't repeat yourself if you've already acknowledged it).
2. If the policy context contains specific rules, deadlines, or requirements relevant to what they just said, briefly reference them.
3. Ask for the next missing piece of information in a conversational, empathetic way.
4. Keep your response under 3 sentences. Do NOT number questions or say "Step 1" etc.
5. Do NOT ask for multiple pieces of information at once — just ask for this one thing."""

    try:
        llm_response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "system", "content": system_prompt}],
            max_tokens=300,
            temperature=0.4,
        )
        response = llm_response.choices[0].message.content.strip()
    except Exception as e:
        logger.error("Followup LLM call failed: %s", e)
        response = f"Thank you for sharing that. Could you also provide: {next_missing}?"

    logger.info("Follow-up for missing item: %s", next_missing)

    return {
        "next_question": next_missing,
        "response": response,
        "active_grievance": True,
    }


def policy_answer_node(state: GrievanceState) -> dict:
    """
    Generate a grounded answer for POLICY_QUERY intent.

    Uses the answer already produced by the existing RAG pipeline.
    Preserves any active grievance state (side-question support).
    """
    policy_answer = state.get("policy_answer", "")
    sources = state.get("sources", [])
    active_grievance = state.get("active_grievance", False)

    if not policy_answer:
        response = "I couldn't find specific policy information for your question. Could you rephrase or ask about a specific policy?"
    else:
        response = policy_answer

    # Append source citations
    if sources:
        source_text = "\n\n📄 Sources: "
        source_parts = []
        for s in sources:
            source_name = s.get("source", "Policy")
            page = s.get("page", "")
            source_parts.append(f"{source_name} (p.{page})")
        source_text += ", ".join(source_parts)
        response += source_text

    # If a grievance is active, remind the user they can continue
    if active_grievance:
        response += "\n\nYou can continue with your grievance whenever you're ready."

    logger.info("Policy answer generated (%d sources)", len(sources))

    return {
        "response": response,
        "status": "POLICY_ANSWERED" if not active_grievance else "ACTIVE",
    }


def intake_complete_node(state: GrievanceState) -> dict:
    """
    Mark intake as complete and generate a summary response.

    Does NOT register a GRM case, route to department, or start SLA.
    Those are Phase 3+.
    """
    category = state.get("category", "Other")
    severity = state.get("severity", "UNKNOWN")
    collected = state.get("collected_information", {})

    # Build a human-readable summary
    info_lines = []
    for field, value in collected.items():
        field_label = field.replace("_", " ").title()
        info_lines.append(f"• **{field_label}**: {value}")

    info_summary = "\n".join(info_lines) if info_lines else "No details collected."

    response = (
        f"Thank you. I have collected all the necessary information for your grievance.\n\n"
        f"**Category**: {category}\n"
        f"**Severity**: {severity}\n\n"
        f"**Information collected:**\n{info_summary}\n\n"
        f"Your grievance has been recorded. The appropriate team will review this and follow up with you."
    )

    logger.info("Intake complete for category=%s, severity=%s", category, severity)

    return {
        "response": response,
        "status": "INTAKE_COMPLETE",
        "active_grievance": False,
    }


def other_response_node(state: GrievanceState) -> dict:
    """
    Handle OTHER intent — greetings, small talk, etc.
    Preserves active grievance state.
    """
    user_message = state.get("user_message", "")
    active_grievance = state.get("active_grievance", False)

    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    prompt = f"""You are a professional and friendly assistant for Puravankara.
Respond naturally and briefly to this message. Keep it concise.

User: {user_message}

Response:"""

    try:
        llm_response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.3,
        )
        response = llm_response.choices[0].message.content.strip()
    except Exception as e:
        logger.error("Other response LLM call failed: %s", e)
        response = "Hello! How can I help you today?"

    if active_grievance:
        response += "\n\nYou can continue with your grievance whenever you're ready."

    return {
        "response": response,
        "status": "ACTIVE" if active_grievance else "OTHER",
    }
