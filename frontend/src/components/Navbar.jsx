import { Link, useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import ThemeToggle from "./ThemeToggle";
import NotificationDropdown from "./NotificationDropdown";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const { user, userDetails, isAdmin, isSuperAdmin, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleAdminLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  return (
    <nav className="navbar navbar-expand-lg shadow-sm" style={{ backgroundColor: "var(--navbar-bg)" }}>
      <div className="container">

        {/* LOGO */}
        <Link className="navbar-brand d-flex align-items-center text-decoration-none" to="/">
          <img src="/purvankaraimg.png" alt="Puravankara" style={{ height: "55px", objectFit: "contain", marginRight: "6px" }} />
          <span style={{ color: "#c4122f", fontWeight: "800", fontSize: "1.6rem", letterSpacing: "1px", fontFamily: "Arial Black, sans-serif" }}>GRM</span>
        </Link>

        {/* NAV LINKS */}
        <div className="ms-auto d-flex align-items-center">

          <Link 
            to="/assistant" 
            className="me-4 text-decoration-none d-flex align-items-center gap-1"
            style={{ 
              color: location.pathname === '/assistant' ? '#0d6efd' : 'var(--text-color)',
              fontWeight: location.pathname === '/assistant' ? '700' : '600',
              opacity: location.pathname === '/assistant' ? 1 : 0.85,
              transition: 'all 0.2s',
              fontSize: '14.5px'
            }}
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style={{ marginRight: '2px' }}>
              <path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5ZM3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.58 26.58 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.933.933 0 0 1-.765.935c-.845.147-2.34.346-4.235.346-1.895 0-3.39-.2-4.235-.346A.933.933 0 0 1 3 9.219V8.062Zm4.542-.827a.25.25 0 0 0-.217.068l-.92.9a24.767 24.767 0 0 1-1.871-.183.25.25 0 0 0-.068.495c.55.076 1.232.149 2.02.193a.25.25 0 0 0 .189-.071l.754-.736.847 1.71a.25.25 0 0 0 .404.062l.932-.97a25.286 25.286 0 0 0 1.922-.188.25.25 0 0 0-.068-.495c-.538.074-1.207.145-1.98.189a.25.25 0 0 0-.166.076l-.754.785-.842-1.7a.25.25 0 0 0-.182-.135Z"/>
              <path d="M8.5 1.866a1 1 0 1 0-1 0V3h-2A4.5 4.5 0 0 0 1 7.5V8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1v-.5A4.5 4.5 0 0 0 10.5 3h-2V1.866ZM14 7.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5A3.5 3.5 0 0 1 5.5 4h5A3.5 3.5 0 0 1 14 7.5Z"/>
            </svg>
            {t('policyAssistant') || "AI Assistant"}
            <span style={{ 
              display: 'inline-block',
              width: '6px', height: '6px', 
              borderRadius: '50%', 
              background: '#22c55e',
              marginLeft: '2px',
              animation: 'pa-pulse-dot 2s ease-in-out infinite'
            }}></span>
          </Link>

          <Link to="/" className="me-4 text-decoration-none nav-link-custom">
            {user ? t("dashboard") : t("home")}
          </Link>

          <Link to="/track" className="me-4 text-decoration-none nav-link-custom">
            {t("track")}
          </Link>

          <Link to="/help" className="me-4 text-decoration-none nav-link-custom">
            {t("help")}
          </Link>

          {isSuperAdmin && (
            <Link to="/admin/portal" className="me-4 text-decoration-none nav-link-custom" style={{ color: "#d32f2f", fontWeight: "bold" }}>
              <i className="bi bi-shield-lock me-1"></i>Staff & Security
            </Link>
          )}

          {/* THEME TOGGLE */}
          <div className="me-3">
            <ThemeToggle />
          </div>

          {/* NOTIFICATION BELL */}
          {user && (
            <div className="me-3">
              <NotificationDropdown />
            </div>
          )}

          {/* LANGUAGE DROPDOWN */}
          <select
            className="form-select form-select-sm me-4 shadow-none"
            style={{ width: "auto", cursor: "pointer" }}
            aria-label="Language Selection"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="English">English</option>
            <option value="Hindi">Hindi</option>
            <option value="Kannada">Kannada</option>
          </select>

          {/* AUTH BUTTON — Admin or User */}
          {isAdmin ? (
            // Admin is logged in
            <div className="d-flex align-items-center">
              <div className="me-3 d-flex align-items-center">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center text-white me-2 shadow-sm"
                  style={{ width: "32px", height: "32px", backgroundColor: "#001a4d", fontWeight: "bold" }}
                >
                  {userDetails?.name ? userDetails.name.charAt(0).toUpperCase() : "A"}
                </div>
                <span style={{ fontSize: "14px", color: "#6c757d" }}>
                  <span style={{ color: "#001a4d", fontWeight: "bold" }}>{userDetails?.name}</span>
                </span>
              </div>
              <button onClick={handleAdminLogout} className="btn btn-outline-danger px-3 fw-semibold" style={{ fontSize: "14px" }}>
                {t("logout")}
              </button>
            </div>
          ) : user ? (
            // Regular user logged in
            <div className="d-flex align-items-center">
              <div className="me-3 d-flex align-items-center">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center text-white me-2 shadow-sm"
                  style={{ width: "32px", height: "32px", backgroundColor: "#ff5722", fontWeight: "bold" }}
                >
                  {userDetails?.name ? userDetails.name.charAt(0).toUpperCase() : "U"}
                </div>
                <span style={{ fontSize: "15px", color: "#6c757d" }}>
                  <i style={{ opacity: 0.8 }}>{t("hi")}</i> <span style={{ color: "#00838f", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>{userDetails?.name || "User"}</span>
                </span>
              </div>
              <button onClick={handleLogout} className="btn btn-danger">
                {t("logout")}
              </button>
            </div>
          ) : (
            // No one logged in
            <Link to="/login" className="btn btn-danger px-4">
              {t("login")}
            </Link>
          )}

        </div>

      </div>
    </nav>
  );
}

export default Navbar;