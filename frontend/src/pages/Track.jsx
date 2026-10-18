import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { API_BASE_URL } from "../services/supabaseClient";
import { useAuth } from "../context/AuthProvider";
import { apiClient } from "../services/api";
import "./Track.css";

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
    const cleanedId = (rawId || "").trim().replace(/^GR-?/i, "");
    if (!cleanedId) {
      setError("Tracking ID is required");
      return;
    }

    setIsTracking(true);
    setError("");
    setTrackedData(null);

    try {
      // Lookup goes through the backend so the browser never reads the grievances table directly.
      let data = null;
      let fetchError = null;
      try {
        const res = await fetch(`${API_BASE_URL}/api/track/${encodeURIComponent(cleanedId)}`);
        if (res.ok) data = await res.json();
        else fetchError = { message: "Not found" };
      } catch (e) {
        fetchError = e;
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
          documents: data.documents || [],
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
    const searchParams = new URLSearchParams(location.search);
    const queryId = searchParams.get("id") || searchParams.get("trackingId");
    const incomingId = location.state?.trackingId || queryId;
    if (incomingId) {
      setTrackingId(incomingId);
      fetchComplaint(incomingId);
    }
  }, [location.state, location.search]);

  const handleDownloadReport = async () => {
    setDownloadingReport(true);
    try {
      const res = await apiClient(`/api/grievances/${trackedData.id}/report`);
      if (!res.ok) {
        let errMsg = "Could not download report";
        try {
          const errData = await res.json();
          if (errData.detail) errMsg = errData.detail;
        } catch (_) {}
        throw new Error(errMsg);
      }
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
        className="px-3 py-2 rounded-pill fw-semibold shadow-sm fs-13"
        style={{ backgroundColor: s.bg, color: s.color }}
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
        className="px-3 py-2 rounded-pill fw-semibold fs-12"
        style={{ backgroundColor: s.bg, color: s.color }}
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
                className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-1 fs-12 fw-bold track-step-dot${i <= currentIndex ? " is-done" : ""}`}
              >
                {i <= currentIndex ? "✓" : i + 1}
              </div>
              <span className={`fs-10 track-step-label${i <= currentIndex ? " is-done" : ""}${i === currentIndex ? " is-current" : ""}`}>
                {step === "Open" ? t("pending") :
                 step === "Investigating" ? t("inProgress") :
                 step === "Resolved" ? t("resolved") :
                 t("rejected")}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-grow-1 mx-1 track-step-line${i < currentIndex ? " is-done" : ""}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const routingInfo = trackedData ? getRoutingLevelInfo(trackedData) : null;

  return (
    <div className="container py-5 track-page">
      <div className="row justify-content-center">
        <div className="col-12 col-md-9 col-lg-8">
          
          <div className="text-center mb-5">
            <h2 className="fw-bold mb-2 text-navy">{t("trackComplaint")}</h2>
            <p className="text-muted">{t("trackSubtitle")}</p>
          </div>

          {!trackedData && (
            <div className="card border-0 shadow-sm p-4 p-md-5 mb-4 track-card">
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label htmlFor="trackingIdInput" className="form-label fw-bold text-navy">
                    {t("trackingId")}
                  </label>
                  <input
                    id="trackingIdInput"
                    type="text"
                    className={`form-control form-control-lg ${error ? "is-invalid" : ""} rounded-3 track-id-input`}
                    placeholder={t("trackIdPlaceholder")}
                    value={trackingId}
                    onChange={(e) => { setTrackingId(e.target.value); setError(""); }}
                    autoFocus
                  />
                  {error && <div className="invalid-feedback d-block mt-2">{error}</div>}
                </div>
                <button
                  type="submit"
                  className="btn btn-lg w-100 fw-bold shadow-sm text-white bg-navy rounded-3 track-btn"
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
            <div className="card border-0 shadow-sm p-4 p-md-5 mb-4 track-card">
              <div className="text-center mb-4">
                <div
                  className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3 track-result-icon"
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <h3 className="fw-bold mb-1">{t("complaintStatus")}</h3>
                <p className="text-muted mb-0">
                  {t("trackingDetailsFor")} <strong>#{trackedData.id.substring(0, 5)}</strong>
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
                      <span className="badge px-2 py-1 fw-bold text-white fs-11" style={{ backgroundColor: routingInfo.color }}>
                        {routingInfo.levelBadge}
                      </span>
                      <span className="fw-bold fs-14" style={{ color: routingInfo.color }}>
                        {routingInfo.title}
                      </span>
                    </div>
                    <div className="text-muted fs-12">
                      {routingInfo.description}
                    </div>
                  </div>
                  <div className="text-end">
                    <span className="text-muted d-block fs-11 text-uppercase ls-half">
                      Resolution Commitment
                    </span>
                    <span className="fw-bold fs-13" style={{ color: routingInfo.color }}>
                      {trackedData.sla_hours ? `${trackedData.sla_hours} Hours SLA` : routingInfo.slaLabel}
                    </span>
                  </div>
                </div>
              )}

              {/* Details Grid */}
              <div className="bg-light p-4 rounded-3 mb-4 border shadow-sm">
                <div className="row g-3">
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                      {t("trackingId").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">#{trackedData.id.substring(0, 5)}</span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                      {t("status").toUpperCase()}
                    </span>
                    {getStatusBadge(trackedData.status)}
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                      ROUTED LEVEL
                    </span>
                    <span 
                      className="badge px-2 py-1 fw-semibold fs-12"
                      style={{
                        backgroundColor: routingInfo?.bg || "#e3f2fd",
                        color: routingInfo?.color || "#0d47a1",
                        border: `1px solid ${routingInfo?.border || "#bbdefb"}`
                      }}
                    >
                      {routingInfo?.levelBadge || "Normal Level"}
                    </span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                      {t("category").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">{trackedData.category}</span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                      SEVERITY
                    </span>
                    {getSeverityBadge(trackedData.severity)}
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                      {t("department").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">{trackedData.department || "—"}</span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                      ASSIGNED QUEUE
                    </span>
                    <span className="fw-semibold text-dark">
                      {trackedData.assigned_queue || "Standard Queue"}
                    </span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                      RESOLUTION SLA
                    </span>
                    <span className="fw-bold" style={{ color: routingInfo?.color || "#0d47a1" }}>
                      {trackedData.sla_hours ? `${trackedData.sla_hours} Hours` : "Standard SLA"}
                    </span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                      {t("dateSubmitted").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">{trackedData.date}</span>
                  </div>
                  {trackedData.description && (
                    <div className="col-12 mt-2">
                      <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                        DESCRIPTION
                      </span>
                      <p className="text-dark mb-0 fs-14 track-text">
                        {trackedData.description}
                      </p>
                    </div>
                  )}
                  {/* Status remarks / resolution reason */}
                  {trackedData.resolution_reason && (
                    <div className="col-12 mt-2">
                      <span
                        className="text-muted d-block fw-semibold mb-1 fs-11 ls-1"
                      >
                        {trackedData.status === "Resolved"
                          ? "RESOLUTION SUMMARY"
                          : trackedData.status === "Rejected"
                          ? "REASON FOR REJECTION"
                          : "LATEST STATUS REMARKS / REASON"}
                      </span>
                      <div
                        className={`p-3 rounded-3 fs-14 track-text track-remarks is-${(trackedData.status || "").toLowerCase()}`}
                      >
                        {trackedData.resolution_reason}
                      </div>
                    </div>
                  )}
                  {trackedData.documents?.length > 0 && (
                    <div className="col-12 mt-2">
                      <span className="text-muted d-block fw-semibold mb-1 fs-11 ls-1">
                        DOCUMENTS FROM THE TEAM
                      </span>
                      <ul className="list-unstyled mb-0 fs-14">
                        {trackedData.documents.map((f) => (
                          <li key={f.url}>
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-decoration-none">
                              <i className="bi bi-paperclip me-1" />{f.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div className="d-flex flex-column flex-sm-row justify-content-center gap-3">
                <button
                  onClick={() => { setTrackedData(null); setTrackingId(""); }}
                  className="btn btn-outline-secondary px-4 py-3 fw-bold flex-grow-1 rounded-3"
                >
                  {t("trackAnother")}
                </button>

                {/* Download Report button — only for logged-in users on resolved/rejected tickets */}
                {user && (trackedData.status === "Resolved" || trackedData.status === "Rejected") && (
                  <button
                    onClick={handleDownloadReport}
                    disabled={downloadingReport}
                    className="btn px-4 py-3 fw-bold flex-grow-1 text-white shadow-sm d-flex align-items-center justify-content-center gap-2 bg-navy rounded-3 border-0"
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
                  className="btn px-4 py-3 fw-bold flex-grow-1 text-white shadow-sm bg-navy rounded-3 track-btn"
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