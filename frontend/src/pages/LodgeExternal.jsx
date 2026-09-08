import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import { supabase } from "../services/supabaseClient";
import { apiClient } from "../services/api";
import FileUpload from "../components/FileUpload";
import { saveToQueue } from "../services/offlineQueue";

function LodgeExternal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [submittedId, setSubmittedId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queryRedirect, setQueryRedirect] = useState(null);
  const { t } = useLanguage();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    orgName: "",
    contactNumber: "",
    emailAddress: "",
    cityLocation: "",
    incidentDate: "",
    description: location.state?.description || "",
    isAnonymous: false,
    attachments: []
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleUploadComplete = (urls) => {
    setFormData(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...urls]
    }));
  };

  const sendToChat = (text) => {
    window.dispatchEvent(new CustomEvent("chatbot-open", { detail: text }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const stripEmojis = (str) =>
      str ? str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '').replace(/\s+/g, ' ').trim() : '';
    const cleanDescription = stripEmojis(formData.description);

    const payload = {
      description: cleanDescription,
      attachments: formData.attachments,
      metadata: {
        user_id: formData.isAnonymous ? null : (user?.id || null),
        name: formData.orgName,
        phone: formData.contactNumber,
        email: formData.emailAddress,
        location: formData.cityLocation,
        date: formData.incidentDate,
        department: "External Relations",
        is_anonymous: formData.isAnonymous
      },
    };

    try {
      // ── STEP 1: Classify intent ───────────────────────────────────────────
      const classifyRes = await apiClient("/api/agents/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanDescription }),
      });

      if (classifyRes.ok) {
        const classified = await classifyRes.json();

        // ── STEP 2a: Query → chatbot, NO DB insert ──────────────────────────
        if (classified.intent === "Query") {
          setIsSubmitting(false);
          setQueryRedirect({ type: "query", text: cleanDescription });
          sendToChat(cleanDescription);
          return;
        }

        // ── STEP 2b: Low severity → chatbot, NO DB insert ────────────────────
        if (classified.severity === "Low" || classified.severity === "Policy") {
          setIsSubmitting(false);
          setQueryRedirect({ type: "low", text: cleanDescription });
          sendToChat(cleanDescription);
          return;
        }

        // ── STEP 2c: Medium severity → DB insert AND open chatbot ────────────
        if (classified.severity === "Medium") {
          const submitRes = await apiClient("/submit-complaint", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!submitRes.ok) throw new Error("Backend submit failed");
          const data = await submitRes.json();
          setSubmittedId(data.grievance_id || data.id);
          setQueryRedirect({ type: "medium", text: cleanDescription });
          sendToChat(cleanDescription);
          return;
        }

        // ── STEP 3: High/Critical → DB insert only ───────────────────────────
        const submitRes = await apiClient("/submit-complaint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!submitRes.ok) throw new Error("Backend submit failed");

        const data = await submitRes.json();
        setSubmittedId(data.grievance_id || data.id);
        return;
      }

      throw new Error("Classify endpoint unreachable");

    } catch (err) {
      console.warn("Falling back to direct Supabase insert:", err.message);

      // ── FALLBACK: store cleanDescription only — NO metadata prefix ─────────
      try {
        const { data, error } = await supabase.from("grievances").insert({
          user_id: payload.metadata.user_id,
          category: "Other",             // can't classify without backend
          description: cleanDescription, // ← clean text only
          department: "External Relations",
          status: "Open",
        }).select().single();

        if (error) throw error;
        setSubmittedId(data.grievance_id);
      } catch (supabaseErr) {
        console.error("Supabase insert error:", supabaseErr);

        // ── OFFLINE FALLBACK: Save to IndexedDB queue ──
        if (!navigator.onLine) {
          try {
            await saveToQueue(payload);
            setSubmittedId("offline-queued");
          } catch (qErr) {
            console.error("Offline queue error:", qErr);
            alert("Failed to submit grievance. Please try again.");
          }
        } else {
          alert("Failed to submit grievance. Please try again.");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="container mt-5 mb-5">
      <div className="row justify-content-center">
        <div className="col-md-8">

          <div className="card shadow-lg p-4 border-0" style={{ borderRadius: "16px" }}>

            {!submittedId ? (
              <>
                <h3 className="mb-4 fw-bold" style={{ color: "var(--text-color)" }}>{t("lodgeExternal")}</h3>

                {/* Query / Low / Medium Redirect Banner */}
                {queryRedirect && (
                  <div className="alert d-flex align-items-start gap-3 mb-4" style={{
                    backgroundColor: queryRedirect.type === "low" ? "#d1ecf1" : queryRedirect.type === "medium" ? "#d4edda" : "#fff3cd",
                    border: `1px solid ${queryRedirect.type === "low" ? "#bee5eb" : queryRedirect.type === "medium" ? "#c3e6cb" : "#ffc107"}`,
                    borderRadius: "12px",
                    color: queryRedirect.type === "low" ? "#0c5460" : queryRedirect.type === "medium" ? "#155724" : "#856404"
                  }}>
                    <span style={{ fontSize: "1.5rem" }}>
                      {queryRedirect.type === "low" ? "💡" : queryRedirect.type === "medium" ? "✅" : "💬"}
                    </span>
                    <div className="flex-grow-1">
                      <strong>
                        {queryRedirect.type === "low" ? "This looks like a low-priority concern."
                          : queryRedirect.type === "medium" ? "Complaint logged! Policy Assistant is here to help."
                          : "This looks like a general query."}
                      </strong>
                      <p className="mb-1 mt-1" style={{ fontSize: "14px" }}>
                        {queryRedirect.type === "low"
                          ? "Our Policy Assistant can help resolve this quickly. Check the chatbot in the bottom-right corner."
                          : queryRedirect.type === "medium"
                          ? "Your complaint has been submitted and assigned. The Policy Assistant is open for additional guidance."
                          : "We've redirected you to the Policy Assistant. Check the chatbot in the bottom-right corner for answers."}
                      </p>
                      <button className="btn btn-sm fw-bold" style={{
                        backgroundColor: queryRedirect.type === "low" ? "#bee5eb" : queryRedirect.type === "medium" ? "#c3e6cb" : "#ffc107",
                        fontSize: "12px"
                      }} onClick={() => setQueryRedirect(null)}>Dismiss</button>
                    </div>
                  </div>
                )}

                {user && (
                  <div className="alert py-2 mb-4" style={{ fontSize: "14px", backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-color)" }}>
                    Filing as: <strong>External Stakeholder</strong>
                  </div>
                )}

                <form onSubmit={handleSubmit}>

                  <div className="mb-3">
                    <label className="fw-semibold mb-1">{t("orgName")}</label>
                    <input type="text" name="orgName" value={formData.orgName} onChange={handleChange} className="form-control" required />
                  </div>

                  <div className="mb-3">
                    <label className="fw-semibold mb-1">{t("contactNumber")}</label>
                    <input type="tel" name="contactNumber" value={formData.contactNumber} onChange={handleChange} className="form-control" required />
                  </div>

                  <div className="mb-3">
                    <label className="fw-semibold mb-1">{t("emailAddress")}</label>
                    <input type="email" name="emailAddress" value={formData.emailAddress} onChange={handleChange} className="form-control" />
                  </div>

                  <div className="mb-3">
                    <label className="fw-semibold mb-1">{t("cityLocation")}</label>
                    <input type="text" name="cityLocation" value={formData.cityLocation} onChange={handleChange} className="form-control" required />
                  </div>


                  <div className="mb-3">
                    <label className="fw-semibold mb-1">{t("incidentDate")}</label>
                    <input type="date" name="incidentDate" value={formData.incidentDate} onChange={handleChange} className="form-control" required />
                  </div>

                  <div className="mb-3">
                    <label className="fw-semibold mb-1">{t("grievanceDescription")}</label>
                    <textarea name="description" value={formData.description} onChange={handleChange} className="form-control" rows="4" placeholder={t("describeGrievance")} required></textarea>
                  </div>

                  <div className="mb-3">
                    <FileUpload 
                      onUploadComplete={handleUploadComplete} 
                      onUploading={(isUploading) => setIsSubmitting(isUploading)}
                    />
                  </div>

                  <div className="form-check mb-4 mt-3">
                    <input className="form-check-input" type="checkbox" id="anonExternal" name="isAnonymous" checked={formData.isAnonymous} onChange={handleChange} />
                    <label className="form-check-label text-muted" htmlFor="anonExternal">
                      {t("submitAnonymously")}
                    </label>
                  </div>

                  <button type="submit" disabled={isSubmitting} className="btn btn-danger w-100 py-2 fw-bold shadow-sm">
                    {isSubmitting ? "Submitting..." : t("submitGrievance")}
                  </button>

                </form>
              </>
            ) : submittedId === "offline-queued" ? (
              <div className="text-center py-5">
                <div className="mx-auto mb-4 d-flex justify-content-center align-items-center rounded-circle" style={{ width: "80px", height: "80px", backgroundColor: "#fff3cd", color: "#f7931e" }}>
                  <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
                    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
                  </svg>
                </div>
                <h3 className="fw-bold mb-3" style={{ color: "var(--text-color)" }}>Saved Offline</h3>
                <p className="text-muted mb-4 fs-6 px-3">
                  Your complaint has been saved locally on this device. It will be <strong>automatically submitted</strong> when your internet connection is restored.
                </p>
                <div className="bg-light p-4 rounded mb-5 d-inline-block border shadow-sm">
                  <span className="text-muted d-block mb-1 text-uppercase" style={{ fontSize: "14px", letterSpacing: "1px" }}>Status</span>
                  <h4 className="fw-bold mb-0" style={{ color: "#f7931e" }}>⏳ Queued for Sync</h4>
                </div>
                <div className="d-flex justify-content-center gap-3">
                  <button onClick={() => setSubmittedId(null)} className="btn btn-outline-secondary px-4 py-2 fw-bold">
                    {t("submitAnother")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-5">
                <div className="mx-auto mb-4 d-flex justify-content-center align-items-center rounded-circle" style={{ width: "80px", height: "80px", backgroundColor: "#d4edda", color: "#28a745" }}>
                  <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 className="fw-bold mb-3" style={{ color: "var(--text-color)" }}>{t("grievanceSuccess")}</h3>
                <p className="text-muted mb-4 fs-6 px-3">
                  {t("grievanceSuccessMsg")}
                </p>
                <div className="bg-light p-4 rounded mb-5 d-inline-block border shadow-sm">
                  <span className="text-muted d-block mb-1 text-uppercase" style={{ fontSize: "14px", letterSpacing: "1px" }}>{t("trackingId")}</span>
                  <h2 className="fw-bold mb-0 text-danger" style={{ letterSpacing: "2px" }}>{submittedId}</h2>
                </div>
                <div className="d-flex justify-content-center gap-3">
                  <button onClick={() => setSubmittedId(null)} className="btn btn-outline-secondary px-4 py-2 fw-bold">
                    {t("submitAnother")}
                  </button>
                  <button onClick={() => navigate("/track", { state: { trackingId: submittedId } })} className="btn btn-danger px-4 py-2 fw-bold shadow-sm">
                    {t("trackStatus")}
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}

export default LodgeExternal;