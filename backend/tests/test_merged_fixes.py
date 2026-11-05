"""
test_merged_fixes.py — Checks for the fixes brought back from purva-esg (2026-11-05).

Supabase, email and the LLM classifiers are replaced with fakes, so these
tests never touch the real database or send anything.

Run with:
    python -m pytest backend/tests/test_merged_fixes.py -v
"""

import os
import sys
import builtins
import subprocess
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

# Must be set before backend.main builds its CORS list
os.environ["FRONTEND_URL"] = "https://grm.example.test/, https://second.example.test"

from fastapi.testclient import TestClient
import backend.main as main
from backend.middleware.auth import require_super_admin, require_verified_phone
from backend.utils.audit import log_audit

SUPER_ADMIN = {"user_id": "11111111-1111-1111-1111-111111111111", "email": "boss@example.test",
               "name": "Boss", "role": "super_admin"}


# ── Fake Supabase ─────────────────────────────────────────────────────────

class FakeQuery:
    """Chainable stand-in for supabase.table(...): records calls, returns canned rows."""

    def __init__(self, db, table):
        self.db, self.table, self.ops = db, table, []

    def __getattr__(self, name):
        def op(*args, **kwargs):
            self.ops.append((name, args, kwargs))
            return self
        return op

    def execute(self):
        self.db.calls.append((self.table, self.ops))
        return SimpleNamespace(data=self.db.handler(self.table, self.ops))


class FakeSupabase:
    def __init__(self, handler=None):
        self.handler = handler or (lambda table, ops: [])
        self.calls = []
        self.auth = SimpleNamespace(admin=MagicMock())

    def table(self, name):
        return FakeQuery(self, name)

    def ops_for(self, table, op_name):
        return [o for t, ops in self.calls if t == table for o in ops if o[0] == op_name]


@pytest.fixture
def client(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(main, "supabase", fake)
    notifier = MagicMock()
    notifier.email_configured = True
    notifier.send_email.return_value = True
    monkeypatch.setattr(main, "notifier", notifier)
    main.app.dependency_overrides[require_super_admin] = lambda: SUPER_ADMIN
    main.app.dependency_overrides[require_verified_phone] = lambda: {"user_id": "u1", "role": "user"}
    yield TestClient(main.app), fake, notifier
    main.app.dependency_overrides.clear()


# ── A1: audit log writes the columns the table actually has ──────────────

def test_audit_log_row_shape():
    fake = FakeSupabase()
    log_audit(fake, "INVITE_USER", SUPER_ADMIN, "22222222-2222-2222-2222-222222222222",
              "new@example.test", None, "admin", {"department": "HR"})
    row = fake.ops_for("audit_logs", "insert")[0][1][0]
    assert row["target_user_id"] == "22222222-2222-2222-2222-222222222222"
    assert row["target_email"] == "new@example.test"
    assert row["actor_email"] == "boss@example.test"
    assert row["new_value"] == "admin"
    assert "target_grievance_id" not in row  # a user id no longer lands in the grievance column


def test_migration_019_adds_audit_columns():
    sql = open(os.path.join(ROOT, "backend/database/019_fix_audit_logs.sql")).read()
    for col in ["actor_id", "actor_name", "actor_role", "target_user_id", "old_value", "new_value"]:
        assert f"ADD COLUMN IF NOT EXISTS {col}" in sql
    statements = [l for l in sql.splitlines() if not l.strip().startswith("--")]
    assert not any("DROP " in l.upper() for l in statements)


# ── A3: tracking IDs ──────────────────────────────────────────────────────

GRIEVANCE = {"grievance_id": "34c83bc2-0000-4000-8000-000000000001", "status": "Open",
             "category": "HR", "severity": "Medium", "description": "x", "created_at": "2026-11-01"}


def test_track_rejects_ids_shorter_than_5(client):
    c, fake, _ = client
    assert c.get("/api/track/34c8").status_code == 404
    assert not fake.calls  # rejected before any database query


def test_track_accepts_5_char_dashboard_id(client):
    c, fake, _ = client
    fake.handler = lambda t, ops: [GRIEVANCE] if t == "grievances" else []
    r = c.get("/api/track/34c83")
    assert r.status_code == 200, r.text
    gte = fake.ops_for("grievances", "gte")[0][1]
    lte = fake.ops_for("grievances", "lte")[0][1]
    assert gte[1].startswith("34c83000-") and lte[1].startswith("34c83fff-")


def test_track_refuses_ambiguous_prefix(client):
    c, fake, _ = client
    other = dict(GRIEVANCE, grievance_id="34c83ff0-0000-4000-8000-000000000002")
    fake.handler = lambda t, ops: [GRIEVANCE, other] if t == "grievances" else []
    assert c.get("/api/track/34c83").status_code == 404


# ── A9: CORS from FRONTEND_URL ────────────────────────────────────────────

@pytest.mark.parametrize("origin,allowed", [
    ("https://grm.example.test", True),      # trailing slash in env is stripped
    ("https://second.example.test", True),   # comma-separated list
    ("http://localhost:5173", True),
    ("https://evil.example.test", False),
])
def test_cors_origins(client, origin, allowed):
    c, _, _ = client
    r = c.options("/health", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})
    assert (r.headers.get("access-control-allow-origin") == origin) is allowed


