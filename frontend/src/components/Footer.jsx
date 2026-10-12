import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import "./Footer.css";

function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-navy fs-sm site-footer">
      <div className="container">
        <div className="row text-center text-md-start g-4 mb-4">

          <div className="col-md-5 mb-3">
            <h5 className="d-flex align-items-center mb-3">
              <img className="object-fit-contain me-2 footer-logo" src="/purvankaraimg.png" alt="Puravankara" />
              <span className="text-accent fw-extrabold ls-1 footer-brand-mark">GRM</span>
            </h5>
            <p className="footer-desc">{t("footerDesc")}</p>
          </div>

          <div className="col-md-3 mb-3">
            <h6 className="fw-bold mb-3 text-white footer-heading">{t("quickLinks")}</h6>
            <p className="mb-2"><Link className="text-decoration-none footer-link" to="/">{t("home")}</Link></p>
            <p className="mb-2"><Link className="text-decoration-none footer-link" to="/track">{t("trackStatus")}</Link></p>
            <p className="mb-2"><Link className="text-decoration-none footer-link" to="/help">{t("helpCenter")}</Link></p>
            <p className="mb-2"><Link className="text-decoration-none footer-link" to="/login">{t("loginRegister")}</Link></p>
          </div>

          <div className="col-md-4 mb-3">
            <h6 className="fw-bold mb-3 text-white footer-heading">{t("contactUs")}</h6>
            <p className="mb-2 footer-link">{t("helpline")}</p>
            <p className="mb-2 footer-link">support@puravankara.com</p>
            <p className="mb-2 footer-address">Puravankara Projects Ltd, Bengaluru, India</p>
          </div>

        </div>

        <hr className="footer-divider" />

        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 pt-2 fs-xs footer-bottom">
          <div>{t("copyright")}</div>
          <div className="fst-italic footer-tagline">{t("tagline")}</div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;