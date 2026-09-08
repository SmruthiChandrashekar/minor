"""
JWT Authentication Middleware for Supabase Auth.

Provides FastAPI Depends() functions:
  - get_current_user: Decodes + verifies Supabase JWT
  - require_role(*roles): Factory that returns a dependency checking role
  - require_admin: Shortcut for require_role("admin", "super_admin")
  - require_super_admin: Shortcut for require_role("super_admin")
"""

import os
from fastapi import Depends, HTTPException, Request
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing Supabase configuration")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

async def get_current_user(request: Request) -> dict:
    """Extract and verify the Supabase JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = auth_header.split(" ", 1)[1]
    
    try:
        # Verify token by fetching user from Supabase Auth directly
        auth_response = supabase.auth.get_user(token)
        if not auth_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_id = auth_response.user.id
        email = auth_response.user.email
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")
        
    # Fetch role and admin tier from users table
    result = supabase.table("users").select("role, department, name, admin_tier") \
        .eq("user_id", user_id).execute()
    
    # Allow users who authenticated but aren't in `users` table yet
    user_data = result.data[0] if result.data else {"role": "user", "department": None, "name": None, "admin_tier": None}
    
    return {
        "user_id": user_id, 
        "email": email,
        **user_data
    }

def require_role(*allowed_roles):
    """Factory: returns a dependency that checks user role."""
    async def checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, 
                detail=f"Requires role: {', '.join(allowed_roles)}")
        return user
    return checker

# Convenience shortcuts
require_admin = require_role("admin", "super_admin", "hr", "safety", "compliance")
require_super_admin = require_role("super_admin")
require_authenticated = get_current_user
