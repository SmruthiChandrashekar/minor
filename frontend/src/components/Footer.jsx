import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="footer">
      <div className="container">
        <div className="row text-center text-md-start">

          <div className="col-md-4 mb-3">
            <h5 className="d-flex align-items-center mb-3">
              <img src="/purvankaraimg.png" alt="Puravankara" style={{ height: "45px", objectFit: "contain", marginRight: "6px" }} />
              <span style={{ color: "#c4122f", fontWeight: "800", fontSize: "1.4rem", letterSpacing: "1px", fontFamily: "Arial Black, sans-serif" }}>GRM</span>
            </h5>

            <p>{t("footerDesc")}</p>
          </div>

          <div className="col-md-4 mb-3">
            <h6 className="fw-bold">{t("quickLinks")}</h6>
            <p><Link to="/">{t("home")}</Link></p>
            <p><Link to="/track">{t("trackStatus")}</Link></p>
            <p><Link to="/help">{t("helpCenter")}</Link></p>
            <p><Link to="/auth">{t("loginRegister")}</Link></p>
          </div>

          <div className="col-md-4 mb-3">
            <h6 className="fw-bold">{t("contactUs")}</h6>
            <p>📞 {t("helpline")}</p>
            <p>✉ support@puravankara.com</p>
            <p>Bengaluru, India</p>
          </div>

        </div>

        <hr />

        <div className="text-center">
          {t("copyright")}
          <div className="tagline">
            {t("tagline")}
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;