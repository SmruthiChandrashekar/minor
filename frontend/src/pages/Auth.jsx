import React, { useState, useEffect } from "react";
import { resetApiClientState } from "../services/api";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import { useLanguage } from "../context/LanguageContext";
import "./Auth.css";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    supabase.auth.signOut().catch(() => {});
    const msg = searchParams.get("message");
    if (msg) {
      setMessage({ type: "info", text: msg });
    }
  }, [searchParams]);

  const [formData, setFormData] = useState({
    userType: "",
    email: "",
    password: "",
    name: "",
    confirmPassword: "",
    employeeId: "",
    agencyName: "",
    location: "",
  });
  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
    setMessage({ type: "", text: "" });
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.email) newErrors.email = "Email is required.";
    if (!formData.password) newErrors.password = "Password is required.";

    if (mode === "register") {
      if (!formData.name) newErrors.name = "Full Name is required.";
      if (!formData.userType) newErrors.userType = "User Type is required.";
      
      // Internal Email Domain Restriction
      if (formData.userType === "Internal" && formData.email) {
        if (!formData.email.toLowerCase().endsWith("@company.com")) {
          newErrors.email = "Internal registration requires a @company.com email address.";
        }
      }

      if (!formData.confirmPassword) newErrors.confirmPassword = "Confirm Password is required.";
      if (
        formData.password &&
        formData.confirmPassword &&
        formData.password !== formData.confirmPassword
      ) {
        newErrors.confirmPassword = "Passwords do not match.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const parseError = (err) => {
    try {
      const parsed = typeof err.message === "string" ? JSON.parse(err.message) : err.message;
      if (parsed && parsed.code === "PGRST303") return "Your session has expired. Please log in again.";
      if (parsed && parsed.message) return parsed.message;
    } catch (_) {}
    if (err.message?.includes("JWT expired")) return "Your session has expired. Please log in again.";
    if (err.message?.includes("Invalid login credentials")) return "Invalid email or password. Please try again.";
    if (err.message?.includes("Email not confirmed")) return "Please confirm your email before logging in.";
    if (err.message?.includes("User already registered")) return "An account with this email already exists.";
    return err.message || "Something went wrong. Please try again.";
  };

  const registerUser = async () => {
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });
      if (signUpError) throw signUpError;
      if (data.user) {
        const { error: insertError } = await supabase.from("users").insert([
          {
            user_id: data.user.id,
            name: formData.name,
            email: formData.email,
            user_type: formData.userType,
            department: formData.userType === "Internal" ? formData.employeeId : (formData.userType === "Contract" ? formData.agencyName : formData.location),
          },
        ]);
        if (insertError) throw insertError;
        setMessage({ type: "success", text: "Registration successful! Redirecting to dashboard..." });
        setTimeout(() => { window.location.href = "/"; }, 1500);
      }
    } catch (err) {
      setMessage({ type: "error", text: parseError(err) });
    }
  };

  const loginUser = async () => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (authError || !authData?.user) {
        throw authError || new Error("Invalid credentials");
      }

      // Clear any stale refresh-failed flag from a previous expired session
      resetApiClientState();

      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("role")
        .eq("user_id", authData.user.id)
        .single();

      if (userError) {
        console.error("Error fetching user data:", userError);
      }

      if (userData?.role === "super_admin") {
        setMessage({ type: "success", text: "Admin login successful! Redirecting..." });
        setTimeout(() => { window.location.href = "/admin/dashboard"; }, 1000);
      } else {
        setMessage({ type: "success", text: "Login successful! Welcome back." });
        setTimeout(() => { window.location.href = "/"; }, 1000);
      }
    } catch (err) {
      setMessage({ type: "error", text: parseError(err) });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    if (mode === "register") await registerUser();
    else await loginUser();
    setLoading(false);
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setErrors({});
    setMessage({ type: "", text: "" });
    setFormData({ userType: "", email: "", password: "", name: "", confirmPassword: "" });
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const features = [
    { icon: "bi-shield-lock", label: t("featureConfidential"), desc: t("featureConfidentialDesc") },
    { icon: "bi-robot", label: t("featureAI"), desc: t("featureAIDesc") },
    { icon: "bi-clock-history", label: t("feature247"), desc: t("feature247Desc") },
    { icon: "bi-graph-up-arrow", label: t("featureRealtime"), desc: t("featureRealtimeDesc") },
  ];

  return (
    <div>
      {/* HERO BANNER */}
      <div
        className="hero-banner text-white bg-navy auth-hero"
      >
        <div className="container text-center pb-5 text-white">
          <h1 className="fw-bold mb-2 text-white auth-hero-title">
            {mode === "login" ? t("welcomeBack") : t("createYourAccount")}
          </h1>
          <p className="opacity-90 mb-0 auth-hero-lead">
            {mode === "login" ? t("signInDesc") : t("createAccountDesc")}
          </p>
        </div>

        {/* WAVE DIVIDER */}
        <svg
          className="d-block auth-hero-wave"
          viewBox="0 0 1440 60"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="var(--bg)"
            d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z"
          />
        </svg>
      </div>

      {/* MAIN CONTENT */}
      <div className="auth-body">
        <div className="container">
          <div className="row g-5 justify-content-center align-items-start">

            {/* LEFT: FEATURE HIGHLIGHTS */}
            <div className="col-lg-5 d-none d-lg-block auth-side">
              <h4 className="fw-bold mb-4 text-theme">
                {t("whyUseGRM")}
              </h4>
              <div className="d-flex flex-column gap-3">
                {features.map((f, i) => (
                  <div
                    key={i}
                    className="card border-0 shadow-sm p-3 auth-feature-card"
                  >
                    <div className="d-flex align-items-center gap-3">
                      <div
                        className="d-flex align-items-center justify-content-center rounded-circle text-accent flex-shrink-0 auth-feature-icon"
                      >
                        <i className={`bi ${f.icon} auth-feature-glyph`}></i>
                      </div>
                      <div>
                        <div className="fw-bold text-theme auth-feature-label">{f.label}</div>
                        <div className="text-muted auth-feature-desc">{f.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="card border-0 shadow-sm mt-4 p-4 auth-admin-card"
              >
                <div className="d-flex align-items-center gap-2 mb-2">
                  <i className="bi bi-person-badge text-accent auth-feature-glyph"></i>
                  <span className="fw-bold">{t("adminLoginTitle")}</span>
                </div>
                <p className="mb-3 opacity-75 auth-admin-desc">
                  {t("adminLoginDesc")}
                </p>
                <a
                  href="/admin"
                  className="btn btn-danger btn-sm w-100 mt-2 rounded-3 fw-semibold p-2"
                >
                  {t("goToAdminPortal")}
                </a>
              </div>
            </div>

            {/* RIGHT: AUTH FORM CARD */}
            <div className="col-lg-7 col-md-10 col-12 auth-side">
              {mode === "register" && !formData.userType ? (
                /* STEP 1: CATEGORY SELECTION */
                <div className="card border-0 shadow-lg p-4 p-md-5 auth-card">
                  <div className="text-center mb-4">
                    <h3 className="fw-bold">{t("selectCategory")}</h3>
                    <p className="text-muted small">{t("selectCategoryDesc")}</p>
                  </div>
                  <div className="row g-3">
                    {[
                      { type: "Internal", label: t("internalEmployees"), icon: "fa-user-tie", color: "var(--navy)", bg: "var(--surface-2)" },
                      { type: "Contract", label: t("contractWorkforce"), icon: "fa-briefcase", color: "var(--slate)", bg: "rgba(121, 141, 166, 0.12)" },
                      { type: "External", label: t("externalStakeholders"), icon: "fa-users", color: "var(--accent)", bg: "rgba(168, 38, 70, 0.1)" }
                    ].map((cat) => (
                      <div key={cat.type} className="col-12">
                        <div 
                          className="card border-0 p-4 d-flex flex-row align-items-center gap-4 rounded-4 cursor-pointer auth-category-card"
                          style={{ "--category-color": cat.color }}
                          onClick={() => setFormData(prev => ({ ...prev, userType: cat.type }))}
                        >
                          <div className="d-flex align-items-center justify-content-center rounded-circle auth-category-icon" style={{ backgroundColor: cat.bg, color: cat.color }}>
                            <i className={`fa-solid ${cat.icon} auth-category-glyph`}></i>
                          </div>
                          <div className="flex-grow-1 text-start">
                            <h5 className="fw-bold mb-0">{cat.label}</h5>
                            <p className="text-muted small mb-0">Proceed as {cat.label}</p>
                          </div>
                          <i className="fa-solid fa-chevron-right opacity-25"></i>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-center mt-4">
                    <button onClick={() => switchMode("login")} className="btn btn-link text-decoration-none fw-bold text-navy">
                      Already have an account? Sign In
                    </button>
                  </div>
                </div>
              ) : (
                /* STEP 2: ACTUAL FORM */
                <div
                  className="card border-0 shadow overflow-hidden auth-card"
                >
                {/* TAB SWITCHER */}
                <div className="d-flex auth-tabs">
                  {["login", "register"].map((tab) => (
                    <button
                      className={`p-3 border-0 fw-bold ls-half auth-tab${mode === tab ? " is-active" : ""}`}
                      key={tab}
                      type="button"
                      onClick={() => switchMode(tab)}
                      disabled={loading}
                    >
                      {tab === "login" ? t("signInTab") : t("registerTab")}
                    </button>
                  ))}
                </div>

                <div className="p-4 p-md-5">
                  <h3 className="fw-bold mb-1">
                    {mode === "login" ? t("loginToAccount") : t("createAnAccount")}
                  </h3>
                  <p className="text-muted mb-4 auth-hint">
                    {mode === "login" ? t("loginToAccountDesc") : t("fillDetailsDesc")}
                  </p>

                  {/* MESSAGE ALERT */}
                  {message.text && (
                    <div
                      className={`alert ${
                        message.type === "success"
                          ? "alert-success"
                          : message.type === "info"
                          ? "alert-info"
                          : "alert-danger"
                      } d-flex align-items-center gap-2 auth-alert`}
                      role="alert"
                    >
                      <i
                        className={`bi ${
                          message.type === "success"
                            ? "bi-check-circle-fill"
                            : message.type === "info"
                            ? "bi-info-circle-fill"
                            : "bi-exclamation-triangle-fill"
                        }`}
                      ></i>
                      {message.text}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} noValidate>
                    {/* FULL NAME — register only */}
                    {mode === "register" && (
                      <div className="mb-3">
                        <label className="form-label fw-semibold text-theme auth-hint">
                          {t("fullNameLabel")}
                        </label>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          className={`form-control ${errors.name ? "is-invalid" : ""} auth-input`}
                          placeholder={t("fullNamePlaceholder")}
                          disabled={loading}
                        />
                        {errors.name && <div className="invalid-feedback">{errors.name}</div>}
                      </div>
                    )}

                    {/* CATEGORY-SPECIFIC FIELDS */}
                    {mode === "register" && formData.userType === "Internal" && (
                      <div className="mb-3">
                        <label className="form-label fw-semibold text-theme auth-hint">
                          Employee ID
                        </label>
                        <input
                          type="text"
                          name="employeeId"
                          value={formData.employeeId}
                          onChange={handleInputChange}
                          className="form-control auth-input"
                          placeholder="Enter your Employee ID"
                          disabled={loading}
                        />
                      </div>
                    )}

                    {mode === "register" && formData.userType === "Contract" && (
                      <div className="mb-3">
                        <label className="form-label fw-semibold text-theme auth-hint">
                          Agency Name
                        </label>
                        <input
                          type="text"
                          name="agencyName"
                          value={formData.agencyName}
                          onChange={handleInputChange}
                          className="form-control auth-input"
                          placeholder="Enter your Agency/Contractor name"
                          disabled={loading}
                        />
                      </div>
                    )}

                    {mode === "register" && formData.userType === "External" && (
                      <div className="mb-3">
                        <label className="form-label fw-semibold text-theme auth-hint">
                          City / Location
                        </label>
                        <input
                          type="text"
                          name="location"
                          value={formData.location}
                          onChange={handleInputChange}
                          className="form-control auth-input"
                          placeholder="e.g. Bengaluru, Mumbai"
                          disabled={loading}
                        />
                      </div>
                    )}


                    {/* EMAIL */}
                    <div className="mb-3">
                      <label className="form-label fw-semibold text-theme auth-hint">
                        {t("emailAddress")}
                      </label>
                      <div className="input-group">
                        <span
                          className="input-group-text text-theme auth-addon-start"
                        >
                          <i className="bi bi-envelope"></i>
                        </span>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          className={`form-control ${errors.email ? "is-invalid" : ""} auth-input-end`}
                          placeholder={t("emailPlaceholder")}
                          disabled={loading}
                        />
                        {errors.email && <div className="invalid-feedback">{errors.email}</div>}
                      </div>
                    </div>

                    {/* USER TYPE INDICATOR — register only */}
                    {mode === "register" && (
                      <div className="mb-3 d-flex align-items-center justify-content-between p-3 auth-role-summary">
                        <div>
                          <span className="text-muted small d-block">Registering as:</span>
                          <strong className="text-navy">{formData.userType}</strong>
                        </div>
                        <button type="button" onClick={() => setFormData(p => ({ ...p, userType: "" }))} className="btn btn-sm btn-outline-secondary fs-11">
                          Change
                        </button>
                      </div>
                    )}

                    {/* PASSWORD */}
                    <div className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <label className="form-label fw-semibold mb-0 text-theme auth-hint">
                          {t("passwordLabel")}
                        </label>
                        {mode === "login" && (
                          <a href="#" className="text-decoration-none text-accent auth-forgot-link">
                            {t("forgotPassword")}
                          </a>
                        )}
                      </div>
                      <div className="input-group">
                        <span
                          className="input-group-text text-theme auth-addon-start"
                        >
                          <i className="bi bi-lock"></i>
                        </span>
                        <input
                          type={showPassword ? "text" : "password"}
                          name="password"
                          value={formData.password}
                          onChange={handleInputChange}
                          className={`form-control ${errors.password ? "is-invalid" : ""} rounded-0 auth-input-mid`}
                          placeholder="••••••••"
                          disabled={loading}
                        />
                        <button
                          type="button"
                          className="input-group-text cursor-pointer text-theme auth-addon-end"
                          onClick={() => setShowPassword((p) => !p)}
                          tabIndex={-1}
                        >
                          <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`}></i>
                        </button>
                        {errors.password && <div className="invalid-feedback">{errors.password}</div>}
                      </div>
                    </div>

                    {/* CONFIRM PASSWORD — register only */}
                    {mode === "register" && (
                      <div className="mb-4">
                        <label className="form-label fw-semibold text-navy auth-hint">
                          {t("confirmPasswordLabel")}
                        </label>
                        <div className="input-group">
                          <span
                            className="input-group-text auth-addon-start-light"
                          >
                            <i className="bi bi-lock-fill"></i>
                          </span>
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleInputChange}
                            className={`form-control ${errors.confirmPassword ? "is-invalid" : ""} rounded-0 auth-input-mid`}
                            placeholder="••••••••"
                            disabled={loading}
                          />
                          <button
                            type="button"
                            className="input-group-text cursor-pointer auth-addon-end-light"
                            onClick={() => setShowConfirmPassword((p) => !p)}
                            tabIndex={-1}
                          >
                            <i className={`bi ${showConfirmPassword ? "bi-eye-slash" : "bi-eye"}`}></i>
                          </button>
                          {errors.confirmPassword && <div className="invalid-feedback">{errors.confirmPassword}</div>}
                        </div>
                      </div>
                    )}

                    {/* SUBMIT BUTTON */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn btn-danger w-100 fw-bold ls-half auth-submit-btn"
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          {t("processing")}
                        </>
                      ) : mode === "login" ? (
                        <>
                          <i className="bi bi-box-arrow-in-right me-2"></i>{t("signInBtn")}
                        </>
                      ) : (
                        <>
                          <i className="bi bi-person-plus me-2"></i>{t("createAccountBtn")}
                        </>
                      )}
                    </button>

                    {/* SWITCH MODE LINK */}
                    <div className="text-center mt-4 auth-switch">
                      {mode === "login" ? (
                        <>
                          {t("dontHaveAccount")}{" "}
                          <button
                            className="border-0 text-navy fw-bold cursor-pointer p-0 auth-link-btn"
                            type="button"
                            onClick={() => switchMode("register")}
                            disabled={loading}
                          >
                            {t("registerHere")}
                          </button>
                        </>
                      ) : (
                        <>
                          {t("alreadyHaveAccount")}{" "}
                          <button
                            className="border-0 text-navy fw-bold cursor-pointer p-0 auth-link-btn"
                            type="button"
                            onClick={() => switchMode("login")}
                            disabled={loading}
                          >
                            {t("signInLink")}
                          </button>
                        </>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            )}

              {/* ADMIN PORTAL LINK — mobile only */}
              <div className="d-lg-none text-center mt-3">
                <span className="text-muted auth-admin-desc">
                  {t("areYouAdminQ")}{" "}
                  <a className="text-accent fw-bold auth-link" href="/admin">
                    {t("adminPortalLink")}
                  </a>
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;