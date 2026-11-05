"""Non-blocking audit trail logging."""
from supabase import Client

def log_audit(supabase: Client, action: str, actor: dict,
                    target_user_id: str = None, target_email: str = None,
                    old_val: str = None, new_val: str = None, details: dict = None):
    """Fire-and-forget audit log insertion for staff management actions."""
    try:
        data = {
            "action": action,
            "actor_id": actor.get("user_id"),
            "actor_email": actor.get("email"),
            "actor_name": actor.get("name", "System"),
            "actor_role": actor.get("role", "system"),
            "target_user_id": target_user_id,
            "target_email": target_email,
            "old_value": old_val,
            "new_value": new_val,
            "details": details
        }
        supabase.table("audit_logs").insert(data).execute()
    except Exception as e:
        print(f"[AUDIT] Warning: failed to log {action}: {e}")
