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
    "IC": "Internal Committee (POSH) — sexual harassment, unwelcome advances, hostile work environment based on gender/sex, POSH Act compliance",
    "HR": "Human Resources — employee relations, non-sexual workplace conduct/bullying, payroll & salary disputes, leave policies, manager conflicts, appraisals",
    "CRM": "Customer Relationship Management — customer-facing sales & commercial issues, booking/allotment, agreements, registration/Khata, possession commitments, pricing disputes, customer-directed bribes or kickbacks",
    "CSD": "Customer Service Department — post-possession maintenance, construction quality defects, water seepage, electrical/plumbing faults, snags, facility management",
    "ESG": "Environmental, Social & Governance — environmental violations, construction dust/noise pollution, sewage/STP, drainage/flooding, waste, worker/public safety violations, tree cutting, community impact",
    "Investors": "Investor Relations — shareholder queries, dividends, annual report disclosures, stock transfer, financial reporting, SEBI compliance, insider trading allegations",
}

DEPARTMENT_DESCRIPTIONS_PROMPT = "\n".join(
    f"- {dept}: {desc}" for dept, desc in DEPARTMENT_DESCRIPTIONS.items()
)

