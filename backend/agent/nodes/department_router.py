"""
department_router.py — Department routing node.

This is a SINGLE reusable function used by all 6 department nodes in the graph.
When a MEDIUM/HIGH severity query is routed to a department, this node:
1. Determines the initial tier/SLA using the deterministic router
2. Creates a grievance record in Supabase with tier/SLA fields
3. Assigns an admin from that department
4. Creates in-app notifications for user and admin
5. Triggers escalation notifications (email/SMS) for HIGH severity
6. Generates a confirmation response

Adding a new department requires only:
  - Adding it to DEPARTMENTS in config/categories.py
  - Adding one node + edge in graph.py
"""

import os
import logging
from datetime import datetime
from backend.agent.state import GrievanceState
from backend.agent.nodes.router import determine_initial_route

logger = logging.getLogger(__name__)


def _get_supabase():
    """Get Supabase client."""
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("Missing Supabase environment variables")
    return create_client(url, key)


def _find_admin(supabase, department: str) -> dict | None:
    """
    Find an admin for the given department.

    Fallback chain:
    1. Admin matching the exact department
    2. Admin in "Compliance" department
    3. None
    """
    try:
        # Primary lookup
        result = (
            supabase.table("users")
            .select("user_id, name, email, phone")
            .eq("role", "admin")
            .eq("department", department)
            .execute()
        )
        if result.data:
            return result.data[0]

        # Fallback to Compliance
        fallback = (
            supabase.table("users")
            .select("user_id, name, email, phone")
            .eq("role", "admin")
            .eq("department", "Compliance")
            .execute()
        )
        if fallback.data:
            logger.warning("No admin for %s, falling back to Compliance", department)
            return fallback.data[0]

        logger.warning("No admin found for department %s or Compliance", department)
        return None
    except Exception as e:
        logger.error("Admin lookup failed for %s: %s", department, e)
        return None


def _create_grievance(supabase, user_message: str, department: str, severity: str,
                      admin: dict | None, route_info: dict) -> str | None:
    """
    Insert a grievance record into Supabase with tier/SLA fields and return the grievance_id.
    """
    try:
        grievance_data = {
            "description": user_message,
            "category": department,
            "department": department,
            "severity": severity.capitalize(),  # Store as 'Low', 'Medium', 'High' for DB constraint
            "status": route_info["status"],
            "assigned_to": admin["user_id"] if admin else None,
            "is_anonymous": True,  # Chat-based submission — no user metadata
            "initial_handler": route_info["initial_handler"],
            "assigned_tier": route_info["assigned_tier"],
            "assigned_queue": route_info["assigned_queue"],
            "sla_hours": route_info["sla_hours"],
            "sla_deadline": route_info["sla_deadline"].isoformat() if route_info["sla_deadline"] else None,
            "escalation_history": [],
        }

        result = supabase.table("grievances").insert(grievance_data).execute()

        if result.data:
            grievance_id = result.data[0].get("grievance_id", "")
            logger.info("Created grievance %s → department=%s tier=%s",
                        grievance_id, department, route_info["assigned_tier"])
            return grievance_id
        return None
    except Exception as e:
        logger.error("Failed to create grievance for %s: %s", department, e)
        return None


def _send_notifications(admin: dict, department: str, user_message: str, grievance_id: str):
    """
    Send email notification to the assigned admin (non-blocking, best-effort).
    """
    try:
        from agents.escalation.notifier import Notifier
        notifier = Notifier()

        admin_email = admin.get("email")
        admin_name = admin.get("name", "Admin")

        if admin_email:
            subject = f"[HIGH SEVERITY] New {department} Grievance — {grievance_id}"
            body = (
                f"Dear {admin_name},\n\n"
                f"A new HIGH severity grievance has been routed to the {department} department "
                f"and requires your attention.\n\n"
                f"─── Issue Details ───\n"
                f"{user_message}\n"
                f"─────────────────────\n\n"
                f"Grievance ID: {grievance_id}\n"
                f"Department: {department}\n"
                f"Severity: High\n"
                f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
                f"Please log in to the Admin Dashboard to review and take action.\n\n"
                f"— Puravankara GRM System"
            )
            notifier.send_email(admin_email, subject, body)
            logger.info("Notification sent to %s (%s)", admin_name, admin_email)
    except Exception as e:
        logger.error("Failed to send notification: %s", e)


