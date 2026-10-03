"""
rag/okf_schema.py — Google Open Knowledge Format (OKF) specification for Puravankara.

Standardizes organizational knowledge documents with machine-readable YAML frontmatter.
Strictly maps to Puravankara's 6 official departments and 3 user categories.
"""

from typing import Dict, Any, List, Optional
import yaml
import re

# Strictly aligned with backend/config/categories.py DEPARTMENTS
VALID_OKF_DEPARTMENTS = ["HR", "IC", "CRM", "CSD", "ESG", "Investors"]

# Strictly aligned with Puravankara 3-stakeholder architecture
VALID_STAKEHOLDERS = [
    "internal_employees",
    "contract_workforce",
    "external_stakeholders",
]

# Standard OKF Document Types
VALID_DOCUMENT_TYPES = [
    "policy",
    "procedure",
    "escalation_matrix",
    "faq",
    "declaration",
]


def validate_okf_frontmatter(metadata: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """Validate that the given frontmatter conforms strictly to the OKF specification."""
    if not isinstance(metadata, dict):
        return False, "Metadata must be a dictionary."

    # 1. Required fields
    required = ["id", "title", "department"]
    for field in required:
        if field not in metadata or not str(metadata[field]).strip():
            return False, f"Missing required OKF field: '{field}'."

    # 2. Strict department check
    dept = metadata.get("department", "").strip()
    if dept not in VALID_OKF_DEPARTMENTS:
        return False, f"Invalid department '{dept}'. Must be one of: {VALID_OKF_DEPARTMENTS}."

    # 3. Stakeholders check (if present)
    stakeholders = metadata.get("target_stakeholders", [])
    if isinstance(stakeholders, list):
        for s in stakeholders:
            if s not in VALID_STAKEHOLDERS:
                return False, f"Invalid stakeholder '{s}'. Must be one of: {VALID_STAKEHOLDERS}."

    return True, None


def parse_okf_markdown(content: str) -> tuple[Dict[str, Any], str]:
    """
    Parses a Markdown document containing OKF YAML frontmatter.
    Returns: (metadata_dict, clean_markdown_body)
    """
    if not content:
        return {}, ""

    # Match YAML frontmatter between opening and closing '---'
    pattern = r"^---\s*\n(.*?)\n---\s*\n(.*)$"
    match = re.match(pattern, content, re.DOTALL)

    if match:
        yaml_block = match.group(1)
        body = match.group(2)
        try:
            metadata = yaml.safe_load(yaml_block) or {}
            return metadata, body.strip()
        except Exception as e:
            print(f"[WARN] Failed to parse YAML frontmatter: {e}")
            return {}, content.strip()

    # If no YAML frontmatter, return empty metadata and full content
    return {}, content.strip()


def format_okf_document(metadata: Dict[str, Any], body: str) -> str:
    """Combines metadata dictionary and Markdown body into standard OKF format."""
    yaml_header = yaml.dump(
        metadata,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
    ).strip()
    return f"---\n{yaml_header}\n---\n\n{body.strip()}\n"
