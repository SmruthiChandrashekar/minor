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

import re
import logging
from backend.agent.state import GrievanceState

logger = logging.getLogger(__name__)


def _sanitize_response(text: str) -> str:
    """
    Remove any hallucinated/dummy phone numbers or placeholder contact details
    from LLM-generated text before sending to the user.
    """
    if not text:
        return text

    # Dummy sequences & unverified phone number patterns (e.g. 9876543210, 1234567890, 1800-xxx)
    # Match sequences of 10 digits starting with Indian mobile prefixes (6-9) or standard 1800 toll-free patterns
    dummy_patterns = [
        r'\b9876543210\b',
        r'\b1234567890\b',
        r'\b0123456789\b',
        r'\b(?:\+?91[- ]?)?[6-9]\d{9}\b',
        r'\b1800[-\s]?\d{3}[-\s]?\d{4}\b',
    ]
    for pat in dummy_patterns:
        text = re.sub(pat, "the Puravankara Resident App / Helpdesk", text)

    # Clean up any awkward phrasing resulting from regex substitutions like "at the Puravankara Resident App"
    text = re.sub(r'\bat the Puravankara Resident App / Helpdesk\b', 'via the Puravankara Resident App or Facility Management desk', text)
    text = re.sub(r'\bat the resident app\b', 'via the resident app', text, flags=re.IGNORECASE)

    return text



def _call_llm_with_auto_summary(client, model_name: str, messages: list, max_tokens: int = 1000) -> str:
    """
    Call LLM with auto-summarization if token limit is reached.
    Uses temperature=0.0 to prevent hallucination drift.
    """
    from backend.agent.llm import extract_response_text

    llm_response = client.chat.completions.create(
        model=model_name,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.0,
    )
    choice = llm_response.choices[0]
    content = extract_response_text(choice.message).strip()

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
                model=model_name,
                messages=summary_messages,
                max_tokens=500,
                temperature=0.0,
            )
            content = extract_response_text(sum_res.choices[0].message).strip()
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
    from backend.agent.llm import get_llm

    client, model_name = get_llm()
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

    # Build clean user-facing source citations
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
    # Use the RAG-grounded answer DIRECTLY. No second LLM call — this
    # eliminates the biggest hallucination vector (re-interpretation drift).
    if has_policy_match:
        source_type = "POLICY"
        can_escalate = (intent == "GRIEVANCE")
        # Ensure no internal technical codes like [POL-IC-001] leak into the answer
        clean_policy_answer = re.sub(r'\s*\[POL-[A-Z]+-\d+\]', '', policy_answer).strip()

        response = f"According to Puravankara's {primary_policy}:\n\n{clean_policy_answer}{source_citations}"

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

            system_prompt = f"""### ROLE & SCOPE ASSIGNMENT:
You are Purva, the empathetic and professional AI Grievance Assistant for Puravankara Enterprise. You provide supportive intake guidance and triage, strictly bound to verified community norms and workplace standards.

### CONVERSATION HISTORY:
{history_text}

### USER CONCERN:
"{user_message}"

### SPECIFICITY & STRUCTURE:
1. Acknowledge the user's issue with genuine empathy and professional reassurance in 1-2 sentences.
2. Provide a practical, constructive explanation (maximum 150-200 words):
   - Address the specific concern raised by the user directly. Do NOT assume unrelated topics (e.g. do NOT invent noise or repairs unless explicitly mentioned).
   - If a resident raises a concern regarding other residents' background or profession (e.g. healthcare workers/doctors), clarify courteously that residential complexes welcome diverse residents in accordance with standard community living guidelines and equal housing principles.
   - Explain standard operating norms and common administrative factors.
   - Offer 2-3 concrete steps the user can verify or take.
   - Inform the user that if this does not resolve their concern, they can click the resolution guidance button below to lodge a formal ticket for CRM/management review.

### INSTRUCTIONAL DOS & DON'TS:
- DO refer users strictly to the official "Puravankara Resident App" or "on-site Facility Management desk".
- DO NOT invent, hallucinate, or output dummy phone numbers (e.g. '9876543210', '1800-xxx'), placeholder emails, or fictional personnel names.
- DO ensure all sentences are completely finished."""
        else:
            # Query not in official policy: provide a cautious general answer
            can_escalate = False
            chatbot_resolved = True
            system_prompt = f"""### ROLE & SCOPE ASSIGNMENT:
You are Purva, the official AI Assistant for Puravankara Enterprise. You are answering a general procedural, informational, or workplace question not formally indexed in the company policy handbook.

### CONVERSATION HISTORY:
{history_text}

### USER QUESTION:
"{user_message}"

### SPECIFICITY & GROUNDING CONSTRAINTS:
1. Prefix your answer with: "While this isn't covered in Puravankara's official policy documents, here is some general guidance:"
2. Keep your answer SHORT, focused, and under 120 words. Stick strictly to well-established, universal facts.
3. If the question involves company-specific variables (payroll amounts, team assignments, internal logins, specific staff contacts), do NOT guess. Explicitly state: "For this specific request, please reach out to your HR helpdesk or department coordinator."

### INSTRUCTIONAL DOS & DON'TS:
- DO provide direct, professional, and factual steps.
- DO NOT fabricate contact numbers, emails, employee names, or internal portal URLs.
- DO NOT claim to have access to confidential or unindexed company records.
- DO ensure all sentences end with proper punctuation and full completion."""

        prompt = f"User: {user_message}"

        try:
            response = _call_llm_with_auto_summary(
                client,
                model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=1000,
            )
        except Exception as e:
            logger.error("General response generation failed: %s", e)
            response = "I'm here to assist you. While this specific detail is not outlined in our standard policies, you can verify this through your employee self-service portal or with your department coordinator."

    # Post-process sanitization to strip any hallucinated phone numbers or placeholder contacts
    response = _sanitize_response(response)

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

