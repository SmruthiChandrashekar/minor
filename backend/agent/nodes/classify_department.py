"""
classify_department.py — LLM-based department classification node for Puravankara.

Determines which department should handle a MEDIUM or HIGH severity grievance.
Departments: IC, HR, CRM, CSD, ESG, Investors
"""

import json
import logging
from backend.agent.state import GrievanceState
from backend.config.categories import DEPARTMENTS

logger = logging.getLogger(__name__)


# Fixed policy_category values per department — the LLM must pick from this enum.
POLICY_CATEGORIES: dict[str, list[str]] = {
    "IC":        ["POSH Policy"],
    "HR":        ["Employee HR Policy", "Payroll & Compensation", "Leave & Attendance", "HR Systems"],
    "CRM":       ["Sales & Commitments", "Booking & Allotment", "Agreement & Contractual",
                  "Registration & Documentation", "Commercial & Financial", "Possession & Handover"],
    "CSD":       ["Building Snag & Maintenance", "Electrical", "Plumbing", "Property Service"],
    "ESG":       ["Environmental & Community", "Worker Safety", "Waste Management", "Water & Drainage"],
    "Investors": ["Investor Relations", "Dividend", "Shareholder Services"],
}

_POLICY_ENUM_TEXT = "\n".join(
    f"  {dept}: {', '.join(cats)}" for dept, cats in POLICY_CATEGORIES.items()
)

DEPARTMENT_ROUTING_SYSTEM_PROMPT = f"""You are a classification model for Puravankara grievance routing.
Your ONLY task: read the current user message and output the correct department and policy_category.
Do NOT answer the user. Do NOT ask questions. Do NOT use previous conversation.

DEPARTMENTS & DEFINITIONS:
  IC        — Sexual harassment, unwanted sexual contact, sexual comments, sexual advances, POSH complaints or retaliation.
  HR        — Corporate employee matters: salary, payroll, leave, attendance, appraisal, manager disputes, LMS, HR portal.
  CRM       — Customer transaction issues: sales promises, booking, agreement, charges, pricing, registration, possession commitments, cancellation, refunds.
  CSD       — Physical property defects and service: seepage, cracks, plumbing, electrical faults, snags, elevators, maintenance, repairs.
  ESG       — Environmental, worker, public or community impact: pollution, dust, waste, drainage, worker safety, welfare, site hazards.
  Investors — Shareholder/investor matters: shares, dividends, demat, AGM/EGM, financial disclosures, SEBI complaints.

CRITICAL BOUNDARY RULES:
  1. IC beats HR always — if sexual misconduct is present, IC wins regardless of other issues.
  2. ESG beats HR on site workers — laborer wages + site safety → ESG. Corporate salary → HR.
  3. CRM = what was promised/sold/contracted. CSD = what was physically delivered and needs repair.
  4. ESG = community/worker/environmental impact. CSD = individual property problem.
  5. CRM beats Investors — homebuyer delayed possession → CRM. Shareholder concerns → Investors.

CONTRASTIVE EXAMPLES:
  "My corporate salary has not been credited" → HR | Payroll & Compensation
  "Construction laborers are working without safety harnesses" → ESG | Worker Safety
  "The workers have unsafe conditions, poor sanitation and inadequate welfare" → ESG | Worker Safety
  "My manager constantly shouts at me" → HR | Employee HR Policy
  "My manager makes sexually suggestive comments" → IC | POSH Policy
  "The salesperson promised a swimming pool but it was never delivered" → CRM | Sales & Commitments
  "The swimming pool equipment is broken and needs repair" → CSD | Property Service
  "Construction dust is affecting nearby residents" → ESG | Environmental & Community
  "There is water seepage in my bedroom" → CSD | Building Snag & Maintenance
  "Project sewage plant releasing foul odor to community" → ESG | Water & Drainage
  "My apartment possession has been delayed" → CRM | Possession & Handover
  "I am a shareholder and haven't received my dividend" → Investors | Dividend
  "Cannot access LMS for mandatory training" → HR | HR Systems
  "I cannot log into the employee portal" → HR | HR Systems

POLICY_CATEGORY ALLOWED VALUES:
{_POLICY_ENUM_TEXT}

OUTPUT FORMAT — respond ONLY with valid JSON, nothing else:
{{"department": "<one of IC|HR|CRM|CSD|ESG|Investors>", "policy_category": "<value from allowed list above>"}}"""


