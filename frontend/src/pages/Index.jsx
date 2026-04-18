import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import { supabase } from "../services/supabaseClient";

function Index() {
  const { t } = useLanguage();
  const { user, adminUser } = useAuth();
  const navigate = useNavigate();

  const handleProtectedAction = async (path) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session && !adminUser) {
      navigate("/login?message=Please login to continue");
    } else {
      navigate(path);
    }
  };

  const handleTrack = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session && !adminUser) {
      navigate("/login");
    } else {
      navigate("/track");
    }
  };

  return (
    <div>

      {/* HERO SECTION */}
      <div style={{
        background: "linear-gradient(135deg, #001a4d 0%, #003366 100%)",
        padding: "80px 0",
        color: "#fff"
      }}>
        <div className="container text-center">
          <h1 className="fw-bold mb-3 display-4 animate__animated animate__fadeInDown">
            {t("heroTitle")}
          </h1>
          <p className="lead mb-4 opacity-75 animate__animated animate__fadeInUp animate__delay-1s">
            {t("heroSubtitle")}
          </p>
          <div className="d-flex justify-content-center gap-3 animate__animated animate__fadeInUp animate__delay-1s">
            <button
              onClick={() => handleProtectedAction("/lodge-selection")}
              className="btn btn-danger btn-lg px-5 py-3 fw-bold shadow-lg"
              style={{ borderRadius: "10px" }}
            >
              Lodge Complaint
            </button>
            <button
              onClick={handleTrack}
              className="btn btn-outline-light btn-lg px-5 py-3 fw-bold shadow-lg"
              style={{ borderRadius: "10px" }}
            >
              Track Status
            </button>
          </div>
        </div>
      </div>

      {/* ABOUT US SECTION */}
      <section style={{
        backgroundColor: "#f8f9fa",
        padding: "60px 20px"
      }}>
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "40px",
          alignItems: "center"
        }}>
          {/* LEFT: TEXT CONTENT */}
          <div style={{ maxWidth: "500px" }}>
            <h2 style={{
              fontWeight: "bold",
              marginBottom: "24px",
              color: "#001a4d",
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap"
            }}>
              About <img src="/purvankaraimg.png" alt="Puravankara" style={{ height: "60px", objectFit: "contain", margin: "0 10px" }} />
              <span style={{ color: "#c4122f", fontSize: "2.5rem", fontWeight: "900" }}>GRM</span>
            </h2>
            <p style={{
              color: "#6c757d",
              fontSize: "1.1rem",
              lineHeight: "1.8",
              marginBottom: "30px"
            }}>
              Puravankara's Grievance Redressal Mechanism (GRM) is a state-of-the-art platform designed to ensure transparency, accountability, and rapid resolution of concerns for our employees, partners, and external stakeholders.
            </p>
            <div className="row g-3">
              {[
                { icon: "bi-clock-history", label: "24/7 Digital Intake" },
                { icon: "bi-robot", label: "AI-Powered Routing" },
                { icon: "bi-shield-lock", label: "Confidential & Secure" },
                { icon: "bi-graph-up-arrow", label: "Real-time Tracking" }
              ].map((item, idx) => (
                <div key={idx} className="col-6">
                  <div className="d-flex align-items-center">
                    <div className="bg-danger text-white rounded-circle p-2 me-3 d-flex align-items-center justify-content-center" style={{ width: "35px", height: "35px" }}>
                      <i className={`bi ${item.icon}`} style={{ fontSize: "0.9rem" }}></i>
                    </div>
                    <strong style={{ fontSize: "0.9rem" }}>{item.label}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: IMAGE */}
          <div style={{
            display: "flex",
            justifyContent: "center",
            position: "relative"
          }}>
            <img
              src="https://puravankaraprelaunch.com/wp-content/uploads/2025/11/111111111.png"
              alt="Puravankara Codename Bliss"
              style={{
                width: "100%",
                maxWidth: "500px",
                height: "auto",
                borderRadius: "12px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
                border: "4px solid #fff"
              }}
            />
            <div style={{
              position: "absolute",
              bottom: "-20px",
              left: "20px",
              backgroundColor: "#fff",
              padding: "20px",
              borderRadius: "12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              borderLeft: "5px solid #c4122f",
              display: "none" // Hidden on smaller screens via responsive logic if needed, or keeping it clean
            }} className="d-none d-md-block">
              <h4 style={{ fontWeight: "bold", margin: 0 }}>98%</h4>
              <p style={{ color: "#6c757d", margin: 0, fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase" }}>Resolution Rate</p>
            </div>
          </div>
        </div>
      </section>

      {/* ACTION CARDS */}
      <div className="container mt-5 mb-5 pb-5">
        <h3 className="fw-bold text-center mb-5" style={{ color: "#001a4d" }}>How can we help you today?</h3>
        <div className="row g-4 justify-content-center">

          {/* LODE COMPLAINT */}
          <div className="col-md-4">
            <div
              onClick={() => handleProtectedAction("/lodge-selection")}
              className="card h-100 border-0 shadow-sm text-center p-5"
              style={{ borderRadius: "16px", transition: "all 0.3s ease", cursor: "pointer" }}
              onMouseOver={(e) => { e.currentTarget.classList.replace('shadow-sm', 'shadow'); e.currentTarget.style.transform = 'translateY(-5px)'; }}
              onMouseOut={(e) => { e.currentTarget.classList.replace('shadow', 'shadow-sm'); e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div className="mx-auto mb-4 d-flex align-items-center justify-content-center rounded-circle" style={{ width: "80px", height: "80px", backgroundColor: "#f8d7da", color: "#c4122f" }}>
                <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <h5 className="fw-bold mb-3" style={{ color: "#001a4d" }}>Raise Grievance</h5>
              <p className="text-muted small mb-0">Securely submit a new concern or complaint for investigation.</p>
            </div>
          </div>

          {/* VIEW STATUS */}
          <div className="col-md-4">
            <div
              onClick={handleTrack}
              className="card h-100 border-0 shadow-sm text-center p-5"
              style={{ borderRadius: "16px", transition: "all 0.3s ease", cursor: "pointer" }}
              onMouseOver={(e) => { e.currentTarget.classList.replace('shadow-sm', 'shadow'); e.currentTarget.style.transform = 'translateY(-5px)'; }}
              onMouseOut={(e) => { e.currentTarget.classList.replace('shadow', 'shadow-sm'); e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div className="mx-auto mb-4 d-flex align-items-center justify-content-center rounded-circle" style={{ width: "80px", height: "80px", backgroundColor: "#e2e3e5", color: "#343a40" }}>
                <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <h5 className="fw-bold mb-3" style={{ color: "#001a4d" }}>{t("viewStatus")}</h5>
              <p className="text-muted small mb-0">{t("viewStatusDesc")}</p>
            </div>
          </div>

          {/* HELP CENTER */}
          <div className="col-md-4">
            <div
              onClick={() => navigate("/help")}
              className="card h-100 border-0 shadow-sm text-center p-5"
              style={{ borderRadius: "16px", transition: "all 0.3s ease", cursor: "pointer" }}
              onMouseOver={(e) => { e.currentTarget.classList.replace('shadow-sm', 'shadow'); e.currentTarget.style.transform = 'translateY(-5px)'; }}
              onMouseOut={(e) => { e.currentTarget.classList.replace('shadow', 'shadow-sm'); e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div className="mx-auto mb-4 d-flex align-items-center justify-content-center rounded-circle" style={{ width: "80px", height: "80px", backgroundColor: "#d1ecf1", color: "#0c5460" }}>
                <i className="bi bi-question-circle fs-2"></i>
              </div>
              <h5 className="fw-bold mb-3" style={{ color: "#001a4d" }}>{t("helpCenter")}</h5>
              <p className="text-muted small mb-0">Browse FAQs or view policy documentation for assistance.</p>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

export default Index;