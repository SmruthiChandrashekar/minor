"""
sla_monitor.py — Background SLA monitoring and automatic escalation.

Runs periodically to check for SLA breaches and escalate grievances
through the tier chain: L1 → L2 → L3 → HEAD.

Each escalation:
1. Updates the grievance's assigned_tier, assigned_queue, sla_hours, sla_deadline
2. Appends to escalation_history
3. Creates notifications for user and department admins
4. Uses idempotency to prevent duplicate escalations
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger("sla_monitor")

# How often to check for SLA breaches (in seconds)
CHECK_INTERVAL_SECONDS = 300  # 5 minutes


_client = None


def _get_supabase():
    """Get the shared Supabase client (created once, then reused)."""
    global _client
    if _client is None:
        import os
        from supabase import create_client
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError("Missing Supabase environment variables")
        _client = create_client(url, key)
    return _client


def check_and_escalate():
    """
    Check all HUMAN_HANDLING grievances for SLA breaches and escalate.

    This function is idempotent — it only escalates grievances whose
    sla_deadline has passed and that haven't already been escalated
    past the current tier.
    """
    from backend.agent.nodes.router import escalate, ESCALATION_CHAIN

    try:
        supabase = _get_supabase()
        now = datetime.now(timezone.utc)

        # Find all grievances that have breached SLA
        result = (
            supabase.table("grievances")
            .select("grievance_id, department, severity, assigned_tier, assigned_queue, "
                    "sla_deadline, escalation_history, user_id")
            .eq("status", "HUMAN_HANDLING")
            .not_.is_("assigned_tier", "null")
            .not_.is_("sla_deadline", "null")
            .lt("sla_deadline", now.isoformat())
            .execute()
        )

        breached = result.data or []

        if not breached:
            return 0

        logger.info("[SLA] Found %d grievance(s) with SLA breach", len(breached))
        escalated_count = 0

        for grievance in breached:
            grievance_id = grievance["grievance_id"]
            current_tier = grievance["assigned_tier"]
            department = grievance["department"]
            severity = grievance["severity"]
            user_id = grievance.get("user_id")
            history = grievance.get("escalation_history") or []

            # Skip if already at HEAD (no further escalation possible)
            if current_tier == "HEAD":
                logger.info("[SLA] %s already at HEAD — no further escalation", grievance_id[:8])
                continue

            # Skip if current_tier is not in escalation chain
            if current_tier not in ESCALATION_CHAIN:
                logger.warning("[SLA] %s has unknown tier '%s' — skipping", grievance_id[:8], current_tier)
                continue

            # Escalate
            route_update = escalate(current_tier, department)
            if route_update is None:
                continue

            next_tier = route_update["assigned_tier"]

            # Idempotency check: don't re-escalate if we already recorded this transition
            last_escalation = history[-1] if history else None
            if last_escalation and last_escalation.get("to_tier") == next_tier:
                logger.info("[SLA] %s already escalated to %s — skipping duplicate",
                            grievance_id[:8], next_tier)
                continue

            # Record escalation event with clear automated reason and notes
            escalation_event = {
                "from_tier": current_tier,
                "to_tier": next_tier,
                "tier": "System",
                "handler": "SLA Monitor (Automated)",
                "action": f"Auto-escalated from {current_tier} to {next_tier}",
                "reason": "SLA_BREACH",
                "notes": f"SLA deadline expired without resolution. Automatically escalated to {next_tier} queue ({route_update['sla_hours']}h SLA).",
                "escalated_at": now.isoformat(),
                "timestamp": now.isoformat(),
            }
            history.append(escalation_event)

            # Update grievance
            update_data = {
                "assigned_tier": route_update["assigned_tier"],
                "assigned_queue": route_update["assigned_queue"],
                "sla_hours": route_update["sla_hours"],
                "sla_deadline": route_update["sla_deadline"].isoformat(),
                "escalation_history": history,
                "updated_at": now.isoformat(),
            }

            supabase.table("grievances").update(update_data).eq(
                "grievance_id", grievance_id
            ).execute()

            logger.info(
                "[SLA] Escalated %s: %s → %s (new SLA: %dh)",
                grievance_id[:8], current_tier, next_tier, route_update["sla_hours"],
            )

            # Create notifications
            _send_escalation_notifications(
                grievance_id, department, severity,
                current_tier, next_tier, user_id,
            )

            escalated_count += 1

        if escalated_count > 0:
            logger.info("[SLA] Escalated %d grievance(s) this cycle", escalated_count)

        return escalated_count

    except Exception as e:
        logger.error("[SLA] Monitor check failed: %s", e, exc_info=True)
        return 0


def _send_escalation_notifications(
    grievance_id: str,
    department: str,
    severity: str,
    from_tier: str,
    to_tier: str,
    user_id: str | None,
):
    """Send in-app notifications for SLA escalation."""
    try:
        from backend.utils.notification_service import (
            notify_user_escalated,
            notify_admins_escalated,
        )

        # Notify department admins
        notify_admins_escalated(department, grievance_id, from_tier, to_tier)

        # Notify user (if known)
        if user_id:
            notify_user_escalated(user_id, grievance_id, from_tier, to_tier)

    except Exception as e:
        logger.error("[SLA] Failed to send escalation notifications: %s", e)


# ── Resolution SLA (GRM framework §7) ────────────────────────────────

_OPEN_TICKET_FIELDS = (
    "grievance_id, department, category, severity, status, assigned_tier, user_id, created_at, "
    "escalation_history, acknowledged_at, resolve_by, final_resolve_by, resolved_at, "
    "resolution_breached, final_breached, sla_rule_snapshot, sla_alerts_sent"
)
_DONE = ["Resolved", "Rejected", "Closed", "CHATBOT_HANDLING"]


def _fmt_ist(value) -> str:
    from backend.sla.calendar import to_ist
    from backend.sla.engine import parse_ts
    dt = parse_ts(value)
    return to_ist(dt).strftime("%d %b %Y") if dt else "—"


def _super_admin_ids(supabase) -> list[str]:
    try:
        res = supabase.table("users").select("user_id").eq("role", "super_admin").execute()
        return [r["user_id"] for r in res.data or []]
    except Exception as e:
        logger.error("[SLA] Could not load super admins: %s", e)
        return []


def _notify(user_ids, grievance_id: str, notification_type: str, message: str):
    from backend.utils.notification_service import create_notification
    for uid in dict.fromkeys(user_ids):
        create_notification(uid, grievance_id, notification_type, message)


def backfill_resolution_sla(supabase, now: datetime) -> int:
    """Stamp deadlines on open human-handled tickets filed before migration 020.
    Alerts already in the past are recorded as sent, so nobody is spammed."""
    from backend.sla.engine import backfill_fields
    from backend.sla.store import resolve_rule, load_holidays

    res = (
        supabase.table("grievances").select(_OPEN_TICKET_FIELDS)
        .is_("resolve_by", "null")
        .not_.is_("assigned_tier", "null")
        .not_.in_("status", _DONE)
        .limit(200)
        .execute()
    )
    rows = res.data or []
    holidays = load_holidays(supabase)
    for g in rows:
        rule = resolve_rule(supabase, g.get("department"), g.get("category"), g.get("severity"))
        if rule is None:
            return 0
        fields = backfill_fields(g, rule, holidays, now)
        fields["acknowledged_at"] = g.get("created_at")
        supabase.table("grievances").update(fields).eq("grievance_id", g["grievance_id"]) \
            .is_("resolve_by", "null").execute()
    if rows:
        logger.info("[SLA] Backfilled resolution deadlines on %d open ticket(s)", len(rows))
    return len(rows)


def check_resolution_sla() -> int:
    """Send resolution reminders and handle breaches. Each alert key fires once per ticket.

      resolve_<pct>   reminder to the current level (and HEAD from 75%)
      resolve_breach  not resolved within the rule's days → escalated case: move to HEAD,
                      now measured against final_resolve_by (45 working days)
      final_75        HEAD warned that the escalated-case ceiling is close
      final_breach    45 working days exceeded → HEAD and super admins alerted
    """
    from backend.sla.engine import due_alerts
    from backend.sla.store import load_policies
    from backend.utils.notification_service import _get_department_admin_ids

    try:
        supabase = _get_supabase()
        if load_policies(supabase) is None:
            return 0  # migration 020 not applied
        now = datetime.now(timezone.utc)
        backfill_resolution_sla(supabase, now)

        res = (
            supabase.table("grievances").select(_OPEN_TICKET_FIELDS)
            .is_("resolved_at", "null")
            .not_.is_("resolve_by", "null")
            .not_.in_("status", _DONE)
            .execute()
        )
        handled = 0
        for g in res.data or []:
            keys = due_alerts(g, now)
            if not keys:
                continue
            gid = g["grievance_id"]
            sent = list(g.get("sla_alerts_sent") or []) + keys
            update = {"sla_alerts_sent": sent}

            dept = g.get("department") or g.get("category") or ""
            tier = g.get("assigned_tier") or "L1"
            short = f"GR-{gid[:8]}"
            resolve_by = _fmt_ist(g.get("resolve_by"))
            final_by = _fmt_ist(g.get("final_resolve_by"))
            days = (g.get("sla_rule_snapshot") or {}).get("resolution_days")
            actions = []

            if "resolve_breach" in keys:
                update["resolution_breached"] = True
                if tier != "HEAD":
                    from backend.agent.nodes.router import TIER_SLA_HOURS, build_queue_name
                    from datetime import timedelta
                    history = list(g.get("escalation_history") or [])
                    history.append({
                        "from_tier": tier,
                        "to_tier": "HEAD",
                        "tier": "System",
                        "handler": "SLA Monitor (Automated)",
                        "action": f"Escalated from {tier} to HEAD: resolution deadline missed",
                        "reason": "RESOLUTION_SLA_BREACH",
                        "notes": (f"Not resolved by {resolve_by}"
                                  + (f" ({days}-day resolution SLA)" if days else "")
                                  + f". Escalated case must be closed by {final_by} "
                                    "(45 working days from acknowledgement)."),
                        "escalated_at": now.isoformat(),
                        "timestamp": now.isoformat(),
                    })
                    update.update({
                        "assigned_tier": "HEAD",
                        "assigned_queue": build_queue_name(dept, "HEAD"),
                        "sla_hours": TIER_SLA_HOURS["HEAD"],
                        "sla_deadline": (now + timedelta(hours=TIER_SLA_HOURS["HEAD"])).isoformat(),
                        "escalation_history": history,
                    })
                actions.append(lambda: _notify(
                    _get_department_admin_ids(dept, "HEAD"), gid, "SLA_BREACHED",
                    f"{short} missed its resolution deadline ({resolve_by}) and is now an escalated "
                    f"case with HEAD. It must be closed by {final_by}."))
                if g.get("user_id"):
                    actions.append(lambda: _notify(
                        [g["user_id"]], gid, "ESCALATED",
                        f"Your grievance {short} has been escalated to the Department Head. "
                        f"Expected resolution by {final_by}."))
            elif any(k.startswith("resolve_") for k in keys):
                pct = max(int(k.split("_")[1]) for k in keys if k.startswith("resolve_"))
                target = _get_department_admin_ids(dept, tier)
                if pct >= 75:
                    target += _get_department_admin_ids(dept, "HEAD")
                actions.append(lambda: _notify(
                    target, gid, "SLA_REMINDER",
                    f"{short}: {pct}% of the resolution time used. Resolve by {resolve_by}."))

            if "final_breach" in keys:
                update["final_breached"] = True
                actions.append(lambda: _notify(
                    _get_department_admin_ids(dept, "HEAD") + _super_admin_ids(supabase), gid,
                    "SLA_BREACHED",
                    f"{short} has exceeded the 45-working-day limit for escalated cases "
                    f"(due {final_by}). Record the reason for the delay."))
            elif "final_75" in keys:
                actions.append(lambda: _notify(
                    _get_department_admin_ids(dept, "HEAD"), gid, "SLA_REMINDER",
                    f"{short}: escalated case must be closed by {final_by} (75% of the "
                    "45-working-day limit used)."))

            # Claim the alerts first so a second worker (or a retry) never sends them twice.
            claimed = (
                supabase.table("grievances").update(update)
                .eq("grievance_id", gid)
                .not_.contains("sla_alerts_sent", json.dumps([keys[-1]]))
                .execute()
            )
            if not claimed.data:
                continue
            for act in actions:
                try:
                    act()
                except Exception as e:
                    logger.error("[SLA] Notification failed for %s: %s", gid[:8], e)
            logger.info("[SLA] %s resolution alerts: %s", gid[:8], ", ".join(keys))
            handled += 1
        return handled
    except Exception as e:
        logger.error("[SLA] Resolution check failed: %s", e, exc_info=True)
        return 0


async def sla_monitor_loop():
    """
    Async background loop that periodically checks for SLA breaches.

    Run this as a FastAPI startup task:
        asyncio.create_task(sla_monitor_loop())
    """
    logger.info("[SLA] Monitor started — checking every %ds", CHECK_INTERVAL_SECONDS)

    # First pass shortly after startup so deadlines (and the backfill of older tickets)
    # appear straight away instead of after the first full interval.
    delay = 15
    while True:
        try:
            await asyncio.sleep(delay)
            delay = CHECK_INTERVAL_SECONDS
            await asyncio.to_thread(check_and_escalate)
            await asyncio.to_thread(check_resolution_sla)
        except asyncio.CancelledError:
            logger.info("[SLA] Monitor stopped")
            break
        except Exception as e:
            logger.error("[SLA] Monitor loop error: %s", e)
            await asyncio.sleep(60)  # Back off on error
