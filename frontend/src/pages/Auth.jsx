import React, { useState, useEffect } from "react";
import { resetApiClientState } from "../services/api";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import { useLanguage } from "../context/LanguageContext";

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
        style={{
          background: "linear-gradient(135deg, #001a4d 0%, #003366 100%)",
          padding: "48px 0 0",
          color: "#fff",
        }}
      >
        <div className="container text-center pb-5">
          <h1 className="fw-bold mb-2" style={{ fontSize: "2rem" }}>
            {mode === "login" ? t("welcomeBack") : t("createYourAccount")}
          </h1>
          <p className="opacity-75 mb-0" style={{ fontSize: "1rem" }}>
            {mode === "login" ? t("signInDesc") : t("createAccountDesc")}
          </p>
        </div>

        {/* WAVE DIVIDER */}
        <svg
          viewBox="0 0 1440 60"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: "block", marginBottom: "-2px" }}
        >
          <path
            fill="var(--bg-color)"
            d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z"
          />
        </svg>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ backgroundColor: "var(--bg-color)", paddingBottom: "60px" }}>
        <div className="container">
          <div className="row g-5 justify-content-center align-items-start">

            {/* LEFT: FEATURE HIGHLIGHTS */}
            <div className="col-lg-5 d-none d-lg-block" style={{ paddingTop: "40px" }}>
              <h4 className="fw-bold mb-4" style={{ color: "var(--text-color)" }}>
                {t("whyUseGRM")}
              </h4>
              <div className="d-flex flex-column gap-3">
                {features.map((f, i) => (
                  <div
                    key={i}
                    className="card border-0 shadow-sm p-3"
                    style={{
                      borderRadius: "14px",
                      borderLeft: "4px solid #c4122f",
                      transition: "transform 0.2s ease",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.transform = "translateX(6px)")}
                    onMouseOut={(e) => (e.currentTarget.style.transform = "translateX(0)")}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <div
                        className="d-flex align-items-center justify-content-center rounded-circle"
                        style={{ width: "46px", height: "46px", backgroundColor: "rgba(196, 18, 47, 0.1)", color: "#c4122f", flexShrink: 0 }}
                      >
                        <i className={`bi ${f.icon}`} style={{ fontSize: "1.2rem" }}></i>
                      </div>
                      <div>
                        <div className="fw-bold" style={{ color: "var(--text-color)", fontSize: "0.95rem" }}>{f.label}</div>
                        <div className="text-muted" style={{ fontSize: "0.82rem" }}>{f.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="card border-0 shadow-sm mt-4 p-4"
                style={{ borderRadius: "14px", backgroundColor: "#001a4d", color: "#fff" }}
              >
                <div className="d-flex align-items-center gap-2 mb-2">
                  <i className="bi bi-person-badge" style={{ fontSize: "1.2rem", color: "#c4122f" }}></i>
                  <span className="fw-bold">{t("adminLoginTitle")}</span>
                </div>
                <p className="mb-3 opacity-75" style={{ fontSize: "0.85rem" }}>
                  {t("adminLoginDesc")}
                </p>
                <a
                  href="/admin"
                  className="btn btn-danger btn-sm w-100 mt-2"
                  style={{ borderRadius: "8px", fontWeight: "600", padding: "8px" }}
                >
                  {t("goToAdminPortal")}
                </a>
              </div>
            </div>

            {/* RIGHT: AUTH FORM CARD */}
            <div className="col-lg-7 col-md-10 col-12" style={{ paddingTop: "40px" }}>
              {mode === "register" && !formData.userType ? (
                /* STEP 1: CATEGORY SELECTION */
                <div className="card border-0 shadow-lg p-4 p-md-5" style={{ borderRadius: "20px" }}>
                  <div className="text-center mb-4">
                    <h3 className="fw-bold" style={{ color: "#001a4d" }}>{t("selectCategory")}</h3>
                    <p className="text-muted small">{t("selectCategoryDesc")}</p>
                  </div>
                  <div className="row g-3">
                    {[
                      { type: "Internal", label: t("internalEmployees"), icon: "fa-user-tie", color: "#1e88e5", bg: "#e3f2fd" },
                      { type: "Contract", label: t("contractWorkforce"), icon: "fa-briefcase", color: "#4caf50", bg: "#e8f5e9" },
                      { type: "External", label: t("externalStakeholders"), icon: "fa-users", color: "#c4122f", bg: "#f8d7da" }
                    ].map((cat) => (
                      <div key={cat.type} className="col-12">
                        <div 
                          className="card border-0 shadow-sm p-4 d-flex flex-row align-items-center gap-4"
                          style={{ borderRadius: "16px", cursor: "pointer", transition: "all 0.2s ease", borderLeft: `6px solid ${cat.color}` }}
                          onClick={() => setFormData(prev => ({ ...prev, userType: cat.type }))}
                          onMouseOver={(e) => { e.currentTarget.classList.replace('shadow-sm', 'shadow'); e.currentTarget.style.transform = 'translateX(8px)'; }}
                          onMouseOut={(e) => { e.currentTarget.classList.replace('shadow', 'shadow-sm'); e.currentTarget.style.transform = 'translateX(0)'; }}
                        >
                          <div className="d-flex align-items-center justify-content-center rounded-circle" style={{ width: "50px", height: "50px", backgroundColor: cat.bg, color: cat.color }}>
                            <i className={`fa-solid ${cat.icon}`} style={{ fontSize: "1.4rem" }}></i>
                          </div>
                          <div className="flex-grow-1 text-start">
                            <h5 className="fw-bold mb-0" style={{ color: "#001a4d" }}>{cat.label}</h5>
                            <p className="text-muted small mb-0">Proceed as {cat.label}</p>
                          </div>
                          <i className="fa-solid fa-chevron-right opacity-25"></i>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-center mt-4">
                    <button onClick={() => switchMode("login")} className="btn btn-link text-decoration-none fw-bold" style={{ color: "#001a4d" }}>
                      Already have an account? Sign In
                    </button>
                  </div>
                </div>
              ) : (
                /* STEP 2: ACTUAL FORM */
                <div
                  className="card border-0 shadow"
                  style={{ borderRadius: "20px", overflow: "hidden" }}
                >
                {/* TAB SWITCHER */}
                <div className="d-flex" style={{ borderBottom: "1px solid #e9ecef" }}>
                  {["login", "register"].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => switchMode(tab)}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: "16px",
                        border: "none",
                        fontWeight: "700",
                        fontSize: "0.95rem",
                        cursor: loading ? "not-allowed" : "pointer",
                        transition: "all 0.2s ease",
                        backgroundColor: mode === tab ? "#001a4d" : "var(--card-bg)",
                        color: mode === tab ? "#fff" : "var(--text-color)",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {tab === "login" ? t("signInTab") : t("registerTab")}
                    </button>
                  ))}
                </div>

                <div className="p-4 p-md-5">
                  <h3 className="fw-bold mb-1" style={{ color: "var(--text-color)" }}>
                    {mode === "login" ? t("loginToAccount") : t("createAnAccount")}
                  </h3>
                  <p className="text-muted mb-4" style={{ fontSize: "0.88rem" }}>
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
                      } d-flex align-items-center gap-2`}
                      style={{ borderRadius: "10px", fontSize: "0.88rem" }}
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
                        <label className="form-label fw-semibold" style={{ color: "var(--text-color)", fontSize: "0.88rem" }}>
                          {t("fullNameLabel")}
                        </label>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          className={`form-control ${errors.name ? "is-invalid" : ""}`}
                          placeholder={t("fullNamePlaceholder")}
                          disabled={loading}
                          style={{ borderRadius: "10px", padding: "12px 14px", fontSize: "0.92rem" }}
                        />
                        {errors.name && <div className="invalid-feedback">{errors.name}</div>}
                      </div>
                    )}

                    {/* CATEGORY-SPECIFIC FIELDS */}
                    {mode === "register" && formData.userType === "Internal" && (
                      <div className="mb-3">
                        <label className="form-label fw-semibold" style={{ color: "var(--text-color)", fontSize: "0.88rem" }}>
                          Employee ID
                        </label>
                        <input
                          type="text"
                          name="employeeId"
                          value={formData.employeeId}
                          onChange={handleInputChange}
                          className="form-control"
                          placeholder="Enter your Employee ID"
                          disabled={loading}
                          style={{ borderRadius: "10px", padding: "12px 14px", fontSize: "0.92rem" }}
                        />
                      </div>
                    )}

                    {mode === "register" && formData.userType === "Contract" && (
                      <div className="mb-3">
                        <label className="form-label fw-semibold" style={{ color: "var(--text-color)", fontSize: "0.88rem" }}>
                          Agency Name
                        </label>
                        <input
                          type="text"
                          name="agencyName"
                          value={formData.agencyName}
                          onChange={handleInputChange}
                          className="form-control"
                          placeholder="Enter your Agency/Contractor name"
                          disabled={loading}
                          style={{ borderRadius: "10px", padding: "12px 14px", fontSize: "0.92rem" }}
                        />
                      </div>
                    )}

                    {mode === "register" && formData.userType === "External" && (
                      <div className="mb-3">
                        <label className="form-label fw-semibold" style={{ color: "var(--text-color)", fontSize: "0.88rem" }}>
                          City / Location
                        </label>
                        <input
                          type="text"
                          name="location"
                          value={formData.location}
                          onChange={handleInputChange}
                          className="form-control"
                          placeholder="e.g. Bengaluru, Mumbai"
                          disabled={loading}
                          style={{ borderRadius: "10px", padding: "12px 14px", fontSize: "0.92rem" }}
                        />
                      </div>
                    )}


                    {/* EMAIL */}
                    <div className="mb-3">
                      <label className="form-label fw-semibold" style={{ color: "var(--text-color)", fontSize: "0.88rem" }}>
                        {t("emailAddress")}
                      </label>
                      <div className="input-group">
                        <span
                          className="input-group-text"
                          style={{ borderRadius: "10px 0 0 10px", backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-color)" }}
                        >
                          <i className="bi bi-envelope"></i>
                        </span>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          className={`form-control ${errors.email ? "is-invalid" : ""}`}
                          placeholder={t("emailPlaceholder")}
                          disabled={loading}
                          style={{ borderRadius: "0 10px 10px 0", padding: "12px 14px", fontSize: "0.92rem" }}
                        />
                        {errors.email && <div className="invalid-feedback">{errors.email}</div>}
                      </div>
                    </div>

                    {/* USER TYPE INDICATOR — register only */}
                    {mode === "register" && (
                      <div className="mb-3 d-flex align-items-center justify-content-between p-3" style={{ backgroundColor: "rgba(0,0,0,0.03)", borderRadius: "10px" }}>
                        <div>
                          <span className="text-muted small d-block">Registering as:</span>
                          <strong style={{ color: "#001a4d" }}>{formData.userType}</strong>
                        </div>
                        <button type="button" onClick={() => setFormData(p => ({ ...p, userType: "" }))} className="btn btn-sm btn-outline-secondary" style={{ fontSize: "11px" }}>
                          Change
                        </button>
                      </div>
                    )}

                    {/* PASSWORD */}
                    <div className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <label className="form-label fw-semibold mb-0" style={{ color: "var(--text-color)", fontSize: "0.88rem" }}>
                          {t("passwordLabel")}
                        </label>
                        {mode === "login" && (
                          <a href="#" className="text-decoration-none" style={{ fontSize: "0.8rem", color: "#c4122f" }}>
                            {t("forgotPassword")}
                          </a>
                        )}
                      </div>
                      <div className="input-group">
                        <span
                          className="input-group-text"
                          style={{ borderRadius: "10px 0 0 10px", backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-color)" }}
                        >
                          <i className="bi bi-lock"></i>
                        </span>
                        <input
                          type={showPassword ? "text" : "password"}
                          name="password"
                          value={formData.password}
                          onChange={handleInputChange}
                          className={`form-control ${errors.password ? "is-invalid" : ""}`}
                          placeholder="••••••••"
                          disabled={loading}
                          style={{ borderRadius: "0", padding: "12px 14px", fontSize: "0.92rem" }}
                        />
                        <button
                          type="button"
                          className="input-group-text"
                          onClick={() => setShowPassword((p) => !p)}
                          style={{ borderRadius: "0 10px 10px 0", backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", color: "var(--text-color)" }}
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
                        <label className="form-label fw-semibold" style={{ color: "#001a4d", fontSize: "0.88rem" }}>
                          {t("confirmPasswordLabel")}
                        </label>
                        <div className="input-group">
                          <span
                            className="input-group-text"
                            style={{ borderRadius: "10px 0 0 10px", backgroundColor: "#f8f9fa", border: "1px solid #dee2e6", color: "#6c757d" }}
                          >
                            <i className="bi bi-lock-fill"></i>
                          </span>
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleInputChange}
                            className={`form-control ${errors.confirmPassword ? "is-invalid" : ""}`}
                            placeholder="••••••••"
                            disabled={loading}
                            style={{ borderRadius: "0", padding: "12px 14px", fontSize: "0.92rem" }}
                          />
                          <button
                            type="button"
                            className="input-group-text"
                            onClick={() => setShowConfirmPassword((p) => !p)}
                            style={{ borderRadius: "0 10px 10px 0", backgroundColor: "#f8f9fa", border: "1px solid #dee2e6", cursor: "pointer", color: "#6c757d" }}
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
                      className="btn btn-danger w-100 fw-bold"
                      style={{
                        borderRadius: "10px",
                        padding: "13px",
                        fontSize: "1rem",
                        backgroundColor: loading ? "#6c757d" : "#c4122f",
                        border: "none",
                        transition: "all 0.2s ease",
                        letterSpacing: "0.5px",
                      }}
                      onMouseOver={(e) => { if (!loading) e.currentTarget.style.backgroundColor = "#a30f27"; }}
                      onMouseOut={(e) => { if (!loading) e.currentTarget.style.backgroundColor = "#c4122f"; }}
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
                    <div className="text-center mt-4" style={{ fontSize: "0.88rem", color: "#6c757d" }}>
                      {mode === "login" ? (
                        <>
                          {t("dontHaveAccount")}{" "}
                          <button
                            type="button"
                            onClick={() => switchMode("register")}
                            disabled={loading}
                            style={{ background: "none", border: "none", color: "#001a4d", fontWeight: "700", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                          >
                            {t("registerHere")}
                          </button>
                        </>
                      ) : (
                        <>
                          {t("alreadyHaveAccount")}{" "}
                          <button
                            type="button"
                            onClick={() => switchMode("login")}
                            disabled={loading}
                            style={{ background: "none", border: "none", color: "#001a4d", fontWeight: "700", cursor: "pointer", padding: 0, textDecoration: "underline" }}
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
                <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                  {t("areYouAdminQ")}{" "}
                  <a href="/admin" style={{ color: "#c4122f", fontWeight: "700", textDecoration: "underline" }}>
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