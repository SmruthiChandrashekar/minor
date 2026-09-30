"""
classify.py — Standardized classification route.

Provides unified classification using the central LangGraph LLM agent nodes:
- classify_severity_node
- classify_department_node
"""

from fastapi import APIRouter
from pydantic import BaseModel
from backend.agent.nodes.classify_severity import classify_severity_node
from backend.agent.nodes.classify_department import classify_department_node

router = APIRouter()

class ComplaintRequest(BaseModel):
    text: str

@router.post("/classify")
def classify_complaint(request: ComplaintRequest):
    text = request.text.strip()
    sev_res = classify_severity_node({"user_message": text})
    dept_res = classify_department_node({"user_message": text})

    severity = sev_res.get("severity", "LOW").capitalize()
    category = dept_res.get("department", "CRM")

    return {
        "category": category,
        "department": category,
        "severity": severity,
        "severity_reason": sev_res.get("severity_reason", ""),
        "department_reason": dept_res.get("department_reason", "")
    }