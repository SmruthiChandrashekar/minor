"""
classifier.py — Core Laya Router wrapper for severity + department classification.

Uses Laya's `choice` primitive to classify grievance text into:
  - Severity: LOW / MEDIUM / HIGH
  - Intent: QUERY / GRIEVANCE
  - Department: HR / IC / CRM / CSD / ESG / Investors

Each classification returns the chosen label, confidence score, and full
probability distribution across all options.
"""

import time
import logging
from laya import Router

from jev_classifier.config import SEVERITY_QUESTIONS, DEPARTMENT_QUESTIONS

logger = logging.getLogger(__name__)

# ── Singleton Router ──────────────────────────────────────────────────────────

_router = None


def get_router() -> Router:
    """Lazily initialize and return the Laya Router singleton."""
    global _router
    if _router is None:
        logger.info("Initializing Laya Router on CPU...")
        try:
            _router = Router(device="cpu")
        except Exception:
            _router = Router()
        logger.info("Laya Router initialized successfully.")
    return _router


# ── Classification Functions ──────────────────────────────────────────────────

def classify_severity(text: str) -> dict:
    """
    Classify a grievance/query text for severity and intent using Laya.

    Args:
        text: The user message to classify.

    Returns:
        dict with keys:
            severity: "LOW" | "MEDIUM" | "HIGH"
            severity_confidence: float (0-1)
            severity_probabilities: dict mapping each label to its probability
            intent: "QUERY" | "GRIEVANCE"
            intent_confidence: float (0-1)
            intent_probabilities: dict mapping each label to its probability
            latency_ms: float
    """
    router = get_router()
    start = time.perf_counter()

    state_text = f"Context: Puravankara corporate & customer grievance management system\nUser Message: {text}"
    result = router.predict(state_text, SEVERITY_QUESTIONS)
    elapsed_ms = (time.perf_counter() - start) * 1000

    answers = result.get("answers", result)

    # Extract severity choice
    sev = answers.get("severity", {})
    severity_label = sev.get("choice", "LOW")
    severity_conf = sev.get("answer_confidence", sev.get("confidence", 0.0))
    severity_probs = sev.get("probabilities", {})

    # Extract intent choice
    intent_data = answers.get("intent", {})
    intent_label = intent_data.get("choice", "QUERY")
    intent_conf = intent_data.get("answer_confidence", intent_data.get("confidence", 0.0))
    intent_probs = intent_data.get("probabilities", {})

    return {
        "severity": severity_label,
        "severity_confidence": round(float(severity_conf), 4),
        "severity_probabilities": {k: round(float(v), 4) for k, v in severity_probs.items()},
        "intent": intent_label,
        "intent_confidence": round(float(intent_conf), 4),
        "intent_probabilities": {k: round(float(v), 4) for k, v in intent_probs.items()},
        "latency_ms": round(elapsed_ms, 2),
    }


def classify_department(text: str) -> dict:
    """
    Classify a grievance text into the responsible department using Laya.

    Args:
        text: The user message to classify.

    Returns:
        dict with keys:
            department: "HR" | "IC" | "CRM" | "CSD" | "ESG" | "Investors"
            department_confidence: float (0-1)
            department_probabilities: dict mapping each label to its probability
            latency_ms: float
    """
    router = get_router()
    start = time.perf_counter()

    state_text = f"Context: Puravankara corporate & customer grievance management system\nUser Message: {text}"
    result = router.predict(state_text, DEPARTMENT_QUESTIONS)
    elapsed_ms = (time.perf_counter() - start) * 1000

    answers = result.get("answers", result)

    dept = answers.get("department", {})
    dept_label = dept.get("choice", "HR")
    dept_conf = dept.get("answer_confidence", dept.get("confidence", 0.0))
    dept_probs = dept.get("probabilities", {})


    return {
        "department": dept_label,
        "department_confidence": round(float(dept_conf), 4),
        "department_probabilities": {k: round(float(v), 4) for k, v in dept_probs.items()},
        "latency_ms": round(elapsed_ms, 2),
    }

