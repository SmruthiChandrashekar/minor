import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

function Footer() {
  const { t } = useLanguage();

  return (
    <footer style={{
      backgroundColor: "var(--navy)",
      color: "#b3c2dc",
      padding: "var(--s7) 0 var(--s5)",
      fontSize: "var(--fs-sm)",
      borderTop: "1px solid rgba(255, 255, 255, 0.1)"
    }}>
      <div className="container">
        <div className="row text-center text-md-start g-4 mb-4">

          <div className="col-md-5 mb-3">
            <h5 className="d-flex align-items-center mb-3">
              <img src="/purvankaraimg.png" alt="Puravankara" style={{ height: "45px", objectFit: "contain", marginRight: "8px", filter: "brightness(1.1)" }} />
              <span style={{ color: "var(--accent)", fontWeight: "800", fontSize: "1.5rem", letterSpacing: "1px", fontFamily: "var(--font-d)" }}>GRM</span>
            </h5>
            <p style={{ color: "#9aa9c8", maxWidth: "36ch", lineHeight: "1.7" }}>{t("footerDesc")}</p>
          </div>

          <div className="col-md-3 mb-3">
            <h6 className="fw-bold mb-3" style={{ color: "#ffffff", fontFamily: "var(--font-d)", fontSize: "16px" }}>{t("quickLinks")}</h6>
            <p className="mb-2"><Link to="/" style={{ color: "#b3c2dc", textDecoration: "none" }}>{t("home")}</Link></p>
            <p className="mb-2"><Link to="/track" style={{ color: "#b3c2dc", textDecoration: "none" }}>{t("trackStatus")}</Link></p>
            <p className="mb-2"><Link to="/help" style={{ color: "#b3c2dc", textDecoration: "none" }}>{t("helpCenter")}</Link></p>
            <p className="mb-2"><Link to="/login" style={{ color: "#b3c2dc", textDecoration: "none" }}>{t("loginRegister")}</Link></p>
          </div>

          <div className="col-md-4 mb-3">
            <h6 className="fw-bold mb-3" style={{ color: "#ffffff", fontFamily: "var(--font-d)", fontSize: "16px" }}>{t("contactUs")}</h6>
            <p className="mb-2" style={{ color: "#b3c2dc" }}>📞 {t("helpline")}</p>
            <p className="mb-2" style={{ color: "#b3c2dc" }}>✉ support@puravankara.com</p>
            <p className="mb-2" style={{ color: "#9aa9c8" }}>Puravankara Projects Ltd, Bengaluru, India</p>
          </div>

        </div>

        <hr style={{ borderColor: "rgba(255, 255, 255, 0.12)", margin: "var(--s4) 0" }} />

        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 pt-2 text-muted" style={{ fontSize: "var(--fs-xs)", color: "#8a9ab8" }}>
          <div>{t("copyright")}</div>
          <div style={{ color: "#c4d2ec", fontStyle: "italic" }}>{t("tagline")}</div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;