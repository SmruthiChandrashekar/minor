"""
notification_service.py — Centralized in-app notification service.

Creates persistent notification records in the Supabase `notifications` table.
Supports all grievance lifecycle events and targets both users and department admins.

Notification types:
    GRIEVANCE_RECEIVED
    GRIEVANCE_ROUTED
    CHATBOT_HANDOFF
    TIER_ASSIGNED
    SLA_BREACHED
    ESCALATED
    RESOLVED
    REOPENED
"""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def _get_supabase():
    """Get Supabase client."""
    import os
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("Missing Supabase environment variables")
    return create_client(url, key)


def create_notification(
    user_id: str,
    ticket_id: str | None,
    notification_type: str,
    message: str,
) -> bool:
    """
    Create a single notification record.

    Args:
        user_id:           Target user UUID (user or admin).
        ticket_id:         Associated grievance UUID (can be None).
        notification_type: One of the supported notification types.
        message:           Human-readable notification message.

    Returns:
        True on success, False on failure.
    """
    try:
        supabase = _get_supabase()
        data = {
            "user_id": user_id,
            "ticket_id": ticket_id,
            "type": notification_type,
            "message": message,
            "is_read": False,
        }
        supabase.table("notifications").insert(data).execute()
        logger.info(
            "[NOTIFICATION] Created: type=%s user=%s ticket=%s",
            notification_type, user_id[:8] if user_id else "N/A",
            ticket_id[:8] if ticket_id else "N/A",
        )
        return True
    except Exception as e:
        logger.error("[NOTIFICATION] Failed to create: %s", e)
        return False


def notify_user_grievance_received(user_id: str, grievance_id: str):
    """Notify user that their grievance has been received."""
    create_notification(
        user_id=user_id,
        ticket_id=grievance_id,
        notification_type="GRIEVANCE_RECEIVED",
        message=f"Your grievance GR-{grievance_id[:8]} has been received successfully.",
    )


def notify_user_tier_assigned(user_id: str, grievance_id: str, tier: str):
    """Notify user that their grievance has been assigned to a human tier."""
    create_notification(
        user_id=user_id,
        ticket_id=grievance_id,
        notification_type="TIER_ASSIGNED",
        message=f"Your grievance GR-{grievance_id[:8]} has been assigned to {tier} for further assistance.",
    )


def notify_user_chatbot_handoff(user_id: str, grievance_id: str):
    """Notify user that their LOW grievance is being handed off to human support."""
    create_notification(
        user_id=user_id,
        ticket_id=grievance_id,
        notification_type="CHATBOT_HANDOFF",
        message=f"Your grievance GR-{grievance_id[:8]} requires human assistance and has been forwarded to the support team.",
    )


def notify_user_escalated(user_id: str, grievance_id: str, from_tier: str, to_tier: str):
    """Notify user that their grievance has been escalated."""
    create_notification(
        user_id=user_id,
        ticket_id=grievance_id,
        notification_type="ESCALATED",
        message=f"Your grievance GR-{grievance_id[:8]} has been escalated from {from_tier} to {to_tier} for further attention.",
    )


def notify_user_resolved(user_id: str, grievance_id: str):
    """Notify user that their grievance has been resolved."""
    create_notification(
        user_id=user_id,
        ticket_id=grievance_id,
        notification_type="RESOLVED",
        message=f"Your grievance GR-{grievance_id[:8]} has been resolved.",
    )


def notify_user_reopened(user_id: str, grievance_id: str):
    """Notify user that their grievance has been reopened."""
    create_notification(
        user_id=user_id,
        ticket_id=grievance_id,
        notification_type="REOPENED",
        message=f"Your grievance GR-{grievance_id[:8]} has been reopened and is being reviewed.",
    )


