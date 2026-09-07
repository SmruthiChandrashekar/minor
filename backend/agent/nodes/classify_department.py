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


DEPARTMENT_ROUTING_SYSTEM_PROMPT = """You are a Grievance Classification and Routing Agent for Puravankara.

Your task is to analyze the user's complaint or query and determine the responsible department and relevant policy category.

Available Departments:
1. IC (Internal Committee - POSH)
2. HR (Human Resources)
3. CRM (Customer Relationship Management)
4. CSD (Customer Service Department)
5. ESG (Environmental, Social & Governance)
6. Investors (Investor Relations)

==================================================
DEPARTMENT SCOPES & EXAMPLES
==================================================

### 1. IC (Internal Committee - POSH)
Scope:
Sexual harassment, unwelcome physical or verbal conduct of a sexual nature, sexually suggestive messages/calls, sexist comments, quid pro quo harassment, gender-based intimidation, or creation of a hostile work environment based on gender/sex as governed by the POSH Act, 2013.
Examples:
- "My reporting manager makes sexually suggestive remarks regarding my appearance and insists on private meetings."
- "A colleague repeatedly sends inappropriate personal messages late at night despite clear requests to stop."
- "An employee subjected me to inappropriate physical touch during an official team offsite event."
RULE:
Any allegation involving sexual misconduct or POSH must route to IC regardless of seniority, department, or presence of other employment disputes.

### 2. HR (Human Resources)
Scope:
Employee relations, non-sexual workplace harassment or bullying, payroll and compensation discrepancies, leave administration, manager conflicts, performance appraisals, onboarding, probation confirmation, transfer/department changes, shift schedules, LMS issues, and employee access.
Examples:
- "My leave balance on the LMS reflects 5 fewer days than my approved leaves. Kindly rectify the record."
- "My probation period concluded two months ago, but HR has not released my confirmation letter."
- "My department and reporting manager were reassigned without prior notice or documentation."
- "Salary for the current month was incorrectly credited with unexplained salary deductions."
- "My manager regularly uses abusive language and belittles me during daily internal team standups."
RULE:
Internal employee and workplace grievances belong to HR unless they involve sexual harassment (which goes to IC).

### 3. CRM (Customer Relationship Management)
Scope:
Customer-facing sales and commercial matters, booking and unit allotment, sale agreements, buyer-builder contracts, registration and Khata transfers, delivery and possession commitments, sales commitment mismatches, pricing discrepancies, infrastructure/clubhouse charges, cancellations, refunds, sales executive misconduct, and customer-directed bribes or kickbacks.
Examples:
- "The possession date was committed for December 2025, but the CRM team has postponed the handover three times."
- "The carpet area and undivided share of land (UDS) in my registered deed differ from my original agreement of sale."
- "Infrastructure and electrification charges not mentioned in the signed cost sheet are now being demanded before handover."
- "Unit registration has been stalled for three months due to pending bifurcated A-Khata documentation from the builder."
- "I submitted a formal booking cancellation request four months ago, but the refundable deposit has not been credited."
- "The sales executive demanded an under-the-table cash payment of Rs. 50,000 to fast-track my flat handover."
RULE:
If the issue concerns commercial transactions, booking, buyer agreements, registration, handover commitments, or sales team conduct, classify as CRM.
Bribery or kickbacks demanded from a buyer belong under CRM as HIGH severity.

### 4. CSD (Customer Service Department)
Scope:
Post-handover physical property maintenance, construction defects, structural cracks, water seepage and dampness, plumbing blockages, electrical wiring faults, snag inspection rectifications, elevator and generator common-area amenities, and maintenance helpdesk SLA breaches.
Examples:
- "Severe water seepage is visible along the master bedroom wall and ceiling, and no repair has been initiated."
- "The circuit breaker in my apartment trips continuously; the ticket lodged a week ago has not been attended to."
- "Snag items identified during the pre-possession inspection (broken tiles, misaligned doors) remain unrectified."
- "The main sewer line for our residential wing is backed up, producing foul drainage backflow inside the apartment."
RULE:
Physical building defects, in-flat snags, and post-possession maintenance issues belong to CSD. Do not route in-flat plumbing or drainage issues to ESG.

### 5. ESG (Environmental, Social & Governance)
Scope:
Environmental compliance violations, air and fugitive dust pollution from construction sites, excessive noise during silent/night hours, storm water runoff blockage, urban flooding caused by project grading, improper dumping of construction debris/hazardous waste, sewage treatment plant (STP) discharge into public drains, groundwater depletion/unauthorized borewells, unauthorized felling of trees, worker on-site occupational health and safety (PPE violations, lack of safety netting), and surrounding community grievances.
Examples:
- "Excavation and construction at the project site generate dense dust clouds affecting neighboring residential schools."
- "Construction debris dumped by the contractor has blocked the municipal storm water canal, flooding adjacent properties."
- "Laborers on the 14th floor are working without safety harnesses, helmets, or perimeter catch nets."
- "Construction and heavy machinery operate past 11:00 PM in violation of local noise abatement regulations."
- "Untreated effluent from the site batching plant is being discharged into an adjacent open lake bed."
- "Multiple mature trees on the project boundary were felled without mandatory municipal forest department clearance."
- "Unregulated deep borewell drilling at the site has dried up neighboring community drinking water wells."
RULE:
Select ESG when the grievance concerns community impact, environmental regulations, worker health/safety, public hazard, pollution, or corporate governance.

### 6. Investors (Investor Relations)
Scope:
Shareholder and institutional investor communications, unpaid or unclaimed dividends, annual report and financial statement disclosures, share transfers, demat/remat requests, transmission of shares, duplicate share certificates, AGM/EGM voting procedures, Registrar and Share Transfer Agent (RTA) grievances, SEBI (LODR) compliance, and allegations of insider trading or financial misrepresentation.
Examples:
- "Kindly provide the link and instructions to join the upcoming Annual General Meeting via video conference."
- "I have not received the physical copy of the Annual Report for the latest financial year. Please send one to my registered address."
- "Please share the procedure and formats required to update my bank mandate and residential address in company records."
- "The declared final dividend has not been credited to my bank account despite holding shares on the record date."
- "My request for transmission of deceased family member's shares submitted with the RTA two months ago has seen no progress."
- "TDS on my dividend payout was deducted, but Form 16A has not been issued or updated in my Form 26AS."
- "The quarterly financial statements omit material related-party transactions and present false revenue figures to shareholders."
- "I have reason to believe senior executives traded shares immediately preceding the quarterly earnings release (insider trading)."
- "Company shares held in physical form were illegally transferred without valid transfer deeds or shareholder authorization."
- "The company has failed to resolve repeated formal grievances filed through the SEBI SCORES portal regarding non-receipt of shares."
RULE:
If the complainant is an individual or institutional shareholder or investor, and the grievance concerns equity, dividends, statutory filings, corporate disclosures, or investor relations, classify as Investors.

==================================================
PRIORITY & OUTPUT RULES
==================================================
- Base classification on the SUBSTANCE and PRIMARY ROOT CAUSE of the grievance, not superficial keywords.
- Only ONE primary department must be selected.
- Sexual Harassment / POSH allegations must ALWAYS be routed to IC, overriding any overlapping HR or operational context.
- Customer-facing bribery or kickback demands must be classified under CRM.
- Do NOT classify routine apartment defects as ESG merely because they involve water, plumbing, or electricity.
- If truly uncertain, default to CRM.

Respond with ONLY a JSON object:
{
  "department": "IC" | "HR" | "CRM" | "CSD" | "ESG" | "Investors",
  "policy_category": "string or No specific policy identified",
  "reason": "Brief explanation of why this department was selected"
}"""


def classify_department_node(state: GrievanceState) -> dict:
    """
    Classify which department should handle a grievance query.

    Returns partial state update with 'department', 'department_reason', and 'policy_category'.
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

    prompt = f"""Conversation context:
{history_text}

User's grievance / query: {user_message}

Classify the department. Respond ONLY with JSON: {{"department": "...", "policy_category": "...", "reason": "..."}}"""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": DEPARTMENT_ROUTING_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=250,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content.strip()
        result = json.loads(text)
        department = result.get("department", "CRM")
        reason = result.get("reason", "")
        policy_category = result.get("policy_category", "No specific policy identified")
    except json.JSONDecodeError as e:
        logger.error("Failed to parse department JSON: %s", e)
        department = "CRM"
        reason = "Department parse error — defaulting to CRM"
        policy_category = "No specific policy identified"
    except Exception as e:
        logger.error("Department classification LLM call failed: %s", e)
        department = "CRM"
        reason = f"Classification error: {str(e)}"
        policy_category = "No specific policy identified"

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
