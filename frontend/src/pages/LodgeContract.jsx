import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import { supabase } from "../services/supabaseClient";

function LodgeContract() {
  const navigate = useNavigate();
  const [submittedId, setSubmittedId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useLanguage();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    workerName: "",
    contractorCompany: "",
    workSiteLocation: "",
    incidentDate: "",
    description: "",
    isAnonymous: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const cleanDescription = formData.description.trim();
    console.log("Sending description:", cleanDescription);
    
    const payload = {
       description: cleanDescription,
       metadata: {
           user_id: formData.isAnonymous ? null : (user?.id || null),
           location: formData.workSiteLocation,
           date: formData.incidentDate,
           contact_info: `Worker: ${formData.workerName}, Company: ${formData.contractorCompany}`,
           department: "Operations"
       }
    };
    
    try {
      const response = await fetch("http://localhost:8000/submit-complaint", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(payload)
      });
      
      if (!response.ok) throw new Error("Backend not ready or returned error");
      
      const data = await response.json();
      setSubmittedId(data.grievance_id || data.id);
      
    } catch (err) {
      console.warn("Backend not ready. Falling back to direct Supabase insert.", err);
      
      // FALLBACK: Temporary direct insert to satisfy NOT NULL constraints
      try {
         const fallbackDesc = `[Worker: ${formData.workerName}] [Company: ${formData.contractorCompany}] [Location: ${formData.workSiteLocation}] [Date: ${formData.incidentDate}]\n\n${cleanDescription}`;
         
         const { data, error } = await supabase.from("grievances").insert({
             user_id: payload.metadata.user_id,
             category: "Other", // satisfied NOT NULL
             description: fallbackDesc,
             department: "Operations",
             status: "Open"
         }).select().single();
         
         if (error) throw error;
         setSubmittedId(data.grievance_id);
      } catch (supabaseErr) {
         console.error("Supabase insert error:", supabaseErr);
         alert("Failed to submit grievance. Please try again.");
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
                <h3 className="mb-4 fw-bold" style={{ color: "#001a4d" }}>{t("lodgeContract")}</h3>

                {user && (
                  <div className="alert alert-info py-2 mb-4" style={{ fontSize: "14px", backgroundColor: "#e8f5e9", border: "none", color: "#1b5e20" }}>
                    Filing as: <strong>Contract Workforce</strong>
                  </div>
                )}

                <form onSubmit={handleSubmit}>

                  <div className="mb-3">
                    <label className="fw-semibold mb-1">{t("workerName")}</label>
                    <input type="text" name="workerName" value={formData.workerName} onChange={handleChange} className="form-control" required />
                  </div>

                  <div className="mb-3">
                    <label className="fw-semibold mb-1">{t("contractorCompany")}</label>
                    <input type="text" name="contractorCompany" value={formData.contractorCompany} onChange={handleChange} className="form-control" required />
                  </div>

                  <div className="mb-3">
                    <label className="fw-semibold mb-1">{t("workSiteLocation")}</label>
                    <input type="text" name="workSiteLocation" value={formData.workSiteLocation} onChange={handleChange} className="form-control" required />
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
                    <label className="fw-semibold mb-1">{t("uploadProof")}</label>
                    <input type="file" className="form-control" />
                  </div>

                  <div className="form-check mb-4 mt-3">
                    <input className="form-check-input" type="checkbox" id="anonContract" name="isAnonymous" checked={formData.isAnonymous} onChange={handleChange} />
                    <label className="form-check-label text-muted" htmlFor="anonContract">
                      {t("submitAnonymously")}
                    </label>
                  </div>

                  <button type="submit" disabled={isSubmitting} className="btn btn-danger w-100 py-2 fw-bold shadow-sm">
                    {isSubmitting ? "🤖 AI Classifying & Submitting..." : t("submitGrievance")}
                  </button>

                </form>
              </>
            ) : (
              <div className="text-center py-5">
                <div className="mx-auto mb-4 d-flex justify-content-center align-items-center rounded-circle" style={{ width: "80px", height: "80px", backgroundColor: "#d4edda", color: "#28a745" }}>
                  <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 className="fw-bold mb-3" style={{ color: "#001a4d" }}>{t("grievanceSuccess")}</h3>
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
                  <button onClick={() => navigate("/track")} className="btn btn-danger px-4 py-2 fw-bold shadow-sm">
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

export default LodgeContract;