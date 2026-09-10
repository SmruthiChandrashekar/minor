"""
report_generator.py
Generates PDF reports for grievances using reportlab.

Two variants:
  - generate_employee_report(grievance) → bytes  (sanitized, for the complainant)
  - generate_admin_report(grievance)    → bytes  (full details, for HEAD/super_admin)
"""

import io
import html
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT


def _safe_text(val, preserve_newlines: bool = True) -> str:
    """Safely escape text for ReportLab XML parser and convert newlines to <br/>."""
    if val is None or str(val).strip() == "":
        return "—"
    escaped = html.escape(str(val))
    if preserve_newlines:
        return escaped.replace("\n", "<br/>")
    return escaped


def _safe_p(val, style, preserve_newlines: bool = True) -> Paragraph:
    """Create a ReportLab Paragraph with safely escaped text."""
    return Paragraph(_safe_text(val, preserve_newlines), style)


# ── Puravankara brand colours ───────────────────────────────────────────────
BRAND_DARK   = colors.HexColor("#001a4d")
BRAND_MID    = colors.HexColor("#003366")
BRAND_ACCENT = colors.HexColor("#0066cc")
RESOLVED_CLR = colors.HexColor("#2e7d32")
REJECTED_CLR = colors.HexColor("#c62828")
GREY_LIGHT   = colors.HexColor("#f5f7fa")
GREY_BORDER  = colors.HexColor("#dee2e6")
TEXT_DARK    = colors.HexColor("#212529")
TEXT_MUTED   = colors.HexColor("#6c757d")


def _build_styles():
    base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "title", parent=base["Normal"],
            fontSize=20, fontName="Helvetica-Bold",
            textColor=colors.white, alignment=TA_CENTER, spaceAfter=2
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=base["Normal"],
            fontSize=10, fontName="Helvetica",
            textColor=colors.HexColor("#b0c4de"), alignment=TA_CENTER
        ),
        "section_heading": ParagraphStyle(
            "section_heading", parent=base["Normal"],
            fontSize=11, fontName="Helvetica-Bold",
            textColor=BRAND_DARK, spaceBefore=14, spaceAfter=6
        ),
        "label": ParagraphStyle(
            "label", parent=base["Normal"],
            fontSize=8, fontName="Helvetica-Bold",
            textColor=TEXT_MUTED, spaceAfter=1
        ),
        "value": ParagraphStyle(
            "value", parent=base["Normal"],
            fontSize=10, fontName="Helvetica",
            textColor=TEXT_DARK, spaceAfter=4
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"],
            fontSize=10, fontName="Helvetica",
            textColor=TEXT_DARK, leading=15, spaceAfter=6
        ),
        "footer": ParagraphStyle(
            "footer", parent=base["Normal"],
            fontSize=8, fontName="Helvetica",
            textColor=TEXT_MUTED, alignment=TA_CENTER
        ),
        "status_resolved": ParagraphStyle(
            "status_resolved", parent=base["Normal"],
            fontSize=13, fontName="Helvetica-Bold",
            textColor=RESOLVED_CLR, alignment=TA_CENTER
        ),
        "status_rejected": ParagraphStyle(
            "status_rejected", parent=base["Normal"],
            fontSize=13, fontName="Helvetica-Bold",
            textColor=REJECTED_CLR, alignment=TA_CENTER
        ),
        "status_in_progress": ParagraphStyle(
            "status_in_progress", parent=base["Normal"],
            fontSize=13, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#b45309"), alignment=TA_CENTER
        ),
        "policy_box": ParagraphStyle(
            "policy_box", parent=base["Normal"],
            fontSize=9, fontName="Helvetica",
            textColor=colors.HexColor("#0d47a1"), leading=13
        ),
        "disclaimer": ParagraphStyle(
            "disclaimer", parent=base["Normal"],
            fontSize=8, fontName="Helvetica-Oblique",
            textColor=TEXT_MUTED, alignment=TA_CENTER, leading=11
        ),
    }
    return styles


