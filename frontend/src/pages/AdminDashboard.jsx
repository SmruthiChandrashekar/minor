import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import { supabase } from "../services/supabaseClient";
import { translateList } from "../services/translationService";
import AdminAnalytics from "../components/AdminAnalytics";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { userDetails: admin, isSuperAdmin } = useAuth();
  
  const [grievances, setGrievances] = useState([]);
  const [translatedGrievances, setTranslatedGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [viewingAttachments, setViewingAttachments] = useState(null);
  const [tierFilter, setTierFilter] = useState("ALL");

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
    setUpdatingId(grievanceId);
    try {
      const { error } = await supabase
        .from("grievances")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("grievance_id", grievanceId);
      if (error) throw error;
      setGrievances((prev) =>
        prev.map((g) => g.grievance_id === grievanceId ? { ...g, status: newStatus } : g)
      );
    } catch (err) {
      alert("Failed to update status: " + err.message);
    } finally {
      setUpdatingId(null);
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

  // --- STATUS BADGE (uses i18n for labels) ---
  const getStatusBadge = (status) => {
    const styles = {
      Open:              { bg: "#e8f4fd", color: "#0c7cd5", label: t("pending") },
      Investigating:     { bg: "#fff8e1", color: "#f59e0b", label: t("inProgress") },
      Resolved:          { bg: "#e8f5e9", color: "#2e7d32", label: t("resolved") },
      Closed:            { bg: "#fce4ec", color: "#c62828", label: t("rejected") },
      CHATBOT_HANDLING:  { bg: "#f3e8ff", color: "#7c3aed", label: "Chatbot" },
      HUMAN_HANDLING:    { bg: "#fef3c7", color: "#d97706", label: "Human" },
    };
    const s = styles[status] || { bg: "#f5f5f5", color: "#666", label: status };
    return (
      <span className="px-3 py-1 rounded-pill fw-semibold"
        style={{ backgroundColor: s.bg, color: s.color, fontSize: "12px" }}>
        {s.label}
      </span>
    );
  };

  // --- SEVERITY BADGE ---
  const getSeverityBadge = (severity) => {
    const styles = {
      Critical: { bg: "#fce4ec", color: "#c62828" },
      High:     { bg: "#fff3e0", color: "#e65100" },
      Medium:   { bg: "#e3f2fd", color: "#1565c0" },
      Low:      { bg: "#f5f5f5", color: "#616161" },
    };
    const s = styles[severity] || { bg: "#f5f5f5", color: "#666" };
    return (
      <span className="px-2 py-1 rounded-pill fw-semibold"
        style={{ backgroundColor: s.bg, color: s.color, fontSize: "11px" }}>
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
    if (hoursLeft < 0) return { label: 'Breached', color: '#dc2626', bg: '#fef2f2' };
    if (hoursLeft < 4) return { label: `${Math.round(hoursLeft)}h left`, color: '#d97706', bg: '#fffbeb' };
    return { label: `${Math.round(hoursLeft)}h left`, color: '#16a34a', bg: '#f0fdf4' };
  };

  // --- TIER BADGE ---
  const getTierBadge = (tier) => {
    if (!tier) return <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>;
    const colors = {
      L1:   { bg: '#dbeafe', color: '#1d4ed8' },
      L2:   { bg: '#fef3c7', color: '#b45309' },
      L3:   { bg: '#fce7f3', color: '#be185d' },
      HEAD: { bg: '#fecaca', color: '#991b1b' },
    };
    const c = colors[tier] || { bg: '#f3f4f6', color: '#4b5563' };
    return (
      <span className="px-2 py-1 rounded-pill fw-bold"
        style={{ backgroundColor: c.bg, color: c.color, fontSize: '11px' }}>
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
  const closed       = filtered.filter((g) => g.status === "Closed").length;

  return (
    <div className="container-fluid mt-4 mb-5 px-5">

      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom">
        <div>
          <h2 className="fw-bold mb-1" style={{ color: "#001a4d" }}>
            {t("adminDashboard")}
          </h2>
          <p className="text-muted mb-0">
            {t("welcomeBack")} <strong className="text-dark">{admin.name}</strong> —{" "}
            <span className="badge px-2 py-1 rounded-pill"
              style={{ backgroundColor: "#e8f4fd", color: "#0c7cd5" }}>
              {admin.department}
            </span>{" "}
            {admin.admin_tier ? (
              <span className="badge px-2 py-1 rounded-pill ms-1"
                style={{
                  backgroundColor: admin.admin_tier === "HEAD" ? "#fecaca" : "#dbeafe",
                  color: admin.admin_tier === "HEAD" ? "#991b1b" : "#1d4ed8",
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
          <span className="badge bg-success rounded-pill px-3 py-2 ms-2" style={{ fontSize: "11px" }}>
            ● Live
          </span>
        </div>
      </div>

      {/* ADVANCED ANALYTICS & FILTERS */}
      <AdminAnalytics adminDepartment={isSuperAdmin ? "" : (admin?.department || "")} />

      {/* TIER QUEUE SELECTOR / SCOPE INDICATOR */}
      {isTierLocked ? (
        <div className="d-flex align-items-center justify-content-between p-3 mb-3 rounded shadow-sm"
          style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-primary px-3 py-2 rounded-pill fw-bold" style={{ fontSize: "12px" }}>
              {admin.admin_tier} QUEUE
            </span>
            <span className="text-dark" style={{ fontSize: "14px" }}>
              Viewing tickets assigned to <strong>{admin.department} {admin.admin_tier}</strong> handling.
            </span>
          </div>
          <span className="badge bg-light text-primary border border-primary px-3 py-2 rounded-pill fw-bold">
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
                  className={`btn btn-sm rounded-pill fw-semibold ${isActive ? "btn-dark shadow-sm" : "btn-outline-secondary"}`}
                  style={{ fontSize: "12px", padding: "5px 14px" }}
                >
                  {t === "ALL" ? "All Tiers" : t === "HEAD" ? "HEAD (Escalations)" : `${t} Queue`}
                  <span className={`badge ms-2 rounded-pill ${isActive ? "bg-light text-dark" : "bg-secondary text-light"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          {admin.admin_tier === "HEAD" && (
            <span className="badge bg-danger bg-opacity-10 text-danger border border-danger px-3 py-2 rounded-pill fw-semibold" style={{ fontSize: "12px" }}>
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
                <thead className="table-light" style={{ borderBottom: "2px solid #dee2e6" }}>
                  <tr>
                    <th className="text-muted py-3 ps-4" style={{ fontSize: "12px" }}>ID</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>{t("category")}</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>Severity</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>Description</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>Tier</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>SLA</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>{t("dateSubmitted")}</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>{t("status")}</th>
                    <th className="text-muted py-3 text-end pe-4" style={{ fontSize: "12px" }}>{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((g) => (
                    <tr key={g.grievance_id}>
                      <td className="fw-bold ps-4" style={{ color: "#0c7cd5", fontSize: "13px" }}>
                        #{g.grievance_id.substring(0, 8)}
                      </td>
                      <td className="fw-semibold">{g.category}</td>
                      <td>{getSeverityBadge(g.severity)}</td>
                      <td className="text-muted"
                        style={{ maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "13px" }}
                        title={g.description}>
                        {translating
                          ? <span className="spinner-border spinner-border-sm text-secondary" role="status" />
                          : g.description}
                      </td>
                      <td>{getTierBadge(g.assigned_tier)}</td>
                      <td>
                        {(() => {
                          const sla = getSlaStatus(g);
                          if (!sla) return <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>;
                          return (
                            <span className="px-2 py-1 rounded-pill fw-semibold"
                              style={{ backgroundColor: sla.bg, color: sla.color, fontSize: '11px' }}>
                              {sla.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="text-muted" style={{ fontSize: "13px" }}>
                        {new Date(g.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td>{getStatusBadge(g.status)}</td>
                      <td className="text-end pe-4">
                        <div className="d-flex align-items-center justify-content-end gap-2">
                          {g.attachments && g.attachments.length > 0 && (
                            <button
                              className="btn btn-outline-secondary btn-sm shadow-sm"
                              title="View Attachments"
                              onClick={() => setViewingAttachments(g.attachments)}
                              style={{ borderRadius: "6px", padding: "4px 8px" }}
                            >
                              📎 {g.attachments.length}
                            </button>
                          )}
                          <select
                            className="form-select form-select-sm d-inline-block w-auto shadow-sm"
                            value={g.status}
                            disabled={updatingId === g.grievance_id}
                            onChange={(e) => handleStatusChange(g.grievance_id, e.target.value)}
                            style={{ cursor: "pointer", fontWeight: "500", minWidth: "140px", fontSize: "13px", borderColor: "#dee2e6" }}
                          >
                            <option value="Open">{t("pending")}</option>
                            <option value="Investigating">{t("inProgress")}</option>
                            <option value="HUMAN_HANDLING">Human Handling</option>
                            <option value="Resolved">{t("resolved")}</option>
                            <option value="Closed">{t("rejected")}</option>
                          </select>
                          <button
                            className="btn btn-outline-danger btn-sm shadow-sm"
                            title="Delete Grievance"
                            disabled={updatingId === g.grievance_id}
                            onClick={() => handleDelete(g.grievance_id)}
                            style={{ borderRadius: "6px", padding: "4px 8px" }}
                          >
                            <i className="fa-regular fa-trash-can"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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
                        <div className="border rounded p-2 h-100 d-flex flex-column align-items-center justify-content-center bg-light">
                          {isPdf ? (
                            <div className="text-center">
                              <div style={{ fontSize: "3rem" }}>📄</div>
                              <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary mt-2">Open PDF</a>
                            </div>
                          ) : isVideo ? (
                            <video src={url} controls className="img-fluid rounded" style={{ maxHeight: "300px" }} />
                          ) : (
                            <a href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt={`Attachment ${idx + 1}`} className="img-fluid rounded" style={{ maxHeight: "300px", objectFit: "contain" }} />
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

    </div>
  );
};

export default AdminDashboard;
