"""
test_maker_checker.py — Unit tests for Maker-Checker rejection workflow.

Verifies:
- L1, L2, L3 act as Makers (proposing rejection, routing to HEAD for cross-check).
- Only HEAD / super_admin can cross-check (Checker).
- Checker approval confirms "Rejected".
- Checker overturn returns ticket to Maker tier.
- Direct rejection by HEAD is finalized immediately.
"""

import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from backend.agent.nodes.router import TIER_SLA_HOURS


class TestMakerCheckerRejectionWorkflow(unittest.TestCase):

    def setUp(self):
        self.now_utc = datetime.now(timezone.utc)
        self.now_iso = self.now_utc.isoformat()

    def _simulate_update_rejection(self, current_status, user_tier, user_role, target_status, grievance_history=None, reason="Invalid complaint"):
        """
        Pure logic simulator mirroring the update_grievance_status Maker-Checker logic in backend/main.py.
        """
        history = list(grievance_history or [])
        is_maker_tier = (user_role != "super_admin") and (user_tier in ("L1", "L2", "L3"))
        is_checker_tier = (user_role == "super_admin") or (user_tier == "HEAD")
        department = "CRM"

        # 1. Checker action on a ticket awaiting cross-check
        if current_status == "Pending Rejection Approval":
            if not is_checker_tier:
                raise PermissionError("Only HOD or Super Admin can cross-check rejections.")

            if target_status == "Rejected":
                history.append({
                    "tier": user_tier,
                    "handler": f"{user_tier.lower()}@puravankara.com",
                    "action": f"Rejection cross-checked and approved by {user_tier} (Checker)",
                    "notes": reason,
                    "timestamp": self.now_iso,
                })
                return {
                    "status": "Rejected",
                    "history": history,
                    "email_sent_to_complainant": True,
                    "action": "APPROVED",
                }

            elif target_status in ("Investigating", "Open"):
                maker_tier = "L1"
                for ev in reversed(history):
                    if ev.get("maker_tier"):
                        maker_tier = ev["maker_tier"]
                        break
                    elif ev.get("tier") in ("L1", "L2", "L3"):
                        maker_tier = ev["tier"]
                        break

                maker_sla = TIER_SLA_HOURS.get(maker_tier, 24)
                history.append({
                    "tier": user_tier,
                    "handler": f"{user_tier.lower()}@puravankara.com",
                    "action": f"Rejection overturned by {user_tier} (Checker) — returned to {maker_tier} for investigation",
                    "notes": reason,
                    "timestamp": self.now_iso,
                })
                return {
                    "status": target_status,
                    "assigned_tier": maker_tier,
                    "assigned_queue": f"{department.lower()}_{maker_tier.lower()}_queue",
                    "sla_hours": maker_sla,
                    "history": history,
                    "email_sent_to_complainant": False,
                    "action": "OVERTURNED",
                }

        # 2. Maker action (proposing rejection for an open ticket)
        if target_status in ("Rejected", "Pending Rejection Approval") and is_maker_tier:
            effective_status = "Pending Rejection Approval"
            head_sla = TIER_SLA_HOURS.get("HEAD", 4)
            history.append({
                "tier": user_tier,
                "handler": f"{user_tier.lower()}@puravankara.com",
                "action": f"Rejection proposed by {user_tier} (Maker) — forwarded to HOD for cross-check",
                "maker_tier": user_tier,
                "notes": reason,
                "timestamp": self.now_iso,
                "is_rejection_proposal": True,
            })
            return {
                "status": effective_status,
                "assigned_tier": "HEAD",
                "assigned_queue": f"{department.lower()}_head_queue",
                "sla_hours": head_sla,
                "history": history,
                "email_sent_to_complainant": False,
                "action": "PROPOSED",
            }

        if target_status == "Pending Rejection Approval":
            raise ValueError("Status cannot be directly updated to 'Pending Rejection Approval'.")

        # 3. Direct rejection by HOD
        if target_status == "Rejected" and is_checker_tier:
            history.append({
                "tier": user_tier,
                "handler": f"{user_tier.lower()}@puravankara.com",
                "action": "Status updated to Rejected",
                "notes": reason,
                "timestamp": self.now_iso,
            })
            return {
                "status": "Rejected",
                "history": history,
                "email_sent_to_complainant": True,
                "action": "DIRECT_REJECT",
            }

        return {"status": target_status, "history": history}

    def test_l1_rejection_acts_as_maker(self):
        """L1 proposing rejection routes ticket to HEAD with Pending Rejection Approval status."""
        res = self._simulate_update_rejection(
            current_status="Investigating",
            user_tier="L1",
            user_role="admin",
            target_status="Rejected",
        )
        self.assertEqual(res["status"], "Pending Rejection Approval")
        self.assertEqual(res["assigned_tier"], "HEAD")
        self.assertEqual(res["assigned_queue"], "crm_head_queue")
        self.assertEqual(res["sla_hours"], 4)
        self.assertFalse(res["email_sent_to_complainant"])
        self.assertEqual(res["action"], "PROPOSED")
        self.assertIn("Maker", res["history"][-1]["action"])

    def test_l2_rejection_acts_as_maker(self):
        """L2 proposing rejection routes ticket to HEAD with Pending Rejection Approval status."""
        res = self._simulate_update_rejection(
            current_status="Investigating",
            user_tier="L2",
            user_role="admin",
            target_status="Rejected",
        )
        self.assertEqual(res["status"], "Pending Rejection Approval")
        self.assertEqual(res["assigned_tier"], "HEAD")
        self.assertEqual(res["action"], "PROPOSED")

    def test_l3_rejection_acts_as_maker(self):
        """L3 proposing rejection routes ticket to HEAD with Pending Rejection Approval status."""
        res = self._simulate_update_rejection(
            current_status="Investigating",
            user_tier="L3",
            user_role="admin",
            target_status="Rejected",
        )
        self.assertEqual(res["status"], "Pending Rejection Approval")
        self.assertEqual(res["assigned_tier"], "HEAD")
        self.assertEqual(res["action"], "PROPOSED")

    def test_l1_cannot_crosscheck_pending_rejection(self):
        """L1/L2/L3 cannot approve or overturn a ticket in Pending Rejection Approval."""
        with self.assertRaises(PermissionError):
            self._simulate_update_rejection(
                current_status="Pending Rejection Approval",
                user_tier="L1",
                user_role="admin",
                target_status="Rejected",
            )

    def test_hod_approves_rejection(self):
        """HOD approves rejection: status finalized as Rejected and email sent to complainant."""
        init_history = [{
            "tier": "L2",
            "maker_tier": "L2",
            "action": "Rejection proposed by L2 (Maker)",
        }]
        res = self._simulate_update_rejection(
            current_status="Pending Rejection Approval",
            user_tier="HEAD",
            user_role="admin",
            target_status="Rejected",
            grievance_history=init_history,
        )
        self.assertEqual(res["status"], "Rejected")
        self.assertTrue(res["email_sent_to_complainant"])
        self.assertEqual(res["action"], "APPROVED")
        self.assertIn("Checker", res["history"][-1]["action"])

    def test_hod_overturns_rejection_returns_to_maker(self):
        """HOD overturns rejection: status returns to Investigating and ticket is returned to Maker tier."""
        init_history = [{
            "tier": "L2",
            "maker_tier": "L2",
            "action": "Rejection proposed by L2 (Maker)",
        }]
        res = self._simulate_update_rejection(
            current_status="Pending Rejection Approval",
            user_tier="HEAD",
            user_role="admin",
            target_status="Investigating",
            grievance_history=init_history,
            reason="Additional invoice verification is required.",
        )
        self.assertEqual(res["status"], "Investigating")
        self.assertEqual(res["assigned_tier"], "L2")
        self.assertEqual(res["assigned_queue"], "crm_l2_queue")
        self.assertEqual(res["sla_hours"], 24)
        self.assertEqual(res["action"], "OVERTURNED")
        self.assertIn("overturned", res["history"][-1]["action"])

    def test_hod_direct_rejection(self):
        """HOD rejecting directly from Open/Investigating immediately finalizes as Rejected."""
        res = self._simulate_update_rejection(
            current_status="Open",
            user_tier="HEAD",
            user_role="admin",
            target_status="Rejected",
        )
        self.assertEqual(res["status"], "Rejected")
        self.assertTrue(res["email_sent_to_complainant"])
        self.assertEqual(res["action"], "DIRECT_REJECT")

    def test_maker_proposing_with_pending_rejection_status(self):
        """Maker can submit target_status='Pending Rejection Approval' and routes to HEAD."""
        res = self._simulate_update_rejection(
            current_status="Investigating",
            user_tier="L1",
            user_role="admin",
            target_status="Pending Rejection Approval",
        )
        self.assertEqual(res["status"], "Pending Rejection Approval")
        self.assertEqual(res["assigned_tier"], "HEAD")
        self.assertEqual(res["action"], "PROPOSED")

    def test_non_maker_cannot_set_pending_rejection_status_directly(self):
        """Non-maker setting target_status='Pending Rejection Approval' is rejected."""
        with self.assertRaises(ValueError):
            self._simulate_update_rejection(
                current_status="Investigating",
                user_tier="HEAD",
                user_role="admin",
                target_status="Pending Rejection Approval",
            )


if __name__ == "__main__":
    unittest.main()
