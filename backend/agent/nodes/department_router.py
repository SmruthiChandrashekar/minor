"""
department_router.py — Department routing node.

This is a SINGLE reusable function used by all 6 department nodes in the graph.
When a high-severity query is routed to a department, this node:
1. Creates a grievance record in Supabase
2. Assigns an admin from that department
3. Triggers escalation notifications (email/SMS)
4. Generates a confirmation response

Adding a new department requires only:
  - Adding it to DEPARTMENTS in config/categories.py
  - Adding one node + edge in graph.py
"""

import os
import logging
from datetime import datetime
from backend.agent.state import GrievanceState

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


def _create_grievance(supabase, user_message: str, department: str, admin: dict | None) -> str | None:
    """
    Insert a grievance record into Supabase and return the grievance_id.
    """
    try:
        grievance_data = {
            "description": user_message,
            "category": department,
            "department": department,
            "severity": "High",
            "status": "Investigating" if admin else "Open",
            "assigned_to": admin["user_id"] if admin else None,
            "is_anonymous": True,  # Chat-based submission — no user metadata
        }

        result = supabase.table("grievances").insert(grievance_data).execute()

        if result.data:
            grievance_id = result.data[0].get("grievance_id", "")
            logger.info("Created grievance %s → department=%s", grievance_id, department)
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


def department_route_node(state: GrievanceState) -> dict:
    """
    Route the high-severity query to its classified department.

    This function:
    1. Creates a grievance record in the database
    2. Assigns an admin from the target department
    3. Sends notifications to the admin
    4. Returns a confirmation response

    Used by all 6 department nodes (dept_hr, dept_ic, dept_crm, etc.).
    """
    department = state.get("department", "CRM")
    department_reason = state.get("department_reason", "")
    user_message = state.get("user_message", "")
    severity_reason = state.get("severity_reason", "")

    grievance_id = None
    assigned_to_name = None

    try:
        supabase = _get_supabase()

        # Find admin for the department
        admin = _find_admin(supabase, department)
        assigned_to_name = admin["name"] if admin else None

        # Create grievance record
        grievance_id = _create_grievance(supabase, user_message, department, admin)

        # Send notifications
        if admin and grievance_id:
            _send_notifications(admin, department, user_message, grievance_id)

    except Exception as e:
        logger.error("Department routing failed: %s", e)

    # Build response
    response_parts = [
        f"Your issue has been classified as **high severity** and has been routed to the **{department}** department.",
    ]

    if grievance_id:
        response_parts.append(f"\n📋 **Tracking ID**: {grievance_id}")

    if assigned_to_name:
        response_parts.append(f"👤 **Assigned to**: {assigned_to_name}")

    response_parts.append(
        "\nA representative from the department will review your concern and follow up with you. "
        "You can track the status of your issue using the tracking ID above."
    )

    response = "\n".join(response_parts)

    logger.info(
        "═══ DEPARTMENT ROUTING ═══\n"
        "  Department: %s\n"
        "  Grievance ID: %s\n"
        "  Assigned To: %s\n"
        "  Reason: %s",
        department,
        grievance_id or "N/A",
        assigned_to_name or "Unassigned",
        department_reason,
    )

    return {
        "response": response,
        "routed": True,
        "grievance_id": grievance_id or "",
        "assigned_to": assigned_to_name or "",
    }
