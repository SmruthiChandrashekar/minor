"""
rag/generate_okf_bundle.py — Auto-converter for Puravankara policy documents to Google OKF.

Reads documents from rag/data/hr_policies/ (or rag/data/hr_policies_md/),
uses Groq LLM to accurately extract structured YAML metadata (strictly mapping to
the 6 official departments and 3 target stakeholders), cleans OCR noise,
and writes the standardized OKF bundle into rag/data/okf_policies/.
"""

import os
import sys
import re
import json
import time
import zipfile
import xml.etree.ElementTree as ET

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from groq import Groq
import okf_schema as okf

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
ENV_PATH = os.path.join(ROOT_DIR, "backend", ".env")
load_dotenv(ENV_PATH)

RAW_DATA_PATH = os.path.join(BASE_DIR, "data", "hr_policies")
MD_DATA_PATH = os.path.join(BASE_DIR, "data", "hr_policies_md")
OKF_OUTPUT_PATH = os.path.join(BASE_DIR, "data", "okf_policies")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY not configured in backend/.env")

groq_client = Groq(api_key=GROQ_API_KEY)
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")


def extract_docx_text(file_path: str) -> str:
    """Extract text from .docx file."""
    try:
        with zipfile.ZipFile(file_path) as z:
            xml_content = z.read("word/document.xml")
        root = ET.fromstring(xml_content)
        text_pieces = []
        for elem in root.iter():
            if elem.tag.endswith("}t") and elem.text:
                text_pieces.append(elem.text)
            elif elem.tag.endswith("}p"):
                text_pieces.append("\n")
        return "".join(text_pieces).strip()
    except Exception as e:
        print(f"Error reading docx {file_path}: {e}")
        return ""


def extract_raw_text(file_path: str) -> str:
    """Extract text from PDF, DOCX, MD, or TXT."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        try:
            loader = PyPDFLoader(file_path)
            pages = loader.load()
            return "\n\n".join([p.page_content for p in pages if p.page_content]).strip()
        except Exception as e:
            print(f"Error reading PDF {file_path}: {e}")
            return ""
    elif ext == ".docx":
        return extract_docx_text(file_path)
    elif ext in [".md", ".txt"]:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read().strip()
        except Exception as e:
            print(f"Error reading text {file_path}: {e}")
            return ""
    return ""


SYSTEM_METADATA_PROMPT = """You are an enterprise knowledge engineer for Puravankara Group.
Analyze the following policy document extract and produce a standard Google Open Knowledge Format (OKF) metadata descriptor.

You MUST respond strictly with valid JSON conforming to this schema:
{
  "id": "A short uppercase ID like POL-HR-001, POL-IC-002, POL-ESG-003, POL-INV-004, POL-CRM-005, or POL-CSD-006",
  "type": "One of: policy, procedure, escalation_matrix, faq, declaration",
  "title": "Clean, official policy title without typos",
  "department": "Strictly one of: 'HR', 'IC', 'CRM', 'CSD', 'ESG', 'Investors'",
  "target_stakeholders": ["Subset of: 'internal_employees', 'contract_workforce', 'external_stakeholders'"],
  "authority": "Issuing authority (e.g. 'Board of Directors', 'Head of Human Capital', 'ICC Committee', 'Compliance Officer')",
  "version": "Document version or year (e.g. '2025.1' or '2026.1')",
  "tags": ["3 to 6 lowercase keyword tags relevant to this policy"],
  "summary": "A 1-2 sentence high-level summary of what this policy governs"
}

GUIDANCE FOR DEPARTMENTS:
- 'IC': Prevention of Sexual Harassment (POSH), harassment, hostile workplace, gender sensitivity.
- 'HR': Employee conduct, leave, attendance, career progression, appraisals, relocation, training, dress code, internal disputes.
- 'CRM': Sales, bookings, allotment, agreements, pricing, customer commitments.
- 'CSD': Post-possession maintenance, construction defects, seepage, snags, facility management.
- 'ESG': Environmental sustainability, CSR, child labour, minimum wages for site workers, health & safety, standing orders.
- 'Investors': Shareholder relations, insider trading, SEBI disclosures, dividend distribution, board diversity, related party transactions.

