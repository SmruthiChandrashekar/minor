"""
test_multiturn_condensation.py — Test query condensation and multi-turn routing.
"""

import sys
import os
from pathlib import Path

# Add backend and minor root to sys.path
MINOR_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(MINOR_ROOT))

from dotenv import load_dotenv
load_dotenv(MINOR_ROOT / "backend" / ".env")

from backend.agent.graph import run_agent

def test_turn_1_fast_path():
    print("\n--- Test 1: Turn 1 (No History) Fast Path ---")
    user_msg = "What is the policy for paternity leave?"
    res = run_agent(user_message=user_msg, messages=[])
    print(f"User Message: {user_msg}")
    print(f"Condensed: {res.get('condensed_message')}")
    print(f"Severity: {res.get('severity')}")
    assert res.get('condensed_message') == user_msg, "Turn 1 should not alter query!"
    print("PASS: Turn 1 preserved query without alteration.")

def test_turn_2_harassment_followup():
    print("\n--- Test 2: Multi-turn Harassment Follow-up ---")
    messages = [
        {"role": "user", "content": "Someone is harassing me at work."},
        {"role": "assistant", "content": "I am sorry to hear that. Could you share what kind of behavior occurred or who was involved?"}
    ]
    user_msg = "Last Tuesday in cafeteria, unwanted physical contact by my manager."
    res = run_agent(user_message=user_msg, messages=messages)
    print(f"User Reply: {user_msg}")
    print(f"Condensed Statement: {res.get('condensed_message')}")
    print(f"Severity: {res.get('severity')}")
    print(f"Department: {res.get('department')}")
    assert res.get('department') == "IC", f"Expected IC, got {res.get('department')}"
    assert res.get('severity') == "HIGH", f"Expected HIGH, got {res.get('severity')}"
    print("PASS: Multi-turn harassment correctly condensed and routed to IC with HIGH severity.")

def test_turn_2_snag_followup():
    print("\n--- Test 3: Multi-turn Snag / CSD Follow-up ---")
    messages = [
        {"role": "user", "content": "Water is leaking from ceiling"},
        {"role": "assistant", "content": "Which tower and apartment number is this in?"}
    ]
    user_msg = "Tower B 402"
    res = run_agent(user_message=user_msg, messages=messages)
    print(f"User Reply: {user_msg}")
    print(f"Condensed Statement: {res.get('condensed_message')}")
    print(f"Severity: {res.get('severity')}")
    print(f"Department: {res.get('department')}")
    assert res.get('department') == "CSD", f"Expected CSD, got {res.get('department')}"
    print("PASS: Multi-turn snag correctly condensed and routed to CSD.")

if __name__ == "__main__":
    test_turn_1_fast_path()
    test_turn_2_harassment_followup()
    test_turn_2_snag_followup()
    print("\nALL MULTI-TURN TESTS COMPLETED SUCCESSFULLY!")
