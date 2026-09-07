"""
test_routing.py — Unit tests for the deterministic routing logic.

Tests the pure routing functions with NO external dependencies
(no database, no LLM, no network calls).

Run with:
    python -m pytest backend/tests/test_routing.py -v
"""

import unittest
from datetime import datetime, timezone, timedelta

from backend.agent.nodes.router import (
    determine_initial_route,
    chatbot_handoff_route,
    escalate,
    normalize_severity,
    build_queue_name,
    get_next_tier,
    calculate_sla_deadline,
    TIER_SLA_HOURS,
    ESCALATION_CHAIN,
    VALID_DEPARTMENTS,
)


# ── Severity Normalization ────────────────────────────────────────────

class TestNormalizeSeverity:
    def test_low(self):
        assert normalize_severity("low") == "LOW"
        assert normalize_severity("LOW") == "LOW"
        assert normalize_severity("Low") == "LOW"

    def test_medium(self):
        assert normalize_severity("medium") == "MEDIUM"
        assert normalize_severity("MEDIUM") == "MEDIUM"
        assert normalize_severity("Medium") == "MEDIUM"

    def test_high(self):
        assert normalize_severity("high") == "HIGH"
        assert normalize_severity("HIGH") == "HIGH"
        assert normalize_severity("High") == "HIGH"

    def test_critical_maps_to_high(self):
        assert normalize_severity("Critical") == "HIGH"
        assert normalize_severity("CRITICAL") == "HIGH"

    def test_empty_defaults_to_low(self):
        assert normalize_severity("") == "LOW"
        assert normalize_severity(None) == "LOW"

    def test_invalid_defaults_to_low(self):
        assert normalize_severity("unknown") == "LOW"
        assert normalize_severity("xyz") == "LOW"

    def test_whitespace(self):
        assert normalize_severity("  HIGH  ") == "HIGH"
        assert normalize_severity(" low ") == "LOW"


# ── Initial Routing ──────────────────────────────────────────────────

class TestDetermineInitialRoute:
    def test_low_severity_chatbot(self):
        route = determine_initial_route("LOW", "CRM")
        assert route["initial_handler"] == "CHATBOT"
        assert route["assigned_tier"] is None
        assert route["assigned_queue"] is None
        assert route["sla_hours"] is None
        assert route["sla_deadline"] is None
        assert route["status"] == "CHATBOT_HANDLING"

    def test_medium_severity_l1(self):
        route = determine_initial_route("MEDIUM", "HR")
        assert route["initial_handler"] == "L1"
        assert route["assigned_tier"] == "L1"
        assert route["assigned_queue"] == "hr_l1_queue"
        assert route["sla_hours"] == 48
        assert route["sla_deadline"] is not None
        assert route["status"] == "HUMAN_HANDLING"

    def test_high_severity_l2(self):
        route = determine_initial_route("HIGH", "IC")
        assert route["initial_handler"] == "L2"
        assert route["assigned_tier"] == "L2"
        assert route["assigned_queue"] == "ic_l2_queue"
        assert route["sla_hours"] == 24
        assert route["sla_deadline"] is not None
        assert route["status"] == "HUMAN_HANDLING"

    def test_low_case_insensitive(self):
        route = determine_initial_route("low", "CRM")
        assert route["initial_handler"] == "CHATBOT"

    def test_medium_case_insensitive(self):
        route = determine_initial_route("medium", "CRM")
        assert route["initial_handler"] == "L1"

    def test_high_case_insensitive(self):
        route = determine_initial_route("high", "CRM")
        assert route["initial_handler"] == "L2"

    def test_invalid_severity_defaults_to_chatbot(self):
        route = determine_initial_route("garbage", "CRM")
        assert route["initial_handler"] == "CHATBOT"

    def test_all_departments_medium(self):
        """MEDIUM severity should route to L1 for all departments."""
        for dept in VALID_DEPARTMENTS:
            route = determine_initial_route("MEDIUM", dept)
            assert route["assigned_tier"] == "L1"
            assert route["sla_hours"] == 48
            assert dept.lower() in route["assigned_queue"]

    def test_all_departments_high(self):
        """HIGH severity should route to L2 for all departments."""
        for dept in VALID_DEPARTMENTS:
            route = determine_initial_route("HIGH", dept)
            assert route["assigned_tier"] == "L2"
            assert route["sla_hours"] == 24
            assert dept.lower() in route["assigned_queue"]

    def test_sla_deadline_is_future(self):
        route = determine_initial_route("MEDIUM", "CRM")
        assert route["sla_deadline"] > datetime.now(timezone.utc)

    def test_sla_deadline_correct_hours(self):
        before = datetime.now(timezone.utc)
        route = determine_initial_route("MEDIUM", "CRM")
        after = datetime.now(timezone.utc)
        expected_min = before + timedelta(hours=48)
        expected_max = after + timedelta(hours=48)
        assert expected_min <= route["sla_deadline"] <= expected_max