def _header_block(story, styles, report_type: str, grievance_id: str, generated_at: str):
    """Dark branded header banner."""
    header_data = [
        [Paragraph("PURAVANKARA", styles["title"])],
        [Paragraph("Grievance Redressal Management System", styles["subtitle"])],
        [Paragraph(f"{report_type} · #{grievance_id[:8].upper()}", styles["subtitle"])],
    ]
    header_table = Table(header_data, colWidths=[17 * cm])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND_DARK),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 20),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 20),
        ("ROUNDEDCORNERS", [6]),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.3 * cm))

    meta_data = [[
        Paragraph("Generated:", styles["label"]),
        Paragraph(generated_at, styles["value"]),
        Paragraph("Report Type:", styles["label"]),
        Paragraph(report_type, styles["value"]),
    ]]
    meta_table = Table(meta_data, colWidths=[3*cm, 5.5*cm, 3*cm, 5.5*cm])
    meta_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(meta_table)
    story.append(HRFlowable(width="100%", thickness=1, color=GREY_BORDER, spaceAfter=8))


def _status_badge(story, styles, status: str):
    """Coloured status pill."""
    if status == "Resolved":
        style = styles["status_resolved"]
        bg = colors.HexColor("#e8f5e9")
    elif status in ("Rejected", "Closed"):
        style = styles["status_rejected"]
        bg = colors.HexColor("#fce4ec")
    else:
        style = styles["status_in_progress"]
        bg = colors.HexColor("#fef3c7")

    badge = Table([[Paragraph(f"● {status.upper()}", style)]], colWidths=[17 * cm])
    badge.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), bg),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4]),
    ]))
    story.append(badge)
    story.append(Spacer(1, 0.3 * cm))


def _two_col_row(label1, val1, label2, val2, styles, col_widths=None):
    col_widths = col_widths or [3.5*cm, 5*cm, 3.5*cm, 5*cm]
    row = Table([[
        Paragraph(label1, styles["label"]),
        _safe_p(val1, styles["value"], preserve_newlines=False),
        Paragraph(label2, styles["label"]),
        _safe_p(val2, styles["value"], preserve_newlines=False),
    ]], colWidths=col_widths)
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return row


def _section(story, styles, title: str, content_rows: list):
    story.append(Paragraph(title, styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
    for row in content_rows:
        story.append(row)
        story.append(Spacer(1, 0.15 * cm))


def _box(content_paragraphs, bg=None):
    """Wrap paragraphs in a light-background box table."""
    bg = bg or GREY_LIGHT
    inner = [[p] for p in content_paragraphs]
    t = Table(inner, colWidths=[16.5 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), bg),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("BOX",           (0, 0), (-1, -1), 0.5, GREY_BORDER),
        ("ROUNDEDCORNERS", [4]),
    ]))
    return t


def _fmt_date(iso_str):
    if not iso_str:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return str(iso_str)


