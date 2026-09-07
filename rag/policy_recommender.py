"""
policy_recommender.py — Grounded RAG Recommendation Engine for Grievance Resolution.

When admins receive a high-severity or policy-related grievance, this module retrieves
relevant Puravankara policy clauses from the vector store and synthesizes grounded,
actionable procedural steps and compliance guidelines for the resolving administrator.
"""

import os
import re
import json
import logging
import time
from datetime import datetime

logger = logging.getLogger(__name__)

# Import core components from query_data
from rag.query_data import (
    initialize_rag,
    is_rag_ready,
    call_llm,
    preprocess_query,
    deduplicate_results,
)


def _get_db():
    """Retrieve the Chroma vector store instance from query_data."""
    import rag.query_data as qd
    if not qd.is_rag_ready():
        qd.initialize_rag()
    return qd.db


def generate_policy_recommendation(
    grievance_text: str,
    category: str = "General",
    severity: str = "High",
    ticket_id: str = "",
) -> dict:
    """
    Search the Puravankara policy database and generate structured resolution
    recommendations for administrators.

    Args:
        grievance_text: The description of the complaint/incident.
        category: Classified department/category (e.g., HR, Safety, POSH, Operations).
        severity: Severity level ('High', 'Critical', 'Medium', etc.).
        ticket_id: Optional tracking identifier.

    Returns:
        Structured dict containing:
          - has_policy_match: bool
          - primary_policy: str
          - citations: list of { source, page, section, text }
          - recommended_steps: list of { step_number, title, detail, deadline }
          - compliance_notes: str
          - executive_summary: str
          - generated_at: str
    """
    start_time = time.time()

    if not is_rag_ready():
        initialize_rag()

    db = _get_db()
    if not db:
        logger.error("Vector database is unavailable for policy recommendation.")
        return {
            "has_policy_match": False,
            "primary_policy": "None",
            "citations": [],
            "recommended_steps": [
                {
                    "step_number": 1,
                    "title": "Acknowledge and Contact Complainant",
                    "detail": "Contact the complainant within 24 hours to confirm receipt and gather initial facts.",
                    "deadline": "Within 24 Hours"
                },
                {
                    "step_number": 2,
                    "title": "Assign Investigating Officer",
                    "detail": "Assign an appropriate department representative to investigate the complaint.",
                    "deadline": "Within 48 Hours"
                }
            ],
            "compliance_notes": "Follow standard Puravankara operating guidelines and SLA requirements for High severity tickets.",
            "executive_summary": "Standard resolution protocol initiated pending policy vector search availability.",
            "generated_at": datetime.utcnow().isoformat()
        }

    # Step 1: Expand query with category context for high-precision retrieval
    enhanced_query = f"{category} policy {grievance_text}"
    cleaned_query = preprocess_query(enhanced_query)

    # Step 2: Vector similarity search (k=6)
    try:
        raw_results = db.similarity_search_with_score(cleaned_query, k=6)
        deduped = deduplicate_results(raw_results)
    except Exception as e:
        logger.error("Vector search error in policy recommender: %s", e)
        deduped = []

    # Step 3: Threshold filtering
    MAX_DISTANCE_THRESHOLD = 1.15
    matching_chunks = [
        (doc, score) for doc, score in deduped if score <= MAX_DISTANCE_THRESHOLD
    ]

    has_policy_match = len(matching_chunks) > 0

    # Build context blocks and citations
    context_blocks = []
    citations = []
    seen_sources = set()

    for doc, score in matching_chunks[:4]:
        policy_name = doc.metadata.get("policy_name", "Puravankara Policy")
        source_file = doc.metadata.get("source_file", doc.metadata.get("source", "Policy Document"))
        page = doc.metadata.get("page", 1)
        section = doc.metadata.get("section", "")
        excerpt = doc.page_content.strip()[:350]

        context_blocks.append(
            f"--- DOCUMENT: {policy_name} (Page {page}, Section: {section}) ---\n{doc.page_content}\n"
        )

        source_key = (policy_name, page, section)
        if source_key not in seen_sources:
            seen_sources.add(source_key)
            citations.append({
                "source": policy_name,
                "source_file": source_file,
                "page": page,
                "section": section,
                "excerpt": excerpt,
                "score": round(float(score), 3)
            })

    context_text = "\n".join(context_blocks) if context_blocks else "No specific matching internal policy text found in vector database."

    # Step 4: Construct Grounded Admin Advisory Prompt
    prompt = f"""You are the Puravankara AI Grievance Resolution Advisor assisting an Admin or Department Head.
A HIGH-SEVERITY grievance has been received. Your task is to analyze the grievance against Puravankara's official policies and provide actionable, grounded procedural recommendations for the handling admin.

CRITICAL INSTRUCTIONS:
1. Ground your guidance STRICTLY in the provided Policy Context if available.
2. If specific policy rules (such as POSH, Whistleblower, Leave, Code of Conduct, Safety, SLA) exist in the context, cite the policy name and clauses.
3. Formulate concrete, numbered procedural steps for the admin (e.g. interim protection, evidence gathering, committee hearing, complainant communication).
4. Provide compliance/SLA notes (e.g. 24-hour turnaround for High severity, statutory confidentiality).
5. Output your response as a valid JSON object matching this exact schema:

{{
  "has_policy_match": true or false,
  "primary_policy": "Name of the primary applicable policy",
  "executive_summary": "1-2 sentence executive briefing on the grievance and applicable policy framework",
  "recommended_steps": [
    {{
      "step_number": 1,
      "title": "Short title of action step",
      "detail": "Actionable instructions for the admin",
      "deadline": "e.g. Within 24 Hours / Immediate"
    }}
  ],
  "compliance_notes": "Statutory, SLA, and confidentiality mandates the admin must adhere to."
}}

Policy Context:
{context_text}

Grievance Details:
- Category / Department: {category}
- Severity Level: {severity}
- Complaint Description: {grievance_text}

Respond ONLY with the JSON object. Do not include markdown fences (```json) or conversational preamble."""

    # Use higher token budget for detailed advisory JSON
    from rag.query_data import client
    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1500,
            temperature=0.1
        )
        llm_response = response.choices[0].message.content.strip()
    except Exception as llm_err:
        logger.error("LLM call failed in policy recommender: %s", llm_err)
        llm_response = ""

    # Clean potential markdown wrapping and extract JSON block
    cleaned_json = llm_response.strip()
    if "```json" in cleaned_json:
        cleaned_json = cleaned_json.split("```json")[1].split("```")[0].strip()
    elif "```" in cleaned_json:
        cleaned_json = cleaned_json.split("```")[1].split("```")[0].strip()

    parsed = None
    if cleaned_json:
        try:
            parsed = json.loads(cleaned_json)
        except Exception:
            # Try to fix unescaped control chars or newlines inside strings
            try:
                sanitized = re.sub(r'[\r\n\t]', ' ', cleaned_json)
                parsed = json.loads(sanitized)
            except Exception as parse_err:
                logger.warning("Failed to parse LLM JSON response: %s", parse_err)

    if parsed and isinstance(parsed, dict) and "recommended_steps" in parsed:
        parsed["citations"] = citations
        parsed["generated_at"] = datetime.utcnow().isoformat()
        if not citations:
            parsed["has_policy_match"] = False
        logger.info("RAG recommendation generated successfully in %.2fs (match=%s)", time.time() - start_time, parsed.get("has_policy_match"))
        return parsed

    # Fallback structured response
    return {
            "has_policy_match": has_policy_match,
            "primary_policy": citations[0]["source"] if citations else (f"{category} Policy" if has_policy_match else "General Puravankara Code of Conduct"),
            "executive_summary": f"High severity grievance classified under {category}. Follow standard investigation protocol with prioritized SLA handling.",
            "citations": citations,
            "recommended_steps": [
                {
                    "step_number": 1,
                    "title": "Immediate Complainant Contact & Safety Check",
                    "detail": "Acknowledge the complaint and ascertain if any immediate protective or interim measures are required.",
                    "deadline": "Within 24 Hours (L2 SLA)"
                },
                {
                    "step_number": 2,
                    "title": "Form Investigation / Review Panel",
                    "detail": f"Convene authorized representatives from {category} and Compliance to review statements and evidence.",
                    "deadline": "Within 48 Hours"
                },
                {
                    "step_number": 3,
                    "title": "Document Findings & Record Resolution",
                    "detail": "Record findings in the GRM portal, issue formal response to complainant, and archive audit trail.",
                    "deadline": "Within 5 Business Days"
                }
            ],
            "compliance_notes": "High-severity tickets carry a strict 24-hour initial SLA. Maintain strict confidentiality and non-retaliation protections.",
            "generated_at": datetime.utcnow().isoformat()
        }