# ── Chatbot Handoff ──────────────────────────────────────────────────

class TestChatbotHandoff:
    def test_handoff_routes_to_l1(self):
        route = chatbot_handoff_route("CRM")
        assert route["assigned_tier"] == "L1"
        assert route["sla_hours"] == 48
        assert route["assigned_queue"] == "crm_l1_queue"
        assert route["status"] == "HUMAN_HANDLING"

    def test_handoff_sla_deadline_set(self):
        route = chatbot_handoff_route("HR")
        assert route["sla_deadline"] is not None
        assert route["sla_deadline"] > datetime.now(timezone.utc)


# ── Escalation ───────────────────────────────────────────────────────

class TestEscalation:
    def test_l1_to_l2(self):
        result = escalate("L1", "CRM")
        assert result is not None
        assert result["assigned_tier"] == "L2"
        assert result["sla_hours"] == 24
        assert result["assigned_queue"] == "crm_l2_queue"

    def test_l2_to_l3(self):
        result = escalate("L2", "CRM")
        assert result is not None
        assert result["assigned_tier"] == "L3"
        assert result["sla_hours"] == 12
        assert result["assigned_queue"] == "crm_l3_queue"

    def test_l3_to_head(self):
        result = escalate("L3", "CRM")
        assert result is not None
        assert result["assigned_tier"] == "HEAD"
        assert result["sla_hours"] == 4
        assert result["assigned_queue"] == "crm_head_queue"

    def test_head_no_further_escalation(self):
        result = escalate("HEAD", "CRM")
        assert result is None

    def test_full_escalation_chain(self):
        """Test the complete escalation chain: L1 → L2 → L3 → HEAD → None."""
        dept = "IC"
        tier = "L1"
        sla_hours_chain = [24, 12, 4]  # Expected SLAs after each escalation

        for expected_sla in sla_hours_chain:
            result = escalate(tier, dept)
            assert result is not None
            assert result["sla_hours"] == expected_sla
            tier = result["assigned_tier"]

        # HEAD should return None
        assert escalate(tier, dept) is None

    def test_escalation_sla_decreases(self):
        """Each escalation tier should have a shorter SLA."""
        tiers = ["L1", "L2", "L3", "HEAD"]
        slas = [TIER_SLA_HOURS[t] for t in tiers]
        for i in range(len(slas) - 1):
            assert slas[i] > slas[i + 1], f"SLA should decrease: {tiers[i]}({slas[i]}) > {tiers[i+1]}({slas[i+1]})"


# ── Helper Functions ─────────────────────────────────────────────────

class TestHelpers:
    def test_build_queue_name(self):
        assert build_queue_name("CRM", "L1") == "crm_l1_queue"
        assert build_queue_name("HR", "L2") == "hr_l2_queue"
        assert build_queue_name("Investors", "HEAD") == "investors_head_queue"

    def test_get_next_tier(self):
        assert get_next_tier("L1") == "L2"
        assert get_next_tier("L2") == "L3"
        assert get_next_tier("L3") == "HEAD"
        assert get_next_tier("HEAD") is None

    def test_calculate_sla_deadline(self):
        before = datetime.now(timezone.utc)
        deadline = calculate_sla_deadline(24)
        after = datetime.now(timezone.utc)
        assert before + timedelta(hours=24) <= deadline <= after + timedelta(hours=24)

    def test_tier_sla_hours_values(self):
        assert TIER_SLA_HOURS["L1"] == 48
        assert TIER_SLA_HOURS["L2"] == 24
        assert TIER_SLA_HOURS["L3"] == 12
        assert TIER_SLA_HOURS["HEAD"] == 4

    def test_escalation_chain_completeness(self):
        assert ESCALATION_CHAIN["L1"] == "L2"
        assert ESCALATION_CHAIN["L2"] == "L3"
        assert ESCALATION_CHAIN["L3"] == "HEAD"
        assert "HEAD" not in ESCALATION_CHAIN


# ── Edge Cases ───────────────────────────────────────────────────────

class TestEdgeCases:
    def test_empty_severity(self):
        route = determine_initial_route("", "CRM")
        assert route["initial_handler"] == "CHATBOT"

    def test_none_severity(self):
        route = determine_initial_route(None, "CRM")
        assert route["initial_handler"] == "CHATBOT"

    def test_critical_severity_maps_to_high_route(self):
        route = determine_initial_route("CRITICAL", "CRM")
        assert route["initial_handler"] == "L2"
        assert route["assigned_tier"] == "L2"

    def test_unknown_department_still_routes(self):
        route = determine_initial_route("HIGH", "UnknownDept")
        assert route["assigned_tier"] == "L2"
        assert route["assigned_queue"] == "unknowndept_l2_queue"
