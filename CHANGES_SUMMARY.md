# Puravankara Agent Architecture Changes Summary

This document summarizes all files created, modified, and verified to implement the multi-turn Query Condensation and Contextual Rewriting system.

---

## 1. Summary of Changed & Created Files

| File | Action | Summary of Changes | Impact / Purpose |
| :--- | :--- | :--- | :--- |
| **[`backend/agent/state.py`](backend/agent/state.py)** | Modified | Added `condensed_message: str` field to `GrievanceState`. | Allows the synthesized standalone statement to flow through all downstream nodes. |
| **[`backend/agent/nodes/condense_query.py`](backend/agent/nodes/condense_query.py)** | **New File** | Implemented `condense_query_node`. Bypasses LLM on Turn 1 (0 ms); on Turn 2+, rewrites elliptical replies into 1 self-contained statement. | Solves elliptical loss without prompt contamination or topic bleed. |
| **[`backend/agent/graph.py`](backend/agent/graph.py)** | Modified | Set `condense_query` as entry point: `START → condense_query → check_context`. Added `condensed_message` to initial state & `run_agent()` return dict. | Ensures query condensation runs first on every incoming message. |
| **[`backend/agent/nodes/classify_department.py`](backend/agent/nodes/classify_department.py)** | Modified | Reads `state.get("condensed_message") or user_message`. | Pre-LLM guardrails and the classification prompt now understand short follow-up answers (e.g. `"Tower B 402"`). |
| **[`backend/agent/nodes/classify_severity.py`](backend/agent/nodes/classify_severity.py)** | Modified | Reads `condensed_message`. Removed brittle raw history prepending loop. Added `num_ctx` for Ollama and reduced `max_tokens` from 600 to 150. | Accurate severity scoring on follow-ups; faster local inference. |
| **[`backend/agent/nodes/retrieve.py`](backend/agent/nodes/retrieve.py)** | Modified | Directly reuses `condensed_message` as `retrieval_query`. | Eliminates redundant duplicate LLM rewriting calls during RAG. |
| **[`backend/agent/nodes/check_context.py`](backend/agent/nodes/check_context.py)** | Modified | Fixed hardcoded model name (`openai/gpt-oss-120b` → dynamic `model_name` from `get_llm()`). Added `num_ctx` and safe JSON code-block extraction. | Fixes 404 errors and ensures Ollama respects the `.env` model configuration. |
| **[`backend/main.py`](backend/main.py)** | Modified | Returned `condensed_message` in `/api/agents/chat` response. | Provides frontend with the full synthesized grievance summary. |
| **[`frontend/src/pages/PolicyAssistant.jsx`](frontend/src/pages/PolicyAssistant.jsx)** | Modified | Updated `getQueryDescription` to autofill the form with the synthesized summary + all conversation details, filtering meta-phrases. | Fixes bug where only the last message (e.g. `"i want to file a grievance"`) was pre-filled. |
| **[`tests/test_multiturn_condensation.py`](tests/test_multiturn_condensation.py)** | **New Test** | Automated test suite verifying Turn 1 fast path, Turn 2 POSH harassment routing, and Turn 2 property snag routing. | Validated all scenarios passing end-to-end. |

---

## 2. End-to-End Workflow Architecture

```
User Message + History
        │
        ▼
[condense_query] (Entry Node)
  ├── Turn 1 (No history) ──► Bypass LLM (0 ms delay)
  └── Turn 2+ (Follow-up) ──► Rephrase into 1 clear statement in state["condensed_message"]
        │
        ▼
[check_context]
  ├── Insufficient Context ──► [ask_clarification] ──► Return clarifying question to user
  └── Sufficient Context
        │
        ▼
[classify_severity] ── (evaluates condensed_message)
  ├── LOW           ──► [rag_retrieve] (uses condensed_message) ──► [generate_response]
  └── MEDIUM / HIGH ──► [classify_department] (uses condensed_message) ──► Route to Dept Queue
```

---

## 3. How Multi-Turn Scenarios Are Handled

1. **Turn 1 (Fresh Query)**:
   * Example: `"What is the policy for paternity leave?"`
   * Action: Condensation is completely bypassed (0 ms latency). Evaluated directly as LOW severity and answered via RAG.

2. **Turn 2 (Elliptical Harassment Follow-Up)**:
   * Turn 1: `"Someone is harassing me at work."` → Bot asks clarification.
   * Turn 2: `"Last Tuesday in cafeteria, unwanted physical contact by my manager."`
   * Condensation: `"Employee reporting unwanted physical contact by their manager in the cafeteria last Tuesday."`
   * Result: Triggers HIGH severity and routes to **IC** (Internal Committee / POSH).

3. **Turn 2 (Elliptical Property Snag Follow-Up)**:
   * Turn 1: `"Water is leaking from ceiling"` → Bot asks for unit details.
   * Turn 2: `"Tower B 402"`
   * Condensation: `"Resident reporting active ceiling water leak in Tower B, Unit 402."`
   * Result: Triggers HIGH severity and routes to **CSD** (Customer Service & Snags).

4. **Turn 2 With Still-Insufficient Context**:
   * Evaluator identifies missing operational facts (`context_sufficient = false`).
   * Bot generates a targeted follow-up question asking specifically for what is still needed.
   * **Circuit Breaker**: If the user has already answered 2 rounds of clarifications (`clarification_count >= 2`), the bot stops questioning and forces triage so a human officer can follow up directly.

5. **Data Integrity Guarantee**:
   * `condensed_message` is purely an auxiliary signal for classification and retrieval.
   * The raw user input (`state["user_message"]`) and full conversation history (`state["messages"]`) are **never altered or erased** and remain visible to human desk officers.
