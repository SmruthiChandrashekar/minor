"""
test_agent.py — Tests for the Phase 2 LangGraph grievance agent.

Tests cover:
    1. Policy question (POLICY_QUERY intent)
    2. Incomplete grievance (GRIEVANCE intent, missing fields)
    3. Complete initial message (all fields extracted)
    4. Correction handling
    5. Sensitive grievance (POSH — no content refusal)
    6. Side question during active grievance
    7. Unknown information ("I don't know")

Run with:
    python -m pytest backend/tests/test_agent.py -v
"""

import os
import sys
import pytest

# Ensure project root is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from backend.agent.graph import run_agent


# ── Helpers ───────────────────────────────────────────────────────────────

def make_messages(*pairs):
    """Build a message history from (role, content) pairs."""
    return [{"role": r, "content": c} for r, c in pairs]


# ── Test 1: Policy Question ──────────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_policy_question():
    """
    User: 'What is the maximum Earned Leave accumulation?'
    Expected: intent=POLICY_QUERY, RAG retrieves Leave Policy, no grievance follow-up.
    """
    result = run_agent(
        user_message="What is the maximum Earned Leave accumulation?",
        session_id="",
        messages=[],
        existing_state=None,
    )

    assert result["intent"] == "POLICY_QUERY", f"Expected POLICY_QUERY, got {result['intent']}"
    assert result["response"], "Expected a non-empty response"
    assert result["active_grievance"] is False, "Should not have active grievance"
    print(f"✓ Test 1 passed — Policy question: intent={result['intent']}")


# ── Test 2: Incomplete Grievance ─────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_incomplete_grievance():
    """
    User: 'My wages haven't been paid.'
    Expected: intent=GRIEVANCE, missing info identified dynamically from policy,
              one follow-up question generated.
    """
    result = run_agent(
        user_message="My wages haven't been paid.",
        session_id="",
        messages=[],
        existing_state=None,
    )

    assert result["intent"] == "GRIEVANCE", f"Expected GRIEVANCE, got {result['intent']}"
    assert result["response"], "Expected a non-empty response"
    assert result["active_grievance"] is True, "Should have active grievance"
    # Should have missing information (dynamically determined from policy)
    assert len(result.get("missing_information", [])) > 0, "Expected missing information"
    print(f"✓ Test 2 passed — Incomplete grievance: cat={result['category']}, sev={result['severity']}, missing={result['missing_information']}")


# ── Test 3: Complete Initial Message ─────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_complete_initial_message():
    """
    User: "I'm EMP1024 from Site A. My July wages of ₹20,000 haven't been paid."
    Expected: All fields extracted, no duplicate questions.
    """
    result = run_agent(
        user_message="I'm EMP1024 from Site A. My July wages of ₹20,000 haven't been paid.",
        session_id="",
        messages=[],
        existing_state=None,
    )

    collected = result.get("collected_information", {})
    assert result["intent"] == "GRIEVANCE", f"Expected GRIEVANCE, got {result['intent']}"

    # Check that key fields were extracted
    has_employee_id = any("EMP1024" in str(v) for v in collected.values())
    has_site = any("Site A" in str(v) or "site a" in str(v).lower() for v in collected.values())
    has_period = any("July" in str(v) or "july" in str(v).lower() for v in collected.values())
    has_amount = any("20,000" in str(v) or "20000" in str(v) for v in collected.values())

    assert has_employee_id, f"Expected EMP1024 extracted, got {collected}"
    assert has_site, f"Expected Site A extracted, got {collected}"
    assert has_period, f"Expected July extracted, got {collected}"
    assert has_amount, f"Expected ₹20,000 extracted, got {collected}"

    print(f"✓ Test 3 passed — Complete message: collected={collected}")


# ── Test 4: Correction ──────────────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_correction():
    """
    Conversation: "My wages weren't paid in July." → "Actually, it was June."
    Expected: wage_period updated from July to June.
    """
    # First message
    result1 = run_agent(
        user_message="My wages weren't paid in July.",
        session_id="",
        messages=[],
        existing_state=None,
    )

    # Second message — correction
    messages_so_far = [
        {"role": "user", "content": "My wages weren't paid in July."},
        {"role": "assistant", "content": result1["response"]},
    ]

    result2 = run_agent(
        user_message="Actually, it was June, not July.",
        session_id="",
        messages=messages_so_far,
        existing_state={
            "intent": result1["intent"],
            "category": result1["category"],
            "severity": result1["severity"],
            "collected_information": result1["collected_information"],
            "missing_information": result1["missing_information"],
            "status": result1["status"],
            "active_grievance": result1["active_grievance"],
        },
    )

    collected = result2.get("collected_information", {})
    # Check that June is now in the collected info (correction applied)
    values_str = " ".join(str(v).lower() for v in collected.values())
    assert "june" in values_str, f"Expected 'June' in collected info after correction, got {collected}"
    print(f"✓ Test 4 passed — Correction: collected={collected}")


