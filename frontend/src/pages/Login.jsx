import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

const Login = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [formData, setFormData] = useState({
    username: "",
    mobile: "",
    password: "",
    userType: "",
  });

  const [showPopup, setShowPopup] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

 const handleSubmit = (e) => {
  e.preventDefault();

  if (
    formData.username &&
    formData.mobile &&
    formData.password
  ) {

    // Store user in localStorage (without password)
    const userData = {
      username: formData.username,
      mobile: formData.mobile,
      userType: formData.userType,
      isLoggedIn: true
    };

    localStorage.setItem("user", JSON.stringify(userData));

    setShowPopup(true);
  }
};

  const handlePopupClose = () => {
    setShowPopup(false);
    navigate("/dashboard"); // Redirect after OK
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        {/* GRIEVANCE INFORMATION */}
        <div className="col-md-6 mb-4">
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

        {/* LOGIN FORM */}
        <div className="col-md-6">
          <div className="card p-4 shadow h-100">
            <h3 className="text-center mb-4">{t("userLogin")}</h3>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label>{t("userType")}</label>
            <select
              name="userType"
              className="form-control"
              onChange={handleChange}
              required
            >
              <option value="">{t("selectUserType")}</option>
              <option value="Internal Employees">{t("internalEmployees")}</option>
              <option value="Contract Workforce">{t("contractWorkforce")}</option>
              <option value="External Stakeholders">{t("externalStakeholders")}</option>
            </select>
          </div>

          <div className="mb-3">
            <label>{t("username")}</label>
            <input
              type="text"
              name="username"
              className="form-control"
              onChange={handleChange}
              required
            />
          </div>

          <div className="mb-3">
            <label>{t("mobileNumber")}</label>
            <input
              type="text"
              name="mobile"
              className="form-control"
              onChange={handleChange}
              required
            />
          </div>

          <div className="mb-3">
            <label>{t("password")}</label>
            <input
              type="password"
              name="password"
              className="form-control"
              onChange={handleChange}
              required
            />
          </div>

          <button className="btn btn-success w-100">
            {t("secureLogin")}
          </button>

          <div className="text-center mt-4 pt-3 border-top">
            <small className="text-muted">
              {t("areYouAdmin")} <Link to="/admin" className="text-decoration-none fw-bold" style={{ color: "#001a4d" }}>{t("adminPortal")}</Link>
            </small>
          </div>
        </form>
          </div>
        </div>
      </div>

      {/* SUCCESS POPUP */}
      {showPopup && (
        <div className="modal d-block" tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content p-4 text-center">
              <h5>{t("loginSuccess")}</h5>
              <button
                className="btn btn-primary mt-3"
                onClick={handlePopupClose}
              >
                {t("ok")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;