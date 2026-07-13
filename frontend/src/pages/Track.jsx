import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../context/AuthProvider";

function Track() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [trackingId, setTrackingId] = useState("");
  const [error, setError] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [trackedData, setTrackedData] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const cleanedId = trackingId.trim();

    if (!cleanedId) {
      setError("Tracking ID is required");
      return;
    }

    setIsTracking(true);
    setError("");
    setTrackedData(null);

    console.log("🔍 Tracking ID:", cleanedId);

    try {
      let data = null;
      let fetchError = null;

      // Check if input looks like a full UUID
      const isFullUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanedId);

      if (isFullUUID) {
        // Exact match for full UUID
        const result = await supabase
          .from("grievances")
          .select("*")
          .eq("grievance_id", cleanedId)
          .single();

        data = result.data;
        fetchError = result.error;
      } else {
        // Partial match — fetch recent complaints and match by prefix
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

      console.log("📦 Result:", data);

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

  // --- STATUS TIMELINE ---
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

  return (
    <div className="container mt-5 mb-5">
      <div className="row justify-content-center">
        <div className="col-md-8 col-lg-7">
          {!trackedData ? (
            <div className="card shadow-lg p-5 border-0" style={{ borderRadius: "16px" }}>
              <div className="text-center mb-4">
                <div
                  className="mx-auto mb-3 d-flex justify-content-center align-items-center rounded-circle shadow-sm"
                  style={{ width: "70px", height: "70px", backgroundColor: "#e0f7fa", color: "#00acc1" }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
                  </svg>
                </div>
                <h3 className="fw-bold" style={{ color: "#001a4d" }}>{t("trackYourGrievance")}</h3>
                <p className="text-muted">{t("trackSubtitle")}</p>
              </div>

              {error && (
                <div className="alert alert-danger shadow-sm border-0 text-center fw-semibold" style={{ fontSize: "14px" }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="fw-semibold mb-2 text-dark">
                    {t("complaintId")}
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-lg bg-light border-0 shadow-sm"
                    placeholder={t("trackIdPlaceholder")}
                    value={trackingId}
                    onChange={(e) => { setTrackingId(e.target.value); setError(""); }}
                  />
                  <small className="text-muted mt-1 d-block">
                    {t("trackIdHint")}
                  </small>
                </div>

                <button
                  type="submit"
                  disabled={isTracking}
                  className="btn w-100 py-3 fw-bold shadow-sm text-white d-flex justify-content-center align-items-center gap-2"
                  style={{ backgroundColor: "#001a4d", fontSize: "1.1rem", borderRadius: "8px" }}
                >
                  {isTracking ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      {t("searching")}
                    </>
                  ) : (
                    t("trackStatus")
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div className="card shadow-lg p-5 border-0" style={{ borderRadius: "16px" }}>
              <div className="text-center mb-4">
                <div
                  className="mx-auto mb-3 d-flex justify-content-center align-items-center rounded-circle"
                  style={{
                    width: "60px",
                    height: "60px",
                    backgroundColor: trackedData.status === "Resolved" ? "#e8f5e9" : "#e8f4fd",
                    color: trackedData.status === "Resolved" ? "#2e7d32" : "#0c7cd5",
                  }}
                >
                  {trackedData.status === "Resolved" ? "✓" : "📋"}
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

              {/* Details Grid */}
              <div className="bg-light p-4 rounded-3 mb-4 border shadow-sm">
                <div className="row g-3">
                  <div className="col-6">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      {t("trackingId").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">#{trackedData.id.substring(0, 8)}</span>
                  </div>
                  <div className="col-6">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      {t("status").toUpperCase()}
                    </span>
                    {getStatusBadge(trackedData.status)}
                  </div>
                  <div className="col-6">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      {t("category").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">{trackedData.category}</span>
                  </div>
                  <div className="col-6">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      Severity
                    </span>
                    {getSeverityBadge(trackedData.severity)}
                  </div>
                  <div className="col-6">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      {t("department").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">{trackedData.department || "—"}</span>
                  </div>
                  <div className="col-6">
                    <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      {t("dateSubmitted").toUpperCase()}
                    </span>
                    <span className="fw-bold text-dark">{trackedData.date}</span>
                  </div>
                  {trackedData.description && (
                    <div className="col-12 mt-2">
                      <span className="text-muted d-block fw-semibold mb-1" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                        Description
                      </span>
                      <p className="text-dark mb-0" style={{ fontSize: "14px", lineHeight: "1.6" }}>
                        {trackedData.description}
                      </p>
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