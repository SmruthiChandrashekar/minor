import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../services/supabaseClient";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    // Clear any stale Supabase sessions on login page load
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
      if (!formData.confirmPassword) newErrors.confirmPassword = "Confirm Password is required.";
      if (formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const parseError = (err) => {
    // Detect raw Supabase/PostgREST JSON error objects
    try {
      const parsed = typeof err.message === "string" ? JSON.parse(err.message) : err.message;
      if (parsed && parsed.code === "PGRST303") return "Your session has expired. Please log in again.";
      if (parsed && parsed.message) return parsed.message;
    } catch (_) {}
    
    // Map common known errors to friendly messages
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
        const { error: insertError } = await supabase
          .from("users")
          .insert([
            {
              user_id: data.user.id,
              name: formData.name,
              email: formData.email,
              user_type: formData.userType,
            }
          ]);

        if (insertError) throw insertError;

        setMessage({ type: "success", text: "Registration successful! Redirecting to dashboard..." });
        setTimeout(() => {
          window.location.href = "/";
        }, 1500);
      }
    } catch (err) {
      setMessage({ type: "error", text: parseError(err) });
    }
  };

  const loginUser = async () => {
    try {
      // STEP 1: Try direct Supabase Auth (works for users registered via Supabase)
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (!authError && authData?.user) {
        // Supabase login succeeded — fetch role from users table
        const { data: userData } = await supabase
          .from("users")
          .select("*")
          .eq("email", formData.email)
          .single();

        if (userData?.role === "admin") {
          localStorage.setItem("admin_user", JSON.stringify(userData));
          setMessage({ type: "success", text: "Admin login successful! Redirecting..." });
          setTimeout(() => { window.location.href = "/admin/dashboard"; }, 1000);
        } else {
          setMessage({ type: "success", text: "Login successful!" });
          setTimeout(() => { window.location.href = "/"; }, 1000);
        }
        return;
      }

      // STEP 2: Supabase Auth failed — try FastAPI backend (for admins with bcrypt passwords)
      const response = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Invalid email or password. Please try again.");
      }

      if (data.user?.role === "admin") {
        localStorage.setItem("admin_user", JSON.stringify(data.user));
        setMessage({ type: "success", text: "Admin login successful! Redirecting..." });
        setTimeout(() => { window.location.href = "/admin/dashboard"; }, 1000);
      } else {
        setMessage({ type: "success", text: "Login successful!" });
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

    if (mode === "register") {
      await registerUser();
    } else {
      await loginUser();
    }
    
    setLoading(false);
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setErrors({});
    setMessage({ type: "", text: "" });
    setFormData({
      userType: "",
      email: "",
      password: "",
      name: "",
      confirmPassword: "",
    });
  };

  const activeTabStyle = {
    flex: 1,
    padding: "10px",
    cursor: "pointer",
    backgroundColor: "#007bff",
    color: "white",
    border: "1px solid #007bff",
    fontWeight: "bold",
    borderRadius: mode === "login" ? "4px 0 0 0" : "0 4px 0 0",
  };

  const inactiveTabStyle = {
    flex: 1,
    padding: "10px",
    cursor: "pointer",
    backgroundColor: "#f8f9fa",
    color: "#6c757d",
    border: "1px solid #dee2e6",
    borderRadius: mode === "login" ? "0 4px 0 0" : "4px 0 0 0",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px",
    marginBottom: "4px",
    borderRadius: "4px",
    border: "1px solid #ced4da",
    boxSizing: "border-box",
  };

  const errorStyle = {
    color: "#dc3545",
    fontSize: "12px",
    marginBottom: "12px",
    display: "block",
  };

  return (
    <div style={{ maxWidth: "420px", margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", borderBottom: "none" }}>
        <button 
          type="button"
          style={mode === "login" ? activeTabStyle : inactiveTabStyle} 
          onClick={() => switchMode("login")}
          disabled={loading}
        >
          Login
        </button>
        <button 
          type="button"
          style={mode === "register" ? activeTabStyle : inactiveTabStyle} 
          onClick={() => switchMode("register")}
          disabled={loading}
        >
          Register
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          border: "1px solid #dee2e6",
          borderTop: "none",
          padding: "24px",
          borderRadius: "0 0 4px 4px",
          backgroundColor: "#fff",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "20px", textAlign: "center" }}>
          {mode === "login" ? "Login to your account" : "Create an account"}
        </h2>

        {message.text && (
          <div style={{ 
            padding: "12px", 
            marginBottom: "16px", 
            borderRadius: "4px",
            backgroundColor: message.type === "success" ? "#d4edda" : (message.type === "info" ? "#e3f2fd" : "#f8d7da"),
            color: message.type === "success" ? "#155724" : (message.type === "info" ? "#001a4d" : "#721c24"),
            border: `1px solid ${message.type === "success" ? "#c3e6cb" : (message.type === "info" ? "#b8daff" : "#f5c6cb")}`,
            fontSize: "14px",
            textAlign: "center"
          }}>
            {message.text}
          </div>
        )}

        {mode === "register" && (
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Full Name</label>
            <input type="text" name="name" value={formData.name} onChange={handleInputChange} style={inputStyle} disabled={loading} />
            {errors.name ? <span style={errorStyle}>{errors.name}</span> : <div style={{ height: "12px", marginBottom: "12px" }} />}
          </div>
        )}

        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Email Address</label>
          <input type="email" name="email" value={formData.email} onChange={handleInputChange} style={inputStyle} disabled={loading} />
          {errors.email ? <span style={errorStyle}>{errors.email}</span> : <div style={{ height: "12px", marginBottom: "12px" }} />}
        </div>

        {mode === "register" && (
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>User Type</label>
            <select name="userType" value={formData.userType} onChange={handleInputChange} style={inputStyle} disabled={loading}>
              <option value="">Select User Type</option>
              <option value="Internal">Internal Employees</option>
              <option value="Contract">Contract Workforce</option>
              <option value="External">External Stakeholders</option>
            </select>
            {errors.userType ? <span style={errorStyle}>{errors.userType}</span> : <div style={{ height: "12px", marginBottom: "12px" }} />}
          </div>
        )}

        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Password</label>
          <input type="password" name="password" value={formData.password} onChange={handleInputChange} style={inputStyle} disabled={loading} />
          {errors.password ? <span style={errorStyle}>{errors.password}</span> : <div style={{ height: "12px", marginBottom: "12px" }} />}
        </div>

        {mode === "register" && (
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Confirm Password</label>
            <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange} style={inputStyle} disabled={loading} />
            {errors.confirmPassword ? <span style={errorStyle}>{errors.confirmPassword}</span> : <div style={{ height: "12px", marginBottom: "12px" }} />}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: loading ? "#6c757d" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "16px",
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
            marginTop: "8px",
            transition: "background-color 0.2s"
          }}
        >
          {loading ? "Processing..." : (mode === "login" ? "Login" : "Register")}
        </button>

        <div style={{ textAlign: "center", marginTop: "20px", fontSize: "14px" }}>
          {mode === "login" ? (
            <p style={{ margin: 0 }}>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("register")}
                disabled={loading}
                style={{ background: "none", border: "none", color: loading ? "#6c757d" : "#007bff", cursor: loading ? "not-allowed" : "pointer", padding: 0, textDecoration: "underline", fontSize: "14px" }}
              >
                Register
              </button>
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("login")}
                disabled={loading}
                style={{ background: "none", border: "none", color: loading ? "#6c757d" : "#007bff", cursor: loading ? "not-allowed" : "pointer", padding: 0, textDecoration: "underline", fontSize: "14px" }}
              >
                Login
              </button>
            </p>
          )}
        </div>
      </form>
    </div>
  );
};

export default Auth;