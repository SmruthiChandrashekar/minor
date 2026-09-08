import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../context/AuthProvider";

function Track() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [trackingId, setTrackingId] = useState("");
  const [error, setError] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [trackedData, setTrackedData] = useState(null);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const fetchComplaint = async (rawId) => {
    const cleanedId = (rawId || "").trim();
    if (!cleanedId) {
      setError("Tracking ID is required");
      return;
    }

    setIsTracking(true);
    setError("");
    setTrackedData(null);

    try {
      let data = null;
      let fetchError = null;

      const isFullUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanedId);

      if (isFullUUID) {
        const result = await supabase
          .from("grievances")
          .select("*")
          .eq("grievance_id", cleanedId)
          .single();

        data = result.data;
        fetchError = result.error;
      } else {
        const result = await supabase
          .from("grievances")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        if (result.data) {
          const match = result.data.find((g) =>
            g.grievance_id.toLowerCase().startsWith(cleanedId.toLowerCase())
          );
          if (match) {
            data = match;
          } else {
            fetchError = { message: "Not found" };
          }
        } else {
          fetchError = result.error || { message: "Not found" };
        }
      }

      if (fetchError || !data) {
        setError("No complaint found with this Tracking ID. Please check and try again.");
        setTrackedData(null);
      } else {
        setTrackedData({
          id: data.grievance_id,
          category: data.category,
          severity: data.severity,
          status: data.status,
          department: data.department,
          description: data.description,
          assigned_tier: data.assigned_tier,
          assigned_queue: data.assigned_queue,
          sla_hours: data.sla_hours,
          sla_deadline: data.sla_deadline,
          initial_handler: data.initial_handler,
          assigned_to: data.assigned_to,
          resolution_reason: data.resolution_reason,
          report_url: data.report_url,
          date: new Date(data.created_at).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
        });
      }
    } catch (err) {
      console.error("Track error:", err);
      setError("An error occurred while tracking. Please try again.");
      setTrackedData(null);
    } finally {
      setIsTracking(false);
    }
  };

  useEffect(() => {
    if (location.state?.trackingId) {
      const incomingId = location.state.trackingId;
      setTrackingId(incomingId);
      fetchComplaint(incomingId);
    }
  }, [location.state]);

  const handleDownloadReport = async () => {
    setDownloadingReport(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { API_BASE_URL } = await import('../services/supabaseClient');
      const res = await fetch(
        `${API_BASE_URL}/api/grievances/${trackedData.id}/report`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      );
      if (!res.ok) throw new Error("Could not download report");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `grievance_report_${trackedData.id.substring(0, 8).toUpperCase()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download report: " + err.message);
    } finally {
      setDownloadingReport(false);
    }
  };


  const handleSubmit = (e) => {
    e.preventDefault();
    fetchComplaint(trackingId);
  };

  const getStatusBadge = (status) => {
    const styles = {
      Open:          { bg: "#e8f4fd", color: "#0c7cd5", label: t("pending") },
      Investigating: { bg: "#fff8e1", color: "#f59e0b", label: t("inProgress") },
      Resolved:      { bg: "#e8f5e9", color: "#2e7d32", label: t("resolved") },
      Closed:        { bg: "#fce4ec", color: "#c62828", label: t("rejected") },
    };
    const s = styles[status] || { bg: "#f5f5f5", color: "#666", label: status };
    return (
      <span
        className="px-3 py-2 rounded-pill fw-semibold shadow-sm"
        style={{ backgroundColor: s.bg, color: s.color, fontSize: "13px" }}
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
        className="px-3 py-2 rounded-pill fw-semibold"
        style={{ backgroundColor: s.bg, color: s.color, fontSize: "12px" }}
      >
        {severity || "N/A"}
      </span>
    );
  };

  const getRoutingLevelInfo = (data) => {
    const tier = data.assigned_tier;
    const sev = (data.severity || "").toUpperCase();

    if (tier === "HEAD") {
      return {
        levelBadge: "Level 4 (HEAD)",
        title: "Executive Head / Committee Review",
        color: "#880e4f",
        bg: "#fce4ec",
        border: "#f8bbd0",
        description: "Assigned for direct executive oversight and critical grievance redressal.",
        slaLabel: "4 Hours Target SLA"
      };
    }
    if (tier === "L3") {
      return {
        levelBadge: "Level 3 (L3)",
        title: "Senior Department Lead Escalation",
        color: "#4a148c",
        bg: "#f3e5f5",
        border: "#e1bee7",
        description: "Escalated to specialized departmental lead authority for advanced review.",
        slaLabel: "12 Hours Target SLA"
      };
    }
    if (tier === "L2" || sev === "HIGH" || sev === "CRITICAL") {
      return {
        levelBadge: "Level 2 (L2)",
        title: "Immediate Department Escalation",
        color: "#b71c1c",
        bg: "#ffebee",
        border: "#ffcdd2",
        description: "Assigned to Level 2 authority for expedited investigation and 24h SLA compliance.",
        slaLabel: "24 Hours Target SLA"
      };
    }
    if (tier === "L1" || sev === "MEDIUM") {
      return {
        levelBadge: "Level 1 (L1)",
        title: "Department L1 Handling",
        color: "#0d47a1",
        bg: "#e3f2fd",
        border: "#bbdefb",
        description: "Assigned to departmental operations officer for review and resolution within 48h.",
        slaLabel: "48 Hours Target SLA"
      };
    }
    return {
      levelBadge: "Normal Level",
      title: "Standard Review Queue",
      color: "#1b5e20",
      bg: "#e8f5e9",
      border: "#c8e6c9",
      description: "Standard review and automated assistance workflow.",
      slaLabel: "Standard Target SLA"
    };
  };

  const getStatusTimeline = (status) => {
    const steps = ["Open", "Investigating", "Resolved", "Closed"];
    const currentIndex = steps.indexOf(status);

    return (
      <div className="d-flex align-items-center justify-content-between mt-3 px-2">
        {steps.map((step, i) => (
          <React.Fragment key={step}>
            <div className="text-center">
              <div
                className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-1"
                style={{
                  width: "32px",
                  height: "32px",
                  backgroundColor: i <= currentIndex ? "#001a4d" : "#e9ecef",
                  color: i <= currentIndex ? "#fff" : "#adb5bd",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}
              >
                {i <= currentIndex ? "✓" : i + 1}
              </div>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: i === currentIndex ? "700" : "500",
                  color: i <= currentIndex ? "#001a4d" : "#adb5bd",
                }}
              >
                {step === "Open" ? t("pending") :
                 step === "Investigating" ? t("inProgress") :
                 step === "Resolved" ? t("resolved") :
                 t("rejected")}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-grow-1 mx-1"
                style={{
                  height: "3px",
                  backgroundColor: i < currentIndex ? "#001a4d" : "#e9ecef",
                  marginBottom: "18px",
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const routingInfo = trackedData ? getRoutingLevelInfo(trackedData) : null;

  return (
    <div className="container py-5" style={{ minHeight: "80vh" }}>
      <div className="row justify-content-center">
        <div className="col-12 col-md-9 col-lg-8">
          
          <div className="text-center mb-5">
            <h2 className="fw-bold mb-2" style={{ color: "#001a4d" }}>{t("trackComplaint")}</h2>
            <p className="text-muted">{t("trackSubtitle")}</p>
          </div>

          {!trackedData && (
            <div className="card border-0 shadow-sm p-4 p-md-5 mb-4" style={{ borderRadius: "12px" }}>
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label htmlFor="trackingIdInput" className="form-label fw-bold" style={{ color: "#001a4d" }}>
                    {t("trackingId")}
                  </label>
                  <input
                    id="trackingIdInput"
                    type="text"
                    className={`form-control form-control-lg ${error ? "is-invalid" : ""}`}
                    placeholder={t("trackIdPlaceholder")}
                    value={trackingId}
                    onChange={(e) => { setTrackingId(e.target.value); setError(""); }}
                    style={{ borderRadius: "8px", border: "1px solid #ced4da" }}
                    autoFocus
                  />
                  {error && <div className="invalid-feedback d-block mt-2">{error}</div>}
                </div>
                <button
                  type="submit"
                  className="btn btn-lg w-100 fw-bold shadow-sm text-white"
                  style={{ backgroundColor: "#001a4d", borderColor: "#001a4d", borderRadius: "8px" }}
                  disabled={isTracking}
                >
                  {isTracking ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      {t("checkingStatus")}
                    </>
                  ) : (
                    t("trackStatus")
                  )}
                </button>
              </form>
            </div>
          )}

          {trackedData && (
            <div className="card border-0 shadow-sm p-4 p-md-5 mb-4" style={{ borderRadius: "12px" }}>
              <div className="text-center mb-4">
                <div
                  className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: "64px", height: "64px", backgroundColor: "#e8f4fd" }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#001a4d" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <h3 className="fw-bold mb-1" style={{ color: "#001a4d" }}>{t("complaintStatus")}</h3>
                <p className="text-muted mb-0">
                  {t("trackingDetailsFor")} <strong>#{trackedData.id.substring(0, 8)}</strong>
                </p>
              </div>

              {/* Status Timeline */}
              <div className="bg-light p-3 rounded-3 mb-4 border">
                {getStatusTimeline(trackedData.status)}
              </div>

              {/* Routing Level Notification Banner */}
              {routingInfo && (
                <div 
                  className="p-3 rounded-3 mb-4 border d-flex align-items-center justify-content-between flex-wrap gap-2"
                  style={{ 
                    backgroundColor: routingInfo.bg, 
                    borderColor: routingInfo.border 
                  }}
                >
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <span className="badge px-2 py-1 fw-bold" style={{ backgroundColor: routingInfo.color, color: "#fff", fontSize: "11px" }}>
                        {routingInfo.levelBadge}
                      </span>
                      <span className="fw-bold" style={{ color: routingInfo.color, fontSize: "14px" }}>
                        {routingInfo.title}
                      </span>
                    </div>
                    <div className="text-muted" style={{ fontSize: "12px" }}>
                      {routingInfo.description}
                    </div>
                  </div>
                  <div className="text-end">
                    <span className="text-muted d-block" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Resolution Commitment
                    </span>
                    <span className="fw-bold" style={{ color: routingInfo.color, fontSize: "13px" }}>
                      {trackedData.sla_hours ? `${trackedData.sla_hours} Hours SLA` : routingInfo.slaLabel}
                    </span>
                  </div>
                </div>
              )}

              {/* Details Grid */}
              <div className="bg-light p-4 rounded-3 mb-4 border shadow-sm">
                <div className="row g-3">
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      {t("trackingId").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">#{trackedData.id.substring(0, 8)}</span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      {t("status").toUpperCase()}
                    </span>
                    {getStatusBadge(trackedData.status)}
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      ROUTED LEVEL
                    </span>
                    <span 
                      className="badge px-2 py-1 fw-semibold"
                      style={{ 
                        backgroundColor: routingInfo?.bg || "#e3f2fd", 
                        color: routingInfo?.color || "#0d47a1", 
                        border: `1px solid ${routingInfo?.border || "#bbdefb"}`,
                        fontSize: "12px" 
                      }}
                    >
                      {routingInfo?.levelBadge || "Normal Level"}
                    </span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      {t("category").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">{trackedData.category}</span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      SEVERITY
                    </span>
                    {getSeverityBadge(trackedData.severity)}
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      {t("department").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">{trackedData.department || "—"}</span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      ASSIGNED QUEUE
                    </span>
                    <span className="fw-semibold text-dark">
                      {trackedData.assigned_queue || "Standard Queue"}
                    </span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      RESOLUTION SLA
                    </span>
                    <span className="fw-bold" style={{ color: routingInfo?.color || "#0d47a1" }}>
                      {trackedData.sla_hours ? `${trackedData.sla_hours} Hours` : "Standard SLA"}
                    </span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      {t("dateSubmitted").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">{trackedData.date}</span>
                  </div>
                  {trackedData.description && (
                    <div className="col-12 mt-2">
                      <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                        DESCRIPTION
                      </span>
                      <p className="text-dark mb-0" style={{ fontSize: "14px", lineHeight: "1.6" }}>
                        {trackedData.description}
                      </p>
                    </div>
                  )}
                  {/* Resolution Reason Box — shown when resolved or rejected */}
                  {(trackedData.status === "Resolved" || trackedData.status === "Rejected") && trackedData.resolution_reason && (
                    <div className="col-12 mt-2">
                      <span
                        className="text-muted d-block fw-semibold mb-1"
                        style={{ fontSize: "11px", letterSpacing: "1px" }}
                      >
                        {trackedData.status === "Resolved" ? "RESOLUTION SUMMARY" : "REASON FOR REJECTION"}
                      </span>
                      <div
                        className="p-3 rounded-3"
                        style={{
                          backgroundColor: trackedData.status === "Resolved" ? "#e8f5e9" : "#fce4ec",
                          borderLeft: `4px solid ${trackedData.status === "Resolved" ? "#2e7d32" : "#c62828"}`,
                          fontSize: "14px",
                          lineHeight: "1.6",
                          color: trackedData.status === "Resolved" ? "#1b5e20" : "#7f1d1d",
                        }}
                      >
                        {trackedData.resolution_reason}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="d-flex flex-column flex-sm-row justify-content-center gap-3">
                <button
                  onClick={() => { setTrackedData(null); setTrackingId(""); }}
                  className="btn btn-outline-secondary px-4 py-3 fw-bold flex-grow-1"
                  style={{ borderRadius: "8px" }}
                >
                  {t("trackAnother")}
                </button>

                {/* Download Report button — only for logged-in users on resolved/rejected tickets */}
                {user && (trackedData.status === "Resolved" || trackedData.status === "Rejected") && (
                  <button
                    onClick={handleDownloadReport}
                    disabled={downloadingReport}
                    className="btn px-4 py-3 fw-bold flex-grow-1 text-white shadow-sm d-flex align-items-center justify-content-center gap-2"
                    style={{
                      background: "linear-gradient(135deg, #001a4d 0%, #003366 100%)",
                      borderRadius: "8px",
                      border: "none",
                    }}
                  >
                    {downloadingReport ? (
                      <><span className="spinner-border spinner-border-sm" /> Generating...</>
                    ) : (
                      <>
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                          <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                          <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                        </svg>
                        Download Your Report
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => navigate("/lodge-selection")}
                  className="btn px-4 py-3 fw-bold flex-grow-1 text-white shadow-sm"
                  style={{ backgroundColor: "#001a4d", borderColor: "#001a4d", borderRadius: "8px" }}
                >
                  {t("raiseNewComplaint")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Track;