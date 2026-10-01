import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import { supabase } from "../services/supabaseClient";

function Index() {
  const { t } = useLanguage();
  const { user, adminUser } = useAuth();
  const navigate = useNavigate();

  const [refInput, setRefInput] = useState("");
  const [activeStep, setActiveStep] = useState(1);
  const [refStatus, setRefStatus] = useState(null);

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

  const handleCheckRef = (e) => {
    if (e) e.preventDefault();
    const val = refInput.trim();
    if (!val) return;
    navigate(`/track?ref=${encodeURIComponent(val)}`);
  };

  const handleSampleDemo = (e) => {
    e.preventDefault();
    const sampleRef = "GRM-2026-0412";
    setRefInput(sampleRef);
    setActiveStep(2);
    setRefStatus({
      type: "info",
      title: sampleRef,
      msg: "Under investigation. The reviewer has contacted the site operations team."
    });
  };

  const journeyNotes = [
    { title: t('journeyReceivedTitle'), desc: t('journeyReceivedDesc'), step: 0 },
    { title: t('journeyRoutedTitle'), desc: t('journeyRoutedDesc'), step: 1 },
    { title: t('journeyInvestigatingTitle'), desc: t('journeyInvestigatingDesc'), step: 2 },
    { title: t('journeyResolvedTitle'), desc: t('journeyResolvedDesc'), step: 3 }
  ];

  const stakeholders = [
    {
      title: t('internalEmployeesBadge'),
      desc: t('internalEmployeesDesc'),
      icon: "bi-person-badge",
      color: "var(--navy-2)",
      path: "/lodge-internal"
    },
    {
      title: t('contractWorkforceBadge'),
      desc: t('contractWorkforceDesc'),
      icon: "bi-hammer",
      color: "var(--ok)",
      path: "/lodge-contract"
    },
    {
      title: t('externalStakeholdersBadge'),
      desc: t('externalStakeholdersDesc'),
      icon: "bi-globe2",
      color: "var(--accent)",
      path: "/lodge-external"
    }
  ];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }}>

      {/* ================= HERO SECTION ================= */}
      <section className="hero text-white" style={{
        padding: "var(--s8) 0 var(--s7)",
        color: "#ffffff",
        background: "radial-gradient(800px 380px at 90% -10%, #1a4d9c, transparent 70%), linear-gradient(160deg, var(--navy), #00305f)",
        borderBottom: "1px solid var(--line)"
      }}>
        <div className="container text-white">
          <div className="row align-items-center g-5">

            {/* HERO LEFT CONTENT */}
            <div className="col-lg-7">
              <span className="badge mb-3 px-3 py-2 text-white" style={{ backgroundColor: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", fontSize: "13px" }}>
                {t('heroBadge')}
              </span>
              <h1 className="text-white" style={{
                fontSize: "var(--fs-h1)",
                fontWeight: "800",
                lineHeight: "1.02",
                letterSpacing: "-0.035em",
                color: "#ffffff",
                marginBottom: "var(--s4)"
              }}>
                {t('heroHeadline1')}<br />{t('heroHeadline2')}
              </h1>
              <p className="text-white" style={{
                fontSize: "var(--fs-lg)",
                color: "#c4d2ec",
                maxWidth: "42ch",
                lineHeight: "1.6",
                marginBottom: "var(--s5)"
              }}>
                {t('heroDescription')}
              </p>
              
              <div className="d-flex flex-wrap gap-3 mb-4">
                <button
                  onClick={() => handleProtectedAction("/lodge-selection")}
                  className="btn btn-accent btn-lg px-4 py-3 fw-bold d-inline-flex align-items-center gap-2"
                  style={{ borderRadius: "var(--r-pill)", boxShadow: "var(--sh-2)" }}
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  {t('lodgeComplaintHero')}
                </button>

                <button
                  onClick={handleTrack}
                  className="btn btn-ghost btn-lg px-4 py-3 fw-bold text-white border-light"
                  style={{ borderRadius: "var(--r-pill)", borderColor: "rgba(255,255,255,0.5)" }}
                >
                  {t('trackStatusHero')}
                </button>
              </div>

              {/* STAKEHOLDER BADGE STRIP */}
              <div className="d-flex flex-wrap gap-2 pt-2" style={{ opacity: 0.9 }}>
                <span className="badge text-white" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <i className="bi bi-person-check me-1"></i> {t('internalEmployeesBadge')}
                </span>
                <span className="badge text-white" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <i className="bi bi-hammer me-1"></i> {t('contractWorkforceBadge')}
                </span>
                <span className="badge text-white" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <i className="bi bi-globe2 me-1"></i> {t('externalStakeholdersBadge')}
                </span>
              </div>
            </div>

            {/* HERO RIGHT: TRACK CARD */}
            <div className="col-lg-5">
              <div className="card trk" id="track">
                <h3>{t('trackCardTitle')}</h3>
                <p className="sm muted">{t('trackCardSubtitle')}</p>

                <form onSubmit={handleCheckRef}>
                  <div className="d-flex gap-2 mb-2">
                    <input
                      type="text"
                      className="inp"
                      id="ref"
                      placeholder="GRM-2026-0412"
                      value={refInput}
                      onChange={(e) => setRefInput(e.target.value)}
                      aria-label="Reference number"
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      className="btn btn-accent"
                      id="go"
                    >
                      {t('checkBtn')}
                    </button>
                  </div>
                </form>

                <p className="help mb-0" id="refh">
                  {t('noNumberYet')} <a href="#demo" id="demo" onClick={handleSampleDemo}>{t('seeSample')}</a>
                </p>

                {refStatus && (
                  <div className="note n-info mt-3" style={{ animation: "fadeIn 0.3s ease" }}>
                    <div>
                      <b>{refStatus.title}</b>
                      <span className="d-block mt-1">{refStatus.msg}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </section>


      {/* ================= STAKEHOLDER CATEGORIES GRID ================= */}
      <section style={{ padding: "var(--s7) 0", backgroundColor: "var(--surface-2)" }}>
        <div className="container">
          <div className="text-center mb-5">
            <span className="badge b-info mb-2 px-3 py-1">{t('universalRedressalBadge')}</span>
            <h2 style={{ fontWeight: "800", fontSize: "var(--fs-h2)", color: "var(--heading-color)" }}>
              {t('designedForAllTitle')}
            </h2>
            <p className="muted" style={{ fontSize: "var(--fs-md)", maxWidth: "620px", margin: "0 auto" }}>
              {t('designedForAllDesc')}
            </p>
          </div>

          <div className="row g-4 justify-content-center">
            {stakeholders.map((s, idx) => (
              <div key={idx} className="col-md-4">
                <div
                  onClick={() => handleProtectedAction(s.path)}
                  className="card h-100 p-4 border-0 text-start"
                  style={{
                    borderRadius: "var(--r-lg)",
                    backgroundColor: "var(--surface)",
                    boxShadow: "var(--sh-1)",
                    cursor: "pointer",
                    transition: "all 0.25s ease",
                    borderTop: `4px solid ${s.color}`
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.boxShadow = "var(--sh-2)"; }}
                  onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "var(--sh-1)"; }}
                >
                  <div className="d-flex align-items-center justify-content-center rounded-circle mb-3"
                    style={{ width: "52px", height: "52px", backgroundColor: "var(--surface-2)", color: s.color }}>
                    <i className={`bi ${s.icon}`} style={{ fontSize: "1.4rem" }}></i>
                  </div>
                  <h5 className="fw-bold mb-2" style={{ color: "var(--heading-color)", fontSize: "19px" }}>{s.title}</h5>
                  <p className="sm muted mb-3" style={{ fontSize: "14px", lineHeight: "1.6", minHeight: "65px" }}>{s.desc}</p>
                  <div className="d-flex align-items-center gap-1 fw-bold" style={{ color: s.color, fontSize: "14px" }}>
                    <span>{t('submitDetails')}</span>
                    <i className="bi bi-arrow-right"></i>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ================= JOURNEY / PROGRESS SECTION ================= */}
      <section style={{ padding: "var(--s7) 0", backgroundColor: "var(--surface)" }}>
        <div className="container">
          <div className="text-center mb-4">
            <h2 style={{ fontWeight: "700", fontSize: "var(--fs-h2)", color: "var(--heading-color)" }}>{t('whatHappensTitle')}</h2>
            <p className="muted" style={{ fontSize: "var(--fs-md)" }}>{t('whatHappensSubtitle')}</p>
          </div>

          <div className="journey-line">
            <div className="journey-line-fill" style={{ width: `${activeStep * 33.3}%` }}></div>
            {journeyNotes.map((item, idx) => (
              <div
                key={idx}
                className={`journey-stop ${idx <= activeStep ? "on" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => setActiveStep(idx)}
              >
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ================= ABOUT US SECTION ================= */}
      <section style={{
        backgroundColor: "var(--bg)",
        padding: "var(--s8) 0"
      }}>
        <div className="container">
          <div className="row align-items-center g-5">

            {/* LEFT: TEXT CONTENT */}
            <div className="col-lg-6">
              <h2 style={{
                fontWeight: "bold",
                marginBottom: "20px",
                color: "var(--heading-color)",
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                fontSize: "var(--fs-h2)"
              }}>
                About <img src="/purvankaraimg.png" alt="Puravankara" style={{ height: "55px", objectFit: "contain", margin: "0 10px" }} />
                <span style={{ color: "var(--accent)", fontSize: "2.5rem", fontWeight: "900" }}>GRM</span>
              </h2>
              <p style={{
                color: "var(--muted)",
                fontSize: "var(--fs-md)",
                lineHeight: "1.8",
                marginBottom: "30px"
              }}>
                {t('aboutSectionDesc')}
              </p>

              <div className="row g-3">
                {[
                  { icon: "bi-people", label: t('aboutFeature1Title'), desc: t('aboutFeature1Desc') },
                  { icon: "bi-robot", label: t('aboutFeature2Title'), desc: t('aboutFeature2Desc') },
                  { icon: "bi-shield-lock", label: t('aboutFeature3Title'), desc: t('aboutFeature3Desc') },
                  { icon: "bi-graph-up-arrow", label: t('aboutFeature4Title'), desc: t('aboutFeature4Desc') }
                ].map((item, idx) => (
                  <div key={idx} className="col-sm-6">
                    <div className="d-flex align-items-start gap-3 p-2">
                      <div className="text-white rounded-circle p-2 d-flex align-items-center justify-content-center flex-shrink-0"
                        style={{ width: "38px", height: "38px", backgroundColor: "var(--accent)" }}>
                        <i className={`bi ${item.icon}`} style={{ fontSize: "1rem" }}></i>
                      </div>
                      <div>
                        <strong style={{ fontSize: "var(--fs-sm)", display: "block", color: "var(--text)" }}>{item.label}</strong>
                        <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>{item.desc}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT: IMAGE */}
            <div className="col-lg-6 text-center position-relative">
              <div style={{ display: "inline-block", position: "relative" }}>
                <img
                  src="/puravankara_building.png"
                  alt="Puravankara Building"
                  style={{
                    width: "100%",
                    maxWidth: "520px",
                    height: "auto",
                    borderRadius: "var(--r-lg)",
                    boxShadow: "var(--sh-2)",
                    border: "4px solid var(--surface)"
                  }}
                />
                <div style={{
                  position: "absolute",
                  bottom: "-20px",
                  left: "20px",
                  backgroundColor: "var(--surface)",
                  color: "var(--text)",
                  padding: "16px 24px",
                  borderRadius: "var(--r-md)",
                  boxShadow: "var(--sh-2)",
                  borderLeft: "5px solid var(--accent)",
                  textAlign: "left"
                }}>
                  <h4 style={{ fontWeight: "800", margin: 0, fontSize: "28px", color: "var(--heading-color)" }}>98%</h4>
                  <p style={{ color: "var(--muted)", margin: 0, fontSize: "var(--fs-xs)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Resolution Rate
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

    </div>
  );
}

export default Index;