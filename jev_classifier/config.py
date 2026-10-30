"""
config.py — Label taxonomy and Laya question schemas for Puravankara classification.

Defines the Choice/Score/Noul question structures that Laya evaluates in a single
forward pass. Each question maps directly to a classification task.
"""

# ── Label Taxonomies ──────────────────────────────────────────────────────────

SEVERITY_LABELS = ["LOW", "MEDIUM", "HIGH"]

INTENT_LABELS = ["QUERY", "GRIEVANCE"]

DEPARTMENT_LABELS = ["HR", "IC", "CRM", "CSD", "ESG", "Investors"]


# ── Contextualized Laya Question Schemas ───────────────────────────────────────
# Incorporates rich domain context and contrastive group boundaries into each choice's criteria.

SEVERITY_QUESTIONS = {
    "severity": {
        "type": "choice",
        "instructions": (
            "Classify the urgency and impact level of this Puravankara workplace or customer grievance/query."
        ),
        "criteria": {
            "LOW": (
                "Routine informational questions, policy lookups, attendance rules, "
                "leave policy queries, FAQs, how-to requests, minor portal access questions, "
                "or general inquiries that can be answered from a knowledge base."
            ),
            "MEDIUM": (
                "Unresolved operational discrepancies, delayed processing, salary disputes, "
                "unaddressed construction snags, repeated follow-ups without resolution, "
                "leave balance errors in LMS, area measurement disputes, unexpected charges, "
                "or non-urgent grievances requiring L1 investigation."
            ),
            "HIGH": (
                "Life-safety emergencies, physical site hazards, construction site laborers "
                "working without safety harnesses or helmets, sexual harassment (POSH), "
                "fraud, bribery, corruption, kickbacks, whistleblower disclosures, "
                "severe verbal abuse, illegal activities, or urgent executive escalation."
            ),
        },
    },
    "intent": {
        "type": "choice",
        "instructions": (
            "Determine whether this user message is an informational query or an actionable grievance."
        ),
        "criteria": {
            "QUERY": (
                "Informational questions about company policies, rules, procedures, "
                "how-to requests, clarifications, portal guidance, requests for links/forms/documents, "
                "or general FAQs that can be answered from knowledge base."
            ),
            "GRIEVANCE": (
                "Complaints, reports of misconduct, payroll/salary disputes, harassment, "
                "safety violations, delayed handovers, unaddressed snags, or issues requiring "
                "investigation, escalation, or departmental action."
            ),
        },
    },
}


DEPARTMENT_QUESTIONS = {
    "department": {
        "type": "choice",
        "instructions": (
            "Route this Puravankara grievance to the responsible department based on the "
            "complainant's relationship and the core subject matter."
        ),
        "criteria": {
            "HR": (
                "Human Resources — Corporate office employee matters: corporate salary deduction, "
                "payroll errors, leave and attendance balance in LMS, performance appraisal disputes, "
                "manager conflicts, HR portal access, employee handbook policies. "
                "Contrast: Construction site laborer welfare, wages, and site safety belong to ESG, NOT HR."
            ),
            "IC": (
                "Internal Committee (POSH) — Sexual harassment, inappropriate touching, unwanted sexual advances, "
                "sexually suggestive comments, quid pro quo, or POSH Act violations. "
                "Takes absolute priority over general HR when sexual misconduct is reported."
            ),
            "CRM": (
                "Customer Relationship Management — Homebuyer sales and contractual disputes: "
                "salesperson commitments, car parking allotment letters, delayed apartment possession handover, "
                "booking agreements, registration documentation, unexpected charges, pricing disputes, "
                "cancellation and refunds. "
                "Contrast: Physical property maintenance and repairs belong to CSD, NOT CRM."
            ),
            "CSD": (
                "Customer Service Department — Post-possession physical property defects and repairs: "
                "water seepage, plumbing leaks, electrical tripping, elevator breakdowns, "
                "snag list repairs, common area maintenance, broken clubhouse equipment. "
                "Contrast: Sales promises and handover delays belong to CRM, NOT CSD."
            ),
            "ESG": (
                "Environmental, Social & Governance — Environmental impact and construction site worker conditions: "
                "construction dust and noise affecting neighboring residents, STP sewage treatment plant odor, "
                "drainage waterlogging, construction waste dumping, construction laborers working without "
                "safety harnesses or helmets, site worker sanitation and welfare facilities."
            ),
            "Investors": (
                "Investor Relations — Public equity shareholders and investors: unclaimed dividend credits, "
                "physical share certificate dematerialization (demat/remat) with RTA, annual report delivery, "
                "AGM/EGM voting, SEBI SCORES complaints, stock valuation impact."
            ),
        },
    },
}


