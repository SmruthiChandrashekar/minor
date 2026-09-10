import os
import sys
import json

# Ensure project root is in path for 'agents', 'rag', and 'backend' modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
import asyncio
import logging
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from supabase import create_client, Client
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from agents.severity.severity import get_severity
from agents.intent.intent import detect_intent
from agents.escalation import EscalationAgent
from agents.escalation.notifier import Notifier
from backend.middleware.auth import get_current_user, require_admin, require_role, require_super_admin
from backend.utils.audit import log_audit
from backend.utils.translator import translate_text, translate_to_english
from backend.utils.report_generator import generate_employee_report, generate_admin_report
from groq import Groq
import io
import time
import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from rag.query_data import initialize_rag, is_rag_ready, get_rag_response
from rag.policy_recommender import generate_policy_recommendation
from backend.agent.graph import run_agent
from backend.agent.nodes.classify_severity import classify_severity_node
from backend.agent.nodes.classify_department import classify_department_node
from backend.database.grievance_state import load_grievance_state, save_grievance_state
from backend.agent.nodes.router import determine_initial_route, chatbot_handoff_route, escalate, ESCALATION_CHAIN
from backend.utils.notification_service import (
    notify_user_grievance_received,
    notify_user_tier_assigned,
    notify_user_chatbot_handoff,
    notify_user_resolved,
    notify_user_reopened,
    notify_user_status_changed,
    notify_admins_grievance_received,
    notify_admins_tier_assigned,
    notify_admins_chatbot_handoff,
    notify_admins_resolved,
    create_notification,
)
from backend.utils.sla_monitor import sla_monitor_loop

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
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# --- RAG INITIALIZATION ---
@app.on_event("startup")
async def startup_event():
    # Run warmup in background to not block server start
    asyncio.create_task(asyncio.to_thread(initialize_rag))
    # Start SLA monitor background task
    asyncio.create_task(sla_monitor_loop())

@app.get("/api/agents/warmup")
async def warmup_rag():
    """Endpoint to trigger RAG initialization if not already done."""
    if is_rag_ready():
        return {"status": "ready", "message": "RAG is already warmed up"}
    
    # Trigger in a separate thread so we don't block the response
    asyncio.create_task(asyncio.to_thread(initialize_rag))
    return {"status": "initializing", "message": "Warmup started in background"}


def async_generate_and_save_rag_recommendation(grievance_id: str, description: str, category: str, severity: str):
    """Run RAG policy analysis in the background and update grievance in Supabase."""
    try:
        recommendation = generate_policy_recommendation(
            grievance_text=description,
            category=category,
            severity=severity,
            ticket_id=grievance_id
        )
        has_match = recommendation.get("has_policy_match", False)
        supabase.table("grievances").update({
            "rag_recommendation": recommendation,
            "policy_matched": has_match
        }).eq("grievance_id", grievance_id).execute()
        logging.info("Saved RAG policy recommendation for grievance %s (match=%s)", grievance_id, has_match)
    except Exception as err:
        logging.error("Failed to generate/save RAG recommendation for %s: %s", grievance_id, err)


# --- LOAD CLASSIFICATION MODEL (lazy — graceful fallback if model files missing) ---
device = torch.device("cpu")
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "agents", "classification", "model")

try:
    print("loading clasf model")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
    model.to(device)
    print("[OK] Classification model loaded")
except Exception as _clf_err:
    print(f"[WARN] Classification model not found — form classification will be unavailable. ({_clf_err})")
    tokenizer = None
    model = None

reverse_map = {
    0: "HR",
    1: "POSH",
    2: "Child Labour",
    3: "Safety",
    4: "Compliance",
    5: "Other"
}

# --- LOAD SEVERITY MODEL (lazy — graceful fallback if model files missing) ---
severity_model_path = os.path.join(BASE_DIR, "severity_model")

try:
    print("loading sev model")
    severity_tokenizer = AutoTokenizer.from_pretrained(severity_model_path)
    severity_model = AutoModelForSequenceClassification.from_pretrained(severity_model_path)
    severity_model.to(device)
    print("[OK] Severity model loaded")
except Exception as _sev_err:
    print(f"[WARN] Severity model not found — form severity classification will be unavailable. ({_sev_err})")
    severity_tokenizer = None
    severity_model = None

severity_map = {
    0: "Policy",
    1: "Low",
    2: "Medium",
    3: "High",
    4: "Critical"
}

MODELS_READY = model is not None and severity_model is not None

# --- INIT ESCALATION AGENT ---
print("loading escalation agent")
escalation_agent = EscalationAgent()
notifier = Notifier()
print("all modalllls loaded")
# --- MODELS ---
class HealthResponse(BaseModel):
    status: str
    message: str

class ChatRequest(BaseModel):
    message: str
    lang: str = "en"   # ISO 639-1 code: en | hi | kn
    session_id: Optional[str] = None  # Chat session ID for grievance state persistence

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
    attachments: list[str] = []

class UpdateStatusRequest(BaseModel):
    grievance_id: str
    status: str
    resolution_reason: Optional[str] = None
    notes: Optional[str] = None

class EscalateGrievanceRequest(BaseModel):
    grievance_id: str
    reason: Optional[str] = "Manual Escalation"
    notes: Optional[str] = None

class FeedbackRequest(BaseModel):
    grievance_id: str
    rating: int
    comments: Optional[str] = None

