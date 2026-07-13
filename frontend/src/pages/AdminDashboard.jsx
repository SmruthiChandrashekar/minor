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
  }, [navigate]);

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

  // --- FILTER BY ADMIN DEPARTMENT ---
  const filtered = admin
    ? translatedGrievances.filter(
        (g) => isSuperAdmin || g.department === admin.department || g.category === admin.department
      )
    : [];

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
      Open:          { bg: "#e8f4fd", color: "#0c7cd5", label: t("pending") },
      Investigating: { bg: "#fff8e1", color: "#f59e0b", label: t("inProgress") },
      Resolved:      { bg: "#e8f5e9", color: "#2e7d32", label: t("resolved") },
      Closed:        { bg: "#fce4ec", color: "#c62828", label: t("rejected") },
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
            {t("department")}
          </p>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <span className="badge bg-success rounded-pill px-3 py-2" style={{ fontSize: "11px" }}>
            ● Live
          </span>
        </div>
      </div>

      {/* ADVANCED ANALYTICS & FILTERS */}
      <AdminAnalytics adminDepartment={isSuperAdmin ? "" : (admin?.department || "")} />

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
                Grievances matching your <strong>{admin.department}</strong> department will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light" style={{ borderBottom: "2px solid #dee2e6" }}>
                  <tr>
                    <th className="text-muted py-3 ps-4" style={{ fontSize: "12px" }}>ID</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>{t("category")}</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>{t("status")}</th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>Description</th>
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
                      <td className="text-muted" style={{ fontSize: "13px" }}>
                        {new Date(g.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td>{getStatusBadge(g.status)}</td>
                      <td className="text-end pe-4">
                        <div className="d-flex align-items-center justify-content-end gap-2">
                          <select
                            className="form-select form-select-sm d-inline-block w-auto shadow-sm"
                            value={g.status}
                            disabled={updatingId === g.grievance_id}
                            onChange={(e) => handleStatusChange(g.grievance_id, e.target.value)}
                            style={{ cursor: "pointer", fontWeight: "500", minWidth: "140px", fontSize: "13px", borderColor: "#dee2e6" }}
                          >
                            <option value="Open">{t("pending")}</option>
                            <option value="Investigating">{t("inProgress")}</option>
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
    </div>
  );
};

export default AdminDashboard;
