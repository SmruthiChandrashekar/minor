import React, { useState, useEffect, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import { ThemeContext } from "../context/ThemeContext";
import { supabase } from "../services/supabaseClient";
import { translateList } from "../services/translationService";
import { apiClient } from "../services/api";
import AdminAnalytics from "../components/AdminAnalytics";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import "./AdminDashboard.css";

const DEPT_COLORS = [
  "#142841", "#798da6", "#a82646", "#0c7cd5",
  "#f59e0b", "#2e7d32", "#6a0dad", "#00838f", "#e65100", "#558b2f"
];

const DeptPieTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-3 fs-13 admin-chart-tooltip">
        <div className="fw-semibold admin-chart-tooltip-name">{payload[0].name}</div>
        <div className="admin-chart-tooltip-value">{payload[0].value} grievance{payload[0].value !== 1 ? "s" : ""}</div>
      </div>
    );
  }
  return null;
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { userDetails: admin, isSuperAdmin } = useAuth();
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  
  const [grievances, setGrievances] = useState([]);
  const [translatedGrievances, setTranslatedGrievances] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dept pie chart (super admin only)
  const [deptDist, setDeptDist] = useState([]);
  const [deptDistLoading, setDeptDistLoading] = useState(false);
  const [selectedDept, setSelectedDept] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [viewingAttachments, setViewingAttachments] = useState(null);
  const [tierFilter, setTierFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [downloadingReportId, setDownloadingReportId] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null); // slide-out panel

  // Resolution reason modal state
  const [pendingStatusChange, setPendingStatusChange] = useState(null); // { grievanceId, newStatus }
  const [resolutionReason, setResolutionReason] = useState("");
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Manual escalation state
  const [escalatingTicket, setEscalatingTicket] = useState(null);
  const [escalationReason, setEscalationReason] = useState("");
  const [escalationNotes, setEscalationNotes] = useState("");
  const [submittingEscalation, setSubmittingEscalation] = useState(false);

  // Report permission check: super_admin, HEAD, or current level admin (or higher)
  const canAdminGenerateReport = (ticket) => {
    if (!ticket) return false;
    if (isSuperAdmin) return true;
    const userTier = admin?.admin_tier || "HEAD";
    if (userTier === "HEAD") return true;
    const TIER_RANK = { "L1": 1, "L2": 2, "L3": 3, "HEAD": 4 };
    const userRank = TIER_RANK[userTier] || 4;
    const ticketRank = TIER_RANK[ticket.assigned_tier] || 1;
    return userRank >= ticketRank;
  };

  // RAG policy advisory state
  const [selectedRagTicket, setSelectedRagTicket] = useState(null);
  const [ragRecommendation, setRagRecommendation] = useState(null);
  const [loadingRag, setLoadingRag] = useState(false);
  const [copiedRecommendation, setCopiedRecommendation] = useState(false);

  // --- LEGACY DEPARTMENT NORMALIZER ---
  // Maps legacy database labels (e.g. Safety, POSH) to the 6 canonical enterprise departments:
  // HR, CRM, CSD, ESG, IC, Investors
  const normalizeTicket = (t) => {
    if (!t) return t;
    const rawDept = (t.department || "").trim().toUpperCase();
    const desc = (t.description || "").toLowerCase();
    let normDept = t.department || "CRM";
    let normCat = t.category || "General";

    if (rawDept === "SAFETY") {
      if (desc.includes("apartment") || desc.includes("flat") || desc.includes("electrical fault") || desc.includes("foundation") || desc.includes("materials")) {
        normDept = "CSD";
        normCat = "Building Snag";
      } else {
        normDept = "ESG";
        normCat = "Worker Safety";
      }
    } else if (rawDept === "POSH") {
      normDept = "IC";
      normCat = "POSH Policy";
    } else if (rawDept === "CHILD LABOUR") {
      normDept = "ESG";
      normCat = "Worker Safety";
    } else if (rawDept === "COMPLIANCE" || rawDept === "EXTERNAL RELATIONS" || rawDept === "-") {
      normDept = "CRM";
    } else if (rawDept === "INVESTOR" || rawDept === "INVESTORS") {
      normDept = "Investors";
    }

    return {
      ...t,
      department: normDept,
      category: normCat,
    };
  };

  // --- FETCH GRIEVANCES ---
  const fetchGrievances = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("grievances")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setGrievances((data || []).map(normalizeTicket));
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeptDist = async () => {
    try {
      setDeptDistLoading(true);
      const res = await apiClient("/api/admin/dept-category-distribution");
      if (res.ok) setDeptDist(await res.json());
    } catch (err) {
      console.error("Dept dist error:", err);
    } finally {
      setDeptDistLoading(false);
    }
  };

  useEffect(() => {
    if (!admin) { navigate("/admin"); return; }
    fetchGrievances();
    if (isSuperAdmin) fetchDeptDist();

    const channel = supabase
      .channel("grievances-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "grievances" },
        (payload) => setGrievances((prev) => [normalizeTicket(payload.new), ...prev])
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "grievances" },
        (payload) => setGrievances((prev) =>
          prev.map((g) => g.grievance_id === payload.new.grievance_id ? normalizeTicket(payload.new) : g)
        )
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [navigate, admin]);

  // Translate descriptions when grievances or language changes
  useEffect(() => {
    if (grievances.length === 0) { setTranslatedGrievances([]); return; }
    let cancelled = false;
    setTranslating(true);
    // Only translate 'description' — category/status/severity are fixed labels
    translateList(grievances, ["description"], language).then((result) => {
      if (!cancelled) { setTranslatedGrievances(result); setTranslating(false); }
    });
    return () => { cancelled = true; };
  }, [grievances, language]);

  // --- CANONICAL ENTERPRISE DEPARTMENTS & SYSTEM STATUS STATS ---
  const ALLOWED_DEPARTMENTS = ["HR", "CRM", "CSD", "ESG", "IC", "Investors"];
  const availableDepartments = ALLOWED_DEPARTMENTS;

  const systemStatusStats = useMemo(() => {
    const totalCount = grievances.length;
    const openCount = grievances.filter((g) => g.status === "Open" || g.status === "CHATBOT_HANDLING").length;
    const investigatingCount = grievances.filter((g) => g.status === "Investigating" || g.status === "HUMAN_HANDLING").length;
    const resolvedCount = grievances.filter((g) => g.status === "Resolved").length;
    const closedCount = grievances.filter((g) => g.status === "Closed" || g.status === "Rejected").length;

    const calcPct = (cnt) => (totalCount > 0 ? Math.round((cnt / totalCount) * 100) : 0);

    return {
      total: totalCount,
      open: openCount,
      openPct: calcPct(openCount),
      investigating: investigatingCount,
      investigatingPct: calcPct(investigatingCount),
      resolved: resolvedCount,
      resolvedPct: calcPct(resolvedCount),
      closed: closedCount,
      closedPct: calcPct(closedCount),
    };
  }, [grievances]);

  // --- FILTER BY ADMIN DEPARTMENT, TIER, SEVERITY & STATUS ---
  const isTierLocked = Boolean(admin?.admin_tier && ["L1", "L2", "L3"].includes(admin.admin_tier));
  const effectiveTier = isTierLocked ? admin.admin_tier : tierFilter;

  const departmentGrievances = admin
    ? translatedGrievances.filter(
        (g) => isSuperAdmin || g.department === admin.department
      )
    : [];

  const filtered = departmentGrievances.filter((g) => {
    // Super admin department filter
    if (isSuperAdmin && departmentFilter !== "ALL") {
      const gDept = g.department?.trim().toLowerCase();
      const targetDept = departmentFilter.trim().toLowerCase();
      if (gDept !== targetDept) return false;
    }
    // Severity filter
    if (severityFilter !== "ALL" && g.severity !== severityFilter) {
      return false;
    }
    // Status filter
    if (statusFilter !== "ALL") {
      if (statusFilter === "Closed") {
        if (g.status !== "Closed" && g.status !== "Rejected") return false;
      } else if (statusFilter === "Open") {
        if (g.status !== "Open" && g.status !== "CHATBOT_HANDLING") return false;
      } else if (statusFilter === "Investigating") {
        if (g.status !== "Investigating" && g.status !== "HUMAN_HANDLING") return false;
      } else if (g.status !== statusFilter) {
        return false;
      }
    }
    // Tier filter
    if (effectiveTier !== "ALL" && g.assigned_tier !== effectiveTier) {
      return false;
    }
    return true;
  });

  // Status update
  const handleStatusChange = async (grievanceId, newStatus) => {
    const ticket = grievances.find((g) => g.grievance_id === grievanceId) || selectedTicket;
    if (ticket && ticket.status === newStatus) return;

    // Prompt for reason on EVERY status change across all admin levels
    setPendingStatusChange({
      grievanceId,
      newStatus,
      currentStatus: ticket?.status || "Open",
    });
    setResolutionReason("");
  };

  const _submitStatusUpdate = async (grievanceId, newStatus, reason) => {
    setUpdatingId(grievanceId);
    setSubmittingStatus(true);
    try {
      const res = await apiClient("/api/admin/update-status", {
        method: "PATCH",
        body: JSON.stringify({
          grievance_id: grievanceId,
          status: newStatus,
          resolution_reason: reason || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to update status");
      }
      setGrievances((prev) =>
        prev.map((g) =>
          g.grievance_id === grievanceId
            ? { ...g, status: newStatus, resolution_reason: reason }
            : g
        )
      );
      setSelectedTicket((prev) =>
        prev && prev.grievance_id === grievanceId
          ? { ...prev, status: newStatus, resolution_reason: reason }
          : prev
      );
      setPendingStatusChange(null);
      setResolutionReason("");
    } catch (err) {
      alert("Failed to update status: " + err.message);
    } finally {
      setUpdatingId(null);
      setSubmittingStatus(false);
    }
  };

  const getStatusModalConfig = (status) => {
    switch (status) {
      case "Resolved":
        return {
          title: "Resolve grievance",
          tone: "ok",
          label: "Resolution summary",
          placeholder: "Describe the actions taken and how the grievance was resolved…",
          btnText: "Resolve",
          description: "This summary is saved to the audit trail and shared with the complainant.",
        };
      case "Rejected":
        return {
          title: "Reject grievance",
          tone: "danger",
          label: "Reason for rejection",
          placeholder: "Explain why this grievance can't be accepted…",
          btnText: "Reject",
          description: "This reason is saved to the audit trail and shared with the complainant.",
        };
      case "Investigating":
        return {
          title: "Move to investigating",
          tone: "primary",
          label: "Investigation scope",
          placeholder: "Describe what will be inspected or investigated…",
          btnText: "Update status",
          description: "Record why this ticket is moving into active investigation.",
        };
      case "Open":
        return {
          title: "Set back to pending",
          tone: "primary",
          label: "Reason",
          placeholder: "Explain why this ticket is being reopened or set back to pending…",
          btnText: "Update status",
          description: "Record why this ticket is returning to pending.",
        };
      default:
        return {
          title: "Update status",
          tone: "primary",
          label: "Reason",
          placeholder: `Why is the status changing to ${status}?`,
          btnText: "Update status",
          description: "Every status change is recorded in the audit trail.",
        };
    }
  };

  const handleResolutionSubmit = () => {
    if (!resolutionReason.trim()) return;
    _submitStatusUpdate(
      pendingStatusChange.grievanceId,
      pendingStatusChange.newStatus,
      resolutionReason.trim()
    );
  };

  const handleEscalateSubmit = async () => {
    if (!escalatingTicket) return;
    setSubmittingEscalation(true);
    try {
      const res = await apiClient(`/api/admin/grievances/${escalatingTicket.grievance_id}/escalate`, {
        method: "POST",
        body: JSON.stringify({
          grievance_id: escalatingTicket.grievance_id,
          reason: escalationReason.trim() || "Manual Escalation",
          notes: escalationNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to escalate grievance");
      }
      const data = await res.json();
      const updated = data.grievance;
      setGrievances((prev) =>
        prev.map((g) => (g.grievance_id === updated.grievance_id ? updated : g))
      );
      if (selectedTicket && selectedTicket.grievance_id === updated.grievance_id) {
        setSelectedTicket(updated);
      }
      setEscalatingTicket(null);
      setEscalationReason("");
      setEscalationNotes("");
      alert(`Grievance successfully escalated to ${updated.assigned_tier}!`);
    } catch (err) {
      alert("Failed to escalate: " + err.message);
    } finally {
      setSubmittingEscalation(false);
    }
  };

  const handleDownloadAdminReport = async (grievanceId) => {
    setDownloadingReportId(grievanceId);
    try {
      const res = await apiClient(`/api/admin/grievances/${grievanceId}/report`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to generate report");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `admin_report_${grievanceId.substring(0, 8).toUpperCase()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Could not generate report: " + err.message);
    } finally {
      setDownloadingReportId(null);
    }
  };

  // Delete grievance
  const handleDelete = async (grievanceId) => {
    if (!window.confirm("Are you sure you want to delete this grievance? This action cannot be undone.")) {
      return;
    }

    try {
      setUpdatingId(grievanceId);
      const { error } = await supabase
        .from("grievances")
        .delete()
        .eq("grievance_id", grievanceId);

      if (error) throw error;
      
      setGrievances((prev) => prev.filter((g) => g.grievance_id !== grievanceId));
    } catch (err) {
      alert("Failed to delete grievance: " + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  // Open RAG resolution advisory
  const handleOpenRag = async (ticket) => {
    setSelectedRagTicket(ticket);
    setRagRecommendation(ticket.rag_recommendation || null);
    setCopiedRecommendation(false);

    // If no cached recommendation yet, fetch or generate via API
    if (!ticket.rag_recommendation) {
      setLoadingRag(true);
      try {
        const res = await apiClient(`/api/admin/grievances/${ticket.grievance_id}/recommendation`);
        if (res.ok) {
          const json = await res.json();
          setRagRecommendation(json.recommendation);
          setGrievances((prev) =>
            prev.map((g) =>
              g.grievance_id === ticket.grievance_id
                ? { ...g, rag_recommendation: json.recommendation, policy_matched: json.recommendation?.has_policy_match }
                : g
            )
          );
        }
      } catch (err) {
        console.error("Failed to load RAG recommendation:", err);
      } finally {
        setLoadingRag(false);
      }
    }
  };

  const handleRegenerateRag = async (grievanceId) => {
    setLoadingRag(true);
    try {
      const res = await apiClient(`/api/admin/grievances/${grievanceId}/recommendation`, {
        method: "POST"
      });
      if (res.ok) {
        const json = await res.json();
        setRagRecommendation(json.recommendation);
        setGrievances((prev) =>
          prev.map((g) =>
            g.grievance_id === grievanceId
              ? { ...g, rag_recommendation: json.recommendation, policy_matched: json.recommendation?.has_policy_match }
              : g
          )
        );
      }
    } catch (err) {
      console.error("Failed to regenerate RAG recommendation:", err);
    } finally {
      setLoadingRag(false);
    }
  };

  const handleCopyRecommendation = () => {
    if (!ragRecommendation) return;
    const stepsText = (ragRecommendation.recommended_steps || [])
      .map((s) => `${s.step_number}. ${s.title}: ${s.detail} (${s.deadline})`)
      .join("\n\n");
    const fullText = `PURAVANKARA RAG POLICY RESOLUTION GUIDANCE
Ticket ID: #${selectedRagTicket?.grievance_id}
Category: ${selectedRagTicket?.category} | Severity: ${selectedRagTicket?.severity}
Primary Policy: ${ragRecommendation.primary_policy || "General Operating Standards"}

Executive Summary:
${ragRecommendation.executive_summary || ""}

Recommended Procedural Steps:
${stepsText}

Compliance & SLA Notes:
${ragRecommendation.compliance_notes || ""}`;

    navigator.clipboard.writeText(fullText);
    setCopiedRecommendation(true);
    setTimeout(() => setCopiedRecommendation(false), 3000);
  };


  // Status badge (uses i18n for labels); colors live in AdminDashboard.css
  const STATUS_TONES = { Open: "open", Investigating: "investigating", Resolved: "resolved", Closed: "closed", CHATBOT_HANDLING: "chatbot", HUMAN_HANDLING: "human" };
  const getStatusBadge = (status) => {
    const labels = { Open: t("pending"), Investigating: t("inProgress"), Resolved: t("resolved"), Closed: t("rejected"), CHATBOT_HANDLING: "Chatbot", HUMAN_HANDLING: "Human" };
    return (
      <span className={`px-3 py-1 rounded-pill fw-semibold fs-12 text-nowrap tone-badge status-${STATUS_TONES[status] || "other"}`}>
        {labels[status] || status}
      </span>
    );
  };

  // Severity badge
  const getSeverityBadge = (severity) => {
    const tone = ["Critical", "High", "Medium", "Low"].includes(severity) ? severity.toLowerCase() : "other";
    return (
      <span className={`px-2 py-1 rounded-pill fw-semibold fs-11 tone-badge severity-${tone}`}>
        {severity}
      </span>
    );
  };

  // Sla status helper
  const getSlaStatus = (g) => {
    if (!g.sla_deadline || !g.assigned_tier) return null;
    if (g.status === 'Resolved' || g.status === 'Closed') return null;
    const deadline = new Date(g.sla_deadline);
    const now = new Date();
    const hoursLeft = (deadline - now) / 3600000;
    if (hoursLeft < 0) return { label: 'Escalated', tone: 'overdue' };
    if (hoursLeft < 4) return { label: `${Math.round(hoursLeft)}h left`, tone: 'due-soon' };
    return { label: `${Math.round(hoursLeft)}h left`, tone: 'on-track' };
  };

  // Tier badge
  const getTierBadge = (tier) => {
    if (!tier) return <span className="text-theme-muted fs-12">—</span>;
    const tone = ["L1", "L2", "L3", "HEAD"].includes(tier) ? tier.toLowerCase() : "other";
    return (
      <span className={`px-2 py-1 rounded-pill fw-bold fs-11 tone-badge tier-${tone}`}>
        {tier}
      </span>
    );
  };

  const handleExport = async (format) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      let url = `${import.meta.env.VITE_API_BASE_URL}/api/admin/export?format=${format}`;
      if (!isSuperAdmin && admin?.department) {
        url += `&department=${encodeURIComponent(admin.department)}`;
      }
      
      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to export data");
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `grievances_export.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Export Error:", err);
      alert("Failed to export data. Please try again.");
    }
  };

  if (!admin) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
        <div className="spinner-border text-primary mb-3" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="text-muted fw-semibold" style={{ fontSize: "14px" }}>Loading Dashboard...</p>
      </div>
    );
  }

  const total        = filtered.length;
  const open         = filtered.filter((g) => g.status === "Open").length;
  const investigating = filtered.filter((g) => g.status === "Investigating").length;
  const resolved     = filtered.filter((g) => g.status === "Resolved").length;
  const closed       = filtered.filter((g) => g.status === "Closed" || g.status === "Rejected").length;

  return (
    <div className="container-fluid mt-4 mb-5 px-5">

      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom">
        <div>
          <h2 className="fw-bold mb-1 text-heading">
            {t("adminDashboard")}
          </h2>
          <p className="text-muted mb-0">
            {t("welcomeBack")} <strong className="text-dark">{admin.name}</strong> —{" "}
            <span className="badge px-2 py-1 rounded-pill admin-tier-pill">
              {admin?.department || (isSuperAdmin ? "Super Admin" : "General")}
            </span>{" "}
            {admin.admin_tier ? (
              <span className={`badge px-2 py-1 rounded-pill ms-1 admin-queue-pill${admin.admin_tier === "HEAD" ? " is-head" : ""}`}>
                {admin.admin_tier === "HEAD" ? "Department Head" : `${admin.admin_tier} Queue`}
              </span>
            ) : (
              <span className="badge bg-secondary px-2 py-1 rounded-pill ms-1">
                All Tiers
              </span>
            )}{" "}
            {t("department")}
          </p>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <button 
            onClick={() => navigate("/profile")} 
            className="btn btn-outline-secondary btn-sm fw-bold shadow-sm rounded-pill px-3"
          >
            My Profile
          </button>
          <button onClick={() => handleExport("csv")} className="btn btn-outline-primary btn-sm fw-bold shadow-sm rounded-3">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="me-1 mb-1">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            CSV
          </button>
          <button onClick={() => handleExport("pdf")} className="btn btn-outline-danger btn-sm fw-bold shadow-sm rounded-3">
             <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="me-1 mb-1">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* ADVANCED ANALYTICS & FILTERS */}
      <AdminAnalytics adminDepartment={isSuperAdmin ? "" : (admin?.department || "")} />

      {/* SUPER ADMIN OVERVIEW: DEPT PIE CHART + SEPARATE STATUS OVERVIEW CARD */}
      {isSuperAdmin && (() => {
        // Build dept → { category: count } map (only ALLOWED_DEPARTMENTS)
        const deptMap = {};
        deptDist.forEach(({ department, category, count }) => {
          const canonical = ALLOWED_DEPARTMENTS.find(d => d.toLowerCase() === department?.trim().toLowerCase());
          if (!canonical) return;
          if (!deptMap[canonical]) deptMap[canonical] = {};
          deptMap[canonical][category] = (deptMap[canonical][category] || 0) + count;
        });
        const deptTotals = Object.entries(deptMap).map(([name, cats], i) => ({
          name, value: Object.values(cats).reduce((a, b) => a + b, 0), index: i
        }));
        const totalAll = deptTotals.reduce((a, b) => a + b.value, 0);
        const activeDept = selectedDept && deptMap[selectedDept]
          ? Object.entries(deptMap[selectedDept]).map(([name, value]) => ({ name, value }))
          : null;

        return (
          <div className="row g-4 mb-4">
            {/* CARD 1: DEPARTMENT PIE CHART */}
            <div className="col-xl-7 col-lg-7">
              <div className="card shadow-sm border-0 h-100 p-4" style={{ borderRadius: 14 }}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h6 className="fw-bold mb-0" style={{ color: "var(--heading-color)" }}>
                      <i className="bi bi-pie-chart-fill me-2" style={{ color: isDark ? "#e4e4e7" : "#0c7cd5" }} />
                      Grievance Distribution by Department
                    </h6>
                    <small className="text-muted" style={{ fontSize: "12px" }}>
                      {activeDept ? `Drilldown for ${selectedDept}` : "Click a slice or row to view category breakdown"}
                    </small>
                  </div>
                  {selectedDept && (
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setDepartmentFilter(selectedDept)}
                        title="Filter complaints table below"
                        style={{ fontSize: "12px" }}
                      >
                        <i className="bi bi-funnel me-1"></i> Filter Table
                      </button>
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelectedDept(null)} style={{ fontSize: "12px" }}>
                        ← All Departments
                      </button>
                    </div>
                  )}
                </div>

                {deptDistLoading ? (
                  <div className="text-center py-5">
                    <div className="spinner-border spinner-border-sm text-primary" />
                  </div>
                ) : deptTotals.length === 0 ? (
                  <div className="text-muted text-center py-5">No department data available.</div>
                ) : (
                  <div className="row g-3 align-items-center">
                    {/* Pie */}
                    <div className="col-md-5 text-center">
                      <ResponsiveContainer width="100%" height={230}>
                        <PieChart>
                          <Pie
                            data={activeDept || deptTotals}
                            cx="50%" cy="50%"
                            innerRadius={55} outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            onClick={(entry) => { if (!activeDept) setSelectedDept(entry.name); }}
                            style={{ cursor: activeDept ? "default" : "pointer" }}
                          >
                            {(activeDept || deptTotals).map((_, i) => (
                              <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<DeptPieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      {!activeDept && (
                        <div className="text-center" style={{ fontSize: "11px", color: "#94a3b8" }}>
                          Click slice to drill down
                        </div>
                      )}
                    </div>

                    {/* Table */}
                    <div className="col-md-7">
                      <div className="table-responsive" style={{ maxHeight: "230px", overflowY: "auto" }}>
                        <table className="table table-hover align-middle mb-0" style={{ fontSize: 12 }}>
                          <thead className="table-light sticky-top">
                            <tr>
                              <th className="px-2 py-2">{activeDept ? "Category" : "Department"}</th>
                              <th className="py-2 text-center">Count</th>
                              <th className="py-2">Share</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(activeDept || deptTotals)
                              .sort((a, b) => b.value - a.value)
                              .map((row, i) => {
                                const totalBase = activeDept
                                  ? (deptMap[selectedDept] ? Object.values(deptMap[selectedDept]).reduce((a, b) => a + b, 0) : totalAll)
                                  : totalAll;
                                const pct = totalBase > 0 ? Math.round((row.value / totalBase) * 100) : 0;
                                return (
                                  <tr
                                    key={row.name}
                                    style={{ cursor: activeDept ? "default" : "pointer" }}
                                    onClick={() => { if (!activeDept) setSelectedDept(row.name); }}
                                  >
                                    <td className="px-2 fw-semibold">
                                      <span style={{
                                        width: 8, height: 8, borderRadius: "50%",
                                        backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length],
                                        display: "inline-block", marginRight: 6
                                      }} />
                                      {row.name}
                                    </td>
                                    <td className="text-center fw-bold">{row.value}</td>
                                    <td>
                                      <div className="d-flex align-items-center gap-1">
                                        <div className="progress flex-grow-1" style={{ height: 5, borderRadius: 4 }}>
                                          <div
                                            className="progress-bar"
                                            role="progressbar"
                                            style={{ width: `${pct}%`, backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }}
                                          />
                                        </div>
                                        <span style={{ fontSize: 10, minWidth: 26, color: "#64748b" }}>{pct}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 2: SEPARATE STATUS OF ALL GRIEVANCES CARD IN NUMBERS */}
            <div className="col-xl-5 col-lg-5">
              <div className="card shadow-sm border-0 h-100 p-4" style={{ borderRadius: 14 }}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h6 className="fw-bold mb-0" style={{ color: "var(--heading-color)" }}>
                      <i className="bi bi-card-checklist me-2" style={{ color: isDark ? "#38bdf8" : "#0284c7" }} />
                      All Grievances Status
                    </h6>
                    <small className="text-muted" style={{ fontSize: "12px" }}>
                      Live breakdown of all system grievances by stage
                    </small>
                  </div>
                  <span className="badge px-3 py-2 rounded-pill fw-bold" style={{
                    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "#001a4d",
                    color: "#ffffff",
                    fontSize: "12px"
                  }}>
                    {systemStatusStats.total} Total
                  </span>
                </div>

                {/* 2x2 STATUS METRIC TILES FOLLOWING GRIEVANCE STATUS COLOR CODE */}
                <div className="row g-3">
                  {[
                    {
                      statusKey: "Open",
                      label: t("pending") || "Pending",
                      subLabel: "Awaiting initial triage",
                      count: systemStatusStats.open,
                      pct: systemStatusStats.openPct,
                      icon: "bi-clock-history",
                      barColor: "#64748b",
                      // EXACT COLOR CODE FROM getStatusBadge
                      light: {
                        bg: "#f1f5f9",
                        border: "#cbd5e1",
                        activeBorder: "#475569",
                        text: "#334155",
                        badgeBg: "#e2e8f0",
                        badgeText: "#334155",
                        iconColor: "#64748b"
                      },
                      dark: {
                        bg: "rgba(255, 255, 255, 0.05)",
                        border: "rgba(255, 255, 255, 0.14)",
                        activeBorder: "#e4e4e7",
                        text: "#f4f4f5",
                        badgeBg: "rgba(255, 255, 255, 0.12)",
                        badgeText: "#e4e4e7",
                        iconColor: "#a1a1aa"
                      }
                    },
                    {
                      statusKey: "Investigating",
                      label: t("inProgress") || "In Progress",
                      subLabel: "Under active investigation",
                      count: systemStatusStats.investigating,
                      pct: systemStatusStats.investigatingPct,
                      icon: "bi-search",
                      barColor: "#f59e0b",
                      // EXACT COLOR CODE FROM getStatusBadge
                      light: {
                        bg: "#fff8e1",
                        border: "#fde68a",
                        activeBorder: "#f59e0b",
                        text: "#b45309",
                        badgeBg: "#fef3c7",
                        badgeText: "#b45309",
                        iconColor: "#f59e0b"
                      },
                      dark: {
                        bg: "rgba(245, 158, 11, 0.10)",
                        border: "rgba(245, 158, 11, 0.28)",
                        activeBorder: "#f59e0b",
                        text: "#fde047",
                        badgeBg: "rgba(245, 158, 11, 0.22)",
                        badgeText: "#fbbf24",
                        iconColor: "#fbbf24"
                      }
                    },
                    {
                      statusKey: "Resolved",
                      label: t("resolved") || "Resolved",
                      subLabel: "Satisfactorily resolved",
                      count: systemStatusStats.resolved,
                      pct: systemStatusStats.resolvedPct,
                      icon: "bi-check-circle-fill",
                      barColor: "#10b981",
                      // EXACT COLOR CODE FROM getStatusBadge
                      light: {
                        bg: "#ecfdf5",
                        border: "#a7f3d0",
                        activeBorder: "#10b981",
                        text: "#065f46",
                        badgeBg: "#d1fae5",
                        badgeText: "#065f46",
                        iconColor: "#10b981"
                      },
                      dark: {
                        bg: "rgba(16, 185, 129, 0.10)",
                        border: "rgba(16, 185, 129, 0.28)",
                        activeBorder: "#10b981",
                        text: "#34d399",
                        badgeBg: "rgba(16, 185, 129, 0.22)",
                        badgeText: "#34d399",
                        iconColor: "#34d399"
                      }
                    },
                    {
                      statusKey: "Closed",
                      label: t("rejected") || "Closed",
                      subLabel: "Closed or rejected",
                      count: systemStatusStats.closed,
                      pct: systemStatusStats.closedPct,
                      icon: "bi-x-circle-fill",
                      barColor: "#f43f5e",
                      // EXACT COLOR CODE FROM getStatusBadge
                      light: {
                        bg: "#fef2f2",
                        border: "#fecaca",
                        activeBorder: "#dc2626",
                        text: "#991b1b",
                        badgeBg: "#fee2e2",
                        badgeText: "#991b1b",
                        iconColor: "#dc2626"
                      },
                      dark: {
                        bg: "rgba(244, 63, 94, 0.10)",
                        border: "rgba(244, 63, 94, 0.28)",
                        activeBorder: "#f43f5e",
                        text: "#fda4af",
                        badgeBg: "rgba(244, 63, 94, 0.22)",
                        badgeText: "#fb7185",
                        iconColor: "#fb7185"
                      }
                    }
                  ].map((cfg) => {
                    const themeObj = isDark ? cfg.dark : cfg.light;
                    const isActive = statusFilter === cfg.statusKey;
                    return (
                      <div key={cfg.statusKey} className="col-6">
                        <div
                          onClick={() => setStatusFilter(statusFilter === cfg.statusKey ? "ALL" : cfg.statusKey)}
                          className="p-3 rounded-3 h-100 position-relative"
                          style={{
                            backgroundColor: themeObj.bg,
                            border: isActive
                              ? `2px solid ${themeObj.activeBorder}`
                              : `1px solid ${themeObj.border}`,
                            boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                            cursor: "pointer",
                            transition: "all 0.2s ease"
                          }}
                          onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                          onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                        >
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="fw-semibold" style={{ fontSize: "11px", textTransform: "uppercase", color: themeObj.text }}>
                              {cfg.label}
                            </span>
                            <i className={cfg.icon} style={{ color: themeObj.iconColor, fontSize: "14px" }} />
                          </div>
                          <div className="d-flex align-items-baseline gap-2">
                            <h3 className="fw-bold mb-0" style={{ color: themeObj.text }}>
                              {cfg.count}
                            </h3>
                            <span className="badge rounded-pill" style={{
                              backgroundColor: themeObj.badgeBg,
                              color: themeObj.badgeText,
                              fontSize: "10px"
                            }}>
                              {cfg.pct}%
                            </span>
                          </div>
                          <div className="text-muted mt-1" style={{ fontSize: "11px" }}>
                            {cfg.subLabel}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* DISTRIBUTION PROGRESS BAR USING STATUS COLOR CODES */}
                <div className="mt-3 pt-2">
                  <div className="d-flex justify-content-between align-items-center mb-1" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    <span>Resolution Ratio</span>
                    <span className="fw-semibold text-success">{systemStatusStats.resolvedPct}% Success</span>
                  </div>
                  <div className="progress" style={{ height: "8px", borderRadius: "6px", backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0" }}>
                    <div className="progress-bar" style={{ width: `${systemStatusStats.openPct}%`, backgroundColor: "#64748b" }} title={`Pending: ${systemStatusStats.open}`} />
                    <div className="progress-bar" style={{ width: `${systemStatusStats.investigatingPct}%`, backgroundColor: "#f59e0b" }} title={`In Progress: ${systemStatusStats.investigating}`} />
                    <div className="progress-bar" style={{ width: `${systemStatusStats.resolvedPct}%`, backgroundColor: "#10b981" }} title={`Resolved: ${systemStatusStats.resolved}`} />
                    <div className="progress-bar" style={{ width: `${systemStatusStats.closedPct}%`, backgroundColor: "#ef4444" }} title={`Closed: ${systemStatusStats.closed}`} />
                  </div>
                </div>

                {statusFilter !== "ALL" && (
                  <div className="d-flex align-items-center justify-content-between mt-2 pt-2 border-top" style={{ fontSize: "12px" }}>
                    <span className="fw-semibold d-flex align-items-center gap-2">
                      <i className="bi bi-funnel-fill text-muted" />
                      <span>Filter active:</span>
                      {getStatusBadge(statusFilter)}
                    </span>
                    <button
                      className="btn btn-link btn-sm p-0 text-decoration-none text-muted"
                      onClick={() => setStatusFilter("ALL")}
                    >
                      Clear filter
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* COMPLAINTS FILTER CONTROLS */}
      <div className="card shadow-sm border-0 mb-3 p-3" style={{ borderRadius: 12 }}>
        <div className="row g-3 align-items-end">
          {/* Department Filter (For Super Admin) */}
          {isSuperAdmin && (
            <div className="col-lg-3 col-md-4 col-sm-6">
              <label className="form-label mb-1 fw-bold text-muted d-flex align-items-center gap-1" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                <i className="bi bi-building"></i> Department
              </label>
              <select
                className="form-select form-select-sm"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                style={{
                  borderRadius: 8,
                  fontSize: "13px",
                  borderColor: departmentFilter !== "ALL" ? (isDark ? "#38bdf8" : "#0284c7") : undefined
                }}
              >
                <option value="ALL">All Departments ({grievances.length})</option>
                {ALLOWED_DEPARTMENTS.map((dept) => {
                  const count = grievances.filter((g) => g.department && g.department.trim().toLowerCase() === dept.toLowerCase()).length;
                  return (
                    <option key={dept} value={dept}>
                      {dept} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Severity Filter */}
          <div className="col-lg-3 col-md-4 col-sm-6">
            <label className="form-label mb-1 fw-bold text-muted d-flex align-items-center gap-1" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <i className="bi bi-exclamation-triangle"></i> Severity
            </label>
            <select
              className="form-select form-select-sm"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{
                borderRadius: 8,
                fontSize: "13px",
                borderColor: severityFilter !== "ALL" ? (isDark ? "#f59e0b" : "#d97706") : undefined
              }}
            >
              <option value="ALL">All Severities</option>
              {["Critical", "High", "Medium", "Low"].map((sev) => {
                const count = departmentGrievances.filter((g) => g.severity === sev).length;
                return (
                  <option key={sev} value={sev}>
                    {sev} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Status Filter */}
          <div className="col-lg-3 col-md-4 col-sm-6">
            <label className="form-label mb-1 fw-bold text-muted d-flex align-items-center gap-1" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <i className="bi bi-funnel"></i> Status
            </label>
            <select
              className="form-select form-select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                borderRadius: 8,
                fontSize: "13px",
                borderColor: statusFilter !== "ALL" ? (isDark ? "#10b981" : "#059669") : undefined
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="Open">Pending / Open</option>
              <option value="Investigating">Investigating</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed / Rejected</option>
            </select>
          </div>

          {/* Results Summary & Clear Button */}
          <div className="col-lg-3 col-md-12 col-sm-6 ms-auto d-flex align-items-center justify-content-between justify-content-lg-end gap-2">
            <span className="text-muted" style={{ fontSize: "13px" }}>
              Showing <strong>{filtered.length}</strong> of {departmentGrievances.length}
            </span>
            {(departmentFilter !== "ALL" || severityFilter !== "ALL" || statusFilter !== "ALL" || tierFilter !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setDepartmentFilter("ALL");
                  setSeverityFilter("ALL");
                  setStatusFilter("ALL");
                  setTierFilter("ALL");
                }}
                className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                style={{ borderRadius: 8, fontSize: "12px", whiteSpace: "nowrap" }}
              >
                <i className="bi bi-x-circle"></i> Reset
              </button>
            )}
          </div>
        </div>

        {/* TIER QUEUE SELECTOR / SCOPE INDICATOR */}
        {isTierLocked ? (
          <div className="d-flex align-items-center justify-content-between p-3 mt-3 rounded shadow-sm"
            style={{
              backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "#eff6ff",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #bfdbfe"
            }}>
            <div className="d-flex align-items-center gap-2">
              <span className="badge px-3 py-2 rounded-pill fw-bold"
                style={{
                  fontSize: "12px",
                  backgroundColor: isDark ? "#27272a" : "#001a4d",
                  color: "#ffffff",
                  border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : "none"
                }}>
                {admin.admin_tier} QUEUE
              </span>
              <span style={{ fontSize: "14px", color: "var(--text-color)" }}>
                Viewing tickets assigned to <strong>{admin?.department || "All"} {admin?.admin_tier || ""}</strong> handling.
              </span>
            </div>
            <span className="badge px-3 py-2 rounded-pill fw-bold"
              style={{
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#fff",
                color: isDark ? "#f4f4f5" : "#0d6efd",
                border: isDark ? "1px solid rgba(255, 255, 255, 0.16)" : "1px solid #0d6efd"
              }}>
              {filtered.length} ticket{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
        ) : (
          <div className="pt-3 mt-3 border-top d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <span className="text-muted fw-bold me-1" style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Queue:</span>
              {["ALL", "L1", "L2", "L3", "HEAD"].map((t) => {
                const count = departmentGrievances.filter((g) => t === "ALL" || g.assigned_tier === t).length;
                const isActive = tierFilter === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTierFilter(t)}
                    className={`btn btn-sm rounded-pill fw-semibold ${isActive ? "shadow-sm" : "btn-outline-secondary"}`}
                    style={{
                      fontSize: "12px",
                      padding: "4px 12px",
                      backgroundColor: isActive ? (isDark ? "#27272a" : "#001a4d") : undefined,
                      borderColor: isActive ? (isDark ? "rgba(255, 255, 255, 0.22)" : "#001a4d") : undefined,
                      color: isActive ? "#ffffff" : undefined
                    }}
                  >
                    {t === "ALL" ? "All Tiers" : t === "HEAD" ? "HEAD (Escalations)" : `${t} Queue`}
                    <span className={`badge ms-2 rounded-pill ${isActive ? (isDark ? "bg-black text-light border border-secondary" : "bg-light text-dark") : (isDark ? "bg-secondary-subtle text-light" : "bg-secondary text-light")}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            {admin.admin_tier === "HEAD" && (
              <span className="badge px-3 py-2 rounded-pill fw-semibold"
                style={{
                  backgroundColor: isDark ? "rgba(239, 68, 68, 0.15)" : "#fee2e2",
                  color: isDark ? "#fca5a5" : "#b91c1c",
                  border: isDark ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid #fecaca",
                  fontSize: "12px"
                }}>
                Department Head View
              </span>
            )}
          </div>
        )}
      </div>

      {/* TABLE */}
      <div className="card shadow-sm border-0">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="text-muted mt-3">{t("searching")}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <h5 className="fw-bold mb-1">No complaints assigned</h5>
              <p className="mb-0 fs-14">
                Grievances matching your <strong>{admin?.department || "assigned"}</strong> {isTierLocked ? `${admin?.admin_tier || ""} queue` : "department"} will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="text-muted py-3 ps-4 fs-12">ID</th>
                    {isSuperAdmin && (
                      <th className="text-muted py-3 fs-12">Department</th>
                    )}
                    <th className="text-muted py-3 fs-12">{t("category")}</th>
                    <th className="text-muted py-3 fs-12">Severity</th>
                    <th className="text-muted py-3 fs-12">Description</th>
                    <th className="text-muted py-3 fs-12">Tier</th>
                    <th className="text-muted py-3 fs-12">SLA</th>
                    <th className="text-muted py-3 fs-12">{t("dateSubmitted")}</th>
                    <th className="text-muted py-3 fs-12">{t("status")}</th>
                    <th className="py-3 admin-col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                 {filtered.map((g) => (
                    <tr
                      key={g.grievance_id}
                      onClick={() => setSelectedTicket(g)}
                      className="admin-table-row"
                    >
                      <td className="fw-bold ps-4 admin-ticket-id">
                        #{g.grievance_id.substring(0, 8)}
                      </td>
                      {isSuperAdmin && (
                        <td>
                          <span className="badge rounded-pill fw-semibold" style={{
                            backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9",
                            color: isDark ? "#e4e4e7" : "#1e293b",
                            border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1",
                            fontSize: "11px"
                          }}>
                            {g.department || "General"}
                          </span>
                        </td>
                      )}
                      <td className="fw-semibold fs-13 admin-cell-heading">{g.category}</td>
                      <td>{getSeverityBadge(g.severity)}</td>
                      <td
                        className="overflow-hidden text-nowrap fs-13 admin-cell-desc"
                      >
                        {translating
                          ? <span className="spinner-border spinner-border-sm text-secondary" role="status" />
                          : g.description}
                      </td>
                      <td>
                        <div className="d-flex flex-column align-items-start gap-1">
                          {getTierBadge(g.assigned_tier)}
                          {(() => {
                            const esc = (g.escalation_history || []).filter(h => h.reason || h.from_tier);
                            if (esc.length === 0) return null;
                            const last = esc[esc.length - 1];
                            const isBreach = last.reason === "SLA_BREACH";
                            const reasonText = isBreach ? "SLA Breach" : (last.reason || "Escalated");
                            return (
                              <span
                                className="badge rounded-pill fw-semibold text-truncate d-inline-block"
                                style={{
                                  backgroundColor: isBreach
                                    ? (isDark ? "rgba(239, 68, 68, 0.18)" : "#fee2e2")
                                    : (isDark ? "rgba(245, 158, 11, 0.18)" : "#fef3c7"),
                                  color: isBreach
                                    ? (isDark ? "#fca5a5" : "#b91c1c")
                                    : (isDark ? "#fde047" : "#b45309"),
                                  border: isBreach
                                    ? (isDark ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid #fecaca")
                                    : (isDark ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid #fde68a"),
                                  fontSize: "10px",
                                  maxWidth: "125px",
                                  cursor: "help"
                                }}
                                title={`Escalated from ${last.from_tier || "Prior Tier"}: ${reasonText}${last.notes ? `\nNotes: "${last.notes}"` : ""}${last.handler ? `\nBy: ${last.handler}` : ""}`}
                              >
                                ↗ {reasonText}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td>
                        {(() => {
                          const sla = getSlaStatus(g);
                          if (!sla) return <span className="text-theme-muted fs-12">—</span>;
                          return (
                            <span className={`px-2 py-1 rounded-pill fw-semibold fs-11 tone-badge sla-${sla.tone}`}>
                              {sla.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="text-muted fs-13">
                        {new Date(g.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td>{getStatusBadge(g.status)}</td>
                      <td className="pe-4 text-end">
                        <svg className="text-theme-muted" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* TICKET DETAIL MODAL */}
      {selectedTicket && (() => {
        const isOpenTicket = !["Resolved", "Rejected", "Closed"].includes(selectedTicket.status);
        const sla = getSlaStatus(selectedTicket);
        const history = selectedTicket.escalation_history || [];
        const escEvents = history.filter(
          (h) => h.reason || h.from_tier || h.to_tier || h.action?.toLowerCase().includes("escalat")
        );
        const latestEsc = escEvents[escEvents.length - 1];
        const isBreach = latestEsc?.reason === "SLA_BREACH";
        const formatDateTime = (value) =>
          new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

        return (
        <div
          className="modal fade show d-block scrim-60"
          tabIndex="-1"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedTicket(null); }}
        >
          <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden ticket-modal">

              {/* Header */}
              <div className="modal-header px-4 py-3 ticket-header">
                <div className="min-w-0">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <h5 className="modal-title fw-bold mb-0 text-heading">
                      #{selectedTicket.grievance_id.substring(0, 8).toUpperCase()}
                    </h5>
                    {getStatusBadge(selectedTicket.status)}
                    {selectedTicket.severity && getSeverityBadge(selectedTicket.severity)}
                  </div>
                  <div className="fs-13 text-theme-muted mt-1">
                    {[...new Set([selectedTicket.category, selectedTicket.department].filter(Boolean))].join(" · ")}
                    {selectedTicket.assigned_tier ? ` · ${selectedTicket.assigned_tier} queue` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setSelectedTicket(null)}
                />
              </div>

              <div className="modal-body p-0">
                <div className="row g-0">

                  {/* MAIN — complaint, escalation, activity */}
                  <div className="col-12 col-lg-8 p-4 ticket-main">

                    <div className="ticket-section-label">Complaint</div>
                    <p className="fs-14 text-theme mb-0 ticket-description">
                      {selectedTicket.description}
                    </p>

                    {selectedTicket.resolution_reason && (
                      <div className="mt-4">
                        <div className="ticket-section-label">
                          {selectedTicket.status === "Resolved"
                            ? "Resolution summary"
                            : selectedTicket.status === "Rejected"
                            ? "Rejection reason"
                            : "Latest status note"}
                        </div>
                        <div className={`fs-13 text-theme admin-resolution-note is-${(selectedTicket.status || "").toLowerCase()}`}>
                          {selectedTicket.resolution_reason}
                        </div>
                      </div>
                    )}

                    {latestEsc && (
                      <div className={`ticket-escalation mt-4${isBreach ? " is-breach" : ""}`}>
                        <i className={`bi ${isBreach ? "bi-clock-history" : "bi-arrow-up-right"} ticket-escalation-icon`} />
                        <div className="min-w-0">
                          <div className="fs-13 fw-semibold text-heading">
                            {latestEsc.from_tier
                              ? `Escalated from ${latestEsc.from_tier} to ${latestEsc.to_tier || selectedTicket.assigned_tier}`
                              : `Escalated to ${selectedTicket.assigned_tier}`}
                            <span className="fw-normal text-theme-muted">
                              {" — "}{isBreach ? "SLA deadline expired" : (latestEsc.reason || "manual escalation")}
                            </span>
                          </div>
                          {latestEsc.notes && (
                            <div className="fs-13 text-theme mt-1">{latestEsc.notes}</div>
                          )}
                          <div className="fs-12 text-theme-muted mt-1">
                            {latestEsc.handler || "System"} · {formatDateTime(latestEsc.timestamp || latestEsc.escalated_at || latestEsc.at || selectedTicket.updated_at)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Activity timeline */}
                    <div className="mt-4">
                      <div className="ticket-section-label">
                        Activity <span className="text-theme-muted fw-normal">({history.length})</span>
                      </div>
                      {history.length > 0 ? (
                        <ol className="ticket-timeline list-unstyled mb-0">
                          {history.map((item, idx) => (
                            <li key={idx} className={`ticket-timeline-item${item.reason === "SLA_BREACH" ? " is-breach" : ""}`}>
                              <div className="d-flex justify-content-between gap-3">
                                <span className="fs-13 fw-semibold text-heading">
                                  {item.action || (item.from_tier ? `Escalated from ${item.from_tier} to ${item.to_tier}` : "Action logged")}
                                </span>
                                <span className="fs-12 text-theme-muted text-nowrap">
                                  {formatDateTime(item.timestamp || item.escalated_at || item.at)}
                                </span>
                              </div>
                              <div className="fs-12 text-theme-muted">
                                {item.handler || "System"}
                                {item.tier ? ` · ${item.tier}` : item.from_tier ? ` · ${item.from_tier} → ${item.to_tier}` : ""}
                              </div>
                              {item.reason && (
                                <div className="fs-13 text-theme mt-1">
                                  <span className="text-theme-muted">Reason: </span>
                                  {item.reason === "SLA_BREACH" ? "SLA deadline breach (automated)" : item.reason}
                                </div>
                              )}
                              {item.notes && (
                                <div className="fs-13 text-theme mt-1 ticket-timeline-note">{item.notes}</div>
                              )}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="fs-13 text-theme-muted mb-0">No actions recorded yet.</p>
                      )}
                    </div>
                  </div>

                  {/* SIDEBAR — details & actions */}
                  <div className="col-12 col-lg-4 p-4 ticket-sidebar">

                    <div className="ticket-section-label">Details</div>
                    <dl className="ticket-details mb-4">
                      <dt>Category</dt><dd>{selectedTicket.category || "—"}</dd>
                      <dt>Department</dt><dd>{selectedTicket.department || "—"}</dd>
                      <dt>Severity</dt><dd>{selectedTicket.severity || "—"}</dd>
                      <dt>Tier</dt><dd>{selectedTicket.assigned_tier || "—"}</dd>
                      <dt>SLA</dt>
                      <dd className="d-flex align-items-center gap-2 flex-wrap">
                        {selectedTicket.sla_hours ? `${selectedTicket.sla_hours}h` : !sla && "—"}
                        {sla && (
                          <span className={`px-2 py-1 rounded-pill fw-semibold fs-11 tone-badge sla-${sla.tone}`}>
                            {sla.label}
                          </span>
                        )}
                      </dd>
                      <dt>Submitted</dt>
                      <dd>{new Date(selectedTicket.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</dd>
                    </dl>

                    {isOpenTicket && (
                      <div className="mb-4">
                        <label className="ticket-section-label d-block" htmlFor="ticket-status">Status</label>
                        <select
                          id="ticket-status"
                          className="form-select form-select-sm fs-13"
                          value={["Open", "Investigating"].includes(selectedTicket.status) ? selectedTicket.status : ""}
                          disabled={updatingId === selectedTicket.grievance_id}
                          onChange={(e) => handleStatusChange(selectedTicket.grievance_id, e.target.value)}
                        >
                          {/* System-assigned statuses (e.g. HUMAN_HANDLING) aren't manual choices */}
                          <option value="" disabled hidden>Change status…</option>
                          <option value="Open">Pending</option>
                          <option value="Investigating">Investigating</option>
                          <option value="Resolved">Resolve</option>
                          <option value="Rejected">Reject</option>
                        </select>
                      </div>
                    )}

                    <div className="ticket-section-label">Actions</div>
                    <div className="d-flex flex-column gap-2">
                      {(["medium", "high", "critical"].includes(selectedTicket.severity?.toLowerCase()) || selectedTicket.policy_matched || selectedTicket.rag_recommendation) && (
                        <button
                          type="button"
                          className="btn admin-action is-primary"
                          onClick={() => { handleOpenRag(selectedTicket); setSelectedTicket(null); }}
                        >
                          <i className="bi bi-journal-text" />
                          View Policy Advice
                        </button>
                      )}

                      {selectedTicket.assigned_tier !== "HEAD" && isOpenTicket && (
                        <button
                          type="button"
                          className="btn admin-action"
                          onClick={() => {
                            setEscalatingTicket(selectedTicket);
                            setEscalationReason("");
                            setEscalationNotes("");
                          }}
                        >
                          <i className="bi bi-arrow-up-circle" />
                          Escalate to Next Tier
                        </button>
                      )}

                      {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
                        <button
                          type="button"
                          className="btn admin-action"
                          onClick={() => setViewingAttachments(selectedTicket.attachments)}
                        >
                          <i className="bi bi-paperclip" />
                          View Attachments
                          <span className="ms-auto fs-11 text-theme-muted">{selectedTicket.attachments.length}</span>
                        </button>
                      )}

                      {canAdminGenerateReport(selectedTicket) && (
                        <button
                          type="button"
                          className="btn admin-action"
                          onClick={() => handleDownloadAdminReport(selectedTicket.grievance_id)}
                          disabled={downloadingReportId === selectedTicket.grievance_id}
                        >
                          <i className="bi bi-download" />
                          {downloadingReportId === selectedTicket.grievance_id ? "Generating..." : "Download Case Report"}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn btn-link btn-sm px-0 mt-4 text-decoration-none ticket-delete"
                      onClick={() => { handleDelete(selectedTicket.grievance_id); setSelectedTicket(null); }}
                      disabled={updatingId === selectedTicket.grievance_id}
                    >
                      <i className="bi bi-trash3 me-2" />
                      Delete grievance
                    </button>
                  </div>

                </div>
              </div>

            </div>
          </div>
        </div>
        );
      })()}


      {/* ATTACHMENT GALLERY MODAL */}
      <div className={`modal fade ${viewingAttachments ? "show d-block" : ""} scrim-50`} tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content border-0 shadow">
            <div className="modal-header border-bottom-0 pb-0">
              <h5 className="modal-title fw-bold">Evidence Attachments</h5>
              <button type="button" className="btn-close" onClick={() => setViewingAttachments(null)}></button>
            </div>
            <div className="modal-body py-4">
              {viewingAttachments && viewingAttachments.length > 0 ? (
                <div className="row g-3">
                  {viewingAttachments.map((url, idx) => {
                    const isVideo = url.toLowerCase().endsWith('.mp4');
                    const isPdf = url.toLowerCase().endsWith('.pdf');
                    return (
                      <div key={idx} className="col-12 col-md-6">
                        <div className="border rounded p-3 h-100 d-flex flex-column align-items-center justify-content-center bg-light">
                          {isPdf ? (
                            <div className="text-center">
                              <svg width="48" height="48" fill="#a82646" viewBox="0 0 16 16" className="mb-2">
                                <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/>
                                <path d="M4.603 12.087a.81.81 0 0 1-.438-.42c-.195-.388-.13-.776.08-1.09.215-.323.593-.548 1.135-.672.482-.11 1.05-.164 1.704-.164.767 0 1.455.074 2.064.22.453.11.83.256 1.13.439.439.268.618.617.535 1.045-.078.406-.388.7-.93.882-.542.183-1.25.274-2.126.274-.848 0-1.57-.087-2.164-.26a3.864 3.864 0 0 1-.99-.444z"/>
                              </svg>
                              <div><a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-danger mt-1 fw-bold">Open PDF Document</a></div>
                            </div>
                          ) : isVideo ? (
                            <video src={url} controls className="img-fluid rounded shadow-sm admin-attachment-media" />
                          ) : (
                            <a href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt={`Attachment ${idx + 1}`} className="img-fluid rounded shadow-sm object-fit-contain admin-attachment-media" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted text-center">No attachments found.</p>
              )}
            </div>
            <div className="modal-footer border-top-0 pt-0">
              <button type="button" className="btn btn-secondary" onClick={() => setViewingAttachments(null)}>Close</button>
            </div>
          </div>
        </div>
      </div>

      {/* RAG POLICY RESOLUTION ADVISORY MODAL */}
      <div
        className={`modal fade ${selectedRagTicket ? "show d-block" : ""} scrim-60`}
        tabIndex="-1"
        onClick={(e) => { if (e.target === e.currentTarget) setSelectedRagTicket(null); }}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
          <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">

            {/* Header */}
            <div className="modal-header px-4 py-3 ticket-header">
              <div className="min-w-0">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <h5 className="modal-title fw-bold mb-0 text-heading">Policy Advice</h5>
                  {selectedRagTicket?.severity && getSeverityBadge(selectedRagTicket.severity)}
                </div>
                <div className="fs-13 text-theme-muted mt-1">
                  Ticket #{selectedRagTicket?.grievance_id?.substring(0, 8).toUpperCase()}
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={() => setSelectedRagTicket(null)}
              />
            </div>

            {/* Body */}
            <div className="modal-body p-4 bg-card">
              {/* Ticket context */}
              <div className="row g-3 mb-3">
                {[
                  ["Category",  selectedRagTicket?.category || "General"],
                  ["Tier",      selectedRagTicket?.assigned_tier || "—"],
                  ["Submitted", selectedRagTicket?.created_at ? new Date(selectedRagTicket.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"],
                ].map(([label, val]) => (
                  <div key={label} className="col-4">
                    <div className="ticket-section-label mb-1">
                      {label.toUpperCase()}
                    </div>
                    <div className="fs-13 fw-semibold text-heading">{val}</div>
                  </div>
                ))}
              </div>
              <p className="fs-14 text-theme mb-0 ticket-description">
                {selectedRagTicket?.description}
              </p>

              <hr className="my-4 ticket-rule" />

              {loadingRag ? (
                <div className="text-center py-4">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="text-muted fs-13 mt-3 mb-0">
                    Finding the relevant policy clauses for this ticket…
                  </p>
                </div>
              ) : ragRecommendation ? (
                <>
                  {/* Applicable policy */}
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <div className="ticket-section-label mb-0">
                      APPLICABLE POLICY
                    </div>
                    <span className={`fs-11 fw-semibold admin-match-label${ragRecommendation.has_policy_match ? " is-match" : ""}`}>
                      <i className={`bi ${ragRecommendation.has_policy_match ? "bi-check-circle-fill" : "bi-info-circle"} me-1`} />
                      {ragRecommendation.has_policy_match ? "Policy match" : "Standard GRM procedure"}
                    </span>
                  </div>
                  <div className="fs-14 fw-bold text-heading mb-1">
                    {ragRecommendation.primary_policy || "Puravankara Grievance Redressal Policy"}
                  </div>
                  <p className="fs-13 text-theme mb-0 admin-rag-text">
                    {ragRecommendation.executive_summary}
                  </p>

                  {/* Policy references */}
                  {ragRecommendation.citations && ragRecommendation.citations.length > 0 && (
                    <div className="mt-3">
                      <div className="ticket-section-label">
                        REFERENCES ({ragRecommendation.citations.length})
                      </div>
                      <div className="d-flex flex-column gap-2">
                        {ragRecommendation.citations.map((c, i) => (
                          <div key={i} className="ticket-ref">
                            <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
                              <span className="fw-bold text-heading text-truncate">{c.source}</span>
                              <span className="fs-11 text-theme-muted text-nowrap">
                                p. {c.page}{c.section ? ` · ${c.section}` : ""}
                              </span>
                            </div>
                            <div className="text-theme-muted text-truncate-3 admin-rag-text">{c.excerpt}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended steps */}
                  {ragRecommendation.recommended_steps && ragRecommendation.recommended_steps.length > 0 && (
                    <>
                      <hr className="my-4 ticket-rule" />
                      <div className="ticket-section-label mb-3">
                        RECOMMENDED STEPS ({ragRecommendation.recommended_steps.length})
                      </div>
                      <ol className="list-unstyled mb-0 d-flex flex-column gap-3">
                        {ragRecommendation.recommended_steps.map((step, idx) => (
                          <li key={idx} className="d-flex align-items-start gap-3">
                            <span className="fs-12 fw-bold flex-shrink-0 admin-step-num">
                              {step.step_number || idx + 1}
                            </span>
                            <div className="flex-grow-1">
                              <div className="d-flex justify-content-between align-items-baseline gap-2">
                                <span className="fs-13 fw-bold text-heading">{step.title}</span>
                                {step.deadline && (
                                  <span className="fs-11 text-theme-muted text-nowrap">
                                    <i className="bi bi-clock me-1" />{step.deadline}
                                  </span>
                                )}
                              </div>
                              <div className="fs-13 text-theme-muted admin-rag-text">{step.detail}</div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}

                  {/* Compliance */}
                  {ragRecommendation.compliance_notes && (
                    <div className="mt-4">
                      <div className="ticket-section-label">
                        COMPLIANCE NOTE
                      </div>
                      <div className="fs-13 text-theme admin-resolution-note is-rejected">
                        {ragRecommendation.compliance_notes}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-3 text-muted fs-13">
                  No advice generated yet. Use “Re-analyze” below to generate it.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="modal-footer px-4 py-3 d-flex justify-content-between admin-rag-footer">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                disabled={loadingRag}
                onClick={() => handleRegenerateRag(selectedRagTicket?.grievance_id)}
              >
                <i className="bi bi-arrow-clockwise me-1" />
                {loadingRag ? "Re-analyzing..." : "Re-analyze"}
              </button>

              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                  disabled={!ragRecommendation || loadingRag}
                  onClick={handleCopyRecommendation}
                >
                  <i className={`bi ${copiedRecommendation ? "bi-check2" : "bi-clipboard"} me-1`} />
                  {copiedRecommendation ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm rounded-pill px-4"
                  onClick={() => setSelectedRagTicket(null)}
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
      {/* STATUS CHANGE REASON MODAL (All Admin Levels) */}
      {pendingStatusChange && (() => {
        const cfg = getStatusModalConfig(pendingStatusChange.newStatus);
        return (
          <div
            className="modal fade show d-block scrim-60"
            tabIndex="-1"
            onClick={(e) => { if (e.target === e.currentTarget) setPendingStatusChange(null); }}
          >
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden ticket-modal">
                <div className="modal-header px-4 py-3 ticket-header">
                  <div className="min-w-0">
                    <h5 className="modal-title fw-bold mb-0 text-heading">{cfg.title}</h5>
                    <div className="fs-13 text-theme-muted mt-1">
                      Ticket #{pendingStatusChange.grievanceId?.substring(0, 8).toUpperCase()}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setPendingStatusChange(null)}
                  />
                </div>

                <div className="modal-body p-4">
                  <div className="d-flex align-items-center gap-2 mb-3">
                    {getStatusBadge(pendingStatusChange.currentStatus)}
                    <i className="bi bi-arrow-right text-theme-muted" />
                    {getStatusBadge(pendingStatusChange.newStatus)}
                  </div>

                  <label className="form-label fs-13 fw-semibold text-heading mb-1" htmlFor="status-reason">
                    {cfg.label}
                  </label>
                  <div className="fs-12 text-theme-muted mb-2">{cfg.description}</div>
                  <textarea
                    id="status-reason"
                    className="form-control fs-14 admin-textarea"
                    rows={4}
                    autoFocus
                    placeholder={cfg.placeholder}
                    value={resolutionReason}
                    onChange={(e) => setResolutionReason(e.target.value)}
                  />
                  <div className="fs-12 text-theme-muted mt-2">Required for every status change.</div>
                </div>

                <div className="modal-footer px-4 py-3 gap-2 admin-rag-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                    onClick={() => setPendingStatusChange(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm rounded-pill px-4 ${cfg.tone === "danger" ? "btn-danger" : cfg.tone === "ok" ? "btn-primary btn-confirm-ok" : "btn-primary"}`}
                    disabled={!resolutionReason.trim() || submittingStatus}
                    onClick={handleResolutionSubmit}
                  >
                    {submittingStatus ? (
                      <><span className="spinner-border spinner-border-sm me-2" />Saving…</>
                    ) : (
                      cfg.btnText
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MANUAL ESCALATION MODAL */}
      {escalatingTicket && (
        <div
          className="modal fade show d-block scrim-60"
          tabIndex="-1"
          onClick={(e) => { if (e.target === e.currentTarget) setEscalatingTicket(null); }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden ticket-modal">
              <div className="modal-header px-4 py-3 ticket-header">
                <div className="min-w-0">
                  <h5 className="modal-title fw-bold mb-0 text-heading">Escalate to next tier</h5>
                  <div className="fs-13 text-theme-muted mt-1">
                    Ticket #{escalatingTicket.grievance_id.substring(0, 8).toUpperCase()}
                    {escalatingTicket.assigned_tier ? ` · currently ${escalatingTicket.assigned_tier}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setEscalatingTicket(null)}
                />
              </div>

              <div className="modal-body p-4">
                <p className="fs-13 text-theme-muted mb-3">
                  The ticket moves to the next tier's queue with a new SLA deadline. Your notes are added to the case history for the receiving admin.
                </p>

                <div className="mb-3">
                  <label className="form-label fs-13 fw-semibold text-heading mb-1" htmlFor="escalation-reason">
                    Reason
                  </label>
                  <input
                    id="escalation-reason"
                    type="text"
                    className="form-control fs-14"
                    autoFocus
                    placeholder="e.g. Needs senior approval"
                    value={escalationReason}
                    onChange={(e) => setEscalationReason(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label fs-13 fw-semibold text-heading mb-1" htmlFor="escalation-notes">
                    Handoff notes <span className="fw-normal text-theme-muted">(optional)</span>
                  </label>
                  <textarea
                    id="escalation-notes"
                    className="form-control fs-14 admin-textarea"
                    rows={3}
                    placeholder="What you've checked or communicated so far, so the next admin can pick it up…"
                    value={escalationNotes}
                    onChange={(e) => setEscalationNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer px-4 py-3 gap-2 admin-rag-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                  onClick={() => setEscalatingTicket(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm rounded-pill px-4"
                  disabled={!escalationReason.trim() || submittingEscalation}
                  onClick={handleEscalateSubmit}
                >
                  {submittingEscalation ? (
                    <><span className="spinner-border spinner-border-sm me-2" />Escalating…</>
                  ) : (
                    "Escalate"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
