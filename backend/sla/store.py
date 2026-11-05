"""
store.py — Loads SLA rules and holidays from Supabase (cached) and stamps new tickets.

If migration 020 has not been applied, the sla_policies table is missing: start_sla()
then returns {} so complaint filing keeps working without the resolution SLA.
"""

import logging
import os
import time
from datetime import date, datetime, timezone

from backend.sla.engine import start_fields
from backend.sla.policy import DEFAULT_POLICIES, match_policy

logger = logging.getLogger("sla")

_CACHE_TTL_SECONDS = 300
_cache: dict = {}


_MISSING_TTL_SECONDS = 30  # re-check soon after migration 020 is applied


def _cached(key: str, loader):
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    value = loader()
    ttl = _MISSING_TTL_SECONDS if value is None else _CACHE_TTL_SECONDS
    _cache[key] = (time.monotonic() + ttl, value)
    return value


def clear_cache():
    _cache.clear()


def load_policies(supabase) -> list[dict] | None:
    """Active rules, DEFAULT_POLICIES if the table is empty, None if the table is missing."""
    def _load():
        try:
            res = supabase.table("sla_policies").select("*").eq("is_active", True).execute()
        except Exception as e:
            logger.warning("[SLA] sla_policies unavailable (run migration 020): %s", e)
            return None
        return res.data or DEFAULT_POLICIES
    return _cached("policies", _load)


def load_holidays(supabase) -> frozenset[date]:
    location = os.getenv("SLA_HOLIDAY_LOCATION", "KA").strip().upper()

    def _load():
        try:
            res = supabase.table("holidays").select("holiday_date, location").execute()
        except Exception as e:
            logger.warning("[SLA] holidays unavailable: %s", e)
            return frozenset()
        days = set()
        for row in res.data or []:
            loc = (row.get("location") or "").strip().upper()
            if not loc or loc == location:
                days.add(date.fromisoformat(str(row["holiday_date"])[:10]))
        return frozenset(days)
    return _cached(f"holidays:{location}", _load)


def resolve_rule(supabase, department: str | None, category: str | None,
                 severity: str | None) -> dict | None:
    policies = load_policies(supabase)
    if policies is None:
        return None
    return match_policy(policies, department, category, severity)


def start_sla(supabase, department: str | None, category: str | None, severity: str | None,
              acknowledged_at: datetime | None = None) -> dict:
    """Resolution-SLA columns for a new ticket, or {} if the SLA tables are not set up."""
    try:
        rule = resolve_rule(supabase, department, category, severity)
        if rule is None:
            return {}
        return start_fields(acknowledged_at or datetime.now(timezone.utc), rule,
                            load_holidays(supabase))
    except Exception as e:
        logger.error("[SLA] Could not compute resolution SLA: %s", e, exc_info=True)
        return {}