def check_deterministic_department_guardrails(user_message: str) -> tuple[str, str, str] | None:
    """
    Deterministic pre-LLM guardrail for critical safety, POSH, and investor triggers.
    Inspects ONLY the current user_message — no history, no context bleed.
    Returns (department, policy_category, reason) or None.
    """
    t = user_message.lower()

    # 1. IC (POSH) — sexual misconduct takes absolute priority
    posh_indicators = [
        "sexual harassment", "posh", "touched me without", "inappropriate touching",
        "quid pro quo", "unwanted sexual advance", "sexually inappropriate"
    ]
    if any(k in t for k in posh_indicators):
        return ("IC", "POSH Policy", "Guardrail: Sexual misconduct / POSH complaint.")

    # 2. ESG — worker safety / site hazard / emergency
    esg_safety_indicators = [
        "unsafe working condition", "emergency response", "worker welfare", "welfare facilit",
        "site sanitation", "scaffolding collapse", "safety harness", "helmets at site",
        "fall hazard", "toxic gas", "site accident", "dense dust", "excessive dust",
        "dust control", "unauthorized groundwater", "stp odor", "dumping construction waste"
    ]
    if any(k in t for k in esg_safety_indicators):
        return ("ESG", "Worker Safety", "Guardrail: Site safety, worker welfare, or environmental hazard.")

    # 3. Investors — shareholder / equity / SEBI
    investor_indicators = [
        "shareholder", "unclaimed dividend", "dividend not received", "demat", "remat",
        "sebi scores", "agm voting", "annual report delivery"
    ]
    if any(k in t for k in investor_indicators):
        return ("Investors", "Investor Relations", "Guardrail: Shareholder / investor inquiry.")

    return None


