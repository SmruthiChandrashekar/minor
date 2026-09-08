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
          <span style={{ color: "#c4122f", fontWeight: "800", fontSize: "1.6rem", letterSpacing: "1px", fontFamily: "Arial Black, sans-serif" }}>GRM</span>
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
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                <circle cx="32" cy="32" r="32" fill="url(#navBg)"/>
                <rect x="26" y="40" width="12" height="8" rx="4" fill="#f4c2a1"/>
                <ellipse cx="32" cy="56" rx="18" ry="12" fill="url(#navShirt)"/>
                <circle cx="32" cy="28" r="13" fill="#f4c2a1"/>
                <path d="M19 26 Q19 14 32 13 Q45 14 45 26 Q44 18 32 17 Q20 18 19 26Z" fill="#5c3d2e"/>
                <path d="M19 27 Q17 36 20 40 Q19 32 21 28Z" fill="#5c3d2e"/>
                <path d="M45 27 Q47 36 44 40 Q45 32 43 28Z" fill="#5c3d2e"/>
                <ellipse cx="27" cy="28" rx="2" ry="2.5" fill="#3d2b1f"/>
                <ellipse cx="37" cy="28" rx="2" ry="2.5" fill="#3d2b1f"/>
                <path d="M27 33 Q32 37 37 33" stroke="#c87941" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                <defs>
                  <radialGradient id="navBg" cx="50%" cy="35%" r="55%">
                    <stop offset="0%" stopColor="#2d2d4a"/>
                    <stop offset="100%" stopColor="#18181c"/>
                  </radialGradient>
                  <linearGradient id="navShirt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6"/>
                    <stop offset="100%" stopColor="#6d28d9"/>
                  </linearGradient>
                </defs>
              </svg>
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
            {t("track")}
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