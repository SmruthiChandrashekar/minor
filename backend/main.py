import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from agents.severity.severity import get_severity
from agents.intent.intent import detect_intent
import bcrypt
print("issstarting byankand")
# --- SUPABASE SETUP ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qcnxzravgrjdpwfqamzn.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjbnh6cmF2Z3JqZHB3ZnFhbXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjMzMzQsImV4cCI6MjA4OTkzOTMzNH0.Sam3JHUp17-_lAdjQOA9jwFmTHSbuOFNohGIOaVkmVw")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)



if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("Missing Supabase environment variables!")

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
severity_model_path = "agents/severity/model"

severity_tokenizer = AutoTokenizer.from_pretrained(severity_model_path)
severity_model = AutoModelForSequenceClassification.from_pretrained(severity_model_path)

severity_model.to(device)

severity_map = {
    0: "Low",
    1: "Medium",
    2: "High",
    3: "Critical"
}
print("all modalllls loaded")
# --- MODELS ---
class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    userType: str

class UserLogin(BaseModel):
    email: str
    password: str

class HealthResponse(BaseModel):
    status: str
    message: str

class ChatRequest(BaseModel):
    message: str

class ClassifyRequest(BaseModel):
    text: str

class ComplaintMetadata(BaseModel):
    user_id: str | None = None
    location: str | None = None
    date: str | None = None
    contact_info: str | None = None
    department: str | None = None

class SubmitComplaintRequest(BaseModel):
    description: str
    metadata: ComplaintMetadata | None = None

class UpdateStatusRequest(BaseModel):
    grievance_id: str
    status: str

# --- ROUTES ---

@app.get("/", response_model=HealthResponse)
async def root():
    return {"status": "ok", "message": "FastAPI backend is running!"}


# 🔐 REGISTER
@app.post("/api/auth/register")
async def register_user(user: UserRegister):
    try:
        existing_user = supabase.table("users").select("email").eq("email", user.email).execute()

        if existing_user.data:
            raise HTTPException(status_code=400, detail="User already exists.")

        new_user = {
            "name": user.name,
            "email": user.email,
            "password": user.password,  # ⚠️ hash later
            "user_type": user.userType,
        }

        response = supabase.table("users").insert(new_user).execute()

        return {"message": "Registration successful!", "user": response.data[0]}

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


# 🔐 UNIFIED LOGIN (Users + Admins)
@app.post("/api/auth/login")
async def login_user(user: UserLogin):
    try:
        response = supabase.table("users").select("*").eq("email", user.email).execute()

        if not response.data:
            raise HTTPException(status_code=401, detail="Invalid credentials.")

        db_user = response.data[0]

        # Verify password
        stored_password = db_user.get("password")

        if stored_password:
            # Admin or user with bcrypt password in DB
            if not bcrypt.checkpw(user.password.encode("utf-8"), stored_password.encode("utf-8")):
                raise HTTPException(status_code=401, detail="Invalid credentials.")
        else:
            # User registered via Supabase Auth (password column is NULL)
            auth_response = supabase.auth.sign_in_with_password({
                "email": user.email,
                "password": user.password
            })
            if not auth_response.user:
                raise HTTPException(status_code=401, detail="Invalid credentials.")

        return {
            "message": "Login successful!",
            "user": {
                "user_id": db_user["user_id"],
                "name": db_user["name"],
                "email": db_user["email"],
                "user_type": db_user.get("user_type"),
                "role": db_user.get("role", "user"),
                "department": db_user.get("department")
            }
        }

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agents/classify")
async def classify_complaint(request: ClassifyRequest):
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


# 🤖 CHAT PLACEHOLDER
@app.post("/api/agents/chat")
async def chat_with_agent(request: ChatRequest):
    return {"response": f"AI Agent received: {request.message}"}


# 📝 SUBMIT COMPLAINT (Frontend calls this)
@app.post("/submit-complaint")
async def submit_complaint(request: SubmitComplaintRequest):
    try:
        description = request.description.strip()
        meta = request.metadata

        # 🔹 STEP 1: CLASSIFY CATEGORY (using ONLY clean description)
        inputs = tokenizer(
            description,
            return_tensors="pt",
            truncation=True,
            padding=True,
            max_length=128
        ).to(device)

        with torch.no_grad():
            outputs = model(**inputs)

        pred = torch.argmax(outputs.logits).item()
        category = reverse_map[pred]

        # 🔹 STEP 2: CLASSIFY SEVERITY (using ONLY clean description)
        severity = get_severity(
            description,
            severity_tokenizer,
            severity_model,
            device,
            severity_map
        )

        # 🔹 STEP 3: AUTO-ASSIGN TO ADMIN (High/Critical only)
        assigned_to = None
        assigned_admin_name = None
        status = "Open"
        dept = category

        if severity in ["High", "Critical"]:
            # Find admin matching the department
            admin_query = supabase.table("users").select("*").eq("role", "admin").eq("department", category).execute()

            if not admin_query.data:
                # Fallback: route "Other" or unmatched to Compliance
                admin_query = supabase.table("users").select("*").eq("role", "admin").eq("department", "Compliance").execute()
                dept = "Compliance"

            if admin_query.data:
                admin = admin_query.data[0]
                assigned_to = admin["user_id"]
                assigned_admin_name = admin["name"]
                status = "Investigating"

        # 🔹 STEP 4: INSERT INTO SUPABASE
        grievance_data = {
            "user_id": meta.user_id if meta else None,
            "category": category,
            "description": description,
            "severity": severity,
            "department": dept,
            "assigned_to": assigned_to,
            "status": status
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
async def update_grievance_status(request: UpdateStatusRequest):
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