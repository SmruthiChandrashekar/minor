import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

function Help() {
  const { t } = useLanguage();

  return (
    <div>

      {/* CONTENT */}
      <div className="container mt-5">

        <div className="help-card">

          <h3 className="mb-3">
            {t("aboutRedressal")}
          </h3>

          <p>
            {t("helpDescription")}
          </p>

          <div className="helpline-box">
            <h5>{t("stakeholderHelpline")}</h5>

            <div className="helpline-number">
              1800-555-0199
            </div>
          </div>

        </div>

      </div>

   

    </div>
  );
}

export default Help;