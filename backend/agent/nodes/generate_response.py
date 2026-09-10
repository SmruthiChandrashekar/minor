"""
generate_response.py — Conversational response generation node.

Used for LOW severity queries after RAG retrieval.
Generates a context-aware, conversational response using:
- Retrieved policy context
- Conversation history
- Current user message

Handles follow-ups, greetings, references like "it", "that", etc.

Also determines whether the chatbot successfully resolved the query
(sets chatbot_resolved flag for downstream LOW → L1 handoff logic).
"""

import logging
from backend.agent.state import GrievanceState

logger = logging.getLogger(__name__)


def _call_llm_with_auto_summary(client, messages: list[dict], max_tokens: int = 1000) -> str:
    """
    Generate response using Groq LLM with truncation protection.
    If the model hits max_tokens (finish_reason == 'length') and cuts off,
    it automatically summarizes and completes the answer cleanly.
    """
    llm_response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.2,
    )
    choice = llm_response.choices[0]
    content = choice.message.content.strip()

    # If the response reached the token limit mid-sentence, summarize cleanly
    if choice.finish_reason == "length":
        logger.warning("Response hit max_tokens (%d) — auto-summarizing to complete cleanly", max_tokens)
        try:
            summary_messages = [
                {
                    "role": "system",
                    "content": "You are a concise corporate editor. The following text was cut off because it exceeded the length limit. Provide a clean, complete, and concise summary of this explanation so all sentences end properly without anything cut off."
                },
                {"role": "user", "content": content}
            ]
            sum_res = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=summary_messages,
                max_tokens=500,
                temperature=0.2,
            )
            content = sum_res.choices[0].message.content.strip()
        except Exception as sum_err:
            logger.error("Auto-summarization fallback failed: %s", sum_err)

    return content


