"""
test_resolution_sla.py — Resolution SLA (GRM framework §7): calendar, rule matching,
deadline stamping, status transitions, alerts and backfill. Pure functions only.

Run with:
    python -m pytest backend/tests/test_resolution_sla.py -v
"""

from datetime import date, datetime, timedelta, timezone

from backend.sla.calendar import (
    IST, add_calendar_days, add_working_days, is_working_day, to_ist,
)
from backend.sla.engine import (
    backfill_fields, current_deadline, due_alerts, parse_ts, start_fields,
    status_change_fields,
)
from backend.sla.policy import DEFAULT_POLICIES, match_policy

UTC = timezone.utc
# Monday 11 Aug 2025, 10:00 IST
FILED = datetime(2025, 8, 11, 10, 0, tzinfo=IST).astimezone(UTC)
HOLIDAYS = frozenset({date(2025, 8, 15), date(2025, 8, 27)})  # Independence Day, Ganesha Chaturthi


def eod(y, m, d):
    return datetime(y, m, d, 23, 59, 59, tzinfo=IST).astimezone(UTC)


# ── Calendar ──────────────────────────────────────────────────────────

class TestCalendar:
    def test_sunday_is_off_saturday_works(self):
        assert not is_working_day(date(2025, 8, 17))  # Sunday
        assert is_working_day(date(2025, 8, 16))      # Saturday

    def test_holiday_is_off(self):
        assert not is_working_day(date(2025, 8, 15), HOLIDAYS)

    def test_working_days_skip_sunday(self):
        # Tue 12 … Sat 16 = 5, skip Sun 17, Mon 18 = 6, Tue 19 = 7
        assert add_working_days(FILED, 7) == eod(2025, 8, 19)

    def test_working_days_skip_holiday(self):
        # Fri 15 Aug is a holiday, so day 7 moves to Wed 20
        assert add_working_days(FILED, 7, HOLIDAYS) == eod(2025, 8, 20)

    def test_calendar_days_end_of_day_ist(self):
        assert add_calendar_days(FILED, 30) == eod(2025, 9, 10)

    def test_start_on_sunday_counts_from_monday(self):
        sunday = datetime(2025, 8, 17, 12, 0, tzinfo=IST)
        assert add_working_days(sunday, 1) == eod(2025, 8, 18)

    def test_late_night_utc_uses_ist_date(self):
        # 20:00 UTC on Mon 11 Aug is already Tue 12 Aug 01:30 in IST
        late = datetime(2025, 8, 11, 20, 0, tzinfo=UTC)
        assert to_ist(late).date() == date(2025, 8, 12)
        assert add_calendar_days(late, 1) == eod(2025, 8, 13)


# ── Rule matching ─────────────────────────────────────────────────────

class TestPolicy:
    def test_defaults_by_severity(self):
        assert match_policy(DEFAULT_POLICIES, "HR", "HR", "Medium")["resolution_days"] == 15
        assert match_policy(DEFAULT_POLICIES, "HR", "HR", "High")["resolution_days"] == 7
        assert match_policy(DEFAULT_POLICIES, "HR", "HR", "Critical")["resolution_days"] == 3
        assert match_policy(DEFAULT_POLICIES, "HR", "HR", "Low")["resolution_days"] == 30

    def test_unknown_severity_gets_global_default(self):
        rule = match_policy(DEFAULT_POLICIES, "HR", "HR", "Weird")
        assert rule["name"] == "Default (30 days)"
        assert rule["resolution_days"] == 30

    def test_all_defaults_within_30_days(self):
        for sev in ("Low", "Medium", "High", "Critical", None):
            rule = match_policy(DEFAULT_POLICIES, None, None, sev)
            deadline = start_fields(FILED, rule)["resolve_by"]
            assert parse_ts(deadline) <= eod(2025, 9, 10)

    def test_most_specific_rule_wins(self):
        policies = DEFAULT_POLICIES + [
            {"name": "CRM any", "department": "CRM", "resolution_days": 20, "resolution_calendar": "calendar"},
            {"name": "CRM high", "department": "crm", "severity": "HIGH", "resolution_days": 5,
             "resolution_calendar": "working"},
            {"name": "Off", "department": "CRM", "severity": "High", "resolution_days": 1,
             "resolution_calendar": "working", "is_active": False},
        ]
        assert match_policy(policies, "CRM", "CRM", "High")["name"] == "CRM high"
        assert match_policy(policies, "CRM", "CRM", "Medium")["name"] == "CRM any"
        assert match_policy(policies, "HR", "HR", "High")["name"] == "High"

    def test_defaults_filled(self):
        rule = match_policy([], None, None, None)
        assert rule["escalated_resolution_days"] == 45
        assert rule["escalated_calendar"] == "working"
        assert rule["warn_at_pct"] == [50, 75]


# ── Stamping a ticket ─────────────────────────────────────────────────

def ticket_for(severity="Medium", filed=FILED, holidays=HOLIDAYS, **extra):
    rule = match_policy(DEFAULT_POLICIES, "HR", "HR", severity)
    t = {"grievance_id": "abc12345-0000", "status": "HUMAN_HANDLING", "created_at": filed.isoformat()}
    t.update(start_fields(filed, rule, holidays))
    t.update(extra)
    return t


