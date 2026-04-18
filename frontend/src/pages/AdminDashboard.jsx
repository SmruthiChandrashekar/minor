import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { supabase } from "../services/supabaseClient";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  // Get admin data from localStorage
  const admin = JSON.parse(localStorage.getItem("admin_user") || "null");

  // --- FETCH GRIEVANCES FROM SUPABASE ---
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
    if (!admin) {
      navigate("/admin");
      return;
    }

    fetchGrievances();

    // --- SUPABASE REALTIME ---
    const channel = supabase
      .channel("grievances-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "grievances",
        },
        (payload) => {
          console.log("🔔 New grievance received:", payload.new);
          setGrievances((prev) => [payload.new, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "grievances",
        },
        (payload) => {
          console.log("🔄 Grievance updated:", payload.new);
          setGrievances((prev) =>
            prev.map((g) =>
              g.grievance_id === payload.new.grievance_id ? payload.new : g
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  // --- FILTER BASED ON ADMIN DEPARTMENT ---
  const filtered = admin
    ? grievances.filter(
        (g) => g.department === admin.department || g.category === admin.department
      )
    : [];

  // --- STATUS UPDATE ---
  const handleStatusChange = async (grievanceId, newStatus) => {
    setUpdatingId(grievanceId);
    try {
      const { error } = await supabase
        .from("grievances")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("grievance_id", grievanceId);

      if (error) throw error;

      // Optimistic update (realtime will also sync)
      setGrievances((prev) =>
        prev.map((g) =>
          g.grievance_id === grievanceId ? { ...g, status: newStatus } : g
        )
      );
    } catch (err) {
      alert("Failed to update status: " + err.message);
    } finally {
      setUpdatingId(null);
    }
  };



  // --- BADGES ---
  const getStatusBadge = (status) => {
    const styles = {
      Open: { bg: "#e8f4fd", color: "#0c7cd5", label: "Open" },
      Investigating: { bg: "#fff8e1", color: "#f59e0b", label: t("inProgress") },
      Resolved: { bg: "#e8f5e9", color: "#2e7d32", label: t("resolved") },
      Closed: { bg: "#fce4ec", color: "#c62828", label: "Closed" },
    };
    const s = styles[status] || { bg: "#f5f5f5", color: "#666", label: status };
    return (
      <span
        className="px-3 py-1 rounded-pill fw-semibold"
        style={{ backgroundColor: s.bg, color: s.color, fontSize: "12px" }}
      >
        {s.label}
      </span>
    );
  };

  const getSeverityBadge = (severity) => {
    const styles = {
      Critical: { bg: "#fce4ec", color: "#c62828" },
      High: { bg: "#fff3e0", color: "#e65100" },
      Medium: { bg: "#e3f2fd", color: "#1565c0" },
      Low: { bg: "#f5f5f5", color: "#616161" },
    };
    const s = styles[severity] || { bg: "#f5f5f5", color: "#666" };
    return (
      <span
        className="px-2 py-1 rounded-pill fw-semibold"
        style={{ backgroundColor: s.bg, color: s.color, fontSize: "11px" }}
      >
        {severity}
      </span>
    );
  };

  if (!admin) return null;

  // --- DYNAMIC METRICS ---
  const total = filtered.length;
  const open = filtered.filter((g) => g.status === "Open").length;
  const investigating = filtered.filter((g) => g.status === "Investigating").length;
  const resolved = filtered.filter((g) => g.status === "Resolved").length;
  const closed = filtered.filter((g) => g.status === "Closed").length;

  return (
    <div className="container-fluid mt-4 mb-5 px-5">
      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom">
        <div>
          <h2 className="fw-bold mb-1" style={{ color: "#001a4d" }}>
            {t("adminDashboard")}
          </h2>
          <p className="text-muted mb-0">
            Welcome, <strong className="text-dark">{admin.name}</strong> —{" "}
            <span
              className="badge px-2 py-1 rounded-pill"
              style={{ backgroundColor: "#e8f4fd", color: "#0c7cd5" }}
            >
              {admin.department}
            </span>{" "}
            Department
          </p>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <span
            className="badge bg-success rounded-pill px-3 py-2"
            style={{ fontSize: "11px" }}
          >
            ● Live
          </span>
        </div>
      </div>

      {/* STATS */}
      <div className="row mb-4 g-3">
        <div className="col-md">
          <div
            className="card bg-white border-0 shadow-sm p-4 h-100"
            style={{ borderLeft: "4px solid #001a4d" }}
          >
            <h3 className="fw-bold mb-0 text-dark">{total}</h3>
            <p
              className="text-muted mb-0 fw-semibold text-uppercase"
              style={{ fontSize: "11px", letterSpacing: "1px" }}
            >
              Total Assigned
            </p>
          </div>
        </div>
        <div className="col-md">
          <div
            className="card bg-white border-0 shadow-sm p-4 h-100"
            style={{ borderLeft: "4px solid #0c7cd5" }}
          >
            <h3 className="fw-bold mb-0" style={{ color: "#0c7cd5" }}>
              {open}
            </h3>
            <p
              className="text-muted mb-0 fw-semibold text-uppercase"
              style={{ fontSize: "11px", letterSpacing: "1px" }}
            >
              Open
            </p>
          </div>
        </div>
        <div className="col-md">
          <div
            className="card bg-white border-0 shadow-sm p-4 h-100"
            style={{ borderLeft: "4px solid #f59e0b" }}
          >
            <h3 className="fw-bold mb-0" style={{ color: "#f59e0b" }}>
              {investigating}
            </h3>
            <p
              className="text-muted mb-0 fw-semibold text-uppercase"
              style={{ fontSize: "11px", letterSpacing: "1px" }}
            >
              Investigating
            </p>
          </div>
        </div>
        <div className="col-md">
          <div
            className="card bg-white border-0 shadow-sm p-4 h-100"
            style={{ borderLeft: "4px solid #2e7d32" }}
          >
            <h3 className="fw-bold mb-0" style={{ color: "#2e7d32" }}>
              {resolved}
            </h3>
            <p
              className="text-muted mb-0 fw-semibold text-uppercase"
              style={{ fontSize: "11px", letterSpacing: "1px" }}
            >
              Resolved
            </p>
          </div>
        </div>
        <div className="col-md">
          <div
            className="card bg-white border-0 shadow-sm p-4 h-100"
            style={{ borderLeft: "4px solid #c62828" }}
          >
            <h3 className="fw-bold mb-0" style={{ color: "#c62828" }}>
              {closed}
            </h3>
            <p
              className="text-muted mb-0 fw-semibold text-uppercase"
              style={{ fontSize: "11px", letterSpacing: "1px" }}
            >
              Closed
            </p>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="card shadow-sm border-0">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="text-muted mt-3">Loading grievances...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <div
                className="mx-auto mb-3 d-flex justify-content-center align-items-center rounded-circle"
                style={{
                  width: "60px",
                  height: "60px",
                  backgroundColor: "#f5f5f5",
                }}
              >
                <svg
                  width="28"
                  height="28"
                  fill="none"
                  stroke="#999"
                  strokeWidth="2"
                >
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h5 className="fw-bold mb-1">No complaints assigned</h5>
              <p className="mb-0" style={{ fontSize: "14px" }}>
                Grievances matching your <strong>{admin.department}</strong>{" "}
                department will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead
                  className="table-light"
                  style={{ borderBottom: "2px solid #dee2e6" }}
                >
                  <tr>
                    <th className="text-muted py-3 ps-4" style={{ fontSize: "12px" }}>
                      ID
                    </th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>
                      {t("category")}
                    </th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>
                      Severity
                    </th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>
                      Description
                    </th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>
                      {t("dateSubmitted")}
                    </th>
                    <th className="text-muted py-3" style={{ fontSize: "12px" }}>
                      {t("status")}
                    </th>
                    <th
                      className="text-muted py-3 text-end pe-4"
                      style={{ fontSize: "12px" }}
                    >
                      {t("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((g) => (
                    <tr key={g.grievance_id}>
                      <td
                        className="fw-bold ps-4"
                        style={{ color: "#0c7cd5", fontSize: "13px" }}
                      >
                        #{g.grievance_id.substring(0, 8)}
                      </td>
                      <td className="fw-semibold">{g.category}</td>
                      <td>{getSeverityBadge(g.severity)}</td>
                      <td
                        className="text-muted"
                        style={{
                          maxWidth: "280px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: "13px",
                        }}
                        title={g.description}
                      >
                        {g.description}
                      </td>
                      <td className="text-muted" style={{ fontSize: "13px" }}>
                        {new Date(g.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td>{getStatusBadge(g.status)}</td>
                      <td className="text-end pe-4">
                        <select
                          className="form-select form-select-sm d-inline-block w-auto shadow-sm"
                          value={g.status}
                          disabled={updatingId === g.grievance_id}
                          onChange={(e) =>
                            handleStatusChange(g.grievance_id, e.target.value)
                          }
                          style={{
                            cursor: "pointer",
                            fontWeight: "500",
                            minWidth: "140px",
                            fontSize: "13px",
                            borderColor: "#dee2e6",
                          }}
                        >
                          <option value="Open">Open</option>
                          <option value="Investigating">Investigating</option>
                          <option value="Resolved">Resolved</option>
                          <option value="Closed">Closed</option>
                        </select>
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
