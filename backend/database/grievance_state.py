"""
grievance_state.py — Persistence abstraction for grievance conversation state.

Uses the existing Supabase connection to store/load grievance state
per chat session. Clean abstraction so persistence can be swapped later.
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _get_supabase():
    """Get the Supabase client. Uses the same connection as main.py."""
    import os
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("Missing Supabase environment variables")
    return create_client(url, key)


def load_grievance_state(session_id: str) -> Optional[dict]:
    """
    Load persisted grievance state for a given chat session.

    Returns None if no state exists for this session.
    """
    if not session_id:
        return None

    try:
        supabase = _get_supabase()
        result = (
            supabase.table("grievance_states")
            .select("*")
            .eq("session_id", session_id)
            .execute()
        )

        if not result.data:
            return None

        row = result.data[0]
        return {
            "intent": row.get("intent", ""),
            "category": row.get("category", ""),
            "severity": row.get("severity", ""),
            "collected_information": row.get("collected_information", {}),
            "missing_information": row.get("missing_information", []),
            "status": row.get("status", "ACTIVE"),
            "active_grievance": row.get("status", "") == "ACTIVE",
        }
    except Exception as e:
        logger.error("Failed to load grievance state for session %s: %s", session_id, e)
        return None


def save_grievance_state(session_id: str, state: dict) -> bool:
    """
    Save/update grievance state for a given chat session (upsert).

    Returns True on success, False on failure.
    """
    if not session_id:
        return False

    try:
        supabase = _get_supabase()

        data = {
            "session_id": session_id,
            "intent": state.get("intent", ""),
            "category": state.get("category", ""),
            "severity": state.get("severity", ""),
            "collected_information": state.get("collected_information", {}),
            "missing_information": state.get("missing_information", []),
            "status": state.get("status", "ACTIVE"),
        }

        # Upsert: insert or update on conflict with session_id
        supabase.table("grievance_states").upsert(
            data, on_conflict="session_id"
        ).execute()

        logger.info("Saved grievance state for session %s (status=%s)", session_id, data["status"])
        return True

    except Exception as e:
        logger.error("Failed to save grievance state for session %s: %s", session_id, e)
        return False


def clear_grievance_state(session_id: str) -> bool:
    """
    Clear/delete grievance state for a session (e.g., after intake is complete or new conversation).
    """
    if not session_id:
        return False

    try:
        supabase = _get_supabase()
        supabase.table("grievance_states").delete().eq("session_id", session_id).execute()
        logger.info("Cleared grievance state for session %s", session_id)
        return True
    except Exception as e:
        logger.error("Failed to clear grievance state for session %s: %s", session_id, e)
        return False
