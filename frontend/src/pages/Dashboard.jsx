import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import { supabase } from "../services/supabaseClient";
import { translateList } from "../services/translationService";

function Dashboard() {
  const navigate = useNavigate();
  const { user, userDetails, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const [grievances, setGrievances] = useState([]);
  const [translatedGrievances, setTranslatedGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [translating, setTranslating] = useState(false);

  const getLodgeRoute = () => {
    if (!userDetails || !userDetails.user_type) return "/lodge-selection";
    switch (userDetails.user_type) {
      case "Internal": return "/lodge-internal";
      case "Contract": return "/lodge-contract";
      case "External": return "/lodge-external";
      default: return "/lodge-selection";
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        fetchGrievances(user.id);
      } else {
        navigate("/login");
      }
    }
  }, [user, authLoading, navigate]);

  const fetchGrievances = async (userId) => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("grievances")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setGrievances(data || []);
    } catch (err) {
      console.error("Error fetching grievances:", err);
      setError(err.message || "Failed to load grievances.");
    } finally {
      setLoading(false);
    }
  };

  // Re-translate description whenever grievances list or language changes
  useEffect(() => {
    if (grievances.length === 0) {
      setTranslatedGrievances([]);
      return;
    }
    let cancelled = false;
    setTranslating(true);
    // Only translate the 'description' field; category/status stay fixed
    translateList(grievances, ["description"], language).then((result) => {
      if (!cancelled) {
        setTranslatedGrievances(result);
        setTranslating(false);
      }
    });
    return () => { cancelled = true; };
  }, [grievances, language]);

  if (!user) return null;

  // Compute stats
  const totalGrievances = grievances.length;
  const inProgress = grievances.filter(g => g.status === "Investigating").length;
  const resolved = grievances.filter(g => g.status === "Resolved").length;
  const rejected = grievances.filter(g => g.status === "Closed" || g.status === "Rejected").length;

  // Helper for status badge class
  const getBadgeClass = (status) => {
    switch(status) {
      case "Open": return "bg-primary text-white";
      case "Investigating": return "bg-warning text-dark";
      case "Resolved": return "bg-success text-white";
      case "Closed":
      case "Rejected": return "bg-danger text-white";
      default: return "bg-secondary text-dark";
    }
  };

  // Translate status value → i18n label (status itself is stored in English in DB)
  const getStatusLabel = (status) => {
    switch(status) {
      case "Open":          return t("pending");
      case "Investigating": return t("inProgress");
      case "Resolved":      return t("resolved");
      case "Closed":
      case "Rejected":      return t("rejected");
      default:              return status;
    }
  };

  return (
    <div className="container mt-4 mb-5">
      
      {/* HEADER SECTION */}
      <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom">
        <div>
          <h2 className="fw-bold mb-1" style={{ color: "var(--text-color)" }}>{t("dashboardTitle")}</h2>
          <p className="text-muted mb-0">
            {t("welcomeBack")} <span className="fw-bold text-dark">{userDetails?.name || "User"}</span>. {t("dashboardOverview")}
          </p>
        </div>
        <div>
          <button 
            className="btn btn-danger px-4 shadow-sm" 
            onClick={() => {
              window.dispatchEvent(new CustomEvent('chatbot-hint', { detail: 'Not sure about policy? Ask the assistant first. 👇' }));
              navigate(getLodgeRoute());
            }}
          >
            <span className="fw-bold me-2">+</span> {t("newComplaint")}
          </button>
        </div>
      </div>

      {/* STATS OVERVIEW */}
      <div className="row g-4 mb-5">
        <div className="col-md-3">
          <div className="card bg-light border-0 shadow-sm p-4 h-100" style={{ borderLeft: "4px solid #6c757d" }}>
            <p className="text-muted mb-1 fw-bold text-uppercase" style={{ fontSize: "12px", letterSpacing: "1px" }}>{t("totalGrievances")}</p>
            <h3 className="fw-bold mb-0">{totalGrievances}</h3>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-light border-0 shadow-sm p-4 h-100" style={{ borderLeft: "4px solid #ffc107" }}>
            <p className="text-muted mb-1 fw-bold text-uppercase" style={{ fontSize: "12px", letterSpacing: "1px" }}>{t("inProgress")}</p>
            <h3 className="fw-bold mb-0 text-warning">{inProgress}</h3>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-light border-0 shadow-sm p-4 h-100" style={{ borderLeft: "4px solid #198754" }}>
            <p className="text-muted mb-1 fw-bold text-uppercase" style={{ fontSize: "12px", letterSpacing: "1px" }}>{t("resolved")}</p>
            <h3 className="fw-bold mb-0 text-success">{resolved}</h3>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-light border-0 shadow-sm p-4 h-100" style={{ borderLeft: "4px solid #dc3545" }}>
            <p className="text-muted mb-1 fw-bold text-uppercase" style={{ fontSize: "12px", letterSpacing: "1px" }}>{t("rejected")}</p>
            <h3 className="fw-bold mb-0 text-danger">{rejected}</h3>
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS & RECENT TABLE GRID */}
      <div className="row g-4">
        
        {/* RECENT TABLE */}
        <div className="col-lg-8">
          <div className="card shadow-sm border-0 p-4 h-100">
            <h5 className="fw-bold mb-4" style={{ color: "var(--text-color)" }}>{t("recentActivity")}</h5>
            
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : error ? (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            ) : grievances.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <p className="mb-0">No grievances found. Create your first complaint.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle">
                  <thead className="table-light">
                    <tr>
                      <th scope="col" className="text-muted small">{t("trackingId")}</th>
                      <th scope="col" className="text-muted small">{t("category")}</th>
                      <th scope="col" className="text-muted small">Description</th>
                      <th scope="col" className="text-muted small">{t("dateSubmitted")}</th>
                      <th scope="col" className="text-muted small">{t("status")}</th>
                      <th scope="col" className="text-muted small">{t("action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(translating ? grievances : translatedGrievances).map((g) => (
                      <tr key={g.grievance_id}>
                        <td className="fw-bold" style={{ color: "var(--text-color)" }}>#{g.grievance_id.substring(0, 8)}</td>
                        <td style={{ color: "var(--text-color)" }}>{g.category}</td>
                        <td className="text-muted" style={{ maxWidth: "220px" }}>
                          {translating ? (
                            <span className="spinner-border spinner-border-sm text-secondary" role="status" />
                          ) : (
                            <span title={g.description}>
                              {g.description ? g.description.substring(0, 60) + (g.description.length > 60 ? "…" : "") : "—"}
                            </span>
                          )}
                        </td>
                        <td className="text-muted">
                          {new Date(g.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          <span className={`badge px-3 py-2 rounded-pill shadow-sm ${getBadgeClass(g.status)}`}>
                            {getStatusLabel(g.status)}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-sm btn-outline-secondary px-3" onClick={() => navigate("/track")}>
                            {t("view")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && !error && grievances.length > 0 && (
              <div className="text-center mt-3">
                <button 
                  className="btn btn-link text-decoration-none text-muted"
                  onClick={() => navigate("/track")}
                >
                  {t("viewAllHistory")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* QUICK LINKS */}
        <div className="col-lg-4">
          <div className="card shadow-sm border-0 p-4 h-100">
            <h5 className="fw-bold mb-4" style={{ color: "var(--text-color)" }}>{t("quickActions")}</h5>

            {/* ACTION 1 */}
            <div 
              className="d-flex align-items-center mb-3 p-3 rounded shadow-sm bg-light dashboard-action-card"
              style={{ cursor: "pointer", transition: "all 0.2s" }}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('chatbot-hint', { detail: 'Not sure about policy? Ask the assistant first. 👇' }));
                navigate(getLodgeRoute());
              }}
            >
              <div className="bg-danger text-white rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: "45px", height: "45px" }}>
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div>
                <h6 className="fw-bold mb-0 text-dark">{t("lodgeComplaint")}</h6>
                <small className="text-muted">{t("submitNewGrievance")}</small>
              </div>
            </div>

            {/* ACTION 2 */}
            <div 
              className="d-flex align-items-center mb-3 p-3 rounded shadow-sm bg-light dashboard-action-card"
              style={{ cursor: "pointer", transition: "all 0.2s" }}
              onClick={() => navigate("/track")}
            >
              <div className="text-white rounded-circle d-flex justify-content-center align-items-center me-3" style={{ backgroundColor: "#17a2b8", width: "45px", height: "45px" }}>
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <div>
                <h6 className="fw-bold mb-0 text-dark">{t("trackStatus")}</h6>
                <small className="text-muted">{t("checkProgress")}</small>
              </div>
            </div>

            {/* ACTION 3 */}
            <div 
              className="d-flex align-items-center p-3 rounded shadow-sm bg-light dashboard-action-card"
              style={{ cursor: "pointer", transition: "all 0.2s" }}
              onClick={() => navigate("/help")}
            >
              <div className="bg-secondary text-white rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: "45px", height: "45px" }}>
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h6 className="fw-bold mb-0 text-dark">{t("helpCenter")}</h6>
                <small className="text-muted">{t("getSupportGuidance")}</small>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}

export default Dashboard;