class TestStartFields:
    def test_acknowledged_now_and_deadlines(self):
        t = ticket_for("High")
        assert parse_ts(t["acknowledged_at"]) == FILED
        assert parse_ts(t["resolve_by"]) == eod(2025, 8, 20)
        assert t["sla_rule_snapshot"]["resolution_days"] == 7
        assert t["resolution_breached"] is False and t["sla_alerts_sent"] == []

    def test_final_is_45_working_days_from_acknowledgement(self):
        t = ticket_for("Medium")
        final = to_ist(parse_ts(t["final_resolve_by"])).date()
        d, n = to_ist(FILED).date(), 0
        while d < final:
            d += timedelta(days=1)
            n += is_working_day(d, HOLIDAYS)
        assert n == 45
        assert is_working_day(final, HOLIDAYS)

    def test_final_never_before_resolve_by(self):
        rule = {**match_policy([], None, None, None), "escalated_resolution_days": 1}
        t = start_fields(FILED, rule)
        assert t["final_resolve_by"] >= t["resolve_by"]


# ── Status changes ────────────────────────────────────────────────────

class TestStatusChange:
    def test_no_columns_no_changes(self):
        assert status_change_fields({"status": "Open"}, "Resolved", FILED) == {}

    def test_first_response_recorded_once(self):
        t = ticket_for()
        now = FILED + timedelta(hours=5)
        out = status_change_fields(t, "Investigating", now)
        assert parse_ts(out["first_response_at"]) == now
        assert "resolved_at" not in out
        t.update(out)
        assert "first_response_at" not in status_change_fields(t, "Investigating", now + timedelta(days=1))

    def test_resolved_on_time(self):
        t = ticket_for("High")
        out = status_change_fields(t, "Resolved", eod(2025, 8, 20) - timedelta(hours=1))
        assert out["resolution_sla_met"] is True and out["resolved_at"]

    def test_resolved_late(self):
        t = ticket_for("High")
        out = status_change_fields(t, "Rejected", eod(2025, 8, 21))
        assert out["resolution_sla_met"] is False

    def test_reopen_clears_resolution_but_keeps_deadlines(self):
        t = ticket_for("High", status="Resolved", resolved_at=eod(2025, 8, 18).isoformat(),
                       resolution_sla_met=True)
        out = status_change_fields(t, "Open", eod(2025, 8, 19))
        assert out["resolved_at"] is None and out["resolution_sla_met"] is None
        assert "resolve_by" not in out

    def test_pending_rejection_keeps_clock_running(self):
        # Maker's rejection proposal is stored as Investigating
        out = status_change_fields(ticket_for(), "Investigating", FILED + timedelta(days=2))
        assert "resolved_at" not in out


# ── Alerts ────────────────────────────────────────────────────────────

class TestAlerts:
    def test_nothing_early(self):
        assert due_alerts(ticket_for("Medium"), FILED + timedelta(days=1)) == []

    def test_reminders_then_breach(self):
        t = ticket_for("Medium")
        start, rb = parse_ts(t["acknowledged_at"]), parse_ts(t["resolve_by"])
        at = lambda f: start + (rb - start) * f
        assert due_alerts(t, at(0.55)) == ["resolve_50"]
        assert due_alerts(t, at(0.80)) == ["resolve_50", "resolve_75"]
        t["sla_alerts_sent"] = ["resolve_50"]
        assert due_alerts(t, at(0.80)) == ["resolve_75"]
        assert due_alerts(t, rb + timedelta(minutes=1)) == ["resolve_breach"]

    def test_escalated_case_warn_and_final_breach(self):
        t = ticket_for("Medium", sla_alerts_sent=["resolve_50", "resolve_75", "resolve_breach"],
                       resolution_breached=True)
        start, fb = parse_ts(t["acknowledged_at"]), parse_ts(t["final_resolve_by"])
        assert due_alerts(t, start + (fb - start) * 0.8) == ["final_75"]
        assert due_alerts(t, fb + timedelta(seconds=1)) == ["final_breach"]

    def test_done_tickets_never_alert(self):
        t = ticket_for("Medium", status="Resolved")
        assert due_alerts(t, FILED + timedelta(days=90)) == []

    def test_current_deadline_switches_after_breach(self):
        t = ticket_for("Medium")
        assert current_deadline(t) == parse_ts(t["resolve_by"])
        t["resolution_breached"] = True
        assert current_deadline(t) == parse_ts(t["final_resolve_by"])


# ── Backfill ──────────────────────────────────────────────────────────

class TestBackfill:
    def test_old_ticket_marked_silently(self):
        old = {"grievance_id": "x", "status": "Investigating", "created_at": FILED.isoformat()}
        rule = match_policy(DEFAULT_POLICIES, None, None, "High")
        fields = backfill_fields(old, rule, HOLIDAYS, FILED + timedelta(days=200))
        assert fields["resolution_breached"] is True and fields["final_breached"] is True
        assert set(fields["sla_alerts_sent"]) == {"resolve_breach", "final_breach"}
        # Nothing left to fire after backfill
        assert due_alerts({**old, **fields}, FILED + timedelta(days=200)) == []

    def test_recent_ticket_not_breached(self):
        recent = {"grievance_id": "y", "status": "Open", "created_at": FILED.isoformat()}
        rule = match_policy(DEFAULT_POLICIES, None, None, "Medium")
        fields = backfill_fields(recent, rule, HOLIDAYS, FILED + timedelta(days=1))
        assert fields["resolution_breached"] is False and fields["sla_alerts_sent"] == []
