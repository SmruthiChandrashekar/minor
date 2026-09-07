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
        source_citations = "\n\n📄 Sources: " + ", ".join(source_parts)

    # If RAG returned a good answer, use it with conversational wrapping
    if policy_answer and "do not provide sufficient information" not in policy_answer.lower():
        system_prompt = f"""You are a friendly and professional AI Policy Assistant for Puravankara.

CONVERSATION HISTORY:
{history_text}

RETRIEVED POLICY INFORMATION:
{policy_answer}

YOUR TASK:
1. Answer the user's question using the retrieved policy information above.
2. Be conversational and natural — acknowledge context from previous messages if relevant.
3. If the user is asking a follow-up (e.g., "What about interns?", "And for contract workers?"),
   relate your answer to the previous topic from the conversation history.
4. Be concise but thorough. Use bullet points for lists.
5. Do NOT make up information that isn't in the policy context.
6. Do NOT mention that you are using "retrieved" or "policy context" — just answer naturally.
7. If the policy context doesn't fully address the follow-up, say so clearly.

IMPORTANT: Base your answer ONLY on the provided policy information."""

        prompt = f"User: {user_message}"

        try:
            llm_response = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=600,
                temperature=0.2,
            )
            response = llm_response.choices[0].message.content.strip()
            response += source_citations
        except Exception as e:
            logger.error("Response generation failed: %s", e)
            response = policy_answer + source_citations

    else:
        # No sufficient policy context available — check if greeting or unresolved query
        is_greeting = _is_greeting(user_message)
        chatbot_resolved = is_greeting

        system_prompt = f"""You are a friendly and professional AI assistant for Puravankara.

CONVERSATION HISTORY:
{history_text}

You help with company policy questions and grievance-related queries.
If the user is greeting you, respond warmly and ask how you can help.
If the user is asking a specific policy or grievance question that you cannot answer from official policy context,
let them know clearly that official documentation is not available for this topic, and that they can lodge a formal grievance form so the appropriate department can review and assist them.

Keep responses concise, clear, and professional."""

        prompt = f"User: {user_message}"

        try:
            llm_response = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=300,
                temperature=0.3,
            )
            response = llm_response.choices[0].message.content.strip()
        except Exception as e:
            logger.error("General response generation failed: %s", e)
            response = "I am sorry, but the available Puravankara policy documents do not provide sufficient information to resolve your query. You may submit a formal grievance form for direct assistance."

    logger.info(
        "Generated conversational response (%d chars, resolved=%s)",
        len(response), chatbot_resolved,
    )

    return {
        "response": response,
        "chatbot_resolved": chatbot_resolved,
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

