import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthProvider";
import { supabase } from "../services/supabaseClient";
import "./Index.css";

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
    <div className="min-vh-100 home-page">

      {/* Hero Section */}
      <section className="hero text-white bg-navy home-hero">
        <div className="container text-white">
          <div className="row align-items-center g-5">

            {/* Hero left content */}
            <div className="col-lg-7">
              <h1 className="text-white fw-extrabold home-hero-title">
                {t('heroHeadline1')}<br />{t('heroHeadline2')}
              </h1>
              <p className="fs-lg home-hero-lead">
                {t('heroDescription')}
              </p>
              
              <div className="d-flex flex-wrap gap-3 mb-4">
                <button
                  onClick={() => handleProtectedAction("/lodge-selection")}
                  className="btn btn-accent btn-lg px-4 py-3 fw-bold d-inline-flex align-items-center gap-2 home-lodge-btn"
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  {t('lodgeComplaintHero')}
                </button>

                <button
                  onClick={handleTrack}
                  className="btn btn-hero-track btn-lg px-4 py-3 fw-bold text-white d-inline-flex align-items-center gap-2 home-track-btn"
                >
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <span>{t('trackStatusHero')}</span>
                </button>
              </div>

              {/* Stakeholder badge strip */}
              <div className="d-flex flex-wrap gap-2 pt-2 home-badges">
                <span className="badge text-white home-badge">
                  <i className="bi bi-person-check me-1"></i> {t('internalEmployeesBadge')}
                </span>
                <span className="badge text-white home-badge">
                  <i className="bi bi-hammer me-1"></i> {t('contractWorkforceBadge')}
                </span>
                <span className="badge text-white home-badge">
                  <i className="bi bi-globe2 me-1"></i> {t('externalStakeholdersBadge')}
                </span>
              </div>
            </div>

            {/* Hero right: Track card */}
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
                  <div className="note n-info mt-3">
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


      {/* Stakeholder Categories Grid */}
      <section className="home-categories">
        <div className="container">
          <div className="text-center mb-5">
            <span className="badge b-info mb-2 px-3 py-1">{t('universalRedressalBadge')}</span>
            <h2 className="fw-extrabold fs-h2 text-heading">
              {t('designedForAllTitle')}
            </h2>
            <p className="muted fs-md home-section-lead">
              {t('designedForAllDesc')}
            </p>
          </div>

          <div className="row g-4 justify-content-center">
            {stakeholders.map((s, idx) => (
              <div key={idx} className="col-md-4">
                <div
                  onClick={() => handleProtectedAction(s.path)}
                  className="card h-100 p-4 border-0 text-start cursor-pointer tile-card"
                  style={{
                    borderTop: `4px solid ${s.color}`
                  }}
                >
                  <div className="d-flex align-items-center justify-content-center rounded-circle mb-3 home-category-icon"
                    style={{ color: s.color }}>
                    <i className={`bi ${s.icon} home-category-glyph`}></i>
                  </div>
                  <h5 className="fw-bold mb-2 home-category-title">{s.title}</h5>
                  <p className="sm muted mb-3 fs-14 home-category-desc">{s.desc}</p>
                  <div className="d-flex align-items-center gap-1 fw-bold fs-14" style={{ color: s.color }}>
                    <span>{t('submitDetails')}</span>
                    <i className="bi bi-arrow-right"></i>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Journey / Progress Section */}
      <section className="home-journey">
        <div className="container">
          <div className="text-center mb-4">
            <h2 className="fw-bold fs-h2 text-heading">{t('whatHappensTitle')}</h2>
            <p className="muted fs-md">{t('whatHappensSubtitle')}</p>
          </div>

          <div className="journey-line">
            <div className="journey-line-fill" style={{ width: `${activeStep * 33.3}%` }}></div>
            {journeyNotes.map((item, idx) => (
              <div
                key={idx}
                className={`journey-stop ${idx <= activeStep ? "on" : ""} cursor-pointer`}
                onClick={() => setActiveStep(idx)}
              >
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* About us Section */}
      <section className="home-about">
        <div className="container">
          <div className="row align-items-center g-5">

            {/* Left: Text content */}
            <div className="col-lg-6">
              <h2 className="fw-bold text-heading d-flex align-items-center flex-wrap fs-h2 home-about-title">
                About <img className="object-fit-contain home-about-logo" src="/purvankaraimg.png" alt="Puravankara" />
                <span className="text-accent home-about-mark">GRM</span>
              </h2>
              <p className="fs-md home-about-text">
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
                      <div className="text-white rounded-circle p-2 d-flex align-items-center justify-content-center flex-shrink-0 home-feature-icon">
                        <i className={`bi ${item.icon} home-feature-glyph`}></i>
                      </div>
                      <div>
                        <strong className="fs-sm d-block home-feature-label">{item.label}</strong>
                        <span className="fs-xs home-feature-desc">{item.desc}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Image */}
            <div className="col-lg-6 text-center position-relative">
              <div className="d-inline-block position-relative">
                <img
                  className="w-100 home-about-img"
                  src="/puravankara_building.png"
                  alt="Puravankara Building"
                />
                <div className="position-absolute text-start home-stat-card">
                  <h4 className="fw-extrabold m-0 text-heading home-stat-value">98%</h4>
                  <p className="m-0 fs-xs fw-bold text-uppercase ls-half home-stat-label">
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