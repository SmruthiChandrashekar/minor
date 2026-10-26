"""
phone_otp.py — one-time codes for phone verification.

Codes are kept in memory (single backend process; they are lost on restart, which just
means the user asks for a new code). Only a keyed hash of the code is stored.
"""

import os
import hmac
import time
import hashlib
import secrets
import threading

OTP_TTL_SECONDS = 300        # a code is valid for 5 minutes
RESEND_COOLDOWN_SECONDS = 30  # minimum gap between two codes
MAX_SENDS_PER_HOUR = 5        # per user
MAX_ATTEMPTS = 5              # wrong guesses before the code is burned

_lock = threading.Lock()
_codes: dict[str, dict] = {}   # user_id -> {phone, hash, expires, attempts}
_sends: dict[str, list] = {}   # user_id -> [timestamps of recent sends]


class OtpError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _secret() -> bytes:
    return (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "dev-secret").encode()


def _hash(user_id: str, phone: str, code: str) -> str:
    return hmac.new(_secret(), f"{user_id}|{phone}|{code}".encode(), hashlib.sha256).hexdigest()


def issue_code(user_id: str, phone: str) -> str:
    """Create and remember a new 6-digit code. Raises OtpError when sending too often."""
    now = time.time()
    with _lock:
        recent = [t for t in _sends.get(user_id, []) if now - t < 3600]
        if recent and now - recent[-1] < RESEND_COOLDOWN_SECONDS:
            wait = int(RESEND_COOLDOWN_SECONDS - (now - recent[-1])) + 1
            raise OtpError(f"Please wait {wait} seconds before requesting another code.", 429)
        if len(recent) >= MAX_SENDS_PER_HOUR:
            raise OtpError("Too many code requests. Please try again in an hour.", 429)
        code = f"{secrets.randbelow(10**6):06d}"
        _codes[user_id] = {
            "phone": phone,
            "hash": _hash(user_id, phone, code),
            "expires": now + OTP_TTL_SECONDS,
            "attempts": 0,
        }
        recent.append(now)
        _sends[user_id] = recent
    return code


def forget_code(user_id: str) -> None:
    """Drop a pending code (used when the SMS could not be sent)."""
    with _lock:
        _codes.pop(user_id, None)


def check_code(user_id: str, phone: str, code: str) -> None:
    """Raise OtpError unless `code` is the live code issued to this user for this phone."""
    now = time.time()
    with _lock:
        entry = _codes.get(user_id)
        if not entry or entry["phone"] != phone or entry["expires"] < now:
            raise OtpError("Code expired or not requested. Please request a new code.", 400)
        if entry["attempts"] >= MAX_ATTEMPTS:
            _codes.pop(user_id, None)
            raise OtpError("Too many wrong attempts. Please request a new code.", 429)
        entry["attempts"] += 1
        if not hmac.compare_digest(entry["hash"], _hash(user_id, phone, code)):
            raise OtpError("Incorrect code.", 400)
        _codes.pop(user_id, None)  # one use only
