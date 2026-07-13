"""
Notifier Service — Handles Email and SMS dispatch for the Escalation Agent.

Supports:
  - SMTP Email (via environment variables)
  - Twilio SMS (via environment variables)
  - Extensible for future channels (Slack, WhatsApp, etc.)

If credentials are not configured, notifications are logged to console
(simulation mode) so the system never crashes in development.
"""

import os
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

logger = logging.getLogger("escalation.notifier")


class Notifier:
    """
    Production-grade notification dispatcher.
    Each send method is self-contained with error handling —
    a failure in one channel never affects another.
    """

    def __init__(self):
        # ── Email Configuration (SMTP) ───────────────────────────────────
        self.smtp_host = os.environ.get("SMTP_HOST", "")
        self.smtp_port = int(os.environ.get("SMTP_PORT", "587"))
        self.smtp_user = os.environ.get("SMTP_USER", "")
        self.smtp_password = os.environ.get("SMTP_PASSWORD", "")
        self.smtp_from = os.environ.get("SMTP_FROM", self.smtp_user)

        # ── SMS Configuration (Twilio) ───────────────────────────────────
        self.twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        self.twilio_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
        self.twilio_from = os.environ.get("TWILIO_FROM_NUMBER", "")

    # ─────────────────────────────────────────────────────────────────────
    # EMAIL
    # ─────────────────────────────────────────────────────────────────────
    def send_email(self, recipient: str, subject: str, body: str) -> bool:
        """
        Send an email notification via SMTP.
        Falls back to console logging if SMTP is not configured.

        Returns True on success, False on failure. Never raises.
        """
        if not recipient:
            logger.warning("[EMAIL] No recipient address provided — skipping.")
            return False

        # ── Real SMTP dispatch ───────────────────────────────────────────
        if self.smtp_host and self.smtp_user and self.smtp_password:
            try:
                msg = MIMEMultipart()
                msg["From"] = self.smtp_from
                msg["To"] = recipient
                msg["Subject"] = subject
                msg.attach(MIMEText(body, "plain"))

                with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                    server.starttls()
                    server.login(self.smtp_user, self.smtp_password)
                    server.send_message(msg)

                logger.info(f"[EMAIL SENT] To: {recipient} | Subject: {subject}")
                return True

            except Exception as e:
                logger.error(f"[EMAIL FAILED] To: {recipient} | Error: {e}")
                return False

        # ── Simulation mode (no SMTP configured) ────────────────────────
        logger.info(
            f"[EMAIL SIMULATED] To: {recipient} | Subject: {subject} | "
            f"Time: {datetime.now().isoformat()}"
        )
        logger.debug(f"[EMAIL BODY] {body}")
        return True

    # ─────────────────────────────────────────────────────────────────────
    # SMS
    # ─────────────────────────────────────────────────────────────────────
    def send_sms(self, phone_number: str, message: str) -> bool:
        """
        Send an SMS notification via Twilio.
        Falls back to console logging if Twilio is not configured.

        Returns True on success, False on failure. Never raises.
        """
        if not phone_number:
            logger.warning("[SMS] No phone number provided — skipping.")
            return False

        # ── Real Twilio dispatch ─────────────────────────────────────────
        if self.twilio_sid and self.twilio_token and self.twilio_from:
            try:
                from twilio.rest import Client

                client = Client(self.twilio_sid, self.twilio_token)
                sms = client.messages.create(
                    body=message,
                    from_=self.twilio_from,
                    to=phone_number,
                )

                logger.info(
                    f"[SMS SENT] To: {phone_number} | SID: {sms.sid}"
                )
                return True

            except Exception as e:
                logger.error(f"[SMS FAILED] To: {phone_number} | Error: {e}")
                return False

        # ── Simulation mode (no Twilio configured) ──────────────────────
        logger.info(
            f"[SMS SIMULATED] To: {phone_number} | "
            f"Time: {datetime.now().isoformat()}"
        )
        logger.debug(f"[SMS BODY] {message}")
        return True