def classify_department_node(state: GrievanceState) -> dict:
    """
    Classify which department should handle a grievance query.

    INPUT:  Current user message only — no conversation history.
    OUTPUT: {"department": ..., "policy_category": ...}

    Deterministic guardrails run pre-LLM on the current message only.
    """
    from backend.agent.llm import get_llm, extract_response_text
    import re, time

    client, model_name = get_llm()
    # Use condensed statement from multi-turn rewriter if available, fallback to user_message
    user_message = (state.get("condensed_message") or state.get("user_message", "")).strip()

    if not user_message:
        return {"department": "UNKNOWN", "department_reason": "Empty message"}

    # ── Deterministic guardrail (current message ONLY) ────────────────────────
    guardrail_result = check_deterministic_department_guardrails(user_message)
    if guardrail_result:
        department, policy_category, reason = guardrail_result
        logger.info(
            "=== DEPARTMENT CLASSIFICATION (guardrail) ===\n"
            "  Query: %s\n  Department: %s\n  Policy: %s\n  Reason: %s",
            user_message[:100], department, policy_category, reason,
        )
        return {"department": department, "policy_category": policy_category, "department_reason": reason}

    # ── LLM Classification — current message only, no history ─────────────────
    prompt = f"""Classify this message. Respond ONLY with JSON.

USER MESSAGE:
{user_message}"""

    # Pass num_ctx for Ollama via extra_body if the attribute is present
    num_ctx = getattr(client, "_ollama_num_ctx", None)

    for attempt in range(3):
        try:
            kwargs = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": DEPARTMENT_ROUTING_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 150,
                "temperature": 0.0,
            }
            if num_ctx:
                kwargs["extra_body"] = {"options": {"num_ctx": num_ctx}}

            try:
                response = client.chat.completions.create(**kwargs, response_format={"type": "json_object"})
            except Exception:
                response = client.chat.completions.create(**kwargs)

            text = extract_response_text(response.choices[0].message).strip()
            if "```" in text:
                m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
                text = m.group(1) if m else re.search(r"(\{.*?\})", text, re.DOTALL).group(1)

            result = json.loads(text)
            department = result.get("department", "UNKNOWN").strip()
            policy_category = result.get("policy_category", "").strip()
            break

        except json.JSONDecodeError as e:
            logger.error("Failed to parse department JSON (attempt %d): %s", attempt + 1, e)
            department = "UNKNOWN"
            policy_category = ""
            break
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                logger.warning("Rate limit hit, retrying in 5s (attempt %d)...", attempt + 1)
                time.sleep(5)
                continue
            logger.error("Department classification LLM call failed: %s", e)
            department = "UNKNOWN"
            policy_category = ""
            break

    # ── Validate department against allowed list ───────────────────────────────
    if department not in DEPARTMENTS:
        dept_lower = department.lower()
        matched = next((d for d in DEPARTMENTS if d.lower() == dept_lower), None)
        if matched:
            department = matched
        else:
            logger.warning("Invalid department '%s' returned — marking UNKNOWN", department)
            department = "UNKNOWN"

    # ── Validate policy_category against enum for this department ─────────────
    allowed_cats = POLICY_CATEGORIES.get(department, [])
    if allowed_cats and policy_category not in allowed_cats:
        # Pick the first allowed category as a safe fallback
        policy_category = allowed_cats[0]
        logger.warning(
            "Invalid policy_category for %s — defaulted to '%s'", department, policy_category
        )

    logger.info(
        "=== DEPARTMENT CLASSIFICATION ===\n"
        "  Query: %s\n  Department: %s\n  Policy: %s",
        user_message[:100], department, policy_category,
    )

    return {
        "department": department,
        "policy_category": policy_category,
        "department_reason": f"Classified as {department} / {policy_category}",
    }

    """
    Classify which department should handle a grievance query.

    Returns partial state update with 'department', 'department_reason', and 'policy_category'.
    Defaults to 'CRM' on failure (general catch-all).

    Deterministic guardrails are checked first (pre-LLM) for critical safety/POSH/investor
    triggers so small local models can never misroute life-safety issues.
    """
    from backend.agent.llm import get_llm, extract_response_text
    import re

    client, model_name = get_llm()
    user_message = state.get("user_message", "")
    messages = state.get("messages", [])

    # ── Deterministic guardrail (pre-LLM) ─────────────────────────────────────
    # Combine current message + last user turn for broader keyword matching.
    guard_text = user_message
    for msg in reversed(messages):
        if msg.get("role") == "user":
            guard_text = msg.get("content", "") + " " + guard_text
            break
    guardrail_result = check_deterministic_department_guardrails(guard_text)
    if guardrail_result:
        department, policy_category, reason = guardrail_result
        logger.info(
            "=== DEPARTMENT CLASSIFICATION (guardrail) ===\n"
            "  Query: %s\n  Department: %s\n  Policy: %s\n  Reason: %s",
            user_message[:100], department, policy_category, reason,
        )
        return {"department": department, "department_reason": reason}

    # Build conversation context (last 4 messages)
    history_text = ""
    for msg in messages[-4:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_text += f"{role.upper()}: {content}\n"

    prompt = f"""Conversation context (for reference only):
{history_text}

User's current grievance / query to classify:
{user_message}

CRITICAL: Classify the department solely for the USER'S CURRENT GRIEVANCE above, NOT previous historical topics. If previous messages were about a different issue (e.g. earlier messages discussed harassment, but current message is about LMS, salary, or noise), route based strictly on the current grievance: HR for LMS/portal/mandatory training, ESG for noise/pollution, CSD for snags.

Classify the department. Keep the reason concise (1-2 sentences). Respond ONLY with JSON: {{"department": "...", "policy_category": "...", "reason": "..."}}"""

    import time
    for attempt in range(3):
        try:
            kwargs = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": DEPARTMENT_ROUTING_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 800,
                "temperature": 0.0,
            }
            try:
                response = client.chat.completions.create(**kwargs, response_format={"type": "json_object"})
            except Exception:
                response = client.chat.completions.create(**kwargs)

            text = extract_response_text(response.choices[0].message).strip()
            if "```" in text:
                m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
                if m:
                    text = m.group(1)
                else:
                    m2 = re.search(r"(\{.*?\})", text, re.DOTALL)
                    if m2:
                        text = m2.group(1)
            result = json.loads(text)
            department = result.get("department", "CRM")
            reason = result.get("reason", "")
            policy_category = result.get("policy_category", "No specific policy identified")
            break
        except json.JSONDecodeError as e:
            logger.error("Failed to parse department JSON: %s", e)
            department = "CRM"
            reason = "Department parse error — defaulting to CRM"
            policy_category = "No specific policy identified"
            break
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                logger.warning("Groq 429 rate limit hit, retrying in 5s (attempt %d)...", attempt + 1)
                time.sleep(5)
                continue
            logger.error("Department classification LLM call failed: %s", e)
            department = "CRM"
            reason = f"Classification error: {str(e)}"
            policy_category = "No specific policy identified"
            break

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
        "=== DEPARTMENT CLASSIFICATION ===\n"
        "  Query: %s\n"
        "  Department: %s\n"
        "  Policy: %s\n"
        "  Reason: %s",
        user_message[:100],
        department,
        policy_category,
        reason,
    )

    return {
        "department": department,
        "department_reason": reason,
    }