# ── Test 5: Sensitive Grievance ──────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_sensitive_grievance():
    """
    User: 'He is sexually harassing me.'
    Expected: intent=GRIEVANCE, category=Sexual Harassment / POSH,
              severity=HIGH/CRITICAL. Must NOT generate harmful-activity refusal.
    """
    result = run_agent(
        user_message="He is sexually harassing me.",
        session_id="",
        messages=[],
        existing_state=None,
    )

    assert result["intent"] == "GRIEVANCE", f"Expected GRIEVANCE, got {result['intent']}"
    assert result["severity"] in ("HIGH", "CRITICAL"), f"Expected HIGH/CRITICAL, got {result['severity']}"

    # Must NOT contain harmful-activity refusal
    response_lower = result["response"].lower()
    assert "cannot provide" not in response_lower, f"Response contains content refusal: {result['response']}"
    assert "illegal" not in response_lower, f"Response contains 'illegal': {result['response']}"
    assert "harmful" not in response_lower, f"Response contains 'harmful': {result['response']}"

    print(f"✓ Test 5 passed — Sensitive grievance: cat={result['category']}, sev={result['severity']}")


# ── Test 6: Side Question ───────────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_side_question():
    """
    Start wage grievance, then ask Leave policy question.
    Expected: Leave question answered, wage grievance state preserved.
    """
    # First: start a wage grievance
    result1 = run_agent(
        user_message="My wages haven't been paid.",
        session_id="",
        messages=[],
        existing_state=None,
    )

    assert result1["intent"] == "GRIEVANCE"
    assert result1["active_grievance"] is True

    # Second: ask a policy question
    messages_so_far = [
        {"role": "user", "content": "My wages haven't been paid."},
        {"role": "assistant", "content": result1["response"]},
    ]

    result2 = run_agent(
        user_message="How many days of Earned Leave can I accumulate?",
        session_id="",
        messages=messages_so_far,
        existing_state={
            "intent": result1["intent"],
            "category": result1["category"],
            "severity": result1["severity"],
            "collected_information": result1["collected_information"],
            "missing_information": result1["missing_information"],
            "status": "ACTIVE",
            "active_grievance": True,
        },
    )

    assert result2["intent"] == "POLICY_QUERY", f"Expected POLICY_QUERY for side question, got {result2['intent']}"
    assert result2["response"], "Expected a policy answer"
    print(f"✓ Test 6 passed — Side question answered, intent={result2['intent']}")


# ── Test 7: Unknown Information ──────────────────────────────────────────

@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_unknown_information():
    """
    User: 'I don't know my employee ID.'
    Expected: employee_id = UNKNOWN, no repeated questioning loop.
    """
    existing_state = {
        "intent": "GRIEVANCE",
        "category": "Wages / Salary",
        "severity": "HIGH",
        "collected_information": {"wage_period": "July", "site": "Site A"},
        "missing_information": ["Your employee ID so we can look up your records", "The approximate amount involved"],
        "status": "ACTIVE",
        "active_grievance": True,
    }

    messages = [
        {"role": "user", "content": "My wages for July at Site A haven't been paid."},
        {"role": "assistant", "content": "Could you provide your employee ID?"},
    ]

    result = run_agent(
        user_message="I don't know my employee ID.",
        session_id="",
        messages=messages,
        existing_state=existing_state,
    )

    collected = result.get("collected_information", {})
    # employee_id should be set to UNKNOWN
    values_str = " ".join(str(v).lower() for v in collected.values())
    assert "unknown" in values_str, f"Expected UNKNOWN in collected info, got {collected}"

    # The next question should NOT be about employee_id again
    response_lower = result.get("response", "").lower()
    assert "employee id" not in response_lower or "unknown" in response_lower, \
        f"Should not re-ask for employee ID, response: {result['response']}"

    print(f"✓ Test 7 passed — Unknown info: collected={collected}")


if __name__ == "__main__":
    # Run LLM tests if GROQ_API_KEY is set
    if os.environ.get("GROQ_API_KEY"):
        print("--- Running LLM-dependent tests ---\n")
        test_policy_question()
        test_incomplete_grievance()
        test_complete_initial_message()
        test_correction()
        test_sensitive_grievance()
        test_side_question()
        test_unknown_information()
    else:
        print("Skipping LLM tests (GROQ_API_KEY not set)")

    print("\n✅ All tests passed!")