def _sla_status(sla_deadline, resolved_at, is_closed=True):
    """Returns (label, met: bool)."""
    if not sla_deadline:
        return ("N/A", None)
    try:
        from datetime import timezone
        now = datetime.now(timezone.utc)
        dl = datetime.fromisoformat(sla_deadline.replace("Z", "+00:00"))

        if not is_closed:
            if now <= dl:
                diff = dl - now
                hours = int(diff.total_seconds() // 3600)
                return (f"ON TRACK ({hours}h remaining until deadline)", True)
            else:
                diff = now - dl
                hours = int(diff.total_seconds() // 3600)
                return (f"BREACHED ({hours}h overdue)", False)

        if not resolved_at:
            return ("N/A", None)
        ra = datetime.fromisoformat(resolved_at.replace("Z", "+00:00"))
        if ra <= dl:
            diff = dl - ra
            hours = int(diff.total_seconds() // 3600)
            return (f"MET (resolved {hours}h before deadline)", True)
        else:
            diff = ra - dl
            hours = int(diff.total_seconds() // 3600)
            return (f"BREACHED (resolved {hours}h after deadline)", False)
    except Exception:
        return ("Unknown", None)


# ── PUBLIC API ───────────────────────────────────────────────────────────────

def generate_employee_report(grievance: dict) -> bytes:
    """
    Sanitized PDF report for the grievance complainant.
    No admin identities, no internal notes.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=1.5*cm, bottomMargin=2*cm,
        title="Grievance Resolution Report"
    )
    styles = _build_styles()
    story  = []
    now    = datetime.now().strftime("%d %b %Y, %I:%M %p")
    status = grievance.get("status", "Resolved")

    # Header
    _header_block(story, styles, "Grievance Resolution Report", grievance.get("grievance_id", ""), now)

    # Status badge
    _status_badge(story, styles, status)

    # ── Section 1: Complaint Summary ─────────────────────────────────────
    story.append(Paragraph("Complaint Summary", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
    story.append(_two_col_row(
        "Tracking ID",  f"#{(grievance.get('grievance_id') or '')[:8].upper()}",
        "Date Filed",   _fmt_date(grievance.get("created_at")),
        styles
    ))
    story.append(_two_col_row(
        "Category",  grievance.get("category", "—"),
        "Severity",  grievance.get("severity", "—"),
        styles
    ))
    story.append(_two_col_row(
        "Department",    grievance.get("department", "—"),
        "Date Resolved", _fmt_date(grievance.get("updated_at")),
        styles
    ))
    story.append(Spacer(1, 0.2 * cm))

    if grievance.get("description"):
        story.append(Paragraph("Your Complaint", styles["label"]))
        story.append(_box([_safe_p(grievance["description"], styles["body"])]))
        story.append(Spacer(1, 0.3 * cm))

    # ── Section 2: Resolution ────────────────────────────────────────────
    story.append(Paragraph("Resolution", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))

    reason = grievance.get("resolution_reason") or "No specific reason provided."
    action_label = "Resolution Summary" if status == "Resolved" else "Reason for Rejection"
    story.append(Paragraph(action_label, styles["label"]))
    reason_bg = colors.HexColor("#e8f5e9") if status == "Resolved" else colors.HexColor("#fce4ec")
    story.append(_box([_safe_p(reason, styles["body"])], bg=reason_bg))
    story.append(Spacer(1, 0.3 * cm))

    # ── Section 3: Relevant Policy Reference ────────────────────────────
    rag = grievance.get("rag_recommendation")
    if rag and isinstance(rag, dict):
        story.append(Paragraph("Relevant Policy Reference", styles["section_heading"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
        policy_name = rag.get("policy_name") or rag.get("source") or "HR Policy"
        summary     = rag.get("summary") or rag.get("recommendation") or ""
        policy_items = [
            Paragraph(f"Policy: {_safe_text(policy_name, False)}", styles["policy_box"]),
        ]
        if summary:
            policy_items.append(_safe_p(summary[:500], styles["policy_box"]))
        story.append(_box(policy_items, bg=colors.HexColor("#e3f2fd")))
        story.append(Spacer(1, 0.3 * cm))

    # ── Footer ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
    story.append(Paragraph(
        "This report is auto-generated by the Puravankara Grievance Redressal Management System. "
        "For queries, contact your HR department. This document is confidential.",
        styles["disclaimer"]
    ))

    doc.build(story)
    return buf.getvalue()


def generate_admin_report(grievance: dict) -> bytes:
    """
    Full admin PDF report for HEAD / super_admin.
    Includes escalation history, SLA analysis, RAG recommendation, admin details.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=1.5*cm, bottomMargin=2*cm,
        title="Admin Grievance Report"
    )
    styles = _build_styles()
    story  = []
    now    = datetime.now().strftime("%d %b %Y, %I:%M %p")
    status = grievance.get("status", "Resolved")

    # Header
    _header_block(story, styles, "Admin Grievance Report", grievance.get("grievance_id", ""), now)

    # Status badge
    _status_badge(story, styles, status)

    # ── Section 1: Complainant Info ──────────────────────────────────────
    story.append(Paragraph("Complainant Information", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
    is_anon = grievance.get("is_anonymous", False)
    story.append(_two_col_row(
        "Name",       "Anonymous" if is_anon else (grievance.get("submitter_name") or "—"),
        "Department", grievance.get("department", "—"),
        styles
    ))
    story.append(_two_col_row(
        "Contact Email", "Anonymous" if is_anon else (grievance.get("contact_email") or "—"),
        "Contact Phone", "Anonymous" if is_anon else (grievance.get("contact_phone") or "—"),
        styles
    ))
    story.append(_two_col_row(
        "Location",       grievance.get("location", "—"),
        "Incident Date",  grievance.get("incident_date", "—"),
        styles
    ))
    story.append(Spacer(1, 0.2 * cm))

    # ── Section 2: Complaint Details ─────────────────────────────────────
    story.append(Paragraph("Complaint Details", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
    story.append(_two_col_row(
        "Tracking ID",  f"#{(grievance.get('grievance_id') or '')[:8].upper()}",
        "Date Filed",   _fmt_date(grievance.get("created_at")),
        styles
    ))
    story.append(_two_col_row(
        "Category",  grievance.get("category", "—"),
        "Severity",  grievance.get("severity", "—"),
        styles
    ))
    story.append(_two_col_row(
        "Assigned Queue", grievance.get("assigned_queue", "—"),
        "Assigned Tier",  grievance.get("assigned_tier", "—"),
        styles
    ))
    story.append(Spacer(1, 0.2 * cm))
    if grievance.get("description"):
        story.append(Paragraph("Description", styles["label"]))
        story.append(_box([_safe_p(grievance["description"], styles["body"])]))
        story.append(Spacer(1, 0.3 * cm))

    # ── Section 3: SLA Analysis ───────────────────────────────────────────
    story.append(Paragraph("SLA & Timeline", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
    is_closed = status in ("Resolved", "Rejected", "Closed")
    sla_label, sla_met = _sla_status(grievance.get("sla_deadline"), grievance.get("updated_at"), is_closed=is_closed)
    sla_bg = colors.HexColor("#e8f5e9") if sla_met else (colors.HexColor("#fce4ec") if sla_met is False else GREY_LIGHT)
    story.append(_two_col_row(
        "SLA Hours",    f"{grievance.get('sla_hours', '—')}h",
        "SLA Deadline", _fmt_date(grievance.get("sla_deadline")),
        styles
    ))
    story.append(Paragraph("SLA Status", styles["label"]))
    story.append(_box([_safe_p(sla_label, styles["body"])], bg=sla_bg))
    story.append(_two_col_row(
        "Filed At",         _fmt_date(grievance.get("created_at")),
        "Last Updated At",  _fmt_date(grievance.get("updated_at")),
        styles
    ))
    story.append(Spacer(1, 0.3 * cm))

    # ── Section 4: Escalation & Action History ────────────────────────────
    escalation = grievance.get("escalation_history") or []
    if escalation:
        story.append(Paragraph("Escalation & Action History", styles["section_heading"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
        esc_rows = [
            [
                Paragraph("Step", styles["label"]),
                Paragraph("Tier / Handler", styles["label"]),
                Paragraph("Action & Details", styles["label"]),
                Paragraph("Timestamp", styles["label"]),
            ]
        ]
        for i, entry in enumerate(escalation, 1):
            tier_handler = entry.get("tier") or entry.get("handler")
            if not tier_handler:
                if entry.get("from_tier") or entry.get("to_tier"):
                    tier_handler = f"{_safe_text(entry.get('from_tier'), False)} → {_safe_text(entry.get('to_tier'), False)}"
                else:
                    tier_handler = "System"
            elif entry.get("handler") and entry.get("tier") and entry.get("handler") != entry.get("tier"):
                tier_handler = f"[{_safe_text(entry.get('tier'), False)}]<br/>{_safe_text(entry.get('handler'), False)}"
            else:
                tier_handler = _safe_text(tier_handler, False)

            if entry.get("reason") == "SLA_BREACH":
                action_text = f"Auto-escalated: SLA Breach ({_safe_text(entry.get('from_tier', ''), False)} → {_safe_text(entry.get('to_tier', ''), False)})"
            elif entry.get("action"):
                action_text = _safe_text(entry.get("action"), False)
            elif entry.get("reason"):
                action_text = f"Escalated ({_safe_text(entry.get('reason'), False)})"
            else:
                action_text = "Action logged"

            if entry.get("notes"):
                safe_notes = _safe_text(entry.get("notes"))
                action_text += f"<br/><font color='#4b5563' size='7'><i>Note: {safe_notes}</i></font>"

            ts = _fmt_date(entry.get("timestamp") or entry.get("escalated_at") or entry.get("at"))
            esc_rows.append([
                Paragraph(str(i), styles["value"]),
                Paragraph(str(tier_handler), styles["value"]),
                Paragraph(str(action_text), styles["value"]),
                Paragraph(str(ts), styles["value"]),
            ])
        esc_table = Table(esc_rows, colWidths=[1.2*cm, 4.3*cm, 6.5*cm, 5.0*cm])
        esc_table.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), BRAND_DARK),
            ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, 0), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GREY_LIGHT]),
            ("GRID",          (0, 0), (-1, -1), 0.3, GREY_BORDER),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ]))
        story.append(esc_table)
        story.append(Spacer(1, 0.3 * cm))

    # ── Section 5: Resolution / Current Status ────────────────────────────
    story.append(Paragraph("Resolution & Case Status", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
    if is_closed:
        reason = grievance.get("resolution_reason") or "No reason provided."
        action_label = "Resolution Remarks" if status == "Resolved" else "Rejection Reason"
        reason_bg = colors.HexColor("#e8f5e9") if status == "Resolved" else colors.HexColor("#fce4ec")
        story.append(Paragraph(action_label, styles["label"]))
        story.append(_box([_safe_p(reason, styles["body"])], bg=reason_bg))
    else:
        story.append(Paragraph("Active Case Status", styles["label"]))
        story.append(_box([
            Paragraph(
                f"This grievance is actively <b>{_safe_text(status, False)}</b> and assigned to tier <b>{_safe_text(grievance.get('assigned_tier', 'L1'), False)}</b>.<br/>"
                "Review the Escalation & Action History above to inspect actions taken by prior tier handlers.",
                styles["body"]
            )
        ], bg=colors.HexColor("#fffbeb")))
    story.append(Spacer(1, 0.3 * cm))

    # ── Section 6: RAG Policy Recommendation ──────────────────────────────
    rag = grievance.get("rag_recommendation")
    if rag and isinstance(rag, dict):
        story.append(Paragraph("RAG Policy Recommendation", styles["section_heading"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
        has_match = grievance.get("policy_matched", False)
        match_label = "✓ Policy Match Found" if has_match else "✗ No Direct Policy Match"
        match_bg    = colors.HexColor("#e3f2fd") if has_match else GREY_LIGHT
        policy_items = [
            Paragraph(match_label, styles["policy_box"]),
            Paragraph(f"Policy: {_safe_text(rag.get('policy_name') or rag.get('source') or '—', False)}", styles["policy_box"]),
        ]
        summary = rag.get("summary") or rag.get("recommendation") or ""
        if summary:
            policy_items.append(_safe_p(summary[:800], styles["policy_box"]))
        story.append(_box(policy_items, bg=match_bg))
        story.append(Spacer(1, 0.3 * cm))

    # ── Footer ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY_BORDER, spaceAfter=6))
    story.append(Paragraph(
        "CONFIDENTIAL — FOR AUTHORISED PURAVANKARA MANAGEMENT USE ONLY. "
        "This report is auto-generated by the Puravankara GRMS and must not be shared externally.",
        styles["disclaimer"]
    ))

    doc.build(story)
    return buf.getvalue()
