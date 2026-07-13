import sys

with open('backend/main.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

out_lines = []
skip = False
for i, line in enumerate(lines):
    if line.strip() == '# 🔐 REGISTER':
        skip = True
    if skip and line.strip() == '@app.post("/api/agents/classify")':
        skip = False
    
    if not skip:
        out_lines.append(line)

# Now add the user management endpoints
new_endpoints = """
# --- SUPER ADMIN: USER MANAGEMENT ---
@app.get("/api/admin/users")
async def get_privileged_users(user: dict = Depends(require_super_admin)):
    try:
        res = supabase.table("users").select("*").neq("role", "user").execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class InviteUserReq(BaseModel):
    email: str
    name: str
    role: str
    department: str

@app.post("/api/admin/users/invite")
async def invite_privileged_user(req: InviteUserReq, user: dict = Depends(require_super_admin)):
    try:
        auth_res = supabase.auth.admin.create_user({
            "email": req.email,
            "password": "TempPass!123",
            "email_confirm": True
        })
        new_uid = auth_res.user.id
        
        supabase.table("users").insert({
            "user_id": new_uid,
            "email": req.email,
            "name": req.name,
            "role": req.role,
            "department": req.department,
            "user_type": "Internal"
        }).execute()
        
        log_audit(supabase, "user_invited", user, new_uid, None, req.role, {"email": req.email})
        return {"status": "success", "message": "User invited"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateRoleReq(BaseModel):
    role: str

@app.patch("/api/admin/users/{target_id}/role")
async def update_user_role(target_id: str, req: UpdateRoleReq, user: dict = Depends(require_super_admin)):
    try:
        supabase.table("users").update({"role": req.role}).eq("user_id", target_id).execute()
        log_audit(supabase, "role_changed", user, target_id, None, req.role, None)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateStatusReq(BaseModel):
    is_active: bool

@app.patch("/api/admin/users/{target_id}/status")
async def update_user_status(target_id: str, req: UpdateStatusReq, user: dict = Depends(require_super_admin)):
    try:
        supabase.table("users").update({"is_active": req.is_active}).eq("user_id", target_id).execute()
        log_audit(supabase, "status_changed", user, target_id, None, str(req.is_active), None)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- AUDIT LOGS ---
@app.get("/api/admin/audit-logs")
async def get_audit_logs(grievance_id: Optional[str] = None, user: dict = Depends(require_admin)):
    try:
        query = supabase.table("audit_logs").select("*").order("created_at", desc=True)
        if grievance_id:
            query = query.eq("target_grievance_id", grievance_id)
        else:
            query = query.limit(50)
        res = query.execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
"""
out_lines.append(new_endpoints)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.writelines(out_lines)