# --- ROUTES ---

@app.post("/api/feedback")
async def submit_feedback(request: FeedbackRequest, user: dict = Depends(get_current_user)):
    try:
        # Verify the grievance belongs to the user
        grievance = supabase.table("grievances").select("user_id, status").eq("grievance_id", request.grievance_id).execute()
        if not grievance.data or grievance.data[0]["user_id"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Not authorized to submit feedback for this grievance.")
            
        if grievance.data[0]["status"] != "Resolved":
            raise HTTPException(status_code=400, detail="Can only provide feedback on resolved grievances.")

        # Insert feedback
        result = supabase.table("feedback").insert({
            "grievance_id": request.grievance_id,
            "rating": request.rating,
            "comments": request.comments
        }).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to submit feedback")
            
        return {"status": "success", "message": "Feedback submitted successfully"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

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

@app.get("/api/admin/export")
async def export_admin_data(
    format: str,
    category: Optional[str] = None, 
    severity: Optional[str] = None, 
    department: Optional[str] = None,
    user: dict = Depends(require_admin)
):
    try:
        query = supabase.table("grievances").select("*").order("created_at", desc=True)
        if category:
            query = query.eq("category", category)
        if severity:
            query = query.eq("severity", severity)
        if department:
            query = query.eq("department", department)
            
        result = query.execute()
        data = result.data
        
        if not data:
            raise HTTPException(status_code=404, detail="No data found to export")
            
        if format.lower() == "csv":
            df = pd.DataFrame(data)
            csv_data = df.to_csv(index=False)
            return StreamingResponse(
                iter([csv_data]),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=grievances_export.csv"}
            )
            
        elif format.lower() == "pdf":
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=landscape(letter))
            elements = []
            
            styles = getSampleStyleSheet()
            style_normal = styles["Normal"]
            elements.append(Paragraph("Grievances Export", styles['Title']))
            
            headers = ["ID", "Category", "Department", "Severity", "Status", "Date", "Description"]
            table_data = [headers]
            for row in data:
                gid = str(row.get("grievance_id", ""))[:8]
                date_str = str(row.get("created_at", ""))[:10]
                
                desc_text = str(row.get("description", ""))
                if len(desc_text) > 150:
                    desc_text = desc_text[:147] + "..."
                desc_para = Paragraph(desc_text, style_normal)
                
                table_data.append([
                    gid,
                    str(row.get("category", "")),
                    str(row.get("department", "")),
                    str(row.get("severity", "")),
                    str(row.get("status", "")),
                    date_str,
                    desc_para
                ])
                
            col_widths = [55, 65, 65, 55, 70, 65, 330]
            t = Table(table_data, colWidths=col_widths)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('ALIGN', (6, 1), (6, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ]))
            elements.append(t)
            doc.build(elements)
            
            pdf_data = buffer.getvalue()
            buffer.close()
            
            return StreamingResponse(
                iter([pdf_data]),
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=grievances_export.pdf"}
            )
            
        else:
            raise HTTPException(status_code=400, detail="Invalid format specified")
            
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
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
        
        avg_resolution_time = 0
        if result.data and len(result.data) > 0:
            avg_resolution_time = float(result.data[0].get("avg_resolution_time", 0))
            
        # Fetch Feedback Average
        feedback_query = supabase.table("feedback").select("rating")
        # Currently we just do overall or we would need to join with grievances. 
        # Since Supabase REST doesn't easily let us filter feedback by grievance category, 
        # we'll do a simple fetch of all feedback, or if category is provided, we can fetch matching grievances first.
        
        if category or severity:
            grievance_q = supabase.table("grievances").select("grievance_id")
            if category: grievance_q = grievance_q.eq("category", category)
            if severity: grievance_q = grievance_q.eq("severity", severity)
            g_ids = [g["grievance_id"] for g in grievance_q.execute().data]
            if g_ids:
                feedback_query = feedback_query.in_("grievance_id", g_ids)
            else:
                return {"avg_resolution_time": avg_resolution_time, "avg_satisfaction": 0}
                
        feedback_res = feedback_query.execute()
        avg_satisfaction = 0
        if feedback_res.data:
            ratings = [f["rating"] for f in feedback_res.data]
            avg_satisfaction = round(sum(ratings) / len(ratings), 1)
            
        return {
            "avg_resolution_time": avg_resolution_time,
            "avg_satisfaction": avg_satisfaction
        }
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

