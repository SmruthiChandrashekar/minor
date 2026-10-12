import { Link, useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import ThemeToggle from "./ThemeToggle";
import NotificationDropdown from "./NotificationDropdown";
import "./Navbar.css";

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
    <nav className="navbar navbar-expand-lg shadow-sm site-navbar">
      <div className="container">

        {/* LOGO */}
        <Link className="navbar-brand d-flex align-items-center text-decoration-none" to="/">
          <img src="/purvankaraimg.png" alt="Puravankara" className="navbar-brand-logo object-fit-contain" />
          <span className="text-accent fw-extrabold ls-1 brand-mark">GRM</span>
        </Link>

        {/* NAV LINKS */}
        <div className="ms-auto d-flex align-items-center">

          <Link 
            to="/assistant" 
            className={`me-4 text-decoration-none d-flex align-items-center gap-2 nav-assistant-link${location.pathname === "/assistant" ? " is-active" : ""}`}
          >
            {/* Purva mini avatar */}
            <span className="purva-nav-avatar d-inline-flex rounded-circle overflow-hidden flex-shrink-0">
              <img className="w-100 h-100 object-fit-contain" src="/purva-logo.svg" alt="Purva" />
            </span>
            <span>Purva</span>
            <span className="d-inline-block rounded-circle nav-live-dot"></span>
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
              className={`me-4 text-decoration-none nav-link-custom ${location.pathname === "/profile" ? "fw-bold" : "fw-normal"}`}
            >
              Profile
            </Link>
          )}

          {isSuperAdmin && (
            <Link to="/admin/portal" className="me-4 text-decoration-none nav-link-custom fw-bold nav-link-portal">
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
            className="form-select form-select-sm me-4 shadow-none cursor-pointer nav-lang-select"
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
                className="me-3 d-flex align-items-center text-decoration-none p-1 rounded-pill nav-profile-link"
                title="View Admin Profile"
              >
                {userDetails?.avatar_url ? (
                  <img
                    src={userDetails.avatar_url}
                    alt={userDetails.name || "Admin"}
                    className="rounded-circle me-2 shadow-sm object-fit-cover nav-avatar-admin"
                  />
                ) : (
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center text-white me-2 shadow-sm fw-bold nav-avatar-admin-fallback"
                  >
                    {userDetails?.name ? userDetails.name.charAt(0).toUpperCase() : "A"}
                  </div>
                )}
                <span className="fs-14 text-theme-muted">
                  <span className="text-heading fw-bold">{userDetails?.name || "Admin"}</span>
                </span>
              </Link>
              <button onClick={handleAdminLogout} className="btn btn-outline-danger px-3 fw-semibold fs-14">
                {t("logout")}
              </button>
            </div>
          ) : user ? (
            // Regular user logged in
            <div className="d-flex align-items-center">
              <Link 
                to="/profile" 
                className="me-3 d-flex align-items-center text-decoration-none p-1 rounded-pill nav-profile-link"
                title="View My Profile"
              >
                {userDetails?.avatar_url ? (
                  <img
                    src={userDetails.avatar_url}
                    alt={userDetails.name || "User"}
                    className="rounded-circle me-2 shadow-sm object-fit-cover nav-avatar-user"
                  />
                ) : (
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center text-white me-2 shadow-sm fw-bold nav-avatar-user-fallback"
                  >
                    {userDetails?.name ? userDetails.name.charAt(0).toUpperCase() : "U"}
                  </div>
                )}
                <span className="text-theme-muted nav-greeting">
                  <i className="nav-greeting-hi">{t("hi")}</i> <span className="text-heading fw-bold text-uppercase ls-half">{userDetails?.name || "User"}</span>
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