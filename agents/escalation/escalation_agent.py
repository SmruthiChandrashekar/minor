"""
Escalation Agent — Determines and executes escalation actions based on severity.

Pipeline position:
    Complaint → Classification → Severity → **Escalation Agent** → Notifications

Behavior:
    - Low / Medium / Policy → No action
    - High               → Email notification to department admin
    - Critical           → Email + SMS notification to department admin

All admin contact details are fetched dynamically from the database.
No contact information is hardcoded anywhere.
"""

import os
import logging
import asyncio
from datetime import datetime
from supabase import create_client, Client
from .notifier import Notifier

logger = logging.getLogger("escalation.agent")


class EscalationAgent:
    """
    Production-grade escalation agent.

    Usage (sync):
        agent = EscalationAgent()
        result = agent.process(complaint="...", category="HR", severity="Critical")

    Usage (async — non-blocking):
        asyncio.create_task(agent.process_async(complaint="...", category="HR", severity="Critical"))
    """

    def __init__(self):
        self.notifier = Notifier()

        # Initialize Supabase client for dynamic admin lookups
        SUPABASE_URL = os.environ["SUPABASE_URL"]
        SUPABASE_KEY = os.environ["SUPABASE_KEY"]
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("[ESCALATION] Agent initialized successfully.")

    # ─────────────────────────────────────────────────────────────────────
    # DB ACCESS — Dynamic admin contact fetch
    # ─────────────────────────────────────────────────────────────────────
    def get_admin_by_category(self, category: str) -> dict | None:
        """
        Fetch admin contact details (email, phone) from the database
        for the given complaint category/department.

        Fallback chain:
            1. All admins matching the exact department
            2. All admins in the "Compliance" department (catch-all)
            3. Empty list (no admins found → skip notifications)

        Returns: list of {"email": "...", "phone": "...", "name": "..."} or []
        """
        try:
            # Primary lookup — exact department match
            response = (
                self.supabase.table("users")
                .select("name, email, phone")
                .eq("role", "admin")
                .eq("department", category)
                .execute()
            )
            if response.data:
                names = [a.get('name', 'Unknown') for a in response.data]
                logger.info(
                    f"[ESCALATION] Found {len(response.data)} admin(s) for {category}: {', '.join(names)}"
                )
                return response.data

            # Fallback — Compliance department
            fallback = (
                self.supabase.table("users")
                .select("name, email, phone")
                .eq("role", "admin")
                .eq("department", "Compliance")
                .execute()
            )
            if fallback.data:
                names = [a.get('name', 'Unknown') for a in fallback.data]
                logger.warning(
                    f"[ESCALATION] No admin for {category}. "
                    f"Falling back to {len(fallback.data)} Compliance admin(s): {', '.join(names)}"
                )
                return fallback.data

            logger.error(
                f"[ESCALATION] No admin found for category={category} "
                f"and no Compliance fallback exists. Skipping notifications."
            )
            return []

        except Exception as e:
            logger.error(f"[ESCALATION] DB fetch failed for category={category}: {e}")
            return []

    # ─────────────────────────────────────────────────────────────────────
    # CORE PROCESSING (sync)
    # ─────────────────────────────────────────────────────────────────────
    def process(self, complaint: str, category: str, severity: str, metadata: dict = None) -> dict:
        """
        Evaluate the severity and trigger appropriate escalation actions.

        Args:
            complaint:  The complaint text (used in notification body)
            category:   Classification label (e.g., "HR", "Safety", "POSH")
            severity:   Severity level from the model ("Low", "Medium", "High", "Critical")

        Returns:
            dict with escalation metadata:
                {
                    "severity": "...",
                    "category": "...",
                    "actions_triggered": ["email", "sms"],
                    "admin_notified": "admin_name or None",
                    "timestamp": "..."
                }
        """
        severity_lower = severity.lower()
        actions_triggered = []
        admin_notified = None

        # ── LOW / MEDIUM / POLICY → No escalation ───────────────────────
        if severity_lower in ("low", "medium", "policy"):
            logger.info(
                f"[ESCALATION] category={category} severity={severity} → no action required"
            )
            return {
                "severity": severity,
                "category": category,
                "actions_triggered": [],
                "admin_notified": None,
                "timestamp": datetime.now().isoformat(),
            }

        # ── HIGH / CRITICAL → Fetch ALL admins and notify each ───────────
        admins = self.get_admin_by_category(category)

        if not admins:
            logger.error(
                f"[ESCALATION] category={category} severity={severity} → "
                f"CANNOT escalate — no admin contacts found in DB"
            )
            return {
                "severity": severity,
                "category": category,
                "actions_triggered": [],
                "admins_notified": [],
                "error": "No admin contacts found in database",
                "timestamp": datetime.now().isoformat(),
            }

        admins_notified = []

        for admin in admins:
            admin_email = admin.get("email")
            admin_phone = admin.get("phone")
            admin_name = admin.get("name", "Unknown")

            # ── HIGH → Email only ────────────────────────────────────────
            if severity_lower == "high":
                email_ok = self.notifier.send_email(
                    recipient=admin_email,
                    subject=f"[HIGH ALERT] New {category} Grievance Requires Attention",
                    body=self._format_message(complaint, category, severity, admin_name, metadata),
                )
                if email_ok:
                    if "email" not in actions_triggered:
                        actions_triggered.append("email")
                    admins_notified.append(admin_name)

            # ── CRITICAL → Email + SMS ───────────────────────────────────
            elif severity_lower == "critical":
                email_ok = self.notifier.send_email(
                    recipient=admin_email,
                    subject=f"[CRITICAL ALERT] Urgent {category} Grievance",
                    body=self._format_message(complaint, category, severity, admin_name, metadata),
                )
                if email_ok:
                    if "email" not in actions_triggered:
                        actions_triggered.append("email")

                is_anon = metadata.get("is_anonymous", False) if metadata else False
                submitter_label = "Anonymous" if is_anon else (metadata.get("name") if metadata and metadata.get("name") else "Unknown")
                
                sms_ok = self.notifier.send_sms(
                    phone_number=admin_phone,
                    message=(
                        f"GRM Update: A new {category} record was submitted by {submitter_label}. Please review."
                    ),
                )
                if sms_ok:
                    if "sms" not in actions_triggered:
                        actions_triggered.append("sms")

                admins_notified.append(admin_name)

        logger.info(
            f"[ESCALATION] category={category} severity={severity} → "
            f"{' + '.join(actions_triggered)} triggered for {len(admins_notified)} admin(s): "
            f"{', '.join(admins_notified)}"
        )

        return {
            "severity": severity,
            "category": category,
            "actions_triggered": actions_triggered,
            "admins_notified": admins_notified,
            "timestamp": datetime.now().isoformat(),
        }

    # ─────────────────────────────────────────────────────────────────────
    # ASYNC WRAPPER (for non-blocking pipeline integration)
    # ─────────────────────────────────────────────────────────────────────
    async def process_async(self, complaint: str, category: str, severity: str, metadata: dict = None) -> dict:
        """
        Async wrapper around process(). Runs the sync DB/SMTP calls
        in a thread executor so it never blocks the event loop.

        Usage:
            asyncio.create_task(agent.process_async(...))
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.process, complaint, category, severity, metadata
        )

    # ─────────────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────────────
    @staticmethod
    def _format_message(
        complaint: str, category: str, severity: str, admin_name: str, metadata: dict = None
    ) -> str:
        """Format the email body for escalation notifications."""
        
        meta_section = ""
        if metadata:
            is_anon = metadata.get("is_anonymous", False)
            submitter_name = "Anonymous" if is_anon else metadata.get("name", "Unknown")
            contact_phone = "Hidden (Anonymous)" if is_anon else metadata.get("phone", "N/A")
            contact_email = "Hidden (Anonymous)" if is_anon else metadata.get("email", "N/A")
            location = metadata.get("location", "Unknown")
            incident_date = metadata.get("date", "Unknown")
            
            meta_section = (
                f"─── Metadata ───\n"
                f"Submitter: {submitter_name}\n"
                f"Phone: {contact_phone}\n"
                f"Email: {contact_email}\n"
                f"Location: {location}\n"
                f"Incident Date: {incident_date}\n"
                f"────────────────\n\n"
            )
            
        return (
            f"Dear {admin_name},\n\n"
            f"A new {severity.upper()} severity grievance has been filed "
            f"in the {category} department and requires your immediate attention.\n\n"
            f"{meta_section}"
            f"─── Complaint Details ───\n"
            f"{complaint}\n"
            f"─────────────────────────\n\n"
            f"Category: {category}\n"
            f"Severity: {severity}\n"
            f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            f"Please log in to the Admin Dashboard to review and take action.\n\n"
            f"— Puravankara GRM Escalation System"
        )
