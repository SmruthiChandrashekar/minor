"""
categories.py — Grievance taxonomy and severity levels.

IMPORTANT:
    These are an initial implementation taxonomy.
    They are NOT Puravankara's officially defined organizational categories
    unless supported by the existing policy documents or department interviews.
    The system allows categories to be modified later.
"""

# ── Grievance Categories ──────────────────────────────────────────────────
# Ordered roughly by frequency/importance. Easily extensible.
GRIEVANCE_CATEGORIES = [
    "Leave",
    "Attendance / Working Hours",
    "Wages / Salary",
    "Reimbursement / Conveyance",
    "Relocation",
    "Career Progression",
    "Performance Management",
    "Workplace Conduct / Misconduct",
    "Discrimination / Inclusion",
    "Sexual Harassment / POSH",
    "Whistleblower / Protected Disclosure",
    "Bribery / Corruption",
    "Human Rights",
    "Child Labour",
    "Other",
]

# Formatted as a string for use in LLM prompts
CATEGORIES_PROMPT_LIST = "\n".join(f"- {c}" for c in GRIEVANCE_CATEGORIES)


# ── Severity Levels ───────────────────────────────────────────────────────
SEVERITY_LEVELS = [
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
    "UNKNOWN",
]

SEVERITY_PROMPT_LIST = ", ".join(SEVERITY_LEVELS)


# ── Intent Types ──────────────────────────────────────────────────────────
INTENT_TYPES = [
    "POLICY_QUERY",
    "GRIEVANCE",
    "FOLLOW_UP",
    "OTHER",
]

INTENT_PROMPT_LIST = ", ".join(INTENT_TYPES)


# ── Departments (for high-severity routing) ───────────────────────────────
DEPARTMENTS = [
    "HR",
    "IC",
    "CRM",
    "CSD",
    "ESG",
    "Investors",
]

DEPARTMENTS_PROMPT_LIST = "\n".join(f"- {d}" for d in DEPARTMENTS)

# Department descriptions for LLM classification
DEPARTMENT_DESCRIPTIONS = {
    "HR": "Human Resources — employee relations, harassment, workplace conduct, hiring, benefits, leave disputes, payroll issues",
    "IC": "Internal Compliance — regulatory compliance, internal audits, policy violations, ethics, legal compliance, whistleblower",
    "CRM": "Customer Relationship Management — client complaints, service quality, customer satisfaction, sales disputes",
    "CSD": "Customer Service Department — customer support failures, response times, service delivery, helpdesk issues",
    "ESG": "Environmental, Social & Governance — environmental violations, sustainability, social responsibility, governance concerns",
    "Investors": "Investor Relations — financial reporting, shareholder concerns, investment disputes, dividend issues, fund management",
}

DEPARTMENT_DESCRIPTIONS_PROMPT = "\n".join(
    f"- {dept}: {desc}" for dept, desc in DEPARTMENT_DESCRIPTIONS.items()
)
