import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import { ThemeContext } from "../context/ThemeContext";
import { supabase } from "../services/supabaseClient";
import { translateList } from "../services/translationService";
import { apiClient } from "../services/api";
import AdminAnalytics from "../components/AdminAnalytics";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { userDetails: admin, isSuperAdmin } = useAuth();
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  
  const [grievances, setGrievances] = useState([]);
  const [translatedGrievances, setTranslatedGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [viewingAttachments, setViewingAttachments] = useState(null);
  const [tierFilter, setTierFilter] = useState("ALL");
  const [downloadingReportId, setDownloadingReportId] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null); // slide-out panel

  // --- RESOLUTION REASON MODAL STATE ---
  const [pendingStatusChange, setPendingStatusChange] = useState(null); // { grievanceId, newStatus }
  const [resolutionReason, setResolutionReason] = useState("");
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // --- MANUAL ESCALATION STATE ---
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

  // --- RAG POLICY ADVISORY STATE ---
  const [selectedRagTicket, setSelectedRagTicket] = useState(null);
  const [ragRecommendation, setRagRecommendation] = useState(null);
  const [loadingRag, setLoadingRag] = useState(false);
  const [copiedRecommendation, setCopiedRecommendation] = useState(false);

  // --- FETCH GRIEVANCES ---
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

  useEffect(() => {
    if (!admin) { navigate("/admin"); return; }
    fetchGrievances();

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

  // --- TRANSLATE DESCRIPTIONS when grievances or language changes ---
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

  // --- FILTER BY ADMIN DEPARTMENT & TIER ---
  const isTierLocked = Boolean(admin?.admin_tier && ["L1", "L2", "L3"].includes(admin.admin_tier));
  const effectiveTier = isTierLocked ? admin.admin_tier : tierFilter;

  const departmentGrievances = admin
    ? translatedGrievances.filter(
        (g) => isSuperAdmin || g.department === admin.department || g.category === admin.department
      )
    : [];

  const filtered = departmentGrievances.filter((g) => {
    if (effectiveTier === "ALL") return true;
    return g.assigned_tier === effectiveTier;
  });

  // --- STATUS UPDATE ---
  const handleStatusChange = async (grievanceId, newStatus) => {
    // For Resolved/Rejected: show modal to collect reason first
    if (newStatus === "Resolved" || newStatus === "Rejected") {
      setPendingStatusChange({ grievanceId, newStatus });
      setResolutionReason("");
      return;
    }
    // For other statuses: update directly via API
    await _submitStatusUpdate(grievanceId, newStatus, null);
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

  // --- DELETE GRIEVANCE ---
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

  // --- OPEN RAG RESOLUTION ADVISORY ---
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


  // --- STATUS BADGE (uses i18n for labels) ---
  const getStatusBadge = (status) => {
    const styles = isDark ? {
      Open:              { bg: "rgba(255, 255, 255, 0.08)", color: "#f4f4f5", border: "rgba(255, 255, 255, 0.16)", label: t("pending") },
      Investigating:     { bg: "rgba(245, 158, 11, 0.14)", color: "#fde047", border: "rgba(245, 158, 11, 0.28)", label: t("inProgress") },
      Resolved:          { bg: "rgba(16, 185, 129, 0.14)", color: "#34d399", border: "rgba(16, 185, 129, 0.28)", label: t("resolved") },
      Closed:            { bg: "rgba(244, 63, 94, 0.14)",  color: "#fda4af", border: "rgba(244, 63, 94, 0.28)", label: t("rejected") },
      CHATBOT_HANDLING:  { bg: "rgba(168, 85, 247, 0.14)", color: "#d8b4fe", border: "rgba(168, 85, 247, 0.28)", label: "Chatbot" },
      HUMAN_HANDLING:    { bg: "rgba(245, 158, 11, 0.14)", color: "#fde047", border: "rgba(245, 158, 11, 0.28)", label: "Human" },
    } : {
      Open:              { bg: "#f1f5f9", color: "#334155", border: "#cbd5e1", label: t("pending") },
      Investigating:     { bg: "#fff8e1", color: "#b45309", border: "#fde68a", label: t("inProgress") },
      Resolved:          { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0", label: t("resolved") },
      Closed:            { bg: "#fef2f2", color: "#991b1b", border: "#fecaca", label: t("rejected") },
      CHATBOT_HANDLING:  { bg: "#f3e8ff", color: "#6b21a8", border: "#e9d5ff", label: "Chatbot" },
      HUMAN_HANDLING:    { bg: "#fef3c7", color: "#92400e", border: "#fde68a", label: "Human" },
    };
    const s = styles[status] || {
      bg: isDark ? "rgba(255, 255, 255, 0.06)" : "#f1f5f9",
      color: isDark ? "#d4d4d8" : "#475569",
      border: isDark ? "rgba(255, 255, 255, 0.12)" : "transparent",
      label: status
    };
    return (
      <span className="px-3 py-1 rounded-pill fw-semibold"
        style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border || 'transparent'}`, fontSize: "12px", whiteSpace: "nowrap" }}>
        {s.label}
      </span>
    );
  };

  // --- SEVERITY BADGE ---
  const getSeverityBadge = (severity) => {
    const styles = isDark ? {
      Critical: { bg: "rgba(244, 63, 94, 0.16)",  color: "#fda4af", border: "rgba(244, 63, 94, 0.3)" },
      High:     { bg: "rgba(249, 115, 22, 0.16)", color: "#fdba74", border: "rgba(249, 115, 22, 0.3)" },
      Medium:   { bg: "rgba(217, 119, 6, 0.15)",  color: "#fcd34d", border: "rgba(217, 119, 6, 0.26)" },
      Low:      { bg: "rgba(255, 255, 255, 0.07)", color: "#d4d4d8", border: "rgba(255, 255, 255, 0.12)" },
    } : {
      Critical: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
      High:     { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
      Medium:   { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
      Low:      { bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
    };
    const s = styles[severity] || (isDark
      ? { bg: "rgba(255, 255, 255, 0.07)", color: "#d4d4d8", border: "rgba(255, 255, 255, 0.12)" }
      : { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" }
    );
    return (
      <span className="px-2 py-1 rounded-pill fw-semibold"
        style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: "11px" }}>
        {severity}
      </span>
    );
  };

  // --- SLA STATUS HELPER ---
  const getSlaStatus = (g) => {
    if (!g.sla_deadline || !g.assigned_tier) return null;
    if (g.status === 'Resolved' || g.status === 'Closed') return null;
    const deadline = new Date(g.sla_deadline);
    const now = new Date();
    const hoursLeft = (deadline - now) / 3600000;
    if (hoursLeft < 0) {
      return {
        label: 'Breached',
        color: isDark ? '#fda4af' : '#b91c1c',
        bg: isDark ? 'rgba(244, 63, 94, 0.16)' : '#fef2f2',
        border: isDark ? 'rgba(244, 63, 94, 0.3)' : '#fecaca',
      };
    }
    if (hoursLeft < 4) {
      return {
        label: `${Math.round(hoursLeft)}h left`,
        color: isDark ? '#fde047' : '#b45309',
        bg: isDark ? 'rgba(245, 158, 11, 0.16)' : '#fffbeb',
        border: isDark ? 'rgba(245, 158, 11, 0.3)' : '#fde68a',
      };
    }
    return {
      label: `${Math.round(hoursLeft)}h left`,
      color: isDark ? '#6ee7b7' : '#15803d',
      bg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#f0fdf4',
      border: isDark ? 'rgba(16, 185, 129, 0.3)' : '#bbf7d0',
    };
  };

  // --- TIER BADGE ---
  const getTierBadge = (tier) => {
    if (!tier) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>;
    const colors = isDark ? {
      L1:   { bg: 'rgba(255, 255, 255, 0.08)', color: '#f4f4f5', border: 'rgba(255, 255, 255, 0.16)' },
      L2:   { bg: 'rgba(245, 158, 11, 0.15)',  color: '#fde047', border: 'rgba(245, 158, 11, 0.28)' },
      L3:   { bg: 'rgba(217, 70, 239, 0.15)',  color: '#f0abfc', border: 'rgba(217, 70, 239, 0.28)' },
      HEAD: { bg: 'rgba(244, 63, 94, 0.18)',   color: '#fda4af', border: 'rgba(244, 63, 94, 0.35)' },
    } : {
      L1:   { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
      L2:   { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
      L3:   { bg: '#fdf2f8', color: '#be185d', border: '#fbcfe8' },
      HEAD: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
    };
    const c = colors[tier] || (isDark
      ? { bg: 'rgba(255, 255, 255, 0.07)', color: '#d4d4d8', border: 'rgba(255, 255, 255, 0.12)' }
      : { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' }
    );
    return (
      <span className="px-2 py-1 rounded-pill fw-bold"
        style={{ backgroundColor: c.bg, color: c.color, border: `1px solid ${c.border}`, fontSize: '11px' }}>
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
          <h2 className="fw-bold mb-1" style={{ color: "var(--heading-color)" }}>
            {t("adminDashboard")}
          </h2>
          <p className="text-muted mb-0">
            {t("welcomeBack")} <strong className="text-dark">{admin.name}</strong> —{" "}
            <span className="badge px-2 py-1 rounded-pill"
              style={{
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#e8f4fd",
                color: isDark ? "#e4e4e7" : "#0c7cd5",
                border: isDark ? "1px solid rgba(255, 255, 255, 0.14)" : "none"
              }}>
              {admin.department}
            </span>{" "}
            {admin.admin_tier ? (
              <span className="badge px-2 py-1 rounded-pill ms-1"
                style={{
                  backgroundColor: admin.admin_tier === "HEAD"
                    ? (isDark ? "rgba(239, 68, 68, 0.2)" : "#fecaca")
                    : (isDark ? "rgba(255, 255, 255, 0.08)" : "#dbeafe"),
                  color: admin.admin_tier === "HEAD"
                    ? (isDark ? "#fca5a5" : "#991b1b")
                    : (isDark ? "#f4f4f5" : "#1d4ed8"),
                  border: isDark ? (admin.admin_tier === "HEAD" ? "1px solid rgba(239, 68, 68, 0.35)" : "1px solid rgba(255, 255, 255, 0.14)") : "none"
                }}>
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
          <button onClick={() => handleExport("csv")} className="btn btn-outline-primary btn-sm fw-bold shadow-sm" style={{ borderRadius: "8px" }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="me-1 mb-1">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            CSV
          </button>
          <button onClick={() => handleExport("pdf")} className="btn btn-outline-danger btn-sm fw-bold shadow-sm" style={{ borderRadius: "8px" }}>
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

      {/* TIER QUEUE SELECTOR / SCOPE INDICATOR */}
      {isTierLocked ? (
        <div className="d-flex align-items-center justify-content-between p-3 mb-3 rounded shadow-sm"
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
              Viewing tickets assigned to <strong>{admin.department} {admin.admin_tier}</strong> handling.
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
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <span className="text-muted fw-bold me-1" style={{ fontSize: "13px" }}>Queue:</span>
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
                    padding: "5px 14px",
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
              <p className="mb-0" style={{ fontSize: "14px" }}>
                Grievances matching your <strong>{admin.department}</strong> {isTierLocked ? `${admin.admin_tier} queue` : "department"} will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="text-muted py-3 ps-4" style={{ fontSize: "12px" }}>ID</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>{t("category")}</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>Severity</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>Description</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>Tier</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>SLA</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>{t("dateSubmitted")}</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>{t("status")}</th>
                    <th className="py-3" style={{ width: "32px" }}></th>
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
                      <td className="fw-semibold" style={{ fontSize: "13px", color: "var(--heading-color)" }}>{g.category}</td>
                      <td>{getSeverityBadge(g.severity)}</td>
                      <td
                        style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "13px", color: "var(--text-color)" }}
                      >
                        {translating
                          ? <span className="spinner-border spinner-border-sm text-secondary" role="status" />
                          : g.description}
                      </td>
                      <td>{getTierBadge(g.assigned_tier)}</td>
                      <td>
                        {(() => {
                          const sla = getSlaStatus(g);
                          if (!sla) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>;
                          return (
                            <span className="px-2 py-1 rounded-pill fw-semibold"
                              style={{ backgroundColor: sla.bg, color: sla.color, border: `1px solid ${sla.border}`, fontSize: '11px' }}>
                              {sla.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="text-muted" style={{ fontSize: "13px" }}>
                        {new Date(g.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td>{getStatusBadge(g.status)}</td>
                      <td className="pe-4 text-end">
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: "var(--text-muted)" }}>
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
          className="modal fade show d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedTicket(null); }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">

              {/* Header */}
              <div
                className="modal-header border-0 px-4 py-3"
                style={{
                  background: isDark
                    ? "linear-gradient(135deg, #18181b 0%, #27272a 100%)"
                    : "linear-gradient(135deg, #001a4d 0%, #003366 100%)",
                  borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "none"
                }}
              >
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.6)", letterSpacing: "1.2px", marginBottom: "2px" }}>
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
              <div className="modal-body p-0" style={{ backgroundColor: "var(--surface-alt)" }}>
                <div className="row g-0" style={{ minHeight: "380px" }}>

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
                          <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.8px", marginBottom: "2px" }}>
                            {label.toUpperCase()}
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--heading-color)" }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Divider */}
                    <div style={{ height: "1px", background: "var(--surface-border)", marginBottom: "16px" }} />

                    {/* Full complaint */}
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.8px", marginBottom: "8px" }}>
                      COMPLAINT
                    </div>
                    <div className="admin-inset-box p-3" style={{
                      fontSize: "14px",
                      lineHeight: "1.7",
                      whiteSpace: "pre-wrap",
                      maxHeight: "220px",
                      overflowY: "auto",
                    }}>
                      {selectedTicket.description}
                    </div>

                    {/* Resolution reason if closed */}
                    {selectedTicket.resolution_reason && (
                      <div style={{ marginTop: "16px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.8px", marginBottom: "8px" }}>
                          {selectedTicket.status === "Resolved" ? "RESOLUTION" : "REJECTION REASON"}
                        </div>
                        <div style={{
                          background: selectedTicket.status === "Resolved"
                            ? (isDark ? "rgba(34, 197, 94, 0.12)" : "#f0fdf4")
                            : (isDark ? "rgba(239, 68, 68, 0.12)" : "#fff1f2"),
                          borderLeft: `3px solid ${selectedTicket.status === "Resolved" ? "#22c55e" : "#f43f5e"}`,
                          borderRadius: "0 6px 6px 0",
                          padding: "12px 14px",
                          fontSize: "13px",
                          color: "var(--text-color)",
                          lineHeight: "1.6",
                        }}>
                          {selectedTicket.resolution_reason}
                        </div>
                      </div>
                    )}

                    {/* ACTIVITY & ESCALATION TRAIL — what L1/L2 and prior admins have done */}
                    <div style={{ marginTop: "18px" }}>
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.8px" }}>
                          ACTIVITY & ESCALATION TRAIL ({selectedTicket.escalation_history?.length || 0})
                        </div>
                        {selectedTicket.assigned_tier && (
                          <span className="badge bg-light text-secondary border" style={{ fontSize: "10px" }}>
                            Current: {selectedTicket.assigned_tier}
                          </span>
                        )}
                      </div>

                      {selectedTicket.escalation_history && selectedTicket.escalation_history.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "190px", overflowY: "auto", paddingRight: "4px" }}>
                          {selectedTicket.escalation_history.map((item, idx) => (
                            <div key={idx} className="admin-trail-item">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <span style={{ fontWeight: 700, color: isDark ? "#e4e4e7" : "#001a4d", fontSize: "11px" }}>
                                  {item.tier ? `[${item.tier}]` : (item.from_tier ? `${item.from_tier} → ${item.to_tier}` : "System")}
                                  {item.handler ? ` · ${item.handler}` : ""}
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                  {new Date(item.timestamp || item.escalated_at || item.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                                </span>
                              </div>
                              <div style={{ color: "var(--text-color)", fontWeight: 500, fontSize: "12px" }}>
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
                        <div className="admin-inset-box p-3 small text-muted fst-italic text-center" style={{ borderStyle: "dashed" }}>
                          No prior tier actions or handoff notes recorded yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT — actions */}
                  <div className="col-5 p-4 admin-modal-right">
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.8px", marginBottom: "16px" }}>
                      ACTIONS
                    </div>

                    {/* Status change */}
                    {selectedTicket.status !== "Resolved" && selectedTicket.status !== "Rejected" && selectedTicket.status !== "Closed" && (
                      <div style={{ marginBottom: "16px" }}>
                        <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px", letterSpacing: "0.5px" }}>
                          UPDATE STATUS
                        </label>
                        <select
                          className="form-select form-select-sm"
                          value={selectedTicket.status}
                          disabled={updatingId === selectedTicket.grievance_id}
                          onChange={(e) => {
                            handleStatusChange(selectedTicket.grievance_id, e.target.value);
                            setSelectedTicket(prev => ({ ...prev, status: e.target.value }));
                          }}
                          style={{ fontSize: "13px" }}
                        >
                          <option value="Open">Pending</option>
                          <option value="Investigating">Investigating</option>
                          <option value="HUMAN_HANDLING">Human Handling</option>
                          <option value="Resolved">Resolve</option>
                          <option value="Rejected">Reject</option>
                        </select>
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

                      {/* Escalate to Next Tier */}
                      {selectedTicket.assigned_tier !== "HEAD" && selectedTicket.status !== "Resolved" && selectedTicket.status !== "Rejected" && selectedTicket.status !== "Closed" && (
                        <button
                          onClick={() => {
                            setEscalatingTicket(selectedTicket);
                            setEscalationReason("");
                            setEscalationNotes("");
                          }}
                          style={{
                            background: isDark ? "rgba(249, 115, 22, 0.15)" : "#fff7ed",
                            color: isDark ? "#fdba74" : "#c2410c",
                            border: isDark ? "1px solid rgba(249, 115, 22, 0.3)" : "1px solid #fed7aa",
                            borderRadius: "7px", padding: "10px 14px",
                            fontSize: "13px", fontWeight: 600,
                            textAlign: "left", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: "8px",
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
                          onClick={() => { handleOpenRag(selectedTicket); setSelectedTicket(null); }}
                          style={{
                            background: isDark ? "linear-gradient(135deg, #27272a, #3f3f46)" : "linear-gradient(135deg, #001a4d, #003366)",
                            color: "#fff",
                            border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : "none",
                            borderRadius: "7px", padding: "10px 14px",
                            fontSize: "13px", fontWeight: 600,
                            textAlign: "left", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: "8px",
                          }}
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
                          onClick={() => setViewingAttachments(selectedTicket.attachments)}
                          style={{
                            background: isDark ? "rgba(255,255,255,0.05)" : "#fff",
                            color: "var(--text-color)",
                            border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e9ecef",
                            borderRadius: "7px", padding: "10px 14px",
                            fontSize: "13px", fontWeight: 600,
                            textAlign: "left", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: "8px",
                          }}
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
                          onClick={() => handleDownloadAdminReport(selectedTicket.grievance_id)}
                          disabled={downloadingReportId === selectedTicket.grievance_id}
                          style={{
                            background: isDark ? "rgba(34, 197, 94, 0.15)" : "#f0fdf4",
                            color: isDark ? "#86efac" : "#15803d",
                            border: isDark ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid #bbf7d0",
                            borderRadius: "7px", padding: "10px 14px",
                            fontSize: "13px", fontWeight: 600,
                            textAlign: "left", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: "8px",
                          }}
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
                        onClick={() => { handleDelete(selectedTicket.grievance_id); setSelectedTicket(null); }}
                        disabled={updatingId === selectedTicket.grievance_id}
                        style={{
                          marginTop: "8px",
                          background: "transparent",
                          color: isDark ? "#f87171" : "#dc2626",
                          border: isDark ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid #fecaca",
                          borderRadius: "7px", padding: "10px 14px",
                          fontSize: "13px", fontWeight: 600,
                          textAlign: "left", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: "8px",
                        }}
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
      <div className={`modal fade ${viewingAttachments ? "show d-block" : ""}`} tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
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
                              <svg width="48" height="48" fill="#c4122f" viewBox="0 0 16 16" className="mb-2">
                                <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/>
                                <path d="M4.603 12.087a.81.81 0 0 1-.438-.42c-.195-.388-.13-.776.08-1.09.215-.323.593-.548 1.135-.672.482-.11 1.05-.164 1.704-.164.767 0 1.455.074 2.064.22.453.11.83.256 1.13.439.439.268.618.617.535 1.045-.078.406-.388.7-.93.882-.542.183-1.25.274-2.126.274-.848 0-1.57-.087-2.164-.26a3.864 3.864 0 0 1-.99-.444z"/>
                              </svg>
                              <div><a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-danger mt-1 fw-bold">Open PDF Document</a></div>
                            </div>
                          ) : isVideo ? (
                            <video src={url} controls className="img-fluid rounded shadow-sm" style={{ maxHeight: "300px" }} />
                          ) : (
                            <a href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt={`Attachment ${idx + 1}`} className="img-fluid rounded shadow-sm" style={{ maxHeight: "300px", objectFit: "contain" }} />
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
      <div className={`modal fade ${selectedRagTicket ? "show d-block" : ""}`} tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
        <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
          <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
            
            {/* MODAL HEADER */}
            <div 
              className="modal-header border-0 px-4 py-3 text-white" 
              style={{
                background: isDark
                  ? "linear-gradient(135deg, #18181b 0%, #27272a 100%)"
                  : "linear-gradient(135deg, #001a4d 0%, #003366 100%)",
                borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "none"
              }}
            >
              <div className="d-flex align-items-center gap-3">
                <div 
                  className="rounded-circle d-flex align-items-center justify-content-center"
                  style={{ width: "42px", height: "42px", background: "rgba(255,255,255,0.12)" }}
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
                  className={`badge rounded-pill px-3 py-2 fw-semibold ${selectedRagTicket?.severity?.toLowerCase() === "medium" ? "bg-warning text-dark" : "bg-danger text-white"}`} 
                  style={{ fontSize: "12px" }}
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
            <div className="modal-body p-4" style={{ backgroundColor: "var(--surface-alt)" }}>
              {loadingRag ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" style={{ width: "3rem", height: "3rem" }} role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <h6 className="fw-bold mt-4" style={{ color: "var(--heading-color)" }}>Consulting Policy Vector Store...</h6>
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
                    <p className="mb-0 small fst-italic p-2 rounded border" style={{ backgroundColor: "var(--surface-alt)", color: "var(--text-color)" }}>
                      "{selectedRagTicket?.description}"
                    </p>
                  </div>

                  {/* EXECUTIVE SUMMARY & PRIMARY POLICY MATCH */}
                  <div className="card border-0 shadow-sm rounded-3 p-3">
                    <div className="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
                      <h6 className="fw-bold mb-0" style={{ color: "var(--heading-color)" }}>
                        Applicable Policy Framework
                      </h6>
                      {ragRecommendation.has_policy_match ? (
                        <span className="badge rounded-pill px-3 py-1"
                          style={{
                            background: isDark ? "#27272a" : "#001a4d",
                            color: "#fff",
                            border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : "none",
                            fontSize: "12px"
                          }}>
                          Policy Match Verified
                        </span>
                      ) : (
                        <span className="badge bg-secondary rounded-pill px-3 py-1" style={{ fontSize: "12px" }}>
                          Standard GRM SOP
                        </span>
                      )}
                    </div>
                    
                    <div className="p-3 rounded-3 mb-3"
                      style={{
                        backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "#f1f5f9",
                        borderLeft: isDark ? "4px solid #e4e4e7" : "4px solid #001a4d"
                      }}>
                      <div className="fw-bold mb-1" style={{ color: isDark ? "#fafafa" : "#001a4d", fontSize: "14px" }}>
                        {ragRecommendation.primary_policy || "Puravankara Grievance Redressal Policy"}
                      </div>
                      <p className="mb-0 small" style={{ color: "var(--text-color)" }}>
                        {ragRecommendation.executive_summary}
                      </p>
                    </div>

                    {/* POLICY CITATIONS & CLAUSES */}
                    {ragRecommendation.citations && ragRecommendation.citations.length > 0 && (
                      <div>
                        <div className="text-muted small fw-bold mb-2 text-uppercase" style={{ letterSpacing: "0.5px", fontSize: "11px" }}>
                          Retrieved Policy References ({ragRecommendation.citations.length})
                        </div>
                        <div className="row g-2">
                          {ragRecommendation.citations.map((c, i) => (
                            <div key={i} className="col-12 col-md-6">
                              <div className="border rounded-3 p-2 h-100 small" style={{ backgroundColor: "var(--surface-alt)" }}>
                                <div className="d-flex justify-content-between align-items-center mb-1">
                                  <strong className="text-truncate" style={{ maxWidth: "200px", color: "var(--heading-color)" }}>
                                    {c.source}
                                  </strong>
                                  <span className="badge bg-secondary-subtle text-dark" style={{ fontSize: "10px" }}>
                                    Page {c.page} {c.section ? `• ${c.section}` : ""}
                                  </span>
                                </div>
                                <p className="text-muted mb-0 text-truncate-3" style={{ fontSize: "11px", lineHeight: "1.4" }}>
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
                      <h6 className="fw-bold mb-0" style={{ color: "var(--heading-color)" }}>
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
                          className="d-flex align-items-start gap-3 p-3 rounded-3 border"
                          style={{ backgroundColor: "var(--card-bg)" }}
                        >
                          <div 
                            className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0"
                            style={{ 
                              width: "32px", 
                              height: "32px", 
                              backgroundColor: isDark ? "#27272a" : "#001a4d",
                              border: isDark ? "1px solid rgba(255, 255, 255, 0.18)" : "none",
                              fontSize: "14px"
                            }}
                          >
                            {step.step_number || idx + 1}
                          </div>

                          <div className="flex-grow-1">
                            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-1">
                              <strong style={{ fontSize: "14px", color: "var(--heading-color)" }}>
                                {step.title}
                              </strong>
                              {step.deadline && (
                                <span 
                                  className="badge rounded-pill px-2 py-1"
                                  style={{
                                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#eff6ff",
                                    color: isDark ? "#e4e4e7" : "#1d4ed8",
                                    border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #bfdbfe",
                                    fontSize: "11px"
                                  }}
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
                    <div 
                      className="card border-0 rounded-3 p-3"
                      style={{ backgroundColor: isDark ? "rgba(239, 68, 68, 0.12)" : "#fef2f2", borderLeft: "4px solid #c4122f" }}
                    >
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <svg width="16" height="16" fill="#c4122f" viewBox="0 0 16 16">
                          <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
                        </svg>
                        <strong style={{ color: isDark ? "#fca5a5" : "#991b1b", fontSize: "13px" }}>
                          Statutory & SLA Compliance Alert
                        </strong>
                      </div>
                      <p className="small mb-0" style={{ color: isDark ? "#f87171" : "#7f1d1d" }}>
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
      {/* RESOLUTION REASON MODAL */}
      {pendingStatusChange && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div
                className="modal-header border-0 px-4 py-3 text-white"
                style={{
                  background: pendingStatusChange.newStatus === "Resolved"
                    ? "linear-gradient(135deg, #2e7d32, #388e3c)"
                    : "linear-gradient(135deg, #c62828, #e53935)",
                }}
              >
                <h5 className="modal-title fw-bold mb-0">
                  {pendingStatusChange.newStatus === "Resolved" ? "✓ Resolve Grievance" : "✗ Reject Grievance"}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setPendingStatusChange(null)}
                />
              </div>
              <div className="modal-body px-4 py-4">
                <p className="text-muted mb-3" style={{ fontSize: "14px" }}>
                  Please provide a reason for
                  {pendingStatusChange.newStatus === "Resolved" ? " resolving" : " rejecting"} this grievance.
                  This will appear in the employee's report.
                </p>
                <label className="form-label fw-semibold" style={{ fontSize: "13px" }}>
                  {pendingStatusChange.newStatus === "Resolved" ? "Resolution Summary" : "Reason for Rejection"}
                  <span className="text-danger ms-1">*</span>
                </label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder={`Describe the ${pendingStatusChange.newStatus === "Resolved" ? "resolution actions taken" : "reason for rejection"}...`}
                  value={resolutionReason}
                  onChange={(e) => setResolutionReason(e.target.value)}
                  style={{ fontSize: "14px", resize: "vertical" }}
                />
                {!resolutionReason.trim() && (
                  <small className="text-danger mt-1 d-block">This field is required.</small>
                )}
              </div>
              <div className="modal-footer border-top-0 px-4 pb-4 pt-0 gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary rounded-pill px-4"
                  onClick={() => setPendingStatusChange(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn rounded-pill px-4 fw-semibold text-white"
                  disabled={!resolutionReason.trim() || submittingStatus}
                  onClick={handleResolutionSubmit}
                  style={{
                    background: pendingStatusChange.newStatus === "Resolved"
                      ? "linear-gradient(135deg, #2e7d32, #388e3c)"
                      : "linear-gradient(135deg, #c62828, #e53935)",
                  }}
                >
                  {submittingStatus ? (
                    <><span className="spinner-border spinner-border-sm me-2" /> Submitting...</>
                  ) : (
                    pendingStatusChange.newStatus === "Resolved" ? "Confirm Resolution" : "Confirm Rejection"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL ESCALATION MODAL */}
      {escalatingTicket && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div
                className="modal-header border-0 px-4 py-3 text-white"
                style={{ background: "linear-gradient(135deg, #c2410c, #ea580c)" }}
              >
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.75)", letterSpacing: "1px" }}>
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
                <div className="p-3 mb-3 rounded-3" style={{ background: isDark ? "rgba(249, 115, 22, 0.12)" : "#fff7ed", border: isDark ? "1px solid rgba(249, 115, 22, 0.25)" : "1px solid #fed7aa" }}>
                  <div style={{ fontSize: "12px", color: isDark ? "#fdba74" : "#9a3412", fontWeight: 600 }}>
                    Current Tier: <strong>{escalatingTicket.assigned_tier}</strong> → Escalating to next authority level
                  </div>
                  <div style={{ fontSize: "11px", color: isDark ? "#fba97a" : "#c2410c", marginTop: "2px" }}>
                    This will reassign the queue, update SLA deadlines, and log your handoff notes into the case history for the receiving admin.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold" style={{ fontSize: "13px" }}>
                    Reason for Escalation <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Requires senior engineering inspection / approval"
                    value={escalationReason}
                    onChange={(e) => setEscalationReason(e.target.value)}
                    style={{ fontSize: "13px" }}
                  />
                </div>

                <div className="mb-2">
                  <label className="form-label fw-semibold" style={{ fontSize: "13px" }}>
                    Handoff Notes & Actions Taken So Far
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Describe what you have investigated, checked, or communicated with the complainant so the next level admin can pick up smoothly..."
                    value={escalationNotes}
                    onChange={(e) => setEscalationNotes(e.target.value)}
                    style={{ fontSize: "13px", resize: "vertical" }}
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
                  className="btn rounded-pill px-4 fw-semibold text-white"
                  disabled={!escalationReason.trim() || submittingEscalation}
                  onClick={handleEscalateSubmit}
                  style={{ background: "linear-gradient(135deg, #c2410c, #ea580c)" }}
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
