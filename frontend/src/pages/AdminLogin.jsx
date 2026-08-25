import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import { supabase } from "../services/supabaseClient";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Authenticate via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: formData.email.trim(),
        password: formData.password.trim(),
      });

      if (authError || !authData.user) {
        console.error("Auth Error:", authError);
        throw new Error(authError?.message || "Invalid credentials. Please try again.");
      }

      // Check role — only admins/super_admins can access admin portal
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("role")
        .eq("user_id", authData.user.id)
        .single();

      const allowedRoles = ["super_admin", "admin", "hr", "safety", "compliance"];
      if (userError || !allowedRoles.includes(userData?.role)) {
        await supabase.auth.signOut();
        setError("Access denied. This portal is for administrators only.");
        setIsLoading(false);
        return;
      }

      // Redirect to admin dashboard
      navigate("/admin/dashboard");

    } catch (err) {
      setError(err.message || "Failed to connect to server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mt-5 mb-5">
      <div className="row justify-content-center">
        <div className="col-md-5">
          <div className="card shadow-lg p-5 border-0" style={{ borderRadius: "16px" }}>
            <div className="text-center mb-4">
              <div className="mx-auto mb-3 d-flex justify-content-center align-items-center bg-light rounded-circle" style={{ width: "60px", height: "60px", color: "#001a4d" }}>
                <svg width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h3 className="fw-bold mb-1" style={{ color: "#001a4d" }}>{t("adminPortalTitle")}</h3>
              <p className="text-muted small">{t("adminSecureAccess")}</p>
            </div>

            {error && (
              <div className="alert alert-danger py-2 text-center fw-semibold" style={{ fontSize: "14px" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="fw-semibold small mb-1">Email</label>
                <input
                  type="email"
                  className="form-control bg-light"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="admin@puravankara.com"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="fw-semibold small mb-1">{t("adminPassword")}</label>
                <input
                  type="password"
                  className="form-control bg-light"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
              <button 
                type="submit" 
                disabled={isLoading}
                className="btn w-100 py-2 fw-bold text-white shadow-sm" 
                style={{ backgroundColor: "#001a4d" }}
              >
                {isLoading ? "Authenticating..." : t("authenticate")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