@app.get("/api/admin/dept-category-distribution")
async def get_dept_category_distribution(user: dict = Depends(require_super_admin)):
    """Returns grievance counts grouped by department and category for the Super Admin pie chart."""
    try:
        result = supabase.table("grievances").select("department, category").execute()
        data = result.data or []

        # Aggregate: { department: { category: count } }
        dept_map: dict = {}
        for row in data:
            dept = row.get("department") or "Unknown"
            cat = row.get("category") or "Other"
            if dept not in dept_map:
                dept_map[dept] = {}
            dept_map[dept][cat] = dept_map[dept].get(cat, 0) + 1

        # Flatten for chart: [ { department, category, count } ]
        flat = []
        for dept, cats in dept_map.items():
            for cat, count in cats.items():
                flat.append({"department": dept, "category": cat, "count": count})

        return flat
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

        # 🔹 CLASSIFY CATEGORY & SEVERITY (using LangGraph LLM agent classifier)
        sev_res = classify_severity_node({"user_message": text})
        dept_res = classify_department_node({"user_message": text})

        severity = sev_res.get("severity", "LOW").capitalize()
        category = dept_res.get("department", "CRM")

        return {
            "intent": "Complaint",
            "category": category,
            "department": category,
            "severity": severity,
            "severity_reason": sev_res.get("severity_reason", ""),
            "department_reason": dept_res.get("department_reason", "")
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

# 🤖 LANGGRAPH SEVERITY CLASSIFICATION + DEPARTMENT ROUTING + CONVERSATIONAL RAG
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
        session_id = request.session_id or ""

        # Step 1 — Normalize user input to English
        message_en = translate_to_english(request.message)

        # Step 2 — Load conversation history from Supabase (for multi-turn context)
        conversation_history = []
        if session_id:
            try:
                hist_result = supabase.table("chat_messages").select("sender, message").eq(
                    "session_id", session_id
                ).order("created_at", desc=False).limit(20).execute()
                for msg in (hist_result.data or []):
                    role = "assistant" if msg["sender"] == "assistant" else "user"
                    raw_msg = msg["message"]
                    clean_msg = raw_msg.split("<!--META:")[0].rstrip() if "<!--META:" in raw_msg else raw_msg
                    conversation_history.append({"role": role, "content": clean_msg})
            except Exception as hist_err:
                logging.warning("Failed to load chat history: %s", hist_err)

        # Step 3 — Run LangGraph agent (severity classification → routing)
        agent_result = await asyncio.to_thread(
            run_agent,
            user_message=message_en,
            session_id=session_id,
            messages=conversation_history,
        )

        response_en = agent_result.get("response", "I'm sorry, I couldn't process your request.")

        # Step 4 — Translate response back to user's language
        final_response = translate_text(response_en, user_lang)

        print(f"Total Agent Response Time: {round(time.time() - start_time, 3)}s")

        intent_val = agent_result.get("intent", "QUERY").upper()
        severity_val = agent_result.get("severity", "").lower()
        chatbot_resolved_val = agent_result.get("chatbot_resolved", True)
        can_escalate_val = agent_result.get("can_escalate", False)
        source_type_val = agent_result.get("source_type", "GENERAL_KNOWLEDGE")
        policy_name_val = agent_result.get("policy_name", "")

        # Determine if a grievance form should be triggered or redirected to
        trigger_form = False
        form_reason = ""
        if severity_val in ["high", "critical"]:
            trigger_form = True
            form_reason = "high_severity"
        elif severity_val == "medium":
            trigger_form = True
            form_reason = "medium_severity"
        elif not chatbot_resolved_val:
            trigger_form = True
            form_reason = "unresolved_low_query"

        return {
            "response": final_response,
            "sources": agent_result.get("sources", []),
            "intent": intent_val,
            "source_type": source_type_val,
            "policy_name": policy_name_val,
            "context_sufficient": agent_result.get("context_sufficient", True),
            "can_escalate": can_escalate_val,
            "severity": agent_result.get("severity", ""),
            "severity_reason": agent_result.get("severity_reason", ""),
            "department": agent_result.get("department", ""),
            "department_reason": agent_result.get("department_reason", ""),
            "routed": agent_result.get("routed", False),
            "grievance_id": agent_result.get("grievance_id", ""),
            "assigned_to": agent_result.get("assigned_to", ""),
            "initial_handler": agent_result.get("initial_handler", ""),
            "assigned_tier": agent_result.get("assigned_tier", ""),
            "assigned_queue": agent_result.get("assigned_queue", ""),
            "sla_hours": agent_result.get("sla_hours", 0),
            "chatbot_resolved": chatbot_resolved_val,
            "trigger_form": trigger_form,
            "form_reason": form_reason,
            "original_query": request.message,
        }
    except Exception as e:
        logging.error("Agent chat error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")



def clean_complaint_description(text: str) -> str:
    """Removes emojis and cleans whitespace to keep complaint descriptions clean and professional."""
    if not text:
        return ""
    import re
    emoji_pattern = re.compile(
        "["
        "\U0001f600-\U0001f64f"
        "\U0001f300-\U0001f5ff"
        "\U0001f680-\U0001f6ff"
        "\U0001f1e0-\U0001f1ff"
        "\U00002702-\U000027b0"
        "\U000024c2-\U0001f251"
        "\U0001f900-\U0001f9ff"
        "\U0001fa00-\U0001fa6f"
        "\U0001fa70-\U0001faff"
        "\U00002600-\U000026ff"
        "]+",
        flags=re.UNICODE
    )
    cleaned = emoji_pattern.sub("", text)
    return re.sub(r"\s+", " ", cleaned).strip()


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
        clean_desc_en = clean_complaint_description(description_en)

        # 🔹 STEP 2 & 3: CLASSIFY CATEGORY & SEVERITY VIA LLM AGENT
        sev_res = classify_severity_node({"user_message": clean_desc_en})
        dept_res = classify_department_node({"user_message": clean_desc_en})

        category = dept_res.get("department", "CRM")
        severity = sev_res.get("severity", "MEDIUM").capitalize()

        # 🔹 STEP 3.5: ESCALATION AGENT (non-blocking)
        # Runs email/SMS notifications in the background
        asyncio.create_task(
            escalation_agent.process_async(
                complaint=clean_desc_en,
                category=category,
                severity=severity,
                metadata=meta.dict() if meta else {}
            )
        )

        # 🔹 STEP 4: DETERMINISTIC ROUTING — Tier/SLA Assignment
        route_info = determine_initial_route(severity, category)

        assigned_to = None
        assigned_admin_name = None
        dept = category

        # Assign admin for MEDIUM/HIGH
        if route_info["assigned_tier"]:
            admin_query = supabase.table("users").select("*").eq("role", "admin").eq("department", category).execute()

            if not admin_query.data:
                admin_query = supabase.table("users").select("*").eq("role", "admin").eq("department", "Compliance").execute()
                dept = "Compliance"

            if admin_query.data:
                admin = admin_query.data[0]
                assigned_to = admin["user_id"]
                assigned_admin_name = admin["name"]

        # 🔹 STEP 5: INSERT INTO SUPABASE
        # Handle anonymity
        submitter_name = None if (meta and meta.is_anonymous) else (meta.name if meta else None)
        contact_phone = None if (meta and meta.is_anonymous) else (meta.phone if meta else None)
        contact_email = None if (meta and meta.is_anonymous) else (meta.email if meta else None)
        is_anonymous_val = meta.is_anonymous if meta else False
        location_val = meta.location if meta else None
        date_val = meta.date if meta else None

        # Store clean, emoji-free description
        grievance_data = {
            "user_id": meta.user_id if meta else None,
            "category": category,
            "description": clean_desc_en,
            "severity": severity,
            "department": dept,
            "assigned_to": assigned_to,
            "status": route_info["status"],
            "submitter_name": submitter_name,
            "contact_phone": contact_phone,
            "contact_email": contact_email,
            "location": location_val,
            "incident_date": date_val,
            "is_anonymous": is_anonymous_val,
            "attachments": request.attachments,
            "initial_handler": route_info["initial_handler"],
            "assigned_tier": route_info["assigned_tier"],
            "assigned_queue": route_info["assigned_queue"],
            "sla_hours": route_info["sla_hours"],
            "sla_deadline": route_info["sla_deadline"].isoformat() if route_info["sla_deadline"] else None,
            "escalation_history": [],
        }

        result = supabase.table("grievances").insert(grievance_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to insert grievance")

        new_grievance_id = result.data[0]["grievance_id"]

        # 🔹 STEP 6: NOTIFY COMPLAINANT (email)
        if contact_email:
            asyncio.create_task(
                asyncio.to_thread(
                    notifier.send_email,
                    contact_email,
                    "Puravankara GRM - Grievance Received",
                    f"Dear {submitter_name or 'User'},\n\nYour grievance has been successfully submitted.\n\nYour Tracking ID is: {new_grievance_id}\n\nYou can use this ID to track your complaint status.\n\nThank you,\nPuravankara GRM Team"
                )
            )

        # 🔹 STEP 7: IN-APP NOTIFICATIONS
        user_id = meta.user_id if meta else None
        if user_id:
            notify_user_grievance_received(user_id, new_grievance_id)
            if route_info["assigned_tier"]:
                notify_user_tier_assigned(user_id, new_grievance_id, route_info["assigned_tier"])
        notify_admins_grievance_received(dept, new_grievance_id)
        if route_info["assigned_tier"]:
            notify_admins_tier_assigned(dept, new_grievance_id, severity, route_info["assigned_tier"])

        # 🔹 STEP 8: RAG POLICY RESOLUTION RECOMMENDATION (Medium/High/Critical Severity or Policy-Related)
        if severity.lower() in ["medium", "high", "critical"] or category in ["IC", "HR", "Whistleblower", "Compliance", "Safety"]:
            asyncio.create_task(
                asyncio.to_thread(
                    async_generate_and_save_rag_recommendation,
                    new_grievance_id,
                    description_en,
                    category,
                    severity
                )
            )

        return {
            "grievance_id": new_grievance_id,
            "category": category,
            "severity": severity,
            "assigned_to": assigned_admin_name,
            "status": route_info["status"],
            "assigned_tier": route_info["assigned_tier"],
            "sla_hours": route_info["sla_hours"],
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
        valid_statuses = ["Open", "Investigating", "Resolved", "Rejected", "Closed", "CHATBOT_HANDLING", "HUMAN_HANDLING"]
        if request.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

        # Require a reason for every status change at all admin levels
        reason_text = (request.resolution_reason or request.notes or "").strip()
        if not reason_text:
            raise HTTPException(status_code=400, detail="A reason or justification is required for every status change.")

        # Update status, reason, and timestamp
        from datetime import datetime
        now_iso = datetime.now().isoformat()
        update_payload = {
            "status": request.status,
            "updated_at": now_iso,
            "resolution_reason": reason_text
        }

        # Append action log to escalation_history so subsequent tiers (L2, L3, HEAD) can see what prior handlers did
        try:
            curr_res = supabase.table("grievances").select("escalation_history").eq("grievance_id", request.grievance_id).single().execute()
            history = list((curr_res.data or {}).get("escalation_history") or [])
            user_tier = user.get("admin_tier") or user.get("role") or "Admin"
            user_email = user.get("email") or "Admin"
            history.append({
                "tier": user_tier,
                "handler": user_email,
                "action": f"Status updated to {request.status}",
                "notes": reason_text,
                "timestamp": now_iso
            })
            update_payload["escalation_history"] = history
        except Exception as hist_err:
            logging.warning("Could not append status update to escalation_history: %s", hist_err)

        result = supabase.table("grievances").update(update_payload).eq("grievance_id", request.grievance_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Grievance not found or not assigned to you.")

        updated_grievance = result.data[0]
        contact_email = updated_grievance.get("contact_email")
        if contact_email:
            asyncio.create_task(
                asyncio.to_thread(
                    notifier.send_email,
                    contact_email,
                    "Puravankara GRM - Status Update",
                    f"Dear {updated_grievance.get('submitter_name') or 'User'},\n\nThe status of your grievance ({request.grievance_id}) has been updated to: {request.status}.\nRemarks / Reason: {reason_text}\n\nThank you,\nPuravankara GRM Team"
                )
            )

        # In-app notifications
        grievance_user_id = updated_grievance.get("user_id")
        department = updated_grievance.get("department")
        if grievance_user_id:
            if request.status == "Resolved":
                notify_user_resolved(grievance_user_id, request.grievance_id)
            elif request.status == "Open":
                notify_user_reopened(grievance_user_id, request.grievance_id)
            else:
                notify_user_status_changed(grievance_user_id, request.grievance_id, request.status, reason_text)

        if department and request.status == "Resolved":
            notify_admins_resolved(department, request.grievance_id)

        # Generate employee PDF report in background
        if request.status in ("Resolved", "Rejected"):
            asyncio.create_task(asyncio.to_thread(
                _generate_and_store_employee_report,
                request.grievance_id
            ))

        return {
            "message": "Status updated successfully",
            "grievance_id": request.grievance_id,
            "new_status": request.status
        }

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        err_str = str(e)
        if "resolution_reason" in err_str or "PGRST204" in err_str:
            raise HTTPException(
                status_code=500,
                detail="Database column missing: Please execute '014_add_resolution_fields.sql' in Supabase SQL Editor to add the 'resolution_reason' column."
            )
        raise HTTPException(status_code=500, detail=err_str)


def _generate_and_store_employee_report(grievance_id: str):
    """Background task: generate employee PDF and save URL to grievances table."""
    try:
        res = supabase.table("grievances").select("*").eq("grievance_id", grievance_id).single().execute()
        if not res.data:
            return
        grievance = res.data
        pdf_bytes = generate_employee_report(grievance)
        # Store in Supabase Storage bucket 'grievance-reports'
        file_path = f"employee/{grievance_id}.pdf"
        supabase.storage.from_("grievance-reports").upload(
            file_path, pdf_bytes,
            file_options={"content-type": "application/pdf", "upsert": "true"}
        )
        public_url = supabase.storage.from_("grievance-reports").get_public_url(file_path)
        supabase.table("grievances").update({"report_url": public_url}).eq("grievance_id", grievance_id).execute()
        logging.info("Employee report generated for grievance %s", grievance_id)
    except Exception as err:
        logging.error("Failed to generate employee report for %s: %s", grievance_id, err)


# ── REPORT DOWNLOAD ENDPOINTS ─────────────────────────────────────────────

@app.get("/api/grievances/{grievance_id}/report")
async def download_employee_report(grievance_id: str, user: dict = Depends(get_current_user)):
    """Employee downloads their own grievance resolution report."""
    try:
        res = supabase.table("grievances").select("*").eq("grievance_id", grievance_id).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Grievance not found")
        grievance = res.data

        # Security check: owner, anonymous submission with tracking access, or staff/admin
        is_owner = bool(grievance.get("user_id")) and grievance.get("user_id") == user.get("user_id")
        is_anonymous = bool(grievance.get("is_anonymous")) or not grievance.get("user_id")
        is_staff_or_admin = user.get("role") in ("admin", "super_admin", "hr", "safety", "compliance", "crm", "csd", "esg", "investors", "ic") or bool(user.get("admin_tier"))

        if not is_owner and not is_anonymous and not is_staff_or_admin:
            raise HTTPException(status_code=403, detail="Not authorised to access this report")

        if grievance.get("status") not in ("Resolved", "Rejected", "Closed"):
            raise HTTPException(status_code=400, detail="Report is only available after the grievance is resolved or rejected")

        pdf_bytes = generate_employee_report(grievance)
        short_id = grievance_id[:8].upper()
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="grievance_report_{short_id}.pdf"'}
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/grievances/{grievance_id}/escalate")
async def manual_escalate_grievance(
    grievance_id: str,
    request: EscalateGrievanceRequest,
    user: dict = Depends(require_admin)
):
    """Manually escalate a grievance to the next tier in the escalation chain."""
    try:
        from datetime import datetime
        now = datetime.now()

        res = supabase.table("grievances").select("*").eq("grievance_id", grievance_id).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Grievance not found")
        grievance = res.data

        current_tier = grievance.get("assigned_tier") or "L1"
        department = grievance.get("department") or grievance.get("category") or "General"

        # Department scope check (super_admin can escalate any)
        user_role = user.get("role")
        user_dept = user.get("department")
        if user_role != "super_admin" and user_dept and department.strip().lower() != user_dept.strip().lower():
            raise HTTPException(status_code=403, detail="Not authorized to escalate grievances in other departments")

        if current_tier == "HEAD":
            raise HTTPException(status_code=400, detail="Grievance is already at the highest tier (HEAD)")

        route_update = escalate(current_tier, department)
        if not route_update:
            raise HTTPException(status_code=400, detail=f"Cannot escalate from tier {current_tier}")

        next_tier = route_update["assigned_tier"]
        history = list(grievance.get("escalation_history") or [])
        user_tier = user.get("admin_tier") or user.get("role") or "Admin"
        user_email = user.get("email") or "Admin"

        escalation_event = {
            "from_tier": current_tier,
            "to_tier": next_tier,
            "tier": user_tier,
            "handler": user_email,
            "reason": request.reason or "Manual Escalation",
            "notes": request.notes or "",
            "action": f"Escalated from {current_tier} to {next_tier}",
            "escalated_at": now.isoformat(),
            "timestamp": now.isoformat(),
        }
        history.append(escalation_event)

        update_data = {
            "assigned_tier": route_update["assigned_tier"],
            "assigned_queue": route_update["assigned_queue"],
            "sla_hours": route_update["sla_hours"],
            "sla_deadline": route_update["sla_deadline"].isoformat(),
            "escalation_history": history,
            "updated_at": now.isoformat(),
        }

        result = supabase.table("grievances").update(update_data).eq("grievance_id", grievance_id).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update grievance escalation")

        return {
            "message": f"Successfully escalated grievance to {next_tier}",
            "grievance": result.data[0]
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/grievances/{grievance_id}/report")
async def download_admin_report(grievance_id: str, user: dict = Depends(require_admin)):
    """Admin downloads full case/admin report for a grievance.
    Accessible to:
    - super_admin (all tickets)
    - HEAD admin of the department
    - Current assigned tier admin or higher (e.g. L2 admin when ticket is at L2 or L1)
    """
    try:
        user_tier = user.get("admin_tier")
        user_role = user.get("role")
        user_dept = user.get("department")

        res = supabase.table("grievances").select("*").eq("grievance_id", grievance_id).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Grievance not found")
        grievance = res.data

        # Department scope check (super_admin bypasses)
        if user_role != "super_admin":
            grievance_dept = grievance.get("department") or grievance.get("category")
            if user_dept and grievance_dept and user_dept.strip().lower() != grievance_dept.strip().lower():
                raise HTTPException(status_code=403, detail="You can only generate reports for your department's grievances")

            # Tier hierarchy check: HEAD can generate all; L1/L2/L3 can generate if their tier is >= assigned_tier
            TIER_RANK = {"L1": 1, "L2": 2, "L3": 3, "HEAD": 4}
            # Department heads or admins without explicit sub-tier default to HEAD
            effective_tier = user_tier if user_tier in TIER_RANK else "HEAD"
            user_rank = TIER_RANK.get(effective_tier, 4)
            ticket_rank = TIER_RANK.get(grievance.get("assigned_tier"), 1)

            if effective_tier != "HEAD" and user_rank < ticket_rank:
                raise HTTPException(
                    status_code=403,
                    detail=f"Admin tier {effective_tier} is not authorized to generate report for ticket at {grievance.get('assigned_tier')}. Requires current level ({grievance.get('assigned_tier')}) or higher."
                )

        pdf_bytes = generate_admin_report(grievance)
        short_id = grievance_id[:8].upper()
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="admin_report_{short_id}.pdf"'}
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


# 🤖 RAG POLICY RESOLUTION RECOMMENDATIONS FOR ADMINS
@app.get("/api/admin/grievances/{grievance_id}/recommendation")
async def get_grievance_rag_recommendation(grievance_id: str, user: dict = Depends(get_current_user)):
    try:
        # Fetch grievance
        res = supabase.table("grievances").select("*").eq("grievance_id", grievance_id).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Grievance not found")

        grievance = res.data
        existing_rec = grievance.get("rag_recommendation")

        # If recommendation already exists, return it
        if existing_rec:
            return {
                "grievance_id": grievance_id,
                "recommendation": existing_rec,
                "cached": True
            }

        # If not cached yet, generate on the fly
        recommendation = await asyncio.to_thread(
            generate_policy_recommendation,
            grievance_text=grievance.get("description", ""),
            category=grievance.get("category") or grievance.get("department") or "General",
            severity=grievance.get("severity", "High"),
            ticket_id=grievance_id
        )

        has_match = recommendation.get("has_policy_match", False)
        # Cache to Supabase (graceful fallback if migration 013 not yet executed in Supabase SQL editor)
        try:
            supabase.table("grievances").update({
                "rag_recommendation": recommendation,
                "policy_matched": has_match
            }).eq("grievance_id", grievance_id).execute()
        except Exception as cache_err:
            logging.warning("Could not persist RAG recommendation to DB (run migration 013 to persist): %s", cache_err)

        return {
            "grievance_id": grievance_id,
            "recommendation": recommendation,
            "cached": False
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logging.error("Failed to get RAG recommendation: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/grievances/{grievance_id}/recommendation")
async def regenerate_grievance_rag_recommendation(grievance_id: str, user: dict = Depends(get_current_user)):
    try:
        # Fetch grievance
        res = supabase.table("grievances").select("*").eq("grievance_id", grievance_id).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Grievance not found")

        grievance = res.data

        # Force re-query Chroma & Groq
        recommendation = await asyncio.to_thread(
            generate_policy_recommendation,
            grievance_text=grievance.get("description", ""),
            category=grievance.get("category") or grievance.get("department") or "General",
            severity=grievance.get("severity", "High"),
            ticket_id=grievance_id
        )

        has_match = recommendation.get("has_policy_match", False)
        try:
            supabase.table("grievances").update({
                "rag_recommendation": recommendation,
                "policy_matched": has_match
            }).eq("grievance_id", grievance_id).execute()
        except Exception as cache_err:
            logging.warning("Could not persist RAG recommendation to DB (run migration 013 to persist): %s", cache_err)

        return {
            "grievance_id": grievance_id,
            "recommendation": recommendation,
            "regenerated": True
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logging.error("Failed to regenerate RAG recommendation: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



# 🛠 DEBUG
@app.get("/api/debug/users")
async def get_all_users():
    response = supabase.table("users").select("*").execute()
    return {"data": response.data}


# ─── NOTIFICATION ENDPOINTS ───────────────────────────────────────────

@app.get("/api/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    """Get notifications for the current user."""
    try:
        user_id = user["user_id"]
        result = (
            supabase.table("notifications")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/notifications/unread-count")
async def get_unread_count(user: dict = Depends(get_current_user)):
    """Get unread notification count for the current user."""
    try:
        user_id = user["user_id"]
        result = (
            supabase.table("notifications")
            .select("notification_id", count="exact")
            .eq("user_id", user_id)
            .eq("is_read", False)
            .execute()
        )
        return {"unread_count": result.count or 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    """Mark a single notification as read."""
    try:
        supabase.table("notifications").update({"is_read": True}).eq(
            "notification_id", notification_id
        ).eq("user_id", user["user_id"]).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    """Mark all notifications as read for the current user."""
    try:
        supabase.table("notifications").update({"is_read": True}).eq(
            "user_id", user["user_id"]
        ).eq("is_read", False).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── CHATBOT HANDOFF ENDPOINT ─────────────────────────────────────────

class ChatbotHandoffRequest(BaseModel):
    description: str
    department: str = "CRM"
    session_id: Optional[str] = None


@app.post("/api/grievances/chatbot-handoff")
async def chatbot_handoff(request: ChatbotHandoffRequest, user: dict = Depends(get_current_user)):
    """Escalate a LOW-severity chatbot conversation to L1 human handling."""
    try:
        route_info = chatbot_handoff_route(request.department)
        user_id = user["user_id"]

        # Find admin
        admin_query = supabase.table("users").select("user_id, name").eq(
            "role", "admin"
        ).eq("department", request.department).execute()
        admin = admin_query.data[0] if admin_query.data else None

        # Create grievance
        grievance_data = {
            "user_id": user_id,
            "category": request.department,
            "department": request.department,
            "description": request.description,
            "severity": "Low",
            "status": route_info["status"],
            "assigned_to": admin["user_id"] if admin else None,
            "initial_handler": "CHATBOT",
            "assigned_tier": route_info["assigned_tier"],
            "assigned_queue": route_info["assigned_queue"],
            "sla_hours": route_info["sla_hours"],
            "sla_deadline": route_info["sla_deadline"].isoformat() if route_info["sla_deadline"] else None,
            "escalation_history": [{"from_tier": "CHATBOT", "to_tier": "L1", "reason": "USER_REQUEST"}],
        }

        result = supabase.table("grievances").insert(grievance_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create handoff grievance")

        grievance_id = result.data[0]["grievance_id"]

        # Notifications
        notify_user_chatbot_handoff(user_id, grievance_id)
        notify_admins_chatbot_handoff(request.department, grievance_id)

        return {
            "grievance_id": grievance_id,
            "assigned_to": admin["name"] if admin else None,
            "assigned_tier": route_info["assigned_tier"],
            "sla_hours": route_info["sla_hours"],
            "message": "Your issue has been forwarded to a human representative.",
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
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

# --- CHAT HISTORY ROUTES ---
@app.post("/api/chat/session")
async def create_chat_session(user: dict = Depends(get_current_user)):
    try:
        user_id = user["user_id"]
        result = supabase.table("chat_sessions").insert({
            "user_id": user_id,
            "title": "New Conversation"
        }).execute()
        return result.data[0]
    except Exception as e:
        with open("debug_error.log", "a") as f:
            f.write(f"create_chat_session error: {str(e)}\n")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/session/latest")
async def get_latest_chat_session(user: dict = Depends(get_current_user)):
    try:
        user_id = user["user_id"]
        result = supabase.table("chat_sessions").select("*").eq("user_id", user_id).order("updated_at", desc=True).limit(1).execute()
        if result.data:
            return result.data[0]
        return None
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/sessions")
async def get_all_chat_sessions(user: dict = Depends(get_current_user)):
    try:
        user_id = user["user_id"]
        result = supabase.table("chat_sessions").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/session/{session_id}")
async def get_chat_session_messages(session_id: str, user: dict = Depends(get_current_user)):
    try:
        result = supabase.table("chat_messages").select("*").eq("session_id", session_id).order("created_at", desc=False).execute()
        cleaned = []
        for r in (result.data or []):
            msg_text = r.get("message", "")
            meta = {}
            if "<!--META:" in msg_text:
                parts = msg_text.rsplit("<!--META:", 1)
                msg_text = parts[0].rstrip()
                if len(parts) > 1 and "-->" in parts[1]:
                    meta_raw = parts[1].split("-->")[0].strip()
                    try:
                        meta = json.loads(meta_raw)
                    except Exception:
                        pass
            r_copy = dict(r)
            r_copy["message"] = msg_text
            r_copy["metadata"] = meta
            cleaned.append(r_copy)
        return cleaned
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/chat/session/{session_id}")
async def delete_chat_session(session_id: str, user: dict = Depends(get_current_user)):
    try:
        user_id = user["user_id"]
        # Ensure the session belongs to the user
        session = supabase.table("chat_sessions").select("user_id").eq("id", session_id).execute()
        if not session.data or session.data[0]["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this session")
            
        result = supabase.table("chat_sessions").delete().eq("id", session_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ChatMessageRequest(BaseModel):
    session_id: str
    sender: str
    message: str
    metadata: Optional[dict] = None

@app.post("/api/chat/message")
async def add_chat_message(req: ChatMessageRequest, user: dict = Depends(get_current_user)):
    try:
        raw_message = req.message
        if req.metadata:
            meta_json = json.dumps(req.metadata)
            raw_message = f"{raw_message}\n<!--META:{meta_json}-->"

        # Save message
        result = supabase.table("chat_messages").insert({
            "session_id": req.session_id,
            "sender": req.sender,
            "message": raw_message
        }).execute()
        
        # Auto-generate title if this is the first user message
        if req.sender == "user":
            session_res = supabase.table("chat_sessions").select("title").eq("id", req.session_id).execute()
            if session_res.data and session_res.data[0].get("title") == "New Conversation":
                # Generate title: first 40 chars
                new_title = req.message[:40] + ("..." if len(req.message) > 40 else "")
                supabase.table("chat_sessions").update({"title": new_title}).eq("id", req.session_id).execute()
                
        row = dict(result.data[0]) if result.data else {}
        row["message"] = req.message
        row["metadata"] = req.metadata or {}
        return row
    except Exception as e:
        with open("debug_error.log", "a") as f:
            f.write(f"add_chat_message error: {str(e)}\n")
        raise HTTPException(status_code=500, detail=str(e))


# ── PROFILE MANAGEMENT ENDPOINTS ──────────────────────────────────────────────

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    designation: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    avatar_url: Optional[str] = None
    stakeholder_type: Optional[str] = None
    associated_project: Optional[str] = None
    agency_name: Optional[str] = None
    employee_id: Optional[str] = None
    preferred_contact_method: Optional[str] = None

@app.get("/api/profile/me")
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    """Fetch complete profile details for authenticated user/admin."""
    try:
        user_id = current_user["user_id"]
        res = supabase.table("users").select("*").eq("user_id", user_id).execute()
        if not res.data:
            return {
                "user_id": user_id,
                "email": current_user.get("email"),
                "name": current_user.get("name") or "User",
                "role": current_user.get("role", "user"),
                "department": current_user.get("department"),
                "phone": None,
                "avatar_url": None,
                "user_type": "Internal",
                "is_active": True
            }
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/profile/me")
async def update_my_profile(req: ProfileUpdateRequest, current_user: dict = Depends(get_current_user)):
    """Update profile details for current user/admin."""
    try:
        user_id = current_user["user_id"]
        update_data = {}
        for field, value in req.dict(exclude_unset=True).items():
            if value is not None:
                update_data[field] = value
        
        if not update_data:
            return {"status": "no_changes"}

        try:
            res = supabase.table("users").update(update_data).eq("user_id", user_id).execute()
            if not res.data:
                # Row might not exist yet, insert
                update_data["user_id"] = user_id
                update_data["email"] = current_user.get("email")
                res = supabase.table("users").insert(update_data).execute()
            return {"status": "success", "profile": res.data[0] if res.data else update_data}
        except Exception as db_err:
            err_str = str(db_err)
            # If any custom column doesn't exist yet in users table (code 42703), fallback to core columns
            if "does not exist" in err_str or "42703" in err_str:
                core_data = {k: v for k, v in update_data.items() if k in ["name", "phone"]}
                if core_data:
                    res = supabase.table("users").update(core_data).eq("user_id", user_id).execute()
                    return {
                        "status": "partial_success",
                        "message": "Core profile updated. Please run 012_add_user_profile_fields.sql in Supabase SQL editor for extended fields.",
                        "profile": res.data[0] if res.data else core_data
                    }
            raise db_err
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/profile/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload user avatar to Supabase storage and update profile avatar_url."""
    try:
        user_id = current_user["user_id"]
        file_bytes = await file.read()
        if len(file_bytes) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Avatar image size exceeds 5MB limit")

        ext = file.filename.split(".")[-1] if "." in file.filename else "png"
        file_path = f"avatars/{user_id}_{int(time.time())}.{ext}"

        # Upload to Supabase Storage 'attachments' bucket
        try:
            supabase.storage.from_("attachments").upload(
                file_path,
                file_bytes,
                file_options={"content-type": file.content_type or "image/png"}
            )
        except Exception as upload_err:
            # If storage upload fails, check if already exists or try upsert
            pass

        # Get public URL
        url_res = supabase.storage.from_("attachments").get_public_url(file_path)
        public_url = url_res if isinstance(url_res, str) else getattr(url_res, "public_url", str(url_res))

        # Update in users table if column exists
        try:
            supabase.table("users").update({"avatar_url": public_url}).eq("user_id", user_id).execute()
        except Exception:
            pass

        return {"status": "success", "avatar_url": public_url}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