# ── B1: staff invite emails ───────────────────────────────────────────────

INVITE = {"email": "new_admin@example.test", "name": "New Admin", "role": "admin",
          "department": "HR", "admin_tier": "L1"}


def _generate_link_ok(fake):
    fake.auth.admin.generate_link.return_value = SimpleNamespace(
        properties=SimpleNamespace(hashed_token="tok123"), user=SimpleNamespace(id="33333333-3333-3333-3333-333333333333"))


def test_invite_needs_no_password_and_emails_set_password_link(client):
    c, fake, notifier = client
    _generate_link_ok(fake)
    r = c.post("/api/admin/users/invite", json=INVITE)
    assert r.status_code == 200, r.text
    assert fake.auth.admin.generate_link.call_args[0][0] == {"type": "invite", "email": INVITE["email"]}
    to, subject, body = notifier.send_email.call_args[0]
    assert to == INVITE["email"]
    assert "https://grm.example.test/set-password?token_hash=tok123&type=invite" in body
    assert "HR L1 admin" in body
    row = fake.ops_for("users", "insert")[0][1][0]
    assert row["department"] == "HR" and row["admin_tier"] == "L1"
    assert fake.ops_for("audit_logs", "insert")  # invite is audited


def test_invite_escapes_underscore_in_duplicate_check(client):
    c, fake, _ = client
    _generate_link_ok(fake)
    c.post("/api/admin/users/invite", json=INVITE)
    assert fake.ops_for("users", "ilike")[0][1] == ("email", r"new\_admin@example.test")


def test_invite_refuses_duplicate_email(client):
    c, fake, _ = client
    fake.handler = lambda t, ops: [{"role": "user"}] if any(o[0] == "ilike" for o in ops) else []
    r = c.post("/api/admin/users/invite", json=INVITE)
    assert r.status_code == 409
    fake.auth.admin.generate_link.assert_not_called()


def test_invite_refused_without_smtp(client):
    c, fake, notifier = client
    notifier.email_configured = False
    assert c.post("/api/admin/users/invite", json=INVITE).status_code == 503
    fake.auth.admin.generate_link.assert_not_called()


def test_invite_reports_failed_email(client):
    c, fake, notifier = client
    _generate_link_ok(fake)
    notifier.send_email.return_value = False
    assert c.post("/api/admin/users/invite", json=INVITE).status_code == 502


@pytest.mark.parametrize("confirmed,link_type", [(None, "invite"), ("2026-11-01T00:00:00Z", "recovery")])
def test_resend_invite_picks_invite_or_recovery(client, confirmed, link_type):
    c, fake, notifier = client
    _generate_link_ok(fake)
    staff = {"user_id": "s1", "email": "s1@example.test", "name": "S1", "role": "admin",
             "department": "CRM", "admin_tier": "L2"}
    fake.handler = lambda t, ops: [staff] if t == "users" else []
    fake.auth.admin.get_user_by_id.return_value = SimpleNamespace(user=SimpleNamespace(email_confirmed_at=confirmed))
    r = c.post("/api/admin/users/s1/resend-invite")
    assert r.status_code == 200 and r.json()["type"] == link_type
    assert f"type={link_type}" in notifier.send_email.call_args[0][2]


def test_staff_list_flags_pending_invites(client):
    c, fake, _ = client
    fake.handler = lambda t, ops: [{"user_id": "a"}, {"user_id": "b"}]
    fake.auth.admin.list_users.return_value = [
        SimpleNamespace(id="a", email_confirmed_at=None),
        SimpleNamespace(id="b", email_confirmed_at="2026-11-01"),
    ]
    rows = {r["user_id"]: r for r in c.get("/api/admin/users").json()}
    assert rows["a"]["invite_pending"] is True and rows["b"]["invite_pending"] is False


