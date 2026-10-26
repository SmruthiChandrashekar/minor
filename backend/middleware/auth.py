"""
JWT Authentication Middleware for Supabase Auth.

Provides FastAPI Depends() functions:
  - get_current_user: Decodes + verifies Supabase JWT
  - require_role(*roles): Factory that returns a dependency checking role
  - require_admin: Shortcut for require_role("admin", "super_admin")
  - require_super_admin: Shortcut for require_role("super_admin")
"""

import os
import asyncio
import time
import hashlib
from fastapi import Depends, HTTPException, Request
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing Supabase configuration")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Short-lived cache so a burst of requests (notification polling, dashboard widgets)
# doesn't hit Supabase twice per request. Role/deactivation changes take effect within the TTL.
_USER_CACHE_TTL = 30  # seconds
_USER_CACHE_MAX = 500
_user_cache: dict = {}


async def get_current_user(request: Request) -> dict:
    """Extract and verify the Supabase JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = auth_header.split(" ", 1)[1]

    cache_key = hashlib.sha256(token.encode()).hexdigest()
    cached = _user_cache.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return dict(cached[1])

    try:
        # Verify token by fetching user from Supabase Auth directly
        auth_response = await asyncio.to_thread(supabase.auth.get_user, token)
        if not auth_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_id = auth_response.user.id
        email = auth_response.user.email
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")
        
    # Fetch role and admin tier from users table
    result = await asyncio.to_thread(
        lambda: supabase.table("users").select("role, department, name, admin_tier, is_active")
        .eq("user_id", user_id).execute()
    )
    
    # Allow users who authenticated but aren't in `users` table yet
    user_data = result.data[0] if result.data else {"role": "user", "department": None, "name": None, "admin_tier": None}
    
    if user_data.get("is_active") is False:
        raise HTTPException(status_code=403, detail="This account has been deactivated")

    result_user = {
        "user_id": user_id,
        "email": email,
        **user_data
    }
    if len(_user_cache) >= _USER_CACHE_MAX:
        now = time.monotonic()
        for k in [k for k, v in _user_cache.items() if v[0] <= now]:
            _user_cache.pop(k, None)
        if len(_user_cache) >= _USER_CACHE_MAX:
            _user_cache.clear()
    _user_cache[cache_key] = (time.monotonic() + _USER_CACHE_TTL, result_user)
    return dict(result_user)

def require_role(*allowed_roles):
    """Factory: returns a dependency that checks user role."""
    async def checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, 
                detail=f"Requires role: {', '.join(allowed_roles)}")
        return user
    return checker

def _phone_otp_required() -> bool:
    return os.environ.get("REQUIRE_PHONE_VERIFIED", "false").lower() == "true"


async def require_verified_phone(user: dict = Depends(get_current_user)):
    """Complainants must have a verified phone to file grievances (when REQUIRE_PHONE_VERIFIED=true).
    Staff accounts (admin / super_admin) are exempt. Needs migration 017 (users.phone_verified)."""
    if not _phone_otp_required() or user.get("role") not in (None, "user"):
        return user
    try:
        row = await asyncio.to_thread(
            lambda: supabase.table("users").select("phone_verified")
            .eq("user_id", user["user_id"]).execute()
        )
        verified = bool(row.data and row.data[0].get("phone_verified"))
    except Exception:
        verified = False
    if not verified:
        raise HTTPException(status_code=403, detail="Please verify your phone number before submitting a grievance.")
    return user


# Convenience shortcuts
require_admin = require_role("admin", "super_admin")
require_super_admin = require_role("super_admin")
require_authenticated = get_current_user
