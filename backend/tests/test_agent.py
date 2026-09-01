"""
test_agent.py — Tests for Multi-Account Severity Classification, Routing & Conversational RAG agent.

Tests cover:
    1. Low-severity → RAG ("What is the company's leave policy?")
    2. High-severity → HR ("I have a serious employee harassment issue that requires immediate attention.")
    3. High-severity → IC ("There is a major internal compliance and financial fraud violation in audit.")
    4. High-severity → CRM ("A major corporate client is terminating contract due to sales and service dispute.")
    5. High-severity → CSD ("Our customer support team is completely ignoring critical helpdesk tickets.")
    6. High-severity → ESG ("I want to report a serious environmental compliance and waste dumping violation.")
    7. High-severity → Investors ("Investors are raising critical concerns about financial report disclosure irregularities.")
    8. Conversational follow-up questions ("What is the leave policy?" -> "What about interns?")
    9. Invalid LLM classification handling (graceful fallback to CRM / low severity)
    10. Empty/no-context retrieval handling ("XYZ123NonExistentTopicQuery")

Run with:
    python backend/tests/test_agent.py
"""

import os
import sys

try:
    import pytest
except ImportError:
    class pytest:
        @staticmethod
        def mark():
            pass
        class mark:
            @staticmethod
            def skipif(cond, reason=""):
                def decorator(func):
                    return func
                return decorator

# Ensure project root is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from backend.agent.graph import run_agent
from backend.agent.nodes.classify_severity import classify_severity_node
from backend.agent.nodes.classify_department import classify_department_node


# ── Test 1: Low-severity → RAG ───────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_low_severity_rag():
    """
    User query about company policy.
    Expected: severity='low', routed=False, RAG response generated.
    """
    result = run_agent(
        user_message="What is the company's leave policy?",
        session_id="",
        messages=[],
    )

    assert result["severity"] == "low", f"Expected severity 'low', got '{result['severity']}'"
    assert result["routed"] is False, "Low severity query should not be routed to department"
    assert result["response"], "Expected non-empty response"
    print(f"[OK] Test 1 passed -- Low severity -> RAG: severity={result['severity']}", flush=True)


# ── Test 2: High-severity → HR ───────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_high_severity_hr():
    """
    User query about employee harassment issue.
    Expected: severity='high', department='HR', routed=True.
    """
    result = run_agent(
        user_message="I have a serious employee harassment issue that requires immediate attention.",
        session_id="",
        messages=[],
    )

    assert result["severity"] == "high", f"Expected severity 'high', got '{result['severity']}'"
    assert result["department"] == "HR", f"Expected department 'HR', got '{result['department']}'"
    assert result["routed"] is True, "High severity query should be routed"
    print(f"[OK] Test 2 passed -- High severity -> HR: dept={result['department']}", flush=True)


# ── Test 3: High-severity → IC ───────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_high_severity_ic():
    """
    User query about internal compliance / audit violation.
    Expected: severity='high', department='IC', routed=True.
    """
    result = run_agent(
        user_message="There is a major internal compliance violation and ethics breach in audit.",
        session_id="",
        messages=[],
    )

    assert result["severity"] == "high", f"Expected severity 'high', got '{result['severity']}'"
    assert result["department"] == "IC", f"Expected department 'IC', got '{result['department']}'"
    assert result["routed"] is True, "High severity query should be routed"
    print(f"[OK] Test 3 passed -- High severity -> IC: dept={result['department']}", flush=True)


# ── Test 4: High-severity → CRM ──────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_high_severity_crm():
    """
    User query about client account dispute / sales dispute.
    Expected: severity='high', department='CRM', routed=True.
    """
    result = run_agent(
        user_message="A major corporate client has escalated a critical complaint threatening to terminate their sales agreement.",
        session_id="",
        messages=[],
    )

    assert result["severity"] == "high", f"Expected severity 'high', got '{result['severity']}'"
    assert result["department"] == "CRM", f"Expected department 'CRM', got '{result['department']}'"
    assert result["routed"] is True, "High severity query should be routed"
    print(f"[OK] Test 4 passed -- High severity -> CRM: dept={result['department']}", flush=True)


# ── Test 5: High-severity → CSD ──────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_high_severity_csd():
    """
    User query about customer support helpdesk failure.
    Expected: severity='high', department='CSD', routed=True.
    """
    result = run_agent(
        user_message="Our customer support department is completely failing to answer critical helpdesk tickets for days.",
        session_id="",
        messages=[],
    )

    assert result["severity"] == "high", f"Expected severity 'high', got '{result['severity']}'"
    assert result["department"] == "CSD", f"Expected department 'CSD', got '{result['department']}'"
    assert result["routed"] is True, "High severity query should be routed"
    print(f"[OK] Test 5 passed -- High severity -> CSD: dept={result['department']}", flush=True)


