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

        # ── Email via Brevo HTTP API (preferred when set) ────────────────
        # Hosts like Render's free tier block outbound SMTP ports, but HTTPS works.
        # The sender address must be verified in Brevo (Senders & IP → Senders).
        self.brevo_api_key = os.environ.get("BREVO_API_KEY", "")
        self.email_from = os.environ.get("EMAIL_FROM", self.smtp_from)
        self.email_from_name = os.environ.get("EMAIL_FROM_NAME", "Puravankara GRM")

        # ── SMS Configuration (Twilio) ───────────────────────────────────
        self.twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        self.twilio_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
        self.twilio_from = os.environ.get("TWILIO_FROM_NUMBER", "")

    # ─────────────────────────────────────────────────────────────────────
    # EMAIL
    # ─────────────────────────────────────────────────────────────────────
    @property
    def email_configured(self) -> bool:
        """True when Brevo or SMTP is set up; otherwise send_email only logs (simulation mode)."""
        return bool((self.brevo_api_key and self.email_from)
                    or (self.smtp_host and self.smtp_user and self.smtp_password))

    def send_email(self, recipient: str, subject: str, body: str) -> bool:
        """
        Send an email notification via the Brevo API, or SMTP if Brevo isn't set.
        Falls back to console logging if neither is configured.

        Returns True on success, False on failure. Never raises.
        """
        if not recipient:
            logger.warning("[EMAIL] No recipient address provided — skipping.")
            return False

        # ── Brevo HTTP API dispatch ──────────────────────────────────────
        if self.brevo_api_key and self.email_from:
            try:
                import requests

                res = requests.post(
                    "https://api.brevo.com/v3/smtp/email",
                    headers={"api-key": self.brevo_api_key, "accept": "application/json"},
                    json={
                        "sender": {"email": self.email_from, "name": self.email_from_name},
                        "to": [{"email": recipient}],
                        "subject": subject,
                        "textContent": body,
                    },
                    timeout=20,
                )
                if res.status_code >= 300:
                    logger.error(f"[EMAIL FAILED] To: {recipient} | Brevo {res.status_code}: {res.text[:300]}")
                    return False
                logger.info(f"[EMAIL SENT] To: {recipient} | Subject: {subject} (Brevo)")
                return True
            except Exception as e:
                logger.error(f"[EMAIL FAILED] To: {recipient} | Error: {e}")
                return False

        # ── Real SMTP dispatch ───────────────────────────────────────────
        if self.smtp_host and self.smtp_user and self.smtp_password:
            try:
                msg = MIMEMultipart()
                msg["From"] = self.smtp_from
                msg["To"] = recipient
                msg["Subject"] = subject
                msg.attach(MIMEText(body, "plain"))

                # Timeout so a blocked SMTP port fails fast instead of hanging the request
                if self.smtp_port == 465:
                    server_cm = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port, timeout=20)
                else:
                    server_cm = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=20)
                with server_cm as server:
                    if self.smtp_port != 465:
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
