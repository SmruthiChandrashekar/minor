"""
policy.py — Pick the resolution-SLA rule for a complaint (pure, no I/O).

GRM framework §7: resolution "within 30 days depending upon complexity", and escalated
cases "within 45 working days since acknowledgement". Rules live in the `sla_policies`
table (migration 020); DEFAULT_POLICIES mirrors its seed rows and is used when the table
cannot be read.

Matching: a rule's department / category / severity are each either NULL ("any") or must
equal the complaint's value (case-insensitive). Among matching rules the most specific
wins, weighted department (4) > category (2) > severity (1):
  dept+cat+sev > dept+cat > dept+sev > dept > cat+sev > cat > sev > global default.
"""

DEFAULT_POLICIES: list[dict] = [
    {"rule_id": None, "name": "Default (30 days)", "department": None, "category": None,
     "severity": None, "resolution_days": 30, "resolution_calendar": "calendar"},
    {"rule_id": None, "name": "Low (after chatbot handoff)", "department": None, "category": None,
     "severity": "Low", "resolution_days": 30, "resolution_calendar": "calendar"},
    {"rule_id": None, "name": "Medium", "department": None, "category": None,
     "severity": "Medium", "resolution_days": 15, "resolution_calendar": "working"},
    {"rule_id": None, "name": "High", "department": None, "category": None,
     "severity": "High", "resolution_days": 7, "resolution_calendar": "working"},
    {"rule_id": None, "name": "Critical", "department": None, "category": None,
     "severity": "Critical", "resolution_days": 3, "resolution_calendar": "working"},
]

RULE_DEFAULTS = {
    "escalated_resolution_days": 45,
    "escalated_calendar": "working",
    "warn_at_pct": [50, 75],
}

_WEIGHTS = (("department", 4), ("category", 2), ("severity", 1))


def _norm(value) -> str:
    return str(value or "").strip().lower()


def match_policy(policies: list[dict], department: str | None,
                 category: str | None, severity: str | None) -> dict:
    """Return the most specific active rule for this complaint, with defaults filled in."""
    wanted = {"department": _norm(department), "category": _norm(category), "severity": _norm(severity)}
    best, best_score = None, -1
    for rule in policies or []:
        if rule.get("is_active") is False:
            continue
        score = 0
        for field, weight in _WEIGHTS:
            rule_value = _norm(rule.get(field))
            if not rule_value:
                continue
            if rule_value != wanted[field]:
                break
            score += weight
        else:
            if score > best_score:
                best, best_score = rule, score
    if best is None:
        best = DEFAULT_POLICIES[0]
    merged = {**RULE_DEFAULTS, **{k: v for k, v in best.items() if v is not None}}
    merged.setdefault("rule_id", None)
    return merged
