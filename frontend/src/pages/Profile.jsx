import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthProvider";
import { useLanguage } from "../context/LanguageContext";
import { supabase } from "../services/supabaseClient";
import { apiClient } from "../services/api";
import { Link, useNavigate } from "react-router-dom";

function Profile() {
  const { user, userDetails, isAdmin, isSuperAdmin, refreshUserDetails, updateUserDetailsLocally } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const fileInputRef = useRef(null);

  // User classification
  const userType = userDetails?.user_type || "Internal"; // "Internal" | "Contract" | "External"
  const isExternal = userType === "External" && !isAdmin;
  const isContract = userType === "Contract" && !isAdmin;
  const isInternal = (userType === "Internal" || !userType) && !isAdmin;

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    alternate_phone: "",
    avatar_url: "",
    // Internal & Admin fields
    designation: "",
    employee_id: "",
    department: "",
    location: "",
    bio: "",
    // Contract fields
    agency_name: "",
    // External fields
    stakeholder_type: "",
    associated_project: "",
    preferred_contact_method: "Email",
    // Emergency / Secondary contact
    emergency_contact_name: "",
    emergency_contact_phone: ""
  });

  const [activeTab, setActiveTab] = useState("info"); // "info" | "contacts" | "security"
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Sync state with userDetails
  useEffect(() => {
    if (userDetails) {
      setFormData({
        name: userDetails.name || "",
        email: userDetails.email || user?.email || "",
        phone: userDetails.phone || "",
        alternate_phone: userDetails.alternate_phone || "",
        avatar_url: userDetails.avatar_url || "",
        designation: userDetails.designation || "",
        employee_id: userDetails.employee_id || (isInternal ? userDetails.department : "") || "",
        department: userDetails.department || "",
        location: userDetails.location || (isExternal ? userDetails.department : "") || "",
        bio: userDetails.bio || "",
        agency_name: userDetails.agency_name || (isContract ? userDetails.department : "") || "",
        stakeholder_type: userDetails.stakeholder_type || (isExternal ? "Homebuyer / Property Owner" : ""),
        associated_project: userDetails.associated_project || "",
        preferred_contact_method: userDetails.preferred_contact_method || "Email",
        emergency_contact_name: userDetails.emergency_contact_name || "",
        emergency_contact_phone: userDetails.emergency_contact_phone || ""
      });
    } else if (user) {
      setFormData(prev => ({
        ...prev,
        email: user.email || ""
      }));
    }
  }, [userDetails, user, isExternal, isContract, isInternal]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: "danger", message: "File size exceeds 5MB limit." });
      return;
    }

    setUploadingAvatar(true);
    setFeedback({ type: "", message: "" });

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `avatars/${user.id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
      updateUserDetailsLocally({ avatar_url: publicUrl });

      await supabase
        .from("users")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);

      await refreshUserDetails();
      setFeedback({ type: "success", message: "Profile photo updated successfully!" });
    } catch (err) {
      console.error("Avatar upload error:", err);
      setFeedback({ type: "danger", message: "Failed to upload photo." });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    if (!window.confirm("Are you sure you want to remove your profile photo?")) return;

    setUploadingAvatar(true);
    try {
      setFormData(prev => ({ ...prev, avatar_url: "" }));
      updateUserDetailsLocally({ avatar_url: null });

      await supabase
        .from("users")
        .update({ avatar_url: null })
        .eq("user_id", user.id);

      await refreshUserDetails();
      setFeedback({ type: "success", message: "Profile photo removed." });
    } catch (err) {
      console.error(err);
      setFeedback({ type: "danger", message: "Failed to remove avatar." });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFeedback({ type: "", message: "" });

    try {
      // Build tailored payload based on user type
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        alternate_phone: formData.alternate_phone.trim() || null,
        location: formData.location.trim() || null,
        bio: formData.bio.trim() || null,
        emergency_contact_name: formData.emergency_contact_name.trim() || null,
        emergency_contact_phone: formData.emergency_contact_phone.trim() || null,
      };

      if (isExternal) {
        // External specific
        payload.stakeholder_type = formData.stakeholder_type || null;
        payload.associated_project = formData.associated_project.trim() || null;
        payload.preferred_contact_method = formData.preferred_contact_method || null;
        // Do not include internal job title/designation
        payload.designation = null;
      } else if (isContract) {
        // Contract specific
        payload.agency_name = formData.agency_name.trim() || null;
        payload.designation = formData.designation.trim() || null; // trade / skill role
        payload.associated_project = formData.associated_project.trim() || null; // site location
      } else {
        // Internal / Admin
        payload.designation = formData.designation.trim() || null;
        payload.employee_id = formData.employee_id.trim() || null;
      }

      const res = await apiClient("/api/profile/me", {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const { error } = await supabase
          .from("users")
          .update(payload)
          .eq("user_id", user.id);
        if (error) throw error;
      }

      updateUserDetailsLocally(payload);
      await refreshUserDetails();

      setFeedback({ type: "success", message: "Profile updated successfully!" });
      setTimeout(() => setFeedback({ type: "", message: "" }), 5000);
    } catch (err) {
      console.error("Save profile error:", err);
      setFeedback({ 
        type: "danger", 
        message: "Error updating profile. Please ensure database migration 012_add_user_profile_fields.sql is executed." 
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    try {
      const emailToReset = formData.email || user?.email;
      if (!emailToReset) return;

      const { error } = await supabase.auth.resetPasswordForEmail(emailToReset, {
        redirectTo: `${window.location.origin}/login`
      });

      if (error) throw error;
      setResetEmailSent(true);
      setTimeout(() => setResetEmailSent(false), 8000);
    } catch (err) {
      console.error("Password reset error:", err);
      alert("Failed to send password reset email: " + err.message);
    }
  };

  const handleCopyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  // Badge config based on persona
  const getProfileBadges = () => {
    if (isSuperAdmin) {
      return {
        role: { label: "Super Administrator", bg: "#d32f2f", color: "#fff" },
        deptLabel: userDetails?.department || "Executive",
        isInternalRole: true
      };
    }
    if (isAdmin) {
      const tierText = userDetails?.admin_tier ? ` (${userDetails.admin_tier})` : "";
      return {
        role: { label: `Admin${tierText}`, bg: "#001a4d", color: "#fff" },
        deptLabel: userDetails?.department,
        isInternalRole: true
      };
    }
    if (isContract) {
      return {
        role: { label: "Contract Workforce", bg: "#001a4d", color: "#fff" },
        deptLabel: formData.agency_name || userDetails?.department || "Contract Partner",
        isInternalRole: false
      };
    }
    if (isExternal) {
      return {
        role: { label: "External Stakeholder", bg: "#001a4d", color: "#fff" },
        deptLabel: null,
        cityLabel: formData.location || userDetails?.department,
        isInternalRole: false
      };
    }
    // Default: Internal Employee
    return {
      role: { label: "Internal Employee", bg: "#001a4d", color: "#fff" },
      deptLabel: userDetails?.department || "General",
      isInternalRole: true
    };
  };

  const badges = getProfileBadges();

  return (
    <div className="container py-5" style={{ minHeight: "85vh" }}>

      {/* BREADCRUMB */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb mb-1">
              <li className="breadcrumb-item">
                <Link to={isAdmin ? "/admin/dashboard" : "/dashboard"} className="text-decoration-none">
                  {isAdmin ? "Admin Portal" : "Dashboard"}
                </Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page" style={{ color: "var(--text-color)" }}>
                {isExternal ? "Stakeholder Profile" : (isContract ? "Contractor Profile" : "Profile")}
              </li>
            </ol>
          </nav>
          <h2 className="fw-bold mb-0" style={{ color: "var(--text-color)" }}>
            {isExternal ? "Stakeholder Profile" : (isContract ? "Workforce Profile" : "Account Profile")}
          </h2>
        </div>

        <button 
          onClick={() => navigate(isAdmin ? "/admin/dashboard" : "/dashboard")} 
          className="btn btn-outline-secondary btn-sm rounded-pill px-3"
        >
          ← Back to Dashboard
        </button>
      </div>

      {/* FEEDBACK ALERT */}
      {feedback.message && (
        <div className={`alert alert-dark border-0 shadow-sm`} role="alert" style={{ background: "#001a4d", color: "#fff" }}>
          {feedback.message}
          <button type="button" className="btn-close btn-close-white" onClick={() => setFeedback({ type: "", message: "" })}></button>
        </div>
      )}

      {/* TOP PROFILE HERO CARD */}
      <div 
        className="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden" 
        style={{ background: "var(--card-bg)" }}
      >
        {/* BANNER HEADER */}
        <div style={{
          height: "135px",
          background: "linear-gradient(135deg, #001a4d 0%, #003366 100%)",
          position: "relative"
        }}>
          <div style={{
            position: "absolute", right: "20px", top: "20px",
            color: "rgba(255,255,255,0.15)", fontSize: "65px", fontWeight: "900",
            userSelect: "none", lineHeight: 1
          }}>
            GRM
          </div>
        </div>

        {/* AVATAR + DETAILS ROW */}
        <div className="px-4 pb-4" style={{ marginTop: "-60px" }}>
          <div className="d-flex flex-column flex-md-row align-items-md-end justify-content-between gap-3">
            
            {/* AVATAR & NAME */}
            <div className="d-flex align-items-end gap-3">
              <div style={{ position: "relative" }}>
                <div 
                  className="rounded-circle shadow-lg d-flex align-items-center justify-content-center"
                  style={{
                    width: "115px",
                    height: "115px",
                    backgroundColor: "#001a4d",
                    border: "4px solid var(--card-bg)",
                    overflow: "hidden",
                    position: "relative"
                  }}
                >
                  {formData.avatar_url ? (
                    <img 
                      src={formData.avatar_url} 
                      alt={formData.name || "User Avatar"} 
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                    />
                  ) : (
                    <span style={{ fontSize: "2.6rem", color: "#fff", fontWeight: "bold" }}>
                      {formData.name ? formData.name.charAt(0).toUpperCase() : (user?.email?.charAt(0).toUpperCase() || "U")}
                    </span>
                  )}

                  {uploadingAvatar && (
                    <div 
                      style={{
                        position: "absolute", inset: 0,
                        backgroundColor: "rgba(0,0,0,0.6)",
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}
                    >
                      <div className="spinner-border text-light spinner-border-sm" role="status"></div>
                    </div>
                  )}
                </div>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleAvatarSelect} 
                  accept="image/jpeg,image/png,image/webp" 
                  className="d-none" 
                />

                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-sm btn-primary rounded-circle shadow position-absolute"
                  style={{
                    bottom: "4px",
                    right: "4px",
                    width: "34px",
                    height: "34px",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #001a4d 0%, #003366 100%)",
                    border: "2px solid var(--card-bg)"
                  }}
                  title="Upload profile photo"
                  disabled={uploadingAvatar}
                >
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/>
                    <path d="M2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4H2zm.5 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm9 2.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z"/>
                  </svg>
                </button>
              </div>

              {/* USERNAME & BADGES */}
              <div>
                <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                  <h3 className="fw-bold mb-0" style={{ color: "var(--text-color)" }}>
                    {formData.name || "User Profile"}
                  </h3>
                  
                  {/* Persona Badge */}
                  <span 
                    className="badge rounded-pill px-3 py-1"
                    style={{ backgroundColor: badges.role.bg, color: badges.role.color, fontSize: "12px", fontWeight: "600" }}
                  >
                    {badges.role.label}
                  </span>

                  {/* Department Badge (only for Internal/Admin) */}
                  {badges.deptLabel && (
                    <span className="badge bg-secondary-subtle text-secondary rounded-pill px-3 py-1" style={{ fontSize: "12px" }}>
                      {badges.deptLabel}
                    </span>
                  )}

                  {/* City Badge (for External Stakeholder) */}
                  {isExternal && badges.cityLabel && (
                    <span className="badge bg-secondary-subtle text-secondary rounded-pill px-3 py-1" style={{ fontSize: "12px" }}>
                      Location: {badges.cityLabel}
                    </span>
                  )}

                  {/* Trade / Role badge for contract */}
                  {isContract && formData.designation && (
                    <span className="badge bg-warning-subtle text-warning-emphasis rounded-pill px-3 py-1" style={{ fontSize: "12px" }}>
                      Trade: {formData.designation}
                    </span>
                  )}
                </div>

                <p className="text-muted mb-0 small">
                  {formData.email} • {isExternal ? "Puravankara Customer / Stakeholder" : (isContract ? "Partner Workforce" : "Puravankara Team")}
                </p>
              </div>
            </div>

            {/* AVATAR ACTIONS */}
            <div className="d-flex gap-2">
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-outline-primary btn-sm rounded-pill px-3 d-flex align-items-center gap-1"
                disabled={uploadingAvatar}
                style={{ borderColor: "#002b66", color: "#002b66" }}
              >
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                  <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
                </svg>
                {formData.avatar_url ? "Change Photo" : "Upload Photo"}
              </button>

              {formData.avatar_url && (
                <button 
                  type="button" 
                  onClick={handleRemoveAvatar}
                  className="btn btn-outline-danger btn-sm rounded-pill px-3"
                  disabled={uploadingAvatar}
                >
                  Remove
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="row g-4">

        {/* LEFT COLUMN: FORM TABS */}
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm rounded-4" style={{ background: "var(--card-bg)" }}>
            
            {/* TABS */}
            <div className="border-bottom px-4 pt-3 d-flex gap-3">
              <button
                type="button"
                className={`btn btn-sm rounded-0 border-0 pb-3 fw-bold ${activeTab === 'info' ? 'text-primary' : 'text-muted'}`}
                style={{
                  borderBottom: activeTab === 'info' ? '3px solid #002b66' : '3px solid transparent',
                  color: activeTab === 'info' ? '#002b66' : undefined,
                  fontSize: '14.5px'
                }}
                onClick={() => setActiveTab('info')}
              >
                {isExternal ? "Contact & Relationship Details" : (isContract ? "Contractor & Trade Details" : "Professional & Contact Info")}
              </button>

              <button
                type="button"
                className={`btn btn-sm rounded-0 border-0 pb-3 fw-bold ${activeTab === 'contacts' ? 'text-primary' : 'text-muted'}`}
                style={{
                  borderBottom: activeTab === 'contacts' ? '3px solid #002b66' : '3px solid transparent',
                  color: activeTab === 'contacts' ? '#002b66' : undefined,
                  fontSize: '14.5px'
                }}
                onClick={() => setActiveTab('contacts')}
              >
                {isExternal ? "Alternate Contacts & Preferences" : "Emergency & Reporting Contacts"}
              </button>

              <button
                type="button"
                className={`btn btn-sm rounded-0 border-0 pb-3 fw-bold ${activeTab === 'security' ? 'text-primary' : 'text-muted'}`}
                style={{
                  borderBottom: activeTab === 'security' ? '3px solid #002b66' : '3px solid transparent',
                  color: activeTab === 'security' ? '#002b66' : undefined,
                  fontSize: '14.5px'
                }}
                onClick={() => setActiveTab('security')}
              >
                Account & Security
              </button>
            </div>

            {/* TAB CONTENT BODY */}
            <div className="card-body p-4">
              <form onSubmit={handleSubmit}>

                {/* ══════════════════════════════════════════════════════════════════
                    TAB 1: TAILORED INFORMATION
                    ══════════════════════════════════════════════════════════════════ */}
                {activeTab === "info" && (
                  <div className="row g-3">
                    
                    {/* FULL NAME */}
                    <div className="col-md-6">
                      <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Full Name *</label>
                      <input 
                        type="text" 
                        name="name"
                        className="form-control"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        placeholder="Enter full name"
                      />
                    </div>

                    {/* EMAIL */}
                    <div className="col-md-6">
                      <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Email Address</label>
                      <input 
                        type="email" 
                        name="email"
                        className="form-control"
                        value={formData.email}
                        disabled
                        style={{ backgroundColor: "rgba(0,0,0,0.03)", opacity: 0.85 }}
                      />
                      <span className="text-muted" style={{ fontSize: "11px" }}>Email is linked to your login credentials.</span>
                    </div>

                    {/* PRIMARY PHONE */}
                    <div className="col-md-6">
                      <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Primary Phone Number</label>
                      <input 
                        type="tel" 
                        name="phone"
                        className="form-control"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+91 98765 43210"
                      />
                    </div>

                    {/* ── CASE A: EXTERNAL STAKEHOLDER (Homebuyer, Customer, Vendor, Resident) ── */}
                    {isExternal && (
                      <>
                        <div className="col-md-6">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Stakeholder Category *</label>
                          <select 
                            name="stakeholder_type" 
                            className="form-select"
                            value={formData.stakeholder_type}
                            onChange={handleChange}
                          >
                            <option value="Homebuyer / Property Owner">Homebuyer / Property Owner</option>
                            <option value="Resident / Tenant">Resident / Tenant</option>
                            <option value="Prospective Buyer">Prospective Buyer</option>
                            <option value="External Vendor / Supplier">External Vendor / Supplier</option>
                            <option value="Neighboring Community / Citizen">Neighboring Community / Citizen</option>
                            <option value="Other Stakeholder">Other Stakeholder</option>
                          </select>
                        </div>

                        <div className="col-md-6">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Associated Property / Project Name</label>
                          <input 
                            type="text" 
                            name="associated_project"
                            className="form-control"
                            value={formData.associated_project}
                            onChange={handleChange}
                            placeholder="e.g. Purva Silversands (Unit 402) / Purva Bliss"
                          />
                          <span className="text-muted" style={{ fontSize: "11px" }}>Property or site related to your interaction or grievance.</span>
                        </div>

                        <div className="col-md-6">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>City / Residential Location</label>
                          <input 
                            type="text" 
                            name="location"
                            className="form-control"
                            value={formData.location}
                            onChange={handleChange}
                            placeholder="e.g. Bengaluru, Mumbai, Pune"
                          />
                        </div>

                        <div className="col-12">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Notes / Remarks (Optional)</label>
                          <textarea 
                            name="bio"
                            className="form-control"
                            rows="3"
                            value={formData.bio}
                            onChange={handleChange}
                            placeholder="Add any relevant notes regarding your relationship with Puravankara..."
                          />
                        </div>
                      </>
                    )}

                    {/* ── CASE B: CONTRACT WORKFORCE (Agency, Trade role, Site) ── */}
                    {isContract && (
                      <>
                        <div className="col-md-6">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Contracting Agency / Company</label>
                          <input 
                            type="text" 
                            name="agency_name"
                            className="form-control"
                            value={formData.agency_name}
                            onChange={handleChange}
                            placeholder="e.g. BuildTech Infra Services / Security Guard Agency"
                          />
                        </div>

                        <div className="col-md-6">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Trade / Workforce Role *</label>
                          <input 
                            type="text" 
                            name="designation"
                            className="form-control"
                            value={formData.designation}
                            onChange={handleChange}
                            placeholder="e.g. Site Electrician / Safety Marshal / Mason"
                          />
                        </div>

                        <div className="col-md-6">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Assigned Project / Site Location</label>
                          <input 
                            type="text" 
                            name="location"
                            className="form-control"
                            value={formData.location}
                            onChange={handleChange}
                            placeholder="e.g. Purva Codename Bliss Construction Site"
                          />
                        </div>

                        <div className="col-md-6">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Contractor / Worker ID</label>
                          <input 
                            type="text" 
                            name="associated_project"
                            className="form-control"
                            value={formData.associated_project}
                            onChange={handleChange}
                            placeholder="e.g. CON-8421"
                          />
                        </div>

                        <div className="col-12">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Work Notes & Skills Summary</label>
                          <textarea 
                            name="bio"
                            className="form-control"
                            rows="3"
                            value={formData.bio}
                            onChange={handleChange}
                            placeholder="Briefly describe your site responsibilities, shift schedule, or trade..."
                          />
                        </div>
                      </>
                    )}

                    {/* ── CASE C: INTERNAL EMPLOYEE & ADMIN STAFF ── */}
                    {(isInternal || isAdmin) && (
                      <>
                        <div className="col-md-6">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Job Title / Designation *</label>
                          <input 
                            type="text" 
                            name="designation"
                            className="form-control"
                            value={formData.designation}
                            onChange={handleChange}
                            placeholder="e.g. Senior Project Engineer / Operations Lead"
                          />
                        </div>

                        <div className="col-md-6">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Employee ID</label>
                          <input 
                            type="text" 
                            name="employee_id"
                            className="form-control"
                            value={formData.employee_id}
                            onChange={handleChange}
                            placeholder="e.g. PUR-10928"
                          />
                        </div>

                        <div className="col-md-6">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Base Office / Branch Location</label>
                          <input 
                            type="text" 
                            name="location"
                            className="form-control"
                            value={formData.location}
                            onChange={handleChange}
                            placeholder="e.g. Puravankara Corporate Office, Bengaluru"
                          />
                        </div>

                        <div className="col-12">
                          <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Professional Bio / Role Overview</label>
                          <textarea 
                            name="bio"
                            className="form-control"
                            rows="3"
                            value={formData.bio}
                            onChange={handleChange}
                            placeholder="Brief description of your key responsibilities and department deliverables..."
                          />
                        </div>
                      </>
                    )}

                  </div>
                )}

                {/* ══════════════════════════════════════════════════════════════════
                    TAB 2: CONTACTS & PREFERENCES
                    ══════════════════════════════════════════════════════════════════ */}
                {activeTab === "contacts" && (
                  <div className="row g-3">
                    
                    <div className="col-md-6">
                      <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Alternate / Secondary Phone Number</label>
                      <input 
                        type="tel" 
                        name="alternate_phone"
                        className="form-control"
                        value={formData.alternate_phone}
                        onChange={handleChange}
                        placeholder="+91 80 1234 5678"
                      />
                    </div>

                    {isExternal && (
                      <div className="col-md-6">
                        <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>Preferred Communication Channel</label>
                        <select 
                          name="preferred_contact_method" 
                          className="form-select"
                          value={formData.preferred_contact_method}
                          onChange={handleChange}
                        >
                          <option value="Email">Email</option>
                          <option value="Phone Call">Phone Call</option>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="SMS">SMS Notification</option>
                        </select>
                      </div>
                    )}

                    <div className="col-12 pt-3 border-top mt-3">
                      <h6 className="fw-bold mb-1" style={{ color: "var(--text-color)" }}>
                        {isExternal ? "Secondary Point of Contact (Optional)" : "Emergency Contact Details"}
                      </h6>
                      <p className="text-muted small mb-3">
                        {isExternal 
                          ? "Designate a secondary family member, co-owner, or authorized representative for communications."
                          : "In case of any urgent site or safety incident, this contact will be notified."}
                      </p>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>
                        {isExternal ? "Contact Person Name" : "Emergency Contact Name"}
                      </label>
                      <input 
                        type="text" 
                        name="emergency_contact_name"
                        className="form-control"
                        value={formData.emergency_contact_name}
                        onChange={handleChange}
                        placeholder="Full Name"
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-semibold" style={{ color: "var(--text-color)" }}>
                        {isExternal ? "Contact Number & Relationship" : "Contact Number & Relationship"}
                      </label>
                      <input 
                        type="text" 
                        name="emergency_contact_phone"
                        className="form-control"
                        value={formData.emergency_contact_phone}
                        onChange={handleChange}
                        placeholder="+91 98765 43210 (Spouse / Lead / Co-owner)"
                      />
                    </div>

                    {/* Department info for internal/admin */}
                    {!isExternal && (
                      <div className="col-12 pt-3 border-top mt-3">
                        <h6 className="fw-bold mb-3" style={{ color: "var(--text-color)" }}>Organization Summary</h6>
                        <div className="row g-3">
                          <div className="col-md-4">
                            <div className="p-3 rounded-3 bg-light border">
                              <span className="text-muted small d-block">Department / Queue</span>
                              <strong style={{ color: "var(--text-color)" }}>{userDetails?.department || "General"}</strong>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div className="p-3 rounded-3 bg-light border">
                              <span className="text-muted small d-block">Classification</span>
                              <strong style={{ color: "var(--text-color)" }}>{userType}</strong>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div className="p-3 rounded-3 bg-light border">
                              <span className="text-muted small d-block">Operational Tier</span>
                              <strong style={{ color: "var(--text-color)" }}>{userDetails?.admin_tier || "Standard"}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* ══════════════════════════════════════════════════════════════════
                    TAB 3: ACCOUNT & SECURITY
                    ══════════════════════════════════════════════════════════════════ */}
                {activeTab === "security" && (
                  <div>
                    <div className="mb-4">
                      <h6 className="fw-bold mb-2" style={{ color: "var(--text-color)" }}>Password & Access</h6>
                      <p className="text-muted small mb-3">Manage authentication and password security.</p>
                      
                      <div className="p-3 rounded-3 bg-light border d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div>
                          <strong className="d-block text-dark">Password Reset</strong>
                          <span className="text-muted small">Send a secure reset link to your registered email address.</span>
                        </div>
                        <button
                          type="button"
                          onClick={handlePasswordReset}
                          disabled={resetEmailSent}
                          className="btn btn-sm btn-outline-danger px-3 rounded-pill fw-semibold"
                        >
                          {resetEmailSent ? "Reset Link Sent" : "Send Password Reset Email"}
                        </button>
                      </div>

                      {resetEmailSent && (
                        <div className="alert alert-success mt-2 small py-2">
                          Password reset link has been dispatched to <strong>{formData.email}</strong>. Please check your inbox.
                        </div>
                      )}
                    </div>

                    <div className="mb-3">
                      <h6 className="fw-bold mb-2" style={{ color: "var(--text-color)" }}>System User ID</h6>
                      <div className="input-group">
                        <input 
                          type="text" 
                          className="form-control font-monospace small" 
                          value={user?.id || ""} 
                          readOnly 
                          style={{ backgroundColor: "rgba(0,0,0,0.03)" }}
                        />
                        <button 
                          className="btn btn-outline-secondary" 
                          type="button" 
                          onClick={handleCopyId}
                        >
                          {copiedId ? "Copied!" : "Copy User ID"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUBMIT BUTTON */}
                <div className="pt-4 border-top mt-4 d-flex justify-content-end gap-2">
                  <button 
                    type="submit" 
                    className="btn btn-primary px-4 py-2 fw-semibold rounded-pill shadow-sm"
                    disabled={loading}
                    style={{ background: "linear-gradient(135deg, #001a4d 0%, #003366 100%)", border: "none", color: "#ffffff" }}
                  >
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2" role="status" />Saving Changes...</>
                    ) : (
                      "Save Profile Changes"
                    )}
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TAILORED SUMMARY CARD */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm rounded-4 p-4 mb-4" style={{ background: "var(--card-bg)" }}>
            <h6 className="fw-bold mb-3" style={{ color: "var(--text-color)" }}>Profile Summary</h6>
            
            <ul className="list-unstyled mb-0 d-flex flex-column gap-3 small">
              <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                <span className="text-muted">Account Status</span>
                <span className="badge rounded-pill px-2 py-1" style={{ background: "rgba(0, 26, 77, 0.08)", color: "#001a4d", fontWeight: "600" }}>Active</span>
              </li>

              <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                <span className="text-muted">Category</span>
                <span className="fw-bold" style={{ color: "var(--text-color)" }}>
                  {isExternal ? "External Stakeholder" : (isContract ? "Contract Partner" : "Internal Team")}
                </span>
              </li>

              {/* External specific rows */}
              {isExternal && (
                <>
                  <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span className="text-muted">Stakeholder Type</span>
                    <span className="fw-bold text-end" style={{ color: "var(--text-color)", maxWidth: "160px" }}>
                      {formData.stakeholder_type || "Homebuyer / Owner"}
                    </span>
                  </li>
                  <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span className="text-muted">City / Location</span>
                    <span className="fw-bold" style={{ color: "var(--text-color)" }}>
                      {formData.location || userDetails?.department || "Not set"}
                    </span>
                  </li>
                  {formData.associated_project && (
                    <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                      <span className="text-muted">Associated Property</span>
                      <span className="fw-bold text-end" style={{ color: "var(--text-color)", maxWidth: "160px" }}>
                        {formData.associated_project}
                      </span>
                    </li>
                  )}
                </>
              )}

              {/* Contract specific rows */}
              {isContract && (
                <>
                  <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span className="text-muted">Agency</span>
                    <span className="fw-bold text-end" style={{ color: "var(--text-color)", maxWidth: "160px" }}>
                      {formData.agency_name || userDetails?.department || "Not set"}
                    </span>
                  </li>
                  <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span className="text-muted">Trade / Role</span>
                    <span className="fw-bold text-end" style={{ color: "var(--text-color)", maxWidth: "160px" }}>
                      {formData.designation || "Workforce"}
                    </span>
                  </li>
                  <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span className="text-muted">Site Location</span>
                    <span className="fw-bold text-end" style={{ color: "var(--text-color)", maxWidth: "160px" }}>
                      {formData.location || "Not set"}
                    </span>
                  </li>
                </>
              )}

              {/* Internal / Admin rows */}
              {(isInternal || isAdmin) && (
                <>
                  <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span className="text-muted">Department</span>
                    <span className="fw-bold" style={{ color: "var(--text-color)" }}>
                      {userDetails?.department || "General"}
                    </span>
                  </li>
                  <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span className="text-muted">Job Title</span>
                    <span className="fw-bold text-end" style={{ color: "var(--text-color)", maxWidth: "160px" }}>
                      {formData.designation || "Not set"}
                    </span>
                  </li>
                  <li className="d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span className="text-muted">Office Location</span>
                    <span className="fw-bold text-end" style={{ color: "var(--text-color)", maxWidth: "160px" }}>
                      {formData.location || "Corporate HQ"}
                    </span>
                  </li>
                </>
              )}

              <li className="d-flex justify-content-between align-items-center">
                <span className="text-muted">Contact Phone</span>
                <span className="fw-bold" style={{ color: "var(--text-color)" }}>
                  {formData.phone || "Not set"}
                </span>
              </li>
            </ul>
          </div>

          <div 
            className="card border-0 shadow-sm rounded-4 p-4 text-center text-white" 
            style={{ 
              background: "linear-gradient(135deg, #001a4d 0%, #003366 100%)", 
              color: "#ffffff" 
            }}
          >
            <h5 className="fw-bold mb-2 text-white" style={{ color: "#ffffff" }}>Puravankara GRM</h5>
            <p className="small mb-3 text-white" style={{ color: "#e2e8f0", opacity: 0.9 }}>
              {isExternal 
                ? "Manage your contact details and property associations for transparent grievance resolution." 
                : "Keep your contact information current for timely assignment and resolution alerts."}
            </p>
            <Link 
              to={isAdmin ? "/admin/dashboard" : "/lodge-selection"} 
              className="btn btn-light btn-sm rounded-pill px-4 fw-bold shadow-sm"
              style={{ color: "#001a4d" }}
            >
              {isAdmin ? "Go to Admin Dashboard" : "Lodge a Grievance"}
            </Link>
          </div>
        </div>

      </div>

    </div>
  );
}

export default Profile;