def test_staff_list_still_loads_if_auth_lookup_fails(client):
    c, fake, _ = client
    fake.handler = lambda t, ops: [{"user_id": "a"}]
    fake.auth.admin.list_users.side_effect = RuntimeError("auth down")
    r = c.get("/api/admin/users")
    assert r.status_code == 200 and r.json() == [{"user_id": "a"}]


# ── B2: low-severity direct submissions go to the assistant ──────────────

def _classify(monkeypatch, severity):
    monkeypatch.setattr(main, "translate_to_english", lambda t: t)
    monkeypatch.setattr(main, "classify_severity_node", lambda s: {"severity": severity})
    monkeypatch.setattr(main, "classify_department_node", lambda s: {"department": "HR"})


def test_low_severity_form_submission_is_not_stored(client, monkeypatch):
    c, fake, _ = client
    _classify(monkeypatch, "LOW")
    r = c.post("/submit-complaint", json={"description": "Where can I find the holiday list?"})
    assert r.status_code == 200 and r.json()["redirect"] == "assistant"
    assert not fake.ops_for("grievances", "insert")


def test_low_severity_chatbot_escalation_is_still_stored(client, monkeypatch):
    c, fake, _ = client
    _classify(monkeypatch, "LOW")
    fake.handler = lambda t, ops: [{"grievance_id": "g1"}] if t == "grievances" else []
    monkeypatch.setattr(main, "run_escalation_agent", MagicMock(), raising=False)
    r = c.post("/submit-complaint", json={"description": "Still unresolved", "source": "CHATBOT_ESCALATION",
                                          "prefilled_severity": "LOW", "prefilled_department": "HR"})
    assert "redirect" not in r.json()
    assert fake.ops_for("grievances", "insert")


# ── A7 / A8: startup without GROQ key, openai only for Ollama ────────────

def _run(code, env_extra):
    env = {k: v for k, v in os.environ.items() if k != "GROQ_API_KEY"}
    env.update(env_extra)
    return subprocess.run([sys.executable, "-c", code], cwd=ROOT, env=env, capture_output=True, text=True, timeout=300)


def test_rag_imports_without_groq_key():
    # dotenv would reload the real key from backend/.env, so switch it off
    code = (
        "import dotenv; dotenv.load_dotenv = lambda *a, **k: False\n"
        "import rag.query_data as q\n"
        "assert q.client is None\n"
        "print(q.call_llm('hi'))\n"
    )
    r = _run(code, {})
    assert r.returncode == 0, r.stderr[-2000:]
    assert "GROQ_API_KEY not configured" in r.stdout


def test_groq_mode_works_without_openai_package():
    code = (
        "import builtins; real = builtins.__import__\n"
        "def block(name, *a, **k):\n"
        "    if name == 'openai' or name.startswith('openai.'): raise ImportError('no openai')\n"
        "    return real(name, *a, **k)\n"
        "builtins.__import__ = block\n"
        "from backend.agent.llm import get_llm\n"
        "client, model = get_llm()\n"
        "print(type(client).__name__)\n"
    )
    r = _run(code, {"LLM_PROVIDER": "groq", "GROQ_API_KEY": "test"})
    assert r.returncode == 0, r.stderr[-2000:]
    assert "Groq" in r.stdout


# ── A6: policy search falls back to BM25 when vectors are unavailable ────

def test_policy_search_bm25_only(monkeypatch):
    import rag.query_data as q
    monkeypatch.setattr(q, "RAG_READY", True)
    monkeypatch.setattr(q, "db", None)
    hits = q.search_policies("how many casual leaves do employees get", top_k=3)
    assert hits, "BM25 should find something without the vector store"
    assert any("leave" in d.metadata.get("policy_name", "").lower() for d, _ in hits)
    assert q.search_policies("xyzzy qwertyuiop zzzz", top_k=3) == []


def test_policy_search_survives_vector_failure(monkeypatch):
    import rag.query_data as q
    broken = MagicMock()
    broken.similarity_search_with_score.side_effect = RuntimeError("embedding service down")
    monkeypatch.setattr(q, "RAG_READY", True)
    monkeypatch.setattr(q, "db", broken)
    monkeypatch.setattr(q, "_embed_failed_at", 0.0)
    assert q.search_policies("sexual harassment complaint", top_k=3)
    q.search_policies("sexual harassment complaint", top_k=3)
    assert broken.similarity_search_with_score.call_count == 1  # cooldown skips the second call