def notify_user_status_changed(user_id: str, grievance_id: str, status: str, reason: str = ""):
    """Notify user of any general status update with the admin's remarks/reason."""
    short_reason = f": {reason[:120]}..." if len(reason) > 120 else (f": {reason}" if reason else ".")
    create_notification(
        user_id=user_id,
        ticket_id=grievance_id,
        notification_type="STATUS_UPDATED",
        message=f"Your grievance GR-{grievance_id[:8]} status has been updated to '{status}'{short_reason}",
    )


# ── Admin Notifications ──────────────────────────────────────────────

def _get_department_admin_ids(department: str, target_tier: str = None) -> list[str]:
    """
    Get admin user IDs for a given department.
    If target_tier is specified (e.g. 'L1', 'L2', 'L3', 'HEAD'), returns:
      - Admins assigned to that specific tier
      - Department Heads (admin_tier == 'HEAD')
      - General department admins (admin_tier is None)
    If target_tier is None, returns all admins for the department.
    """
    try:
        supabase = _get_supabase()
        result = (
            supabase.table("users")
            .select("user_id, admin_tier")
            .eq("role", "admin")
            .eq("department", department)
            .execute()
        )
        admins = result.data or []
        if not target_tier:
            return [row["user_id"] for row in admins]

        tier_upper = target_tier.upper()
        matching_ids = []
        for r in admins:
            a_tier = r.get("admin_tier")
            # Tier match, department head, or general department admin
            if not a_tier or a_tier == "HEAD" or a_tier == tier_upper:
                matching_ids.append(r["user_id"])

        return matching_ids
    except Exception as e:
        logger.error("[NOTIFICATION] Failed to fetch admins for %s: %s", department, e)
        return []


def notify_admins_grievance_received(department: str, grievance_id: str):
    """Notify department admins of a new grievance."""
    admin_ids = _get_department_admin_ids(department)
    for admin_id in admin_ids:
        create_notification(
            user_id=admin_id,
            ticket_id=grievance_id,
            notification_type="GRIEVANCE_RECEIVED",
            message=f"New grievance GR-{grievance_id[:8]} has been received in the {department} department.",
        )


def notify_admins_tier_assigned(department: str, grievance_id: str, severity: str, tier: str):
    """Notify department admins that a grievance has been assigned to a tier."""
    admin_ids = _get_department_admin_ids(department, target_tier=tier)
    for admin_id in admin_ids:
        create_notification(
            user_id=admin_id,
            ticket_id=grievance_id,
            notification_type="TIER_ASSIGNED",
            message=f"{severity}-severity grievance GR-{grievance_id[:8]} has been assigned to {department} {tier}.",
        )


def notify_admins_chatbot_handoff(department: str, grievance_id: str):
    """Notify department admins of a chatbot → L1 handoff."""
    admin_ids = _get_department_admin_ids(department, target_tier="L1")
    for admin_id in admin_ids:
        create_notification(
            user_id=admin_id,
            ticket_id=grievance_id,
            notification_type="CHATBOT_HANDOFF",
            message=f"Grievance GR-{grievance_id[:8]} has been handed off from chatbot to {department} L1.",
        )


def notify_admins_escalated(department: str, grievance_id: str, from_tier: str, to_tier: str):
    """Notify department admins that a grievance has been escalated due to SLA breach."""
    admin_ids = _get_department_admin_ids(department, target_tier=to_tier)
    for admin_id in admin_ids:
        create_notification(
            user_id=admin_id,
            ticket_id=grievance_id,
            notification_type="ESCALATED",
            message=f"Grievance GR-{grievance_id[:8]} has escalated from {from_tier} to {to_tier} due to SLA breach.",
        )


def notify_admins_resolved(department: str, grievance_id: str):
    """Notify department admins that a grievance has been resolved."""
    admin_ids = _get_department_admin_ids(department)
    for admin_id in admin_ids:
        create_notification(
            user_id=admin_id,
            ticket_id=grievance_id,
            notification_type="RESOLVED",
            message=f"Grievance GR-{grievance_id[:8]} has been marked as resolved.",
        )
