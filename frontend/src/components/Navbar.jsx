import { Link, useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const { user, userDetails, logout, adminUser, logoutAdmin } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleAdminLogout = () => {
    logoutAdmin();
    navigate("/admin");
  };

  return (
    <nav className="navbar navbar-expand-lg bg-white shadow-sm">
      <div className="container">

        {/* LOGO */}
        <Link className="navbar-brand d-flex align-items-center text-decoration-none" to="/">
          <img src="/purvankaraimg.png" alt="Puravankara" style={{ height: "55px", objectFit: "contain", marginRight: "6px" }} />
          <span style={{ color: "#c4122f", fontWeight: "800", fontSize: "1.6rem", letterSpacing: "1px", fontFamily: "Arial Black, sans-serif" }}>GRM</span>
        </Link>

        {/* NAV LINKS */}
        <div className="ms-auto d-flex align-items-center">

          <Link to="/" className="me-4 text-dark text-decoration-none">
            {user || adminUser ? "Dashboard" : t("home")}
          </Link>

          <Link to="/track" className="me-4 text-dark text-decoration-none">
            {t("track")}
          </Link>

          <Link to="/help" className="me-4 text-dark text-decoration-none">
            {t("help")}
          </Link>

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
          {adminUser ? (
            // Admin is logged in
            <div className="d-flex align-items-center">
              <div className="me-3 d-flex align-items-center">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center text-white me-2 shadow-sm"
                  style={{ width: "32px", height: "32px", backgroundColor: "#001a4d", fontWeight: "bold" }}
                >
                  {adminUser.name ? adminUser.name.charAt(0).toUpperCase() : "A"}
                </div>
                <span style={{ fontSize: "14px", color: "#6c757d" }}>
                  <span style={{ color: "#001a4d", fontWeight: "bold" }}>{adminUser.name}</span>
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