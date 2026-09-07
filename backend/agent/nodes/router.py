"""
router.py — Deterministic routing logic for grievance tier/SLA assignment.

This module contains PURE FUNCTIONS with no external dependencies (no DB, no LLM).
It maps severity → initial handler, tier, queue, and SLA.

Routing rules:
    LOW    → CHATBOT (no tier, no SLA until handoff)
    MEDIUM → L1, 48h SLA
    HIGH   → L2, 24h SLA

Escalation chain:
    L1 → L2 → L3 → HEAD

SLA by tier:
    L1   = 48 hours
    L2   = 24 hours
    L3   = 12 hours
    HEAD =  4 hours
"""

from datetime import datetime, timezone, timedelta

# ── Constants ─────────────────────────────────────────────────────────

TIER_SLA_HOURS = {
    "L1": 48,
    "L2": 24,
    "L3": 12,
    "HEAD": 4,
}

ESCALATION_CHAIN = {
    "L1": "L2",
    "L2": "L3",
    "L3": "HEAD",
}

VALID_TIERS = {"L1", "L2", "L3", "HEAD"}
VALID_SEVERITIES = {"LOW", "MEDIUM", "HIGH"}
VALID_DEPARTMENTS = {"CRM", "CSD", "ESG", "HR", "Investors", "IC"}


# ── Core Routing ──────────────────────────────────────────────────────

def determine_initial_route(severity: str, department: str) -> dict:
    """
    Determine initial routing based on severity and department.

    Args:
        severity:   Normalized severity level (LOW, MEDIUM, HIGH).
        department: Target department (CRM, CSD, ESG, HR, Investors, IC).

    Returns:
        dict with:
            initial_handler: "CHATBOT" | "L1" | "L2"
            assigned_tier:   None | "L1" | "L2"
            assigned_queue:  None | "{dept}_l1_queue" | "{dept}_l2_queue"
            sla_hours:       None | 48 | 24
            sla_deadline:    None | datetime (timezone-aware)
            status:          "CHATBOT_HANDLING" | "HUMAN_HANDLING"
    """
    severity_upper = normalize_severity(severity)

    if severity_upper == "LOW":
        return {
            "initial_handler": "CHATBOT",
            "assigned_tier": None,
            "assigned_queue": None,
            "sla_hours": None,
            "sla_deadline": None,
            "status": "CHATBOT_HANDLING",
        }

    elif severity_upper == "MEDIUM":
        sla_hours = TIER_SLA_HOURS["L1"]
        return {
            "initial_handler": "L1",
            "assigned_tier": "L1",
            "assigned_queue": build_queue_name(department, "L1"),
            "sla_hours": sla_hours,
            "sla_deadline": calculate_sla_deadline(sla_hours),
            "status": "HUMAN_HANDLING",
        }

    else:  # HIGH
        sla_hours = TIER_SLA_HOURS["L2"]
        return {
            "initial_handler": "L2",
            "assigned_tier": "L2",
            "assigned_queue": build_queue_name(department, "L2"),
            "sla_hours": sla_hours,
            "sla_deadline": calculate_sla_deadline(sla_hours),
            "status": "HUMAN_HANDLING",
        }


def chatbot_handoff_route(department: str) -> dict:
    """
    Route a LOW-severity grievance from chatbot to L1 after handoff.

    Called when the chatbot cannot resolve the issue and the user
    needs human assistance.

    Args:
        department: Target department.

    Returns:
        dict with L1 routing fields.
    """
    sla_hours = TIER_SLA_HOURS["L1"]
    return {
        "assigned_tier": "L1",
        "assigned_queue": build_queue_name(department, "L1"),
        "sla_hours": sla_hours,
        "sla_deadline": calculate_sla_deadline(sla_hours),
        "status": "HUMAN_HANDLING",
    }


def escalate(current_tier: str, department: str) -> dict | None:
    """
    Escalate from the current tier to the next tier.

    Args:
        current_tier: Current tier (L1, L2, L3).
        department:   Target department.

    Returns:
        dict with next tier routing fields, or None if already at HEAD.
    """
    next_tier = get_next_tier(current_tier)
    if next_tier is None:
        return None

    sla_hours = TIER_SLA_HOURS[next_tier]
    return {
        "assigned_tier": next_tier,
        "assigned_queue": build_queue_name(department, next_tier),
        "sla_hours": sla_hours,
        "sla_deadline": calculate_sla_deadline(sla_hours),
    }


# ── Helpers ───────────────────────────────────────────────────────────

def normalize_severity(severity: str) -> str:
    """
    Normalize severity string to uppercase.
    Returns 'LOW' for invalid/missing values.
    """
    if not severity:
        return "LOW"

    cleaned = severity.strip().upper()

    if cleaned in VALID_SEVERITIES:
        return cleaned

    # Handle legacy values
    if cleaned in ("CRITICAL",):
        return "HIGH"

    return "LOW"


def build_queue_name(department: str, tier: str) -> str:
    """
    Build a queue name from department and tier.
    Example: build_queue_name("CRM", "L1") → "crm_l1_queue"
    """
    return f"{department.lower()}_{tier.lower()}_queue"


def get_next_tier(current_tier: str) -> str | None:
    """
    Get the next tier in the escalation chain.
    Returns None if already at HEAD.
    """
    return ESCALATION_CHAIN.get(current_tier)


def calculate_sla_deadline(sla_hours: int) -> datetime:
    """
    Calculate SLA deadline from now + sla_hours.
    Returns timezone-aware UTC datetime.
    """
    return datetime.now(timezone.utc) + timedelta(hours=sla_hours)