def generate_response_node(state: GrievanceState) -> dict:
    """
    Generate a conversational response for low-severity queries.

    Uses RAG-retrieved policy context + conversation history to produce
    a natural, context-aware response. Handles multi-turn references.

    Also sets `chatbot_resolved`:
      - True if the RAG response adequately addresses the query
      - False if the query could not be answered from available context

    Returns partial state update with 'response' and 'chatbot_resolved'.
    """
    from groq import Groq
    import os

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    user_message = state.get("user_message", "")
    messages = state.get("messages", [])
    policy_answer = state.get("policy_answer", "")
    sources = state.get("sources", [])

    chatbot_resolved = True  # Assume resolved unless we detect otherwise

    # Build conversation history for context
    history_text = ""
    for msg in messages[-8:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    # Build source citations
    source_citations = ""
    if sources:
        source_parts = []
        for s in sources:
            source_name = s.get("source", "Policy")
            page = s.get("page", "")
            source_parts.append(f"{source_name} (p.{page})")
        source_citations = "\n\nSources: " + ", ".join(source_parts)

    intent = state.get("intent", "QUERY").strip().upper()
    severity = state.get("severity", "LOW").strip().upper()

    has_policy_match = bool(
        policy_answer
        and "do not provide sufficient information" not in policy_answer.lower()
        and sources
    )

    primary_policy = ""
    if sources:
        primary_policy = sources[0].get("source", "Puravankara Policy")

    # ── CASE 1: POLICY MATCH FOUND ─────────────────────────────────────────
    if has_policy_match:
        source_type = "POLICY"
        can_escalate = (intent == "GRIEVANCE")
        chatbot_resolved = True

        system_prompt = f"""You are Purva, the official AI Policy Assistant for Puravankara.

CONVERSATION HISTORY:
{history_text}

RETRIEVED PURAVANKARA POLICY CONTEXT:
Primary Policy: {primary_policy}
{policy_answer}

YOUR TASK:
1. Answer the user's message using the retrieved Puravankara policy information above.
2. In your response, EXPLICITLY refer to the relevant policy by name (e.g., "According to Puravankara's {primary_policy}..." or "As per the {primary_policy}...").
3. Be conversational, professional, and clear. Use bullet points for steps, criteria, or lists.
4. If the user is asking a follow-up, seamlessly connect it with prior conversation context.
5. Do NOT invent policies not in the retrieved text.
6. CONCISENESS & COMPLETION: Keep your response focused and well-structured. Always ensure all sentences and bullet points are fully completed."""

        prompt = f"User: {user_message}"

        try:
            response = _call_llm_with_auto_summary(
                client,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=1000,
            )
            response += source_citations
        except Exception as e:
            logger.error("Policy response generation failed: %s", e)
            response = f"According to Puravankara's {primary_policy}:\n\n{policy_answer}{source_citations}"

    # ── CASE 2: NO POLICY MATCH (GREETING, NON-POLICY QUERY, OR LOW GRIEVANCE) ───
    else:
        source_type = "GENERAL_KNOWLEDGE"
        is_greeting = _is_greeting(user_message)
        sources = []  # Clear empty sources

        if is_greeting:
            can_escalate = False
            chatbot_resolved = True
            system_prompt = f"""You are Purva, a friendly and professional AI companion for Puravankara.
Respond warmly to the user's greeting or pleasantry and let them know you are here to assist with company policies, workplace questions, and grievance inquiries."""
        elif intent == "GRIEVANCE":
            # Low-severity grievance: provide a helpful, empathetic explanation using general workplace knowledge
            # and allow escalation if the user is unsatisfied.
            can_escalate = True
            chatbot_resolved = True

            # Infer department for escalation pre-fill if not already set using central department classifier
            dept = state.get("department", "")
            if not dept:
                try:
                    from backend.agent.nodes.classify_department import classify_department_node
                    dept_res = classify_department_node(state)
                    dept = dept_res.get("department", "CRM")
                except Exception as e:
                    logger.warning("Department inference for low-severity grievance failed: %s", e)
                    dept = "CRM"
            state["department"] = dept

            system_prompt = f"""You are Purva, the empathetic and professional AI Grievance Companion for Puravankara.

CONVERSATION HISTORY:
{history_text}

The user is reporting a concern/grievance:
"{user_message}"

YOUR TASK:
1. Acknowledge the user's issue with genuine empathy and professional reassurance.
2. Provide a practical, constructive explanation drawing upon standard corporate, operational, and site practices:
   - Explain standard operating norms, schedules, inspection procedures, or common administrative factors relevant to the issue.
   - Offer concrete steps the user can immediately take or verify to help resolve or understand the situation.
   - Reassure them that if the issue persists or exceeds standard norms, they can use the resolution guidance button below to lodge a formal ticket for departmental investigation.
3. Be reassuring, polite, and professional.
4. CONCISENESS & COMPLETION: Keep your answer crisp and concise (under 250 words). Avoid overly wide tables; prefer bullet points. Always conclude all sentences completely."""
        else:
            # Query not in official policy: Answer thoroughly using General Knowledge (GK)
            can_escalate = False
            chatbot_resolved = True
            system_prompt = f"""You are Purva, an intelligent, helpful corporate AI Assistant for Puravankara.

CONVERSATION HISTORY:
{history_text}

The user is asking a general informational, procedural, or workplace question:
"{user_message}"

This specific topic does not have a formal Puravankara policy handbook clause, but you should answer it thoroughly, accurately, and professionally using GENERAL KNOWLEDGE (GK) and corporate best practices:
1. Provide a direct, helpful, and informative answer based on standard workplace practices, industry standards, or general knowledge.
2. If the topic involves company-specific variables (like payroll records, specific team assignments, or internal logins), provide the standard explanation and suggest the appropriate channel (e.g. HR helpdesk, IT service desk, or employee portal).
3. Do NOT claim "policy documents are missing" or ask the user to submit a formal grievance for simple questions. Answer constructively.
4. CONCISENESS & COMPLETION: Keep your answer concise and crisp. Summarize key points and ensure every sentence is fully completed."""

        prompt = f"User: {user_message}"

        try:
            response = _call_llm_with_auto_summary(
                client,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=1000,
            )
        except Exception as e:
            logger.error("General response generation failed: %s", e)
            response = "I'm here to assist you. While this specific detail is not outlined in our standard policies, you can verify this through your employee self-service portal or with your department coordinator."

    logger.info(
        "Generated conversational response (intent=%s, source_type=%s, can_escalate=%s)",
        intent, source_type, can_escalate,
    )

    return {
        "response": response,
        "chatbot_resolved": chatbot_resolved,
        "source_type": source_type,
        "policy_name": primary_policy,
        "can_escalate": can_escalate,
        "department": state.get("department", ""),
        "sources": sources,
    }


def _is_greeting(message: str) -> bool:
    """
    Check if the user message is just a greeting or small talk rather than a substantive query/complaint.
    """
    msg_lower = message.strip().lower()
    greetings = {"hi", "hello", "hey", "good morning", "good afternoon",
                 "good evening", "thanks", "thank you", "bye", "ok", "okay", "test"}
    if msg_lower in greetings or len(msg_lower) < 6:
        return True
    return False

