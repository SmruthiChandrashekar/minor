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
import logging
from datetime import datetime, timezone

logger = logging.getLogger("sla_monitor")

# How often to check for SLA breaches (in seconds)
CHECK_INTERVAL_SECONDS = 300  # 5 minutes


def _get_supabase():
    """Get Supabase client."""
    import os
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("Missing Supabase environment variables")
    return create_client(url, key)


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


async def sla_monitor_loop():
    """
    Async background loop that periodically checks for SLA breaches.

    Run this as a FastAPI startup task:
        asyncio.create_task(sla_monitor_loop())
    """
    logger.info("[SLA] Monitor started — checking every %ds", CHECK_INTERVAL_SECONDS)

    while True:
        try:
            await asyncio.sleep(CHECK_INTERVAL_SECONDS)
            await asyncio.to_thread(check_and_escalate)
        except asyncio.CancelledError:
            logger.info("[SLA] Monitor stopped")
            break
        except Exception as e:
            logger.error("[SLA] Monitor loop error: %s", e)
            await asyncio.sleep(60)  # Back off on error
