import React, { useState, useEffect, useContext } from "react";
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

  // Fetch grievances
  const fetchGrievances = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("grievances")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setGrievances(data || []);
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
        (payload) => setGrievances((prev) => [payload.new, ...prev])
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "grievances" },
        (payload) => setGrievances((prev) =>
          prev.map((g) => g.grievance_id === payload.new.grievance_id ? payload.new : g)
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

  // Filter by admin department & tier
  const isTierLocked = Boolean(admin?.admin_tier && ["L1", "L2", "L3"].includes(admin.admin_tier));
  const effectiveTier = isTierLocked ? admin.admin_tier : tierFilter;

  const departmentGrievances = admin
    ? translatedGrievances.filter(
        (g) => isSuperAdmin || g.department === admin.department
      )
    : [];

  const filtered = departmentGrievances.filter((g) => {
    if (effectiveTier === "ALL") return true;
    return g.assigned_tier === effectiveTier;
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
          title: "Resolve Grievance",
          bg: "#15803d",
          label: "Resolution Summary & Actions Taken",
          placeholder: "Describe the actions and resolution steps taken for this grievance...",
          btnText: "Confirm Resolution",
          description: "Please provide a comprehensive resolution summary. This will be recorded in the audit trail and sent to the complainant.",
        };
      case "Rejected":
        return {
          title: "Reject Grievance",
          bg: "#b91c1c",
          label: "Reason for Rejection",
          placeholder: "Explain clearly why this grievance cannot be accepted or is invalid...",
          btnText: "Confirm Rejection",
          description: "Please specify the official justification for rejecting this grievance.",
        };
      case "Investigating":
        return {
          title: "Move to Investigating",
          bg: "#1e3a8a",
          label: "Reason / Investigation Scope",
          placeholder: "Describe what is being inspected, tested, or investigated...",
          btnText: "Update to Investigating",
          description: "Record the reason and operational scope for moving this ticket into active investigation.",
        };
      case "HUMAN_HANDLING":
        return {
          title: "Assign to Human Handling",
          bg: "#581c87",
          label: "Reason for Human Review",
          placeholder: "Detail why manual intervention or departmental review is required...",
          btnText: "Update to Human Handling",
          description: "Provide the reason for transferring this grievance to manual human handling.",
        };
      case "Open":
        return {
          title: "Reopen / Set to Pending",
          bg: "#c2410c",
          label: "Reason for Reopening / Pending State",
          placeholder: "Explain why this ticket is being reopened or set back to pending...",
          btnText: "Update Status",
          description: "Record the rationale for reverting this ticket back to Open / Pending status.",
        };
      default:
        return {
          title: `Update Status: ${status}`,
          bg: "#001a4d",
          label: "Reason for Status Change",
          placeholder: `State the reason for changing status to ${status}...`,
          btnText: "Confirm Status Change",
          description: `Please provide the reason for changing the grievance status to ${status}.`,
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

  if (!admin) return null;

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
              {admin.department}
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

      {/* DEPARTMENT-WISE GRIEVANCE PIE CHART — super admin only */}
      {isSuperAdmin && (() => {
        // Build dept → { category: count } map
        const deptMap = {};
        deptDist.forEach(({ department, category, count }) => {
          if (!deptMap[department]) deptMap[department] = {};
          deptMap[department][category] = (deptMap[department][category] || 0) + count;
        });
        const deptTotals = Object.entries(deptMap).map(([name, cats], i) => ({
          name, value: Object.values(cats).reduce((a, b) => a + b, 0), index: i
        }));
        const totalAll = deptTotals.reduce((a, b) => a + b.value, 0);
        const activeDept = selectedDept && deptMap[selectedDept]
          ? Object.entries(deptMap[selectedDept]).map(([name, value]) => ({ name, value }))
          : null;

        return (
          <div className="card shadow-sm border-0 mb-4 p-4 admin-panel">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-bold mb-0">
                <i className="bi bi-pie-chart-fill me-2 admin-chart-icon" />
                Grievance Distribution by Department
              </h6>
              {selectedDept && (
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelectedDept(null)}>
                  ← All Departments
                </button>
              )}
            </div>

            {deptDistLoading ? (
              <div className="text-center py-4">
                <div className="spinner-border spinner-border-sm text-primary" />
              </div>
            ) : deptTotals.length === 0 ? (
              <div className="text-muted text-center py-3">No data available.</div>
            ) : (
              <div className="row g-4 align-items-center">
                {/* Pie */}
                <div className="col-md-5">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={activeDept || deptTotals}
                        cx="50%" cy="48%"
                        innerRadius={65} outerRadius={105}
                        paddingAngle={4}
                        dataKey="value"
                        onClick={(entry) => { if (!activeDept) setSelectedDept(entry.name); }}
                        style={{ cursor: activeDept ? "default" : "pointer" }}
                      >
                        {(activeDept || deptTotals).map((_, i) => (
                          <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<DeptPieTooltip />} />
                      <Legend iconType="circle" iconSize={10}
                        wrapperStyle={{ fontSize: 12, color: isDark ? "#a1a1aa" : "#64748b" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  {!activeDept && (
                    <div className="text-center fs-11 admin-chart-hint">
                      Click a slice to drill into its categories
                    </div>
                  )}
                </div>

                {/* Table */}
                <div className="col-md-7">
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0 fs-13">
                      <thead className="table-light">
                        <tr>
                          <th className="px-3 py-2">{activeDept ? "Category" : "Department"}</th>
                          <th className="py-2 text-center">Count</th>
                          <th className="py-2">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(activeDept || deptTotals)
                          .sort((a, b) => b.value - a.value)
                          .map((row, i) => {
                            const pct = Math.round((row.value / (activeDept ? deptMap[selectedDept] && Object.values(deptMap[selectedDept]).reduce((a, b) => a + b, 0) : totalAll)) * 100);
                            return (
                              <tr key={row.name}
                                className={`admin-dept-row${activeDept ? " is-drilled" : ""}`}
                                onClick={() => { if (!activeDept) setSelectedDept(row.name); }}
                              >
                                <td className="px-3 fw-semibold">
                                  <span className="rounded-circle d-inline-block me-2 admin-legend-swatch" style={{
                                    backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length]
                                  }} />
                                  {row.name}
                                </td>
                                <td className="text-center fw-bold">{row.value}</td>
                                <td>
                                  <div className="d-flex align-items-center gap-2">
                                    <div className="progress flex-grow-1 admin-dept-progress">
                                      <div className="progress-bar" role="progressbar"
                                        style={{ width: `${pct}%`, backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                                    </div>
                                    <span className="fs-11 admin-dept-pct">{pct}%</span>
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
        );
      })()}

      {/* TIER QUEUE SELECTOR / SCOPE INDICATOR */}
      {isTierLocked ? (
        <div className="d-flex align-items-center justify-content-between p-3 mb-3 rounded shadow-sm admin-scope-bar">
          <div className="d-flex align-items-center gap-2">
            <span className="badge px-3 py-2 rounded-pill fw-bold fs-12 text-white admin-scope-tier">
              {admin.admin_tier} QUEUE
            </span>
            <span className="fs-14 text-theme">
              Viewing tickets assigned to <strong>{admin.department} {admin.admin_tier}</strong> handling.
            </span>
          </div>
          <span className="badge px-3 py-2 rounded-pill fw-bold admin-scope-label">
            {filtered.length} ticket{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
      ) : (
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <span className="text-muted fw-bold me-1 fs-13">Queue:</span>
            {["ALL", "L1", "L2", "L3", "HEAD"].map((t) => {
              const count = departmentGrievances.filter((g) => t === "ALL" || g.assigned_tier === t).length;
              const isActive = tierFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTierFilter(t)}
                  className={`btn btn-sm rounded-pill fw-semibold ${isActive ? "shadow-sm is-active" : "btn-outline-secondary"} fs-12 admin-tier-filter`}
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
            <span className="badge px-3 py-2 rounded-pill fw-semibold fs-12 admin-head-badge">
              Department Head View
            </span>
          )}
        </div>
      )}

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
                Grievances matching your <strong>{admin.department}</strong> {isTierLocked ? `${admin.admin_tier} queue` : "department"} will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="text-muted py-3 ps-4 fs-12">ID</th>
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
                      <td className="fw-semibold fs-13 admin-cell-heading">{g.category}</td>
                      <td>{getSeverityBadge(g.severity)}</td>
                      <td
                        className="overflow-hidden text-nowrap fs-13 admin-cell-desc"
                      >
                        {translating
                          ? <span className="spinner-border spinner-border-sm text-secondary" role="status" />
                          : g.description}
                      </td>
                      <td>{getTierBadge(g.assigned_tier)}</td>
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
      {selectedTicket && (
        <div
          className="modal fade show d-block scrim-60"
          tabIndex="-1"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedTicket(null); }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">

              {/* Header */}
              <div
                className="modal-header border-0 px-4 py-3 admin-ticket-header"
              >
                <div>
                  <div className="fs-11 fw-semibold admin-ticket-eyebrow">
                    GRIEVANCE TICKET
                  </div>
                  <h5 className="modal-title fw-bold text-white mb-0">
                    #{selectedTicket.grievance_id.substring(0, 8).toUpperCase()}
                  </h5>
                </div>
                <div className="d-flex align-items-center gap-3">
                  {getStatusBadge(selectedTicket.status)}
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    onClick={() => setSelectedTicket(null)}
                  />
                </div>
              </div>

              {/* Body — two columns */}
              <div className="modal-body p-0 bg-surface-alt">
                <div className="row g-0 admin-ticket-body">

                  {/* LEFT — complaint details */}
                  <div className="col-7 p-4 admin-modal-left">

                    {/* Meta grid */}
                    <div className="row g-3 mb-4">
                      {[
                        ["Category",   selectedTicket.category],
                        ["Severity",   selectedTicket.severity],
                        ["Department", selectedTicket.department || "—"],
                        ["Tier",       selectedTicket.assigned_tier || "—"],
                        ["Submitted",  new Date(selectedTicket.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })],
                        ["SLA",        selectedTicket.sla_hours ? `${selectedTicket.sla_hours}h` : "—"],
                      ].map(([label, val]) => (
                        <div key={label} className="col-6">
                          <div className="fs-10 fw-bold text-theme-muted admin-field-label">
                            {label.toUpperCase()}
                          </div>
                          <div className="fs-13 fw-semibold text-heading">{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Divider */}
                    <div className="mb-3 admin-divider" />

                    {/* Full complaint */}
                    <div className="fs-10 fw-bold text-theme-muted mb-2 admin-section-label">
                      COMPLAINT
                    </div>
                    <div className="admin-inset-box p-3 fs-14 overflow-y-auto admin-complaint-text">
                      {selectedTicket.description}
                    </div>

                    {/* Resolution reason or latest status remarks */}
                    {selectedTicket.resolution_reason && (
                      <div className="mt-3">
                        <div className="fs-10 fw-bold text-theme-muted mb-2 admin-section-label">
                          {selectedTicket.status === "Resolved"
                            ? "RESOLUTION SUMMARY"
                            : selectedTicket.status === "Rejected"
                            ? "REJECTION REASON"
                            : "LATEST STATUS NOTE / REMARKS"}
                        </div>
                        <div className={`fs-13 text-theme admin-resolution-note is-${(selectedTicket.status || "").toLowerCase()}`}>
                          {selectedTicket.resolution_reason}
                        </div>
                      </div>
                    )}

                    {/* ACTIVITY & ESCALATION TRAIL — what L1/L2 and prior admins have done */}
                    <div className="admin-trail-section">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="fs-10 fw-bold text-theme-muted admin-section-label">
                          ACTIVITY & ESCALATION TRAIL ({selectedTicket.escalation_history?.length || 0})
                        </div>
                        {selectedTicket.assigned_tier && (
                          <span className="badge bg-light text-secondary border fs-10">
                            Current: {selectedTicket.assigned_tier}
                          </span>
                        )}
                      </div>

                      {selectedTicket.escalation_history && selectedTicket.escalation_history.length > 0 ? (
                        <div className="d-flex flex-column gap-2 overflow-y-auto pe-1 admin-trail-list">
                          {selectedTicket.escalation_history.map((item, idx) => (
                            <div key={idx} className="admin-trail-item">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <span className="fw-bold fs-11 admin-trail-tier">
                                  {item.tier ? `[${item.tier}]` : (item.from_tier ? `${item.from_tier} → ${item.to_tier}` : "System")}
                                  {item.handler ? ` · ${item.handler}` : ""}
                                </span>
                                <span className="fs-11 text-theme-muted">
                                  {new Date(item.timestamp || item.escalated_at || item.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                                </span>
                              </div>
                              <div className="text-theme fw-medium fs-12">
                                {item.action || (item.reason === "SLA_BREACH" ? `Auto-escalated: SLA Breach (${item.from_tier} → ${item.to_tier})` : (item.reason ? `Escalated: ${item.reason}` : "Action logged"))}
                              </div>
                              {item.notes && (
                                <div className="admin-trail-notes mt-1 p-2 rounded small fst-italic">
                                  “{item.notes}”
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="admin-inset-box p-3 small text-muted fst-italic text-center admin-trail-empty">
                          No prior tier actions or handoff notes recorded yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT — actions */}
                  <div className="col-5 p-4 admin-modal-right">
                    <div className="fs-10 fw-bold text-theme-muted mb-3 admin-section-label">
                      ACTIONS
                    </div>

                    {/* Status change */}
                    {selectedTicket.status !== "Resolved" && selectedTicket.status !== "Rejected" && selectedTicket.status !== "Closed" && (
                      <div className="mb-3">
                        <label className="fs-11 fw-bold text-theme-muted d-block ls-half admin-status-label">
                          UPDATE STATUS
                        </label>
                        <select
                          className="form-select form-select-sm fs-13"
                          value={selectedTicket.status}
                          disabled={updatingId === selectedTicket.grievance_id}
                          onChange={(e) => {
                            handleStatusChange(selectedTicket.grievance_id, e.target.value);
                          }}
                        >
                          <option value="Open">Pending</option>
                          <option value="Investigating">Investigating</option>
                          <option value="HUMAN_HANDLING">Human Handling</option>
                          <option value="Resolved">Resolve</option>
                          <option value="Rejected">Reject</option>
                        </select>
                      </div>
                    )}

                    <div className="d-flex flex-column gap-2">

                      {/* Escalate to Next Tier */}
                      {selectedTicket.assigned_tier !== "HEAD" && selectedTicket.status !== "Resolved" && selectedTicket.status !== "Rejected" && selectedTicket.status !== "Closed" && (
                        <button
                          className="fs-13 fw-semibold text-start cursor-pointer d-flex align-items-center gap-2 admin-action-btn admin-action-escalate"
                          onClick={() => {
                            setEscalatingTicket(selectedTicket);
                            setEscalationReason("");
                            setEscalationNotes("");
                          }}
                        >
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M5 10l7-7m0 0l7 7m-7-7v18"/>
                          </svg>
                          Escalate to Next Tier
                        </button>
                      )}

                      {/* Policy Advice */}
                      {(["medium", "high", "critical"].includes(selectedTicket.severity?.toLowerCase()) || selectedTicket.policy_matched || selectedTicket.rag_recommendation) && (
                        <button
                          className="text-white fs-13 fw-semibold text-start cursor-pointer d-flex align-items-center gap-2 admin-action-btn admin-action-policy"
                          onClick={() => { handleOpenRag(selectedTicket); setSelectedTicket(null); }}
                        >
                          <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
                          </svg>
                          View Policy Advice
                        </button>
                      )}

                      {/* Attachments */}
                      {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
                        <button
                          className="text-theme fs-13 fw-semibold text-start cursor-pointer d-flex align-items-center gap-2 admin-action-btn admin-action-attachments"
                          onClick={() => setViewingAttachments(selectedTicket.attachments)}
                        >
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                          </svg>
                          View Attachments ({selectedTicket.attachments.length})
                        </button>
                      )}

                      {/* Case / Admin Report — accessible to super_admin, HEAD, and current tier admin or above */}
                      {canAdminGenerateReport(selectedTicket) && (
                        <button
                          className="fs-13 fw-semibold text-start cursor-pointer d-flex align-items-center gap-2 admin-action-btn admin-action-report"
                          onClick={() => handleDownloadAdminReport(selectedTicket.grievance_id)}
                          disabled={downloadingReportId === selectedTicket.grievance_id}
                        >
                          <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                            <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                          </svg>
                          {downloadingReportId === selectedTicket.grievance_id ? "Generating..." : "Download Case Report"}
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        className="mt-2 bg-transparent fs-13 fw-semibold text-start cursor-pointer d-flex align-items-center gap-2 admin-action-btn admin-action-delete"
                        onClick={() => { handleDelete(selectedTicket.grievance_id); setSelectedTicket(null); }}
                        disabled={updatingId === selectedTicket.grievance_id}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14H6L5 6"/>
                          <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                        </svg>
                        Delete Grievance
                      </button>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </div>
        </div>
      )}



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
      <div className={`modal fade ${selectedRagTicket ? "show d-block" : ""} scrim-60`} tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
          <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
            
            {/* MODAL HEADER */}
            <div 
              className="modal-header border-0 px-4 py-3 text-white admin-rag-header"
            >
              <div className="d-flex align-items-center gap-3">
                <div 
                  className="rounded-circle d-flex align-items-center justify-content-center admin-modal-icon"
                >
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
                  </svg>
                </div>
                <div>
                  <h5 className="modal-title fw-bold mb-0 text-white">AI Policy & Resolution Advisory</h5>
                  <p className="small mb-0 opacity-75 text-white">
                    Grounded recommendations from Puravankara policy documents for Ticket #{selectedRagTicket?.grievance_id?.substring(0, 8)}
                  </p>
                </div>
              </div>

              <div className="d-flex align-items-center gap-2">
                <span 
                  className={`badge rounded-pill px-3 py-2 fw-semibold ${selectedRagTicket?.severity?.toLowerCase() === "medium" ? "bg-warning text-dark" : "bg-danger text-white"} fs-12`}
                >
                  {selectedRagTicket?.severity?.toUpperCase() || "MEDIUM"} SEVERITY
                </span>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={() => setSelectedRagTicket(null)}
                ></button>
              </div>
            </div>

            {/* MODAL BODY */}
            <div className="modal-body p-4 bg-surface-alt">
              {loadingRag ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary admin-spinner-lg" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <h6 className="fw-bold mt-4 text-heading">Consulting Policy Vector Store...</h6>
                  <p className="text-muted small mb-0">
                    Retrieving matching Puravankara policy clauses and generating structured resolution protocol.
                  </p>
                </div>
              ) : ragRecommendation ? (
                <div className="d-flex flex-column gap-4">
                  
                  {/* GRIEVANCE CONTEXT HEADER */}
                  <div className="card border-0 shadow-sm rounded-3 p-3">
                    <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-secondary-subtle text-secondary px-3 py-1 rounded-pill fw-semibold">
                          {selectedRagTicket?.category || "General"}
                        </span>
                        <span className="badge bg-primary-subtle text-primary px-3 py-1 rounded-pill fw-semibold">
                          Queue: {selectedRagTicket?.assigned_tier || "L2 Queue"}
                        </span>
                      </div>
                      <span className="text-muted small">
                        Submitted: {selectedRagTicket?.created_at ? new Date(selectedRagTicket.created_at).toLocaleString("en-IN") : "Recent"}
                      </span>
                    </div>
                    <p className="mb-0 small fst-italic p-2 rounded border bg-surface-alt">
                      "{selectedRagTicket?.description}"
                    </p>
                  </div>

                  {/* EXECUTIVE SUMMARY & PRIMARY POLICY MATCH */}
                  <div className="card border-0 shadow-sm rounded-3 p-3">
                    <div className="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
                      <h6 className="fw-bold mb-0">
                        Applicable Policy Framework
                      </h6>
                      {ragRecommendation.has_policy_match ? (
                        <span className="badge rounded-pill px-3 py-1 text-white fs-12 admin-policy-match-badge">
                          Policy Match Verified
                        </span>
                      ) : (
                        <span className="badge bg-secondary rounded-pill px-3 py-1 fs-12">
                          Standard GRM SOP
                        </span>
                      )}
                    </div>
                    
                    <div className="p-3 rounded-3 mb-3 admin-policy-card">
                      <div className="fw-bold mb-1 fs-14 admin-policy-title">
                        {ragRecommendation.primary_policy || "Puravankara Grievance Redressal Policy"}
                      </div>
                      <p className="mb-0 small">
                        {ragRecommendation.executive_summary}
                      </p>
                    </div>

                    {/* POLICY CITATIONS & CLAUSES */}
                    {ragRecommendation.citations && ragRecommendation.citations.length > 0 && (
                      <div>
                        <div className="text-muted small fw-bold mb-2 text-uppercase ls-half fs-11">
                          Retrieved Policy References ({ragRecommendation.citations.length})
                        </div>
                        <div className="row g-2">
                          {ragRecommendation.citations.map((c, i) => (
                            <div key={i} className="col-12 col-md-6">
                              <div className="border rounded-3 p-2 h-100 small bg-surface-alt">
                                <div className="d-flex justify-content-between align-items-center mb-1">
                                  <strong className="text-truncate text-heading admin-source-name">
                                    {c.source}
                                  </strong>
                                  <span className="badge bg-secondary-subtle text-dark fs-10">
                                    Page {c.page} {c.section ? `• ${c.section}` : ""}
                                  </span>
                                </div>
                                <p className="text-muted mb-0 text-truncate-3 fs-11 admin-source-excerpt">
                                  {c.excerpt}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* RECOMMENDED PROCEDURAL RESOLUTION STEPS */}
                  <div className="card border-0 shadow-sm rounded-3 p-3">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <h6 className="fw-bold mb-0">
                        Actionable Resolution Protocol
                      </h6>
                      <span className="text-muted small">
                        {ragRecommendation.recommended_steps?.length || 0} Recommended Steps
                      </span>
                    </div>

                    <div className="d-flex flex-column gap-3">
                      {ragRecommendation.recommended_steps && ragRecommendation.recommended_steps.map((step, idx) => (
                        <div 
                          key={idx} 
                          className="d-flex align-items-start gap-3 p-3 rounded-3 border bg-card"
                        >
                          <div 
                            className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0 fs-14 admin-step-avatar"
                          >
                            {step.step_number || idx + 1}
                          </div>

                          <div className="flex-grow-1">
                            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-1">
                              <strong className="fs-14 text-heading">
                                {step.title}
                              </strong>
                              {step.deadline && (
                                <span 
                                  className="badge rounded-pill px-2 py-1 fs-11 admin-step-deadline"
                                >
                                  {step.deadline}
                                </span>
                              )}
                            </div>
                            <p className="text-muted small mb-0">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* COMPLIANCE & SLA MANDATES */}
                  {ragRecommendation.compliance_notes && (
                    <div className="card border-0 rounded-3 p-3 admin-compliance-card">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <svg width="16" height="16" fill="#a82646" viewBox="0 0 16 16">
                          <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
                        </svg>
                        <strong className="fs-13 admin-compliance-title">
                          Statutory & SLA Compliance Alert
                        </strong>
                      </div>
                      <p className="small mb-0 admin-compliance-text">
                        {ragRecommendation.compliance_notes}
                      </p>
                    </div>
                  )}

                </div>
              ) : (
                <div className="text-center py-4 text-muted">
                  <p className="mb-0">No advisory generated yet. Click "Generate Recommendations" below.</p>
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className="modal-footer border-top px-4 py-3 d-flex justify-content-between align-items-center">
              <button 
                type="button" 
                className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                disabled={loadingRag}
                onClick={() => handleRegenerateRag(selectedRagTicket?.grievance_id)}
              >
                {loadingRag ? "Regenerating..." : "Re-analyze Policy"}
              </button>

              <div className="d-flex gap-2">
                <button 
                  type="button" 
                  className="btn btn-outline-primary btn-sm rounded-pill px-3 fw-semibold shadow-sm"
                  disabled={!ragRecommendation || loadingRag}
                  onClick={handleCopyRecommendation}
                >
                  {copiedRecommendation ? "Copied to Clipboard!" : "Copy Guidance"}
                </button>
                <button 
                  type="button" 
                  className="btn btn-dark btn-sm rounded-pill px-4 shadow-sm"
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
          <div className="modal fade show d-block scrim-65" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div
                className="modal-content border-0 shadow-lg rounded-4 overflow-hidden admin-status-modal"
              >
                <div
                  className="modal-header border-0 px-4 py-3 text-white"
                  style={{ background: cfg.bg }}
                >
                  <div>
                    <div className="fs-11 fw-semibold ls-1 text-uppercase admin-status-transition">
                      Status Transition ({pendingStatusChange.currentStatus || "Current"} → {pendingStatusChange.newStatus})
                    </div>
                    <h5 className="modal-title fw-bold mb-0">
                      {cfg.title}
                    </h5>
                  </div>
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    onClick={() => setPendingStatusChange(null)}
                  />
                </div>
                <div className="modal-body px-4 py-4">
                  <p className="mb-3 admin-modal-desc">
                    {cfg.description}
                  </p>
                  <label className="form-label fw-semibold fs-13 admin-reason-label">
                    {cfg.label} <span className="text-danger ms-1">*</span>
                  </label>
                  <textarea
                    className="form-control fs-14 admin-textarea admin-status-reason"
                    rows={4}
                    placeholder={cfg.placeholder}
                    value={resolutionReason}
                    onChange={(e) => setResolutionReason(e.target.value)}
                  />
                  {!resolutionReason.trim() && (
                    <small className="text-danger mt-1 d-block fs-12">
                      A reason or justification is mandatory for changing the grievance status at all admin levels.
                    </small>
                  )}
                </div>
                <div className="modal-footer border-top-0 px-4 pb-4 pt-0 gap-2">
                  <button
                    type="button"
                    className="btn rounded-pill px-4 admin-cancel-btn"
                    onClick={() => setPendingStatusChange(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn rounded-pill px-4 fw-semibold text-white shadow-sm"
                    disabled={!resolutionReason.trim() || submittingStatus}
                    onClick={handleResolutionSubmit}
                    style={{ background: cfg.bg }}
                  >
                    {submittingStatus ? (
                      <><span className="spinner-border spinner-border-sm me-2" /> Submitting...</>
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
        <div className="modal fade show d-block scrim-55" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div
                className="modal-header border-0 px-4 py-3 text-white admin-escalate-header"
              >
                <div>
                  <div className="fs-11 fw-semibold ls-1 admin-escalate-eyebrow">
                    TIER ESCALATION HANDOFF
                  </div>
                  <h5 className="modal-title fw-bold mb-0">
                    Escalate #{escalatingTicket.grievance_id.substring(0, 8).toUpperCase()}
                  </h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setEscalatingTicket(null)}
                />
              </div>
              <div className="modal-body px-4 py-4">
                <div className="p-3 mb-3 rounded-3 admin-escalate-summary">
                  <div className="fs-12 fw-semibold admin-escalate-summary-title">
                    Current Tier: <strong>{escalatingTicket.assigned_tier}</strong> → Escalating to next authority level
                  </div>
                  <div className="fs-11 admin-escalate-note">
                    This will reassign the queue, update SLA deadlines, and log your handoff notes into the case history for the receiving admin.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold fs-13">
                    Reason for Escalation <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control fs-13"
                    placeholder="e.g. Requires senior engineering inspection / approval"
                    value={escalationReason}
                    onChange={(e) => setEscalationReason(e.target.value)}
                  />
                </div>

                <div className="mb-2">
                  <label className="form-label fw-semibold fs-13">
                    Handoff Notes & Actions Taken So Far
                  </label>
                  <textarea
                    className="form-control fs-13 admin-textarea"
                    rows={3}
                    placeholder="Describe what you have investigated, checked, or communicated with the complainant so the next level admin can pick up smoothly..."
                    value={escalationNotes}
                    onChange={(e) => setEscalationNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer border-top-0 px-4 pb-4 pt-0 gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary rounded-pill px-4"
                  onClick={() => setEscalatingTicket(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn rounded-pill px-4 fw-semibold text-white admin-escalate-btn"
                  disabled={!escalationReason.trim() || submittingEscalation}
                  onClick={handleEscalateSubmit}
                >
                  {submittingEscalation ? (
                    <><span className="spinner-border spinner-border-sm me-2" /> Escalating...</>
                  ) : (
                    "Confirm & Escalate"
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