Do not include any text outside the JSON block.
"""


def classify_and_extract_metadata(filename: str, sample_text: str) -> dict:
    """Use Groq to generate standard OKF metadata for the policy."""
    snippet = sample_text[:4000] if len(sample_text) > 4000 else sample_text
    prompt = f"DOCUMENT FILENAME: {filename}\n\nDOCUMENT CONTENT PREVIEW:\n{snippet}"

    try:
        response = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_METADATA_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content)

        # Validate department
        if data.get("department") not in okf.VALID_OKF_DEPARTMENTS:
            data["department"] = "HR"  # Safe default

        # Validate stakeholders
        valid_stk = []
        for s in data.get("target_stakeholders", []):
            if s in okf.VALID_STAKEHOLDERS:
                valid_stk.append(s)
        if not valid_stk:
            valid_stk = ["internal_employees"]
        data["target_stakeholders"] = valid_stk

        return data
    except Exception as e:
        print(f"Metadata generation failed for {filename}: {e}")
        clean_title = re.sub(r"[\_\-]+", " ", os.path.splitext(filename)[0]).title()
        return {
            "id": f"POL-HR-{abs(hash(filename)) % 900 + 100}",
            "type": "policy",
            "title": clean_title,
            "department": "HR",
            "target_stakeholders": ["internal_employees"],
            "authority": "Puravankara Group Compliance",
            "version": "2026.1",
            "tags": ["workplace", "policy"],
            "summary": f"Puravankara operational policy for {clean_title}."
        }


def clean_markdown_body(text: str) -> str:
    """Clean OCR glitches and normalize formatting."""
    if not text:
        return ""
    text = text.replace("\x00", "")
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_okf_bundle():
    """Converts policy documents to OKF and saves in rag/data/okf_policies/."""
    os.makedirs(OKF_OUTPUT_PATH, exist_ok=True)

    # Source files: check hr_policies/ and hr_policies_md/
    processed_count = 0
    all_files = []

    if os.path.exists(RAW_DATA_PATH):
        for f in sorted(os.listdir(RAW_DATA_PATH)):
            if f.lower().endswith((".pdf", ".docx", ".md", ".txt")) and not f.startswith("."):
                all_files.append((os.path.join(RAW_DATA_PATH, f), f))

    print(f"\n[OKF BUNDLE] Found {len(all_files)} files to standardize into Google OKF...")

    manifest = []

    for full_path, filename in all_files:
        base_name = os.path.splitext(filename)[0]
        out_filename = f"{base_name}.md"
        out_path = os.path.join(OKF_OUTPUT_PATH, out_filename)

        print(f"  -> Processing: {filename} ...", end=" ", flush=True)

        raw_text = extract_raw_text(full_path)
        if not raw_text or len(raw_text.strip()) < 50:
            print("SKIPPED (empty or unreadable)")
            continue

        clean_body = clean_markdown_body(raw_text)
        meta = classify_and_extract_metadata(filename, clean_body)
        meta["okf_spec"] = "0.2"
        meta["provenance"] = {
            "source_file": filename,
            "converted_at": time.strftime("%Y-%m-%d"),
        }

        # Format document with standard YAML frontmatter
        okf_doc = okf.format_okf_document(meta, clean_body)

        with open(out_path, "w", encoding="utf-8") as out_f:
            out_f.write(okf_doc)

        manifest.append(meta)
        processed_count += 1
        print(f"OK ({meta['id']} -> Dept: {meta['department']})")

    # Save OKF Manifest for instant metadata lookup
    manifest_path = os.path.join(OKF_OUTPUT_PATH, "okf_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2)

    print(f"\n[SUCCESS] Generated {processed_count} OKF policy documents in '{OKF_OUTPUT_PATH}'!")
    print(f"[SUCCESS] OKF Manifest saved to '{manifest_path}'.\n")


if __name__ == "__main__":
    build_okf_bundle()