def _create_in_app_notifications(grievance_id: str, department: str, severity: str, route_info: dict):
    """
    Create in-app notifications for department admins.
    """
    try:
        from backend.utils.notification_service import (
            notify_admins_grievance_received,
            notify_admins_tier_assigned,
        )
        notify_admins_grievance_received(department, grievance_id)
        if route_info["assigned_tier"]:
            notify_admins_tier_assigned(department, grievance_id, severity, route_info["assigned_tier"])
    except Exception as e:
        logger.error("Failed to create in-app notifications: %s", e)


def department_route_node(state: GrievanceState) -> dict:
    """
    Route the MEDIUM/HIGH severity query to its classified department.

    This function:
    1. Determines initial tier/SLA using the deterministic router
    2. Creates a grievance record in the database
    3. Assigns an admin from the target department
    4. Sends email notifications for HIGH severity
    5. Creates in-app notifications for admins
    6. Returns a confirmation response

    Used by all 6 department nodes (dept_hr, dept_ic, dept_crm, etc.).
    """
    department = state.get("department", "CRM")
    department_reason = state.get("department_reason", "")
    user_message = state.get("user_message", "")
    severity = state.get("severity", "HIGH")
    severity_reason = state.get("severity_reason", "")

    # Determine routing based on severity
    route_info = determine_initial_route(severity, department)

    grievance_id = None
    assigned_to_name = None

    try:
        supabase = _get_supabase()

        # Find admin for the department
        admin = _find_admin(supabase, department)
        assigned_to_name = admin["name"] if admin else None

        # Create grievance record with tier/SLA fields
        grievance_id = _create_grievance(supabase, user_message, department, severity, admin, route_info)

        # Send email notifications (HIGH severity only)
        if admin and grievance_id and severity.upper() == "HIGH":
            _send_notifications(admin, department, user_message, grievance_id)

        # Create in-app notifications
        if grievance_id:
            _create_in_app_notifications(grievance_id, department, severity, route_info)

    except Exception as e:
        logger.error("Department routing failed: %s", e)

    # Build response
    tier_label = route_info["assigned_tier"] or "support"
    response_parts = [
        f"Your issue has been classified as **{severity.upper()} severity** and has been routed to the **{department}** department.",
    ]

    if grievance_id:
        response_parts.append(f"\n📋 **Tracking ID**: {grievance_id}")

    if route_info["assigned_tier"]:
        response_parts.append(f"📊 **Assigned Tier**: {route_info['assigned_tier']}")

    if assigned_to_name:
        response_parts.append(f"👤 **Assigned to**: {assigned_to_name}")

    if route_info["sla_hours"]:
        response_parts.append(f"⏱️ **SLA**: {route_info['sla_hours']} hours")

    response_parts.append(
        "\nA representative from the department will review your concern and follow up with you. "
        "You can track the status of your issue using the tracking ID above."
    )

    response = "\n".join(response_parts)

    logger.info(
        "═══ DEPARTMENT ROUTING ═══\n"
        "  Department: %s\n"
        "  Severity: %s\n"
        "  Tier: %s\n"
        "  Queue: %s\n"
        "  SLA: %s hours\n"
        "  Grievance ID: %s\n"
        "  Assigned To: %s\n"
        "  Reason: %s",
        department,
        severity,
        route_info["assigned_tier"] or "N/A",
        route_info["assigned_queue"] or "N/A",
        route_info["sla_hours"] or "N/A",
        grievance_id or "N/A",
        assigned_to_name or "Unassigned",
        department_reason,
    )

    return {
        "response": response,
        "routed": True,
        "grievance_id": grievance_id or "",
        "assigned_to": assigned_to_name or "",
        "initial_handler": route_info["initial_handler"],
        "assigned_tier": route_info["assigned_tier"] or "",
        "assigned_queue": route_info["assigned_queue"] or "",
        "sla_hours": route_info["sla_hours"] or 0,
    }
