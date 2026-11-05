"""
engine.py — Resolution-SLA state transitions (pure, no I/O).

Three deadlines per ticket:
  • sla_deadline      per-level pickup timer (L1 48h … HEAD 4h). Owned by router.py, unchanged.
  • resolve_by        resolution deadline from the matching rule ("within 30 days").
  • final_resolve_by  ceiling for escalated cases (45 working days from acknowledgement).

resolve_by and final_resolve_by are stamped once, on filing, and never reset when the
ticket changes level. When resolve_by passes unresolved, the case becomes an escalated
case: it moves to HEAD and is then measured against final_resolve_by.
"""

from datetime import date, datetime, timezone

from backend.sla.calendar import add_days

DONE_STATUSES = {"Resolved", "Rejected", "Closed"}
FINAL_WARN_PCT = 75

_SNAPSHOT_FIELDS = (
    "name", "department", "category", "severity",
    "resolution_days", "resolution_calendar",
    "escalated_resolution_days", "escalated_calendar", "warn_at_pct",
)


def parse_ts(value) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def start_fields(acknowledged_at: datetime, rule: dict,
                 holidays: frozenset[date] | set[date] = frozenset()) -> dict:
    """Columns to write when a ticket first reaches a human (filing or chatbot handoff)."""
    ack = parse_ts(acknowledged_at)
    resolve_by = add_days(ack, int(rule["resolution_days"]), rule["resolution_calendar"], holidays)
    final_by = add_days(ack, int(rule["escalated_resolution_days"]), rule["escalated_calendar"], holidays)
    final_by = max(final_by, resolve_by)
    return {
        "sla_rule_id": rule.get("rule_id"),
        "sla_rule_snapshot": {k: rule.get(k) for k in _SNAPSHOT_FIELDS},
        "acknowledged_at": _iso(ack),
        "resolve_by": _iso(resolve_by),
        "final_resolve_by": _iso(final_by),
        "resolved_at": None,
        "resolution_sla_met": None,
        "resolution_breached": False,
        "final_breached": False,
        "sla_alerts_sent": [],
    }


def is_done(ticket: dict) -> bool:
    return ticket.get("status") in DONE_STATUSES


def status_change_fields(ticket: dict, new_status: str, now: datetime) -> dict:
    """Columns to write when staff change a ticket's status.
    Returns {} for tickets without resolution-SLA columns (migration 020 not applied)."""
    if "resolve_by" not in ticket:
        return {}
    now = parse_ts(now)
    out: dict = {}
    if not ticket.get("first_response_at"):
        out["first_response_at"] = _iso(now)
    if new_status in DONE_STATUSES:
        if not ticket.get("resolved_at"):
            out["resolved_at"] = _iso(now)
            resolve_by = parse_ts(ticket.get("resolve_by"))
            if resolve_by:
                out["resolution_sla_met"] = now <= resolve_by
    elif ticket.get("resolved_at"):
        # Reopened: the original deadlines stand, the clock simply runs again.
        out["resolved_at"] = None
        out["resolution_sla_met"] = None
    return out


def _fraction(start: datetime, end: datetime, now: datetime) -> float:
    span = (end - start).total_seconds()
    if span <= 0:
        return 1.0
    return (now - start).total_seconds() / span


def due_alerts(ticket: dict, now: datetime) -> list[str]:
    """Alert keys that are due now and not yet sent, in escalating order:
    resolve_<pct> reminders, resolve_breach, final_75, final_breach."""
    if is_done(ticket) or ticket.get("resolved_at"):
        return []
    resolve_by = parse_ts(ticket.get("resolve_by"))
    if not resolve_by:
        return []
    now = parse_ts(now)
    start = parse_ts(ticket.get("acknowledged_at")) or parse_ts(ticket.get("created_at")) or now
    final_by = parse_ts(ticket.get("final_resolve_by"))
    snapshot = ticket.get("sla_rule_snapshot") or {}
    warn_at = sorted(int(p) for p in (snapshot.get("warn_at_pct") or [50, 75]))

    keys: list[str] = []
    if now >= resolve_by:
        keys.append("resolve_breach")
        if final_by:
            if now >= final_by:
                keys.append("final_breach")
            elif _fraction(start, final_by, now) * 100 >= FINAL_WARN_PCT:
                keys.append(f"final_{FINAL_WARN_PCT}")
    else:
        frac = _fraction(start, resolve_by, now) * 100
        keys.extend(f"resolve_{p}" for p in warn_at if frac >= p)

    sent = set(ticket.get("sla_alerts_sent") or [])
    return [k for k in keys if k not in sent]


def current_deadline(ticket: dict) -> datetime | None:
    """The deadline the ticket is measured against right now."""
    if ticket.get("resolution_breached") and ticket.get("final_resolve_by"):
        return parse_ts(ticket.get("final_resolve_by"))
    return parse_ts(ticket.get("resolve_by"))


def backfill_fields(ticket: dict, rule: dict, holidays: frozenset[date] | set[date],
                    now: datetime) -> dict:
    """Stamp an existing open ticket from its created_at without firing alerts for the past:
    every alert already due is recorded as sent, and breach flags are set silently."""
    start = parse_ts(ticket.get("created_at")) or parse_ts(now)
    fields = start_fields(start, rule, holidays)
    probe = {**ticket, **fields}
    fields["sla_alerts_sent"] = due_alerts(probe, now)
    fields["resolution_breached"] = "resolve_breach" in fields["sla_alerts_sent"]
    fields["final_breached"] = "final_breach" in fields["sla_alerts_sent"]
    return fields
