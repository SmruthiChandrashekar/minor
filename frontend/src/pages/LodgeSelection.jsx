import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

function LodgeSelection() {
  const { t } = useLanguage();

  return (
    <div className="container mt-5 mb-5">
      <div className="text-center mb-5">
        <h2 className="fw-bold" style={{ color: "#001a4d" }}>{t("selectCategory")}</h2>
        <p className="text-muted">
          {t("selectCategoryDesc")}
        </p>
      </div>

      <div className="row g-4 justify-content-center">
        
        {/* INTERNAL EMPLOYEES */}
        <div className="col-md-4">
          <Link to="/lodge-internal" className="text-decoration-none">
            <div 
              className="card h-100 border-0 shadow-sm text-center p-5"
              style={{ borderRadius: "16px", transition: "all 0.3s ease", cursor: "pointer", borderTop: "4px solid #1e88e5" }}
              onMouseOver={(e) => { e.currentTarget.classList.replace('shadow-sm', 'shadow'); e.currentTarget.style.transform = 'translateY(-5px)'; }}
              onMouseOut={(e) => { e.currentTarget.classList.replace('shadow', 'shadow-sm'); e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div className="mx-auto mb-4 d-flex align-items-center justify-content-center rounded-circle" style={{ width: "70px", height: "70px", backgroundColor: "#e3f2fd", color: "#1e88e5" }}>
                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h5 className="fw-bold mb-3" style={{ color: "#001a4d" }}>{t("internalEmployees")}</h5>
              <p className="text-muted small mb-0">{t("internalCardDesc")}</p>
            </div>
          </Link>
        </div>

        {/* CONTRACT WORKFORCE */}
        <div className="col-md-4">
          <Link to="/lodge-contract" className="text-decoration-none">
            <div 
              className="card h-100 border-0 shadow-sm text-center p-5"
              style={{ borderRadius: "16px", transition: "all 0.3s ease", cursor: "pointer", borderTop: "4px solid #4caf50" }}
              onMouseOver={(e) => { e.currentTarget.classList.replace('shadow-sm', 'shadow'); e.currentTarget.style.transform = 'translateY(-5px)'; }}
              onMouseOut={(e) => { e.currentTarget.classList.replace('shadow', 'shadow-sm'); e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div className="mx-auto mb-4 d-flex align-items-center justify-content-center rounded-circle" style={{ width: "70px", height: "70px", backgroundColor: "#e8f5e9", color: "#4caf50" }}>
                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                </svg>
              </div>
              <h5 className="fw-bold mb-3" style={{ color: "#001a4d" }}>{t("contractWorkforce")}</h5>
              <p className="text-muted small mb-0">{t("contractCardDesc")}</p>
            </div>
          </Link>
        </div>

        {/* EXTERNAL STAKEHOLDERS */}
        <div className="col-md-4">
          <Link to="/lodge-external" className="text-decoration-none">
            <div 
              className="card h-100 border-0 shadow-sm text-center p-5"
              style={{ borderRadius: "16px", transition: "all 0.3s ease", cursor: "pointer", borderTop: "4px solid #c4122f" }}
              onMouseOver={(e) => { e.currentTarget.classList.replace('shadow-sm', 'shadow'); e.currentTarget.style.transform = 'translateY(-5px)'; }}
              onMouseOut={(e) => { e.currentTarget.classList.replace('shadow', 'shadow-sm'); e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div className="mx-auto mb-4 d-flex align-items-center justify-content-center rounded-circle" style={{ width: "70px", height: "70px", backgroundColor: "#f8d7da", color: "#c4122f" }}>
                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
              </div>
              <h5 className="fw-bold mb-3" style={{ color: "#001a4d" }}>{t("externalStakeholders")}</h5>
              <p className="text-muted small mb-0">{t("externalCardDesc")}</p>
            </div>
          </Link>
        </div>

      </div>
    </div>
  );
}

export default LodgeSelection;