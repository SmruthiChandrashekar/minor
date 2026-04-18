import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

function Register() {
  const { t } = useLanguage();

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        {/* GRIEVANCE INFORMATION */}
        <div className="col-md-5 mb-4">
          <div className="card p-4 shadow h-100 bg-light border-0">
            <h4 className="mb-4 text-center" style={{ color: "#c4122f" }}>{t("whoCanLodge")}</h4>
            
            <div className="mb-4">
              <h5>{t("internalEmployees")}</h5>
              <p className="text-muted mb-0">{t("internalDesc")}</p>
            </div>
            
            <div className="mb-4">
              <h5>{t("contractWorkforce")}</h5>
              <p className="text-muted mb-0">{t("contractDesc")}</p>
            </div>
            
            <div>
              <h5>{t("externalStakeholders")}</h5>
              <p className="text-muted mb-0">{t("externalDesc")}</p>
            </div>
          </div>
        </div>

        {/* REGISTRATION FORM */}
        <div className="col-md-7">
          <div className="card p-4 shadow h-100">
            <h3 className="text-center mb-4">{t("userRegistration")}</h3>

            <form className="mt-4">

          <div className="mb-3">
            <label>{t("userType")}</label>
            <select className="form-control" required>
              <option value="">{t("selectUserType")}</option>
              <option value="Internal Employees">{t("internalEmployees")}</option>
              <option value="Contract Workforce">{t("contractWorkforce")}</option>
              <option value="External Stakeholders">{t("externalStakeholders")}</option>
            </select>
          </div>

          <div className="mb-3">
            <label>{t("fullName")}</label>
            <input
              type="text"
              className="form-control"
              required
            />
          </div>

          <div className="mb-3">
            <label>{t("mobileNumber")}</label>
            <input
              type="tel"
              className="form-control"
              required
            />
          </div>

          <div className="mb-3">
            <label>{t("emailOptional")}</label>
            <input
              type="email"
              className="form-control"
            />
          </div>

          <div className="mb-3">
            <label>{t("aadhaarOptional")}</label>
            <input
              type="password"
              className="form-control"
              maxLength="12"
            />
          </div>

          <div className="mb-3">
            <label>{t("createPassword")}</label>
            <input
              type="password"
              className="form-control"
              required
            />
          </div>

          <div className="mb-3">
            <label>{t("confirmPassword")}</label>
            <input
              type="password"
              className="form-control"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary w-100">
            {t("register")}
          </button>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;