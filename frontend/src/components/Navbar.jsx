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
          <img src="/purvankaraimg.png" alt="Puravankara" className="navbar-brand-logo" style={{ height: "55px", objectFit: "contain", marginRight: "6px" }} />
          <span style={{ color: "var(--accent)", fontWeight: "800", fontSize: "1.6rem", letterSpacing: "1px", fontFamily: "Arial Black, sans-serif" }}>GRM</span>
        </Link>

        {/* NAV LINKS */}
        <div className="ms-auto d-flex align-items-center">

          <Link 
            to="/assistant" 
            className="me-4 text-decoration-none d-flex align-items-center gap-2"
            style={{ 
              color: location.pathname === '/assistant' ? 'var(--brand-navy)' : 'var(--text-color)',
              fontWeight: location.pathname === '/assistant' ? '700' : '600',
              opacity: location.pathname === '/assistant' ? 1 : 0.85,
              transition: 'all 0.2s',
              fontSize: '14.5px'
            }}
          >
            {/* Purva mini avatar */}
            <span className="purva-nav-avatar" style={{
              display: 'inline-flex',
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              border: location.pathname === '/assistant' ? '1.5px solid #a78bfa' : '1.5px solid rgba(167, 139, 250, 0.4)',
              boxShadow: location.pathname === '/assistant' ? '0 0 8px rgba(167, 139, 250, 0.5)' : 'none',
              transition: 'all 0.2s',
            }}>
              <img src="/purva-logo.svg" alt="Purva" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </span>
            <span>Purva</span>
            <span style={{ 
              display: 'inline-block',
              width: '6px', height: '6px', 
              borderRadius: '50%', 
              background: '#22c55e',
              animation: 'pa-pulse-dot 2s ease-in-out infinite'
            }}></span>
          </Link>

          <Link to="/" className="me-4 text-decoration-none nav-link-custom">
            {user ? t("dashboard") : t("home")}
          </Link>

          <Link to="/track" className="me-4 text-decoration-none nav-link-custom">
            {t("trackStatus")}
          </Link>

          <Link to="/help" className="me-4 text-decoration-none nav-link-custom">
            {t("help")}
          </Link>

          {user && (
            <Link 
              to="/profile" 
              className="me-4 text-decoration-none nav-link-custom"
              style={{ fontWeight: location.pathname === '/profile' ? '700' : 'normal' }}
            >
              Profile
            </Link>
          )}

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
              <Link 
                to="/profile" 
                className="me-3 d-flex align-items-center text-decoration-none p-1 rounded-pill"
                style={{ transition: "all 0.2s" }}
                title="View Admin Profile"
              >
                {userDetails?.avatar_url ? (
                  <img
                    src={userDetails.avatar_url}
                    alt={userDetails.name || "Admin"}
                    className="rounded-circle me-2 shadow-sm"
                    style={{ width: "34px", height: "34px", objectFit: "cover", border: "2px solid var(--brand-navy)" }}
                  />
                ) : (
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center text-white me-2 shadow-sm"
                    style={{ width: "34px", height: "34px", backgroundColor: "var(--brand-navy)", fontWeight: "bold" }}
                  >
                    {userDetails?.name ? userDetails.name.charAt(0).toUpperCase() : "A"}
                  </div>
                )}
                <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                  <span style={{ color: "var(--heading-color)", fontWeight: "bold" }}>{userDetails?.name || "Admin"}</span>
                </span>
              </Link>
              <button onClick={handleAdminLogout} className="btn btn-outline-danger px-3 fw-semibold" style={{ fontSize: "14px" }}>
                {t("logout")}
              </button>
            </div>
          ) : user ? (
            // Regular user logged in
            <div className="d-flex align-items-center">
              <Link 
                to="/profile" 
                className="me-3 d-flex align-items-center text-decoration-none p-1 rounded-pill"
                style={{ transition: "all 0.2s" }}
                title="View My Profile"
              >
                {userDetails?.avatar_url ? (
                  <img
                    src={userDetails.avatar_url}
                    alt={userDetails.name || "User"}
                    className="rounded-circle me-2 shadow-sm"
                    style={{ width: "34px", height: "34px", objectFit: "cover", border: "2px solid #00838f" }}
                  />
                ) : (
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center text-white me-2 shadow-sm"
                    style={{ width: "34px", height: "34px", backgroundColor: "#ff5722", fontWeight: "bold" }}
                  >
                    {userDetails?.name ? userDetails.name.charAt(0).toUpperCase() : "U"}
                  </div>
                )}
                <span style={{ fontSize: "15px", color: "var(--text-muted)" }}>
                  <i style={{ opacity: 0.8 }}>{t("hi")}</i> <span style={{ color: "var(--heading-color)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>{userDetails?.name || "User"}</span>
                </span>
              </Link>
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