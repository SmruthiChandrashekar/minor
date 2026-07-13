import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
import asyncio
import logging
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from supabase import create_client, Client
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from agents.severity.severity import get_severity
from agents.intent.intent import detect_intent
from agents.escalation import EscalationAgent
from backend.middleware.auth import get_current_user, require_admin, require_role, require_super_admin
from backend.utils.audit import log_audit
from backend.utils.translator import translate_text, translate_to_english
from groq import Groq
import io
import sys
import time

# Ensure root is in path for 'rag' module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rag.query_data import initialize_rag, is_rag_ready, get_rag_response

# ── Configure logging for escalation agent ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-22s │ %(levelname)-7s │ %(message)s",
    datefmt="%H:%M:%S",
)

# --- SUPABASE SETUP ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("Missing Supabase environment variables! Ensure backend/.env is correctly configured.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- FASTAPI INIT ---
app = FastAPI(title="Puravankara GRM Backend")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- RAG INITIALIZATION ---
@app.on_event("startup")
async def startup_event():
    # Run warmup in background to not block server start
    asyncio.create_task(asyncio.to_thread(initialize_rag))

@app.get("/api/agents/warmup")
async def warmup_rag():
    """Endpoint to trigger RAG initialization if not already done."""
    if is_rag_ready():
        return {"status": "ready", "message": "RAG is already warmed up"}
    
    # Trigger in a separate thread so we don't block the response
    asyncio.create_task(asyncio.to_thread(initialize_rag))
    return {"status": "initializing", "message": "Warmup started in background"}

# --- LOAD CLASSIFICATION MODEL ---
print("loading clasf model")
MODEL_PATH = "agents/classification/model"

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)

device = torch.device("cpu")
model.to(device)

reverse_map = {
    0: "HR",
    1: "POSH",
    2: "Child Labour",
    3: "Safety",
    4: "Compliance",
    5: "Other"
}
# 🔥 LOAD SEVERITY MODEL
print("loading sev model")
severity_model_path = "severity_model"

severity_tokenizer = AutoTokenizer.from_pretrained(severity_model_path)
severity_model = AutoModelForSequenceClassification.from_pretrained(severity_model_path)

severity_model.to(device)

severity_map = {
    0: "Policy",
    1: "Low",
    2: "Medium",
    3: "High",
    4: "Critical"
}

# --- INIT ESCALATION AGENT ---
print("loading escalation agent")
escalation_agent = EscalationAgent()
print("all modalllls loaded")
# --- MODELS ---
class HealthResponse(BaseModel):
    status: str
    message: str

class ChatRequest(BaseModel):
    message: str
    lang: str = "en"   # ISO 639-1 code: en | hi | kn

class ClassifyRequest(BaseModel):
    text: str

class InviteRequest(BaseModel):
    email: str
    password: str
    role: str
    name: str
    department: str

class StatusUpdateRequest(BaseModel):
    is_active: bool

class ComplaintMetadata(BaseModel):
    user_id: str | None = None
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    location: str | None = None
    date: str | None = None
    department: str | None = None
    is_anonymous: bool = False

class SubmitComplaintRequest(BaseModel):
    description: str
    lang: str = "en"   # ISO 639-1 code: en | hi | kn
    metadata: ComplaintMetadata | None = None

class UpdateStatusRequest(BaseModel):
    grievance_id: str
    status: str

# --- ROUTES ---

# --- ADMIN ANALYTICS ROUTES ---
@app.get("/api/admin/complaints")
async def get_admin_complaints(category: Optional[str] = None, severity: Optional[str] = None, user: dict = Depends(require_admin)):
    try:
        query = supabase.table("grievances").select("*").order("created_at", desc=True)
        if category:
            query = query.eq("category", category)
        if severity:
            query = query.eq("severity", severity)
        result = query.execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/trends")
async def get_admin_trends(category: Optional[str] = None, severity: Optional[str] = None, user: dict = Depends(require_admin)):
    try:
        args = {}
        if category: args["p_category"] = category
        if severity: args["p_severity"] = severity
        result = supabase.rpc("get_admin_trends", args).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/metrics")
async def get_admin_metrics(category: Optional[str] = None, severity: Optional[str] = None, user: dict = Depends(require_admin)):
    try:
        args = {}
        if category: args["p_category"] = category
        if severity: args["p_severity"] = severity
        result = supabase.rpc("get_admin_metrics", args).execute()
        if result.data and len(result.data) > 0:
            return {"avg_resolution_time": float(result.data[0].get("avg_resolution_time", 0))}
        return {"avg_resolution_time": 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/insights")
async def get_admin_insights(category: Optional[str] = None, severity: Optional[str] = None, user: dict = Depends(require_admin)):
    try:
        args = {}
        if category: args["p_category"] = category
        if severity: args["p_severity"] = severity
        
        top_cat = supabase.rpc("get_top_categories", args).execute()
        status_dist = supabase.rpc("get_status_distribution", args).execute()
        
        # High severity count
        high_query = supabase.table("grievances").select("grievance_id", count="exact").eq("severity", "High")
        crit_query = supabase.table("grievances").select("grievance_id", count="exact").eq("severity", "Critical")
        
        if category:
            high_query = high_query.eq("category", category)
            crit_query = crit_query.eq("category", category)
            
        high_sev = high_query.execute()
        critical_sev = crit_query.execute()
        
        high_count = high_sev.count if high_sev.count else 0
        crit_count = critical_sev.count if critical_sev.count else 0
        total_high_risk = high_count + crit_count

        status_obj = {}
        for row in (status_dist.data or []):
            status_obj[row["status"].lower()] = row["count"]

        return {
            "top_categories": top_cat.data or [],
            "high_severity": total_high_risk,
            "status_distribution": status_obj
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/admin/grievances/{grievance_id}")
async def delete_grievance(grievance_id: str, user: dict = Depends(require_admin)):
    try:
        result = supabase.table("grievances").delete().eq("grievance_id", grievance_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Grievance not found")
        return {"status": "success", "message": "Grievance deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/users")
async def get_admin_users(user: dict = Depends(require_super_admin)):
    try:
        result = supabase.table("users").select("*").in_("role", ["super_admin", "admin"]).order("created_at", desc=True).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/users/invite")
async def invite_admin_user(request: InviteRequest, user: dict = Depends(require_super_admin)):
    try:
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_KEY)
        admin_supabase = create_client(SUPABASE_URL, service_key)
        
        auth_res = admin_supabase.auth.admin.create_user({
            "email": request.email,
            "password": request.password,
            "email_confirm": True
        })
        
        new_user_id = auth_res.user.id
        
        user_data = {
            "user_id": new_user_id,
            "email": request.email,
            "role": request.role,
            "name": request.name,
            "department": request.department,
            "user_type": "Internal",
            "is_active": True
        }
        supabase.table("users").insert(user_data).execute()
        
        log_audit(action="INVITE_USER", actor_id=user["user_id"], actor_name=user["name"], actor_role=user["role"], target_email=request.email, details={"role": request.role})
        
        return {"status": "success", "user_id": new_user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/admin/users/{target_id}/status")
async def update_user_status(target_id: str, request: StatusUpdateRequest, user: dict = Depends(require_super_admin)):
    try:
        result = supabase.table("users").update({"is_active": request.is_active}).eq("user_id", target_id).execute()
        
        status_text = "ACTIVATED" if request.is_active else "DEACTIVATED"
        target_email = result.data[0]["email"] if result.data else target_id
        log_audit(action=f"{status_text}_USER", actor_id=user["user_id"], actor_name=user["name"], actor_role=user["role"], target_email=target_email, details={"user_id": target_id})
        
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/audit-logs")
async def get_audit_logs(user: dict = Depends(require_super_admin)):
    try:
        result = supabase.table("audit_logs").select("*").order("created_at", desc=True).limit(100).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/", response_model=HealthResponse)
async def root():
    return {"status": "ok", "message": "FastAPI backend is running!"}


@app.post("/api/agents/classify")
async def classify_complaint(request: ClassifyRequest, user: dict = Depends(get_current_user)):
    try:
        text = request.text   # 👈 already exists or add

        # 🔥 STEP 0 — ADD THIS BLOCK HERE
        intent = detect_intent(text)

        if intent == "Query":
            return {
                "intent": "Query",
                "message": "This will be handled by chatbot"
            }

        # 🔻 EXISTING CODE CONTINUES BELOW
        # 🔹 STEP 1: CATEGORY (Agent 1)
        inputs = tokenizer(
            request.text,
            return_tensors="pt",
            truncation=True,
            padding=True,
            max_length=128
        ).to(device)

        with torch.no_grad():
            outputs = model(**inputs)

        pred = torch.argmax(outputs.logits).item()
        category = reverse_map[pred]

        # 🔹 STEP 2: SEVERITY (Agent 2 - Hybrid)
        severity = get_severity(
            request.text,
            severity_tokenizer,
            severity_model,
            device,
            severity_map
        )

        return {
            "category": category,
            "severity": severity
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 🎙️ AUDIO TRANSCRIPTION (Whisper)
@app.post("/api/agents/transcribe")
async def transcribe_audio(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        # Initialize Groq client
        # In a real app, load this from .env
        groq_api_key = os.environ.get("GROQ_API_KEY")
        client = Groq(api_key=groq_api_key)

        audio_bytes = await file.read()
        
        # We pass a tuple: (filename, bytes) so Groq knows the file type
        transcription = client.audio.transcriptions.create(
            file=(file.filename, audio_bytes),
            model="whisper-large-v3",
            response_format="text"
        )
        
        return {"transcript": transcription}
        
    except Exception as e:
        print(f"Transcription error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 🤖 RAG-POWERED CHAT
@app.post("/api/agents/chat")
async def chat_with_agent(request: ChatRequest):
    try:
        if not is_rag_ready():
            return {
                "response": "The Policy Assistant is initializing. Please wait a few seconds and try again...",
                "sources": []
            }

        user_lang = request.lang  # e.g. "hi", "kn", "en"
        start_time = time.time()

        # Step 1 — Normalize user input to English for RAG pipeline
        message_en = translate_to_english(request.message)

        # Step 2 — Run RAG (always processes in English)
        result = get_rag_response(message_en)
        response_en = result["answer"]

        # Step 3 — Translate response back to user's language
        final_response = translate_text(response_en, user_lang)

        print(f"Total API Response Time: {round(time.time() - start_time, 3)}s")

        return {
            "response": final_response,
            "sources": result.get("sources", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG error: {str(e)}")


# 📝 SUBMIT COMPLAINT (Frontend calls this)
@app.post("/submit-complaint")
async def submit_complaint(request: SubmitComplaintRequest, user: dict = Depends(get_current_user)):
    try:
        description_original = request.description.strip()
        user_lang = request.lang  # e.g. "hi", "kn", "en"
        meta = request.metadata

        # 🔹 STEP 1: Normalize description to English for ML models
        # If user wrote in Hindi/Kannada, translate first so models work correctly
        description_en = translate_to_english(description_original)

        # 🔹 STEP 2: CLASSIFY CATEGORY (always use English text)
        inputs = tokenizer(
            description_en,
            return_tensors="pt",
            truncation=True,
            padding=True,
            max_length=128
        ).to(device)

        with torch.no_grad():
            outputs = model(**inputs)

        pred = torch.argmax(outputs.logits).item()
        category = reverse_map[pred]

        # 🔹 STEP 3: CLASSIFY SEVERITY (always use English text)
        severity = get_severity(
            description_en,
            severity_tokenizer,
            severity_model,
            device,
            severity_map
        )

        # 🔹 STEP 3.5: ESCALATION AGENT (non-blocking)
        # Runs email/SMS notifications in the background
        asyncio.create_task(
            escalation_agent.process_async(
                complaint=description_en,
                category=category,
                severity=severity,
                metadata=meta.dict() if meta else {}
            )
        )

        # 🔹 STEP 4: AUTO-ASSIGN TO ADMIN (High/Critical only)
        assigned_to = None
        assigned_admin_name = None
        status = "Open"
        dept = category

        if severity in ["High", "Critical"]:
            admin_query = supabase.table("users").select("*").eq("role", "admin").eq("department", category).execute()

            if not admin_query.data:
                admin_query = supabase.table("users").select("*").eq("role", "admin").eq("department", "Compliance").execute()
                dept = "Compliance"

            if admin_query.data:
                admin = admin_query.data[0]
                assigned_to = admin["user_id"]
                assigned_admin_name = admin["name"]
                status = "Investigating"

        # 🔹 STEP 5: INSERT INTO SUPABASE
        # Handle anonymity
        submitter_name = None if (meta and meta.is_anonymous) else (meta.name if meta else None)
        contact_phone = None if (meta and meta.is_anonymous) else (meta.phone if meta else None)
        contact_email = None if (meta and meta.is_anonymous) else (meta.email if meta else None)
        is_anonymous_val = meta.is_anonymous if meta else False
        location_val = meta.location if meta else None
        date_val = meta.date if meta else None

        # Store original (for audit/display) + English (for ML re-processing)
        grievance_data = {
            "user_id": meta.user_id if meta else None,
            "category": category,
            "description": description_en,   # English (normalized) — ML models expect this
            "severity": severity,
            "department": dept,
            "assigned_to": assigned_to,
            "status": status,
            "submitter_name": submitter_name,
            "contact_phone": contact_phone,
            "contact_email": contact_email,
            "location": location_val,
            "incident_date": date_val,
            "is_anonymous": is_anonymous_val
        }

        result = supabase.table("grievances").insert(grievance_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to insert grievance")

        return {
            "grievance_id": result.data[0]["grievance_id"],
            "category": category,
            "severity": severity,
            "assigned_to": assigned_admin_name,
            "status": status,
            "message": "Complaint processed successfully"
        }

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))




# 📋 ADMIN DASHBOARD — Get assigned grievances
@app.get("/api/admin/grievances")
async def get_admin_grievances(admin_id: str):
    try:
        # Verify the user is an admin
        admin_check = supabase.table("users").select("role").eq("user_id", admin_id).single().execute()
        if not admin_check.data or admin_check.data["role"] != "admin":
            raise HTTPException(status_code=403, detail="Access denied. Admins only.")

        # Fetch only grievances assigned to this admin
        result = supabase.table("grievances").select("*").eq("assigned_to", admin_id).order("created_at", desc=True).execute()

        return {"grievances": result.data or []}

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


# 🔄 ADMIN STATUS UPDATE
@app.patch("/api/admin/update-status")
async def update_grievance_status(request: UpdateStatusRequest, user: dict = Depends(require_admin)):
    try:
        valid_statuses = ["Open", "Investigating", "Resolved", "Closed"]
        if request.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

        # Update status and timestamp
        from datetime import datetime
        result = supabase.table("grievances").update({
            "status": request.status,
            "updated_at": datetime.now().isoformat()
        }).eq("grievance_id", request.grievance_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Grievance not found or not assigned to you.")

        return {
            "message": "Status updated successfully",
            "grievance_id": request.grievance_id,
            "new_status": request.status
        }

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


# 🛠 DEBUG
@app.get("/api/debug/users")
async def get_all_users():
    response = supabase.table("users").select("*").execute()
    return {"data": response.data}
# --- SUPER ADMIN: USER MANAGEMENT ---
@app.get("/api/admin/users")
async def get_privileged_users(user: dict = Depends(require_admin)):
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
async def invite_privileged_user(req: InviteUserReq, user: dict = Depends(require_admin)):
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
async def update_user_role(target_id: str, req: UpdateRoleReq, user: dict = Depends(require_admin)):
    try:
        supabase.table("users").update({"role": req.role}).eq("user_id", target_id).execute()
        log_audit(supabase, "role_changed", user, target_id, None, req.role, None)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateStatusReq(BaseModel):
    is_active: bool

@app.patch("/api/admin/users/{target_id}/status")
async def update_user_status(target_id: str, req: UpdateStatusReq, user: dict = Depends(require_admin)):
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