# ── Test 6: High-severity → ESG ──────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_high_severity_esg():
    """
    User query about environmental compliance.
    Expected: severity='high', department='ESG', routed=True.
    """
    result = run_agent(
        user_message="I want to report a serious environmental compliance and hazardous waste dumping violation at our construction site.",
        session_id="",
        messages=[],
    )

    assert result["severity"] == "high", f"Expected severity 'high', got '{result['severity']}'"
    assert result["department"] == "ESG", f"Expected department 'ESG', got '{result['department']}'"
    assert result["routed"] is True, "High severity query should be routed"
    print(f"[OK] Test 6 passed -- High severity -> ESG: dept={result['department']}", flush=True)


# ── Test 7: High-severity → Investors ────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_high_severity_investors():
    """
    User query about investor relations / financial reporting.
    Expected: severity='high', department='Investors', routed=True.
    """
    result = run_agent(
        user_message="Institutional investors are raising severe concerns about financial reporting irregularities and dividend disclosures.",
        session_id="",
        messages=[],
    )

    assert result["severity"] == "high", f"Expected severity 'high', got '{result['severity']}'"
    assert result["department"] == "Investors", f"Expected department 'Investors', got '{result['department']}'"
    assert result["routed"] is True, "High severity query should be routed"
    print(f"[OK] Test 7 passed -- High severity -> Investors: dept={result['department']}", flush=True)


# ── Test 8: Conversational Follow-up Questions ────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_conversational_followup():
    """
    Turn 1: "What is the policy for employee leave?"
    Turn 2: "What about interns?"
    Expected: Turn 2 understands that "interns" refers to leave policy.
    """
    messages_turn_1 = [
        {"role": "user", "content": "What is the policy for employee leave?"},
        {"role": "assistant", "content": "According to Puravankara leave policy, employees get Earned Leave and Casual Leave..."},
    ]

    result = run_agent(
        user_message="What about interns?",
        session_id="",
        messages=messages_turn_1,
    )

    assert result["severity"] == "low", f"Expected 'low', got {result['severity']}"
    assert result["response"], "Expected non-empty response"
    print(f"[OK] Test 8 passed -- Conversational follow-up response generated", flush=True)


# ── Test 9: Invalid LLM Classification Handling ──────────────────────────

def test_invalid_classification_handling():
    """
    Test node fallback behavior when state contains invalid inputs or when LLM fails.
    """
    # 1. State with empty user message
    res_sev = classify_severity_node({"user_message": "", "messages": []})
    assert res_sev["severity"] == "low", f"Expected fallback 'low', got {res_sev['severity']}"

    # 2. Department classification fallback test
    res_dept = classify_department_node({"user_message": "Some random text", "messages": []})
    assert res_dept["department"] in ["HR", "IC", "CRM", "CSD", "ESG", "Investors"], f"Invalid department {res_dept['department']}"

    print("[OK] Test 9 passed -- Invalid LLM classification handling", flush=True)


# ── Test 10: Empty/No-Context Retrieval Handling ──────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_no_context_retrieval():
    """
    User query for a completely non-existent topic.
    Expected: Graceful response indicating no information found without crashing.
    """
    result = run_agent(
        user_message="What is the policy regarding quantum teleportation for remote work in 2099?",
        session_id="",
        messages=[],
    )

    assert result["response"], "Expected graceful response for no-context query"
    assert result["error"] == "", "Should not raise uncaught exception"
    print(f"[OK] Test 10 passed -- Empty/no-context retrieval handling", flush=True)


if __name__ == "__main__":
    if os.environ.get("GROQ_API_KEY"):
        print("--- Running Workflow Tests ---\n", flush=True)
        test_low_severity_rag()
        test_high_severity_hr()
        test_high_severity_ic()
        test_high_severity_crm()
        test_high_severity_csd()
        test_high_severity_esg()
        test_high_severity_investors()
        test_conversational_followup()
        test_invalid_classification_handling()
        test_no_context_retrieval()
        print("\n[OK] All 10 tests passed successfully!", flush=True)
    else:
        print("Running offline tests...", flush=True)
        test_invalid_classification_handling()
        print("\n[OK] Offline test passed!", flush=True)
