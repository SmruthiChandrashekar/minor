import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import "./LodgeSelection.css";

function LodgeSelection() {
  const { t } = useLanguage();

  return (
    <div className="container mt-5 mb-5 lodge-select-page">
      <div className="text-center mb-5">
        <h2 className="fw-bold text-heading fs-h2">{t("selectCategory")}</h2>
        <p className="text-muted fs-md lodge-select-lead">
          {t("selectCategoryDesc")}
        </p>
      </div>

      <div className="row g-4 justify-content-center">
        
        {/* INTERNAL EMPLOYEES */}
        <div className="col-md-4">
          <Link to="/lodge-internal" className="text-decoration-none">
            <div 
              className="card h-100 border-0 text-center p-5 cursor-pointer tile-card lodge-select-card is-internal"
            >
              <div className="mx-auto mb-4 d-flex align-items-center justify-content-center rounded-circle lodge-select-icon">
                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h5 className="fw-bold mb-3 fs-lg">{t("internalEmployees")}</h5>
              <p className="text-muted small mb-0">{t("internalCardDesc")}</p>
            </div>
          </Link>
        </div>

        {/* CONTRACT WORKFORCE */}
        <div className="col-md-4">
          <Link to="/lodge-contract" className="text-decoration-none">
            <div 
              className="card h-100 border-0 text-center p-5 cursor-pointer tile-card lodge-select-card is-contract"
            >
              <div className="mx-auto mb-4 d-flex align-items-center justify-content-center rounded-circle lodge-select-icon-ok">
                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                </svg>
              </div>
              <h5 className="fw-bold mb-3 fs-lg">{t("contractWorkforce")}</h5>
              <p className="text-muted small mb-0">{t("contractCardDesc")}</p>
            </div>
          </Link>
        </div>

        {/* EXTERNAL STAKEHOLDERS */}
        <div className="col-md-4">
          <Link to="/lodge-external" className="text-decoration-none">
            <div 
              className="card h-100 border-0 text-center p-5 cursor-pointer tile-card lodge-select-card is-external"
            >
              <div className="mx-auto mb-4 d-flex align-items-center justify-content-center rounded-circle text-accent lodge-select-icon-accent">
                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
              </div>
              <h5 className="fw-bold mb-3 fs-lg">{t("externalStakeholders")}</h5>
              <p className="text-muted small mb-0">{t("externalCardDesc")}</p>
            </div>
          </Link>
        </div>

      </div>
    </div>
  );
}

export default LodgeSelection;