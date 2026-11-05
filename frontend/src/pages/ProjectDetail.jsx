import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PurvaFooter from "../components/PurvaFooter";
import { findProjectByNameOrId } from "../config/projectsData";
import "./PurvaSimulation.css";
import "./ProjectDetail.css";

const AMENITIES_LIST = [
  { name: "Badminton Court", icon: "🏸" },
  { name: "Business Center", icon: "💼" },
  { name: "Squash Court", icon: "🎾" },
  { name: "Gymnasium", icon: "🏋️" },
  { name: "Games Room", icon: "♟️" },
  { name: "Heated Swimming Pool", icon: "🏊" },
  { name: "Multipurpose Hall", icon: "🏛️" },
  { name: "Kids' Zone", icon: "🧸" },
];

const ProjectDetail = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const matchedProject = findProjectByNameOrId(projectId);
  const projectName = matchedProject?.name || "Purva Heritage";

  const [activeTourTab, setActiveTourTab] = useState("location");
  const [activeAmenityTab, setActiveAmenityTab] = useState("indoor");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentMenuLevel, setCurrentMenuLevel] = useState("main");

  const handleGoToGrievance = () => {
    // Navigates directly into the grievance filing flow for the project
    sessionStorage.setItem("purva_selected_project", projectName);
    navigate(`/lodge-selection?project=${encodeURIComponent(projectName)}`);
  };

  return (
    <div className="proj-page">
      {/* ── Top Navigation Bar ── */}
      <header className="proj-topbar">
        <div className="proj-topbar-left">
          <button
            className="proj-menu-btn"
            onClick={() => {
              setCurrentMenuLevel("main");
              setIsMenuOpen(true);
            }}
          >
            <div className="proj-hamburger">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span>Menu</span>
          </button>

          <Link to="/" className="proj-nav-link">
            Home
          </Link>
          <span className="proj-nav-link">About Us</span>
        </div>

        <Link to="/" className="proj-brand-logo">
          PURAVANKARA
        </Link>

        <div className="proj-topbar-right">
          <Link to="/residential/bengaluru" className="proj-dropdown-link">
            <span>Residential</span>
            <span>▾</span>
          </Link>
          <div className="proj-dropdown-link">
            <span>Commercial</span>
            <span>▾</span>
          </div>

          {/* Above Placement Option 1: Top Navigation Bar Complaint Action */}
          <button
            className="proj-header-grm-btn"
            onClick={handleGoToGrievance}
            title="Puravankara Complaints & Redressal"
          >
            <span className="proj-header-grm-icon">&#9878;</span>
            <span>File a Complaint</span>
          </button>

          <button className="proj-icon-btn" aria-label="Search">
            <svg viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
          </button>

          <button className="proj-icon-btn" aria-label="Phone">
            <svg viewBox="0 0 24 24">
              <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1v3.5a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011 1 11.47 11.47 0 00.57 3.58 1 1 0 01-.25 1.01l-2.2 2.2z" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section
        className="proj-hero"
        style={{ backgroundImage: `url('/purva_heritage.jpg')` }}
      >
        <div className="proj-hero-content">
          <h1 className="proj-hero-title">{projectName}</h1>
          <p className="proj-hero-subtitle">
            On Hosur Road, Kudlu Gate | 3 BHK Residences | ₹ 3.10 CR* Onwards
          </p>

          <div className="proj-hero-buttons">
            <button className="proj-virtual-tour-btn">
              Virtual Tour
            </button>
          </div>
        </div>
      </section>

      {/* ── Breadcrumb Bar with Above Placement Option 3 ── */}
      <div className="proj-breadcrumb-bar">
        <nav className="proj-breadcrumb">
          <Link to="/">Home</Link>
          <span>/</span>
          <Link to="/residential/bengaluru">Residential</Link>
          <span>/</span>
          <Link to="/residential/bengaluru">Bengaluru</Link>
          <span>/</span>
          <span className="active">{projectName}</span>
        </nav>

        {/* Above Placement Option 3: Sub-nav Quick Action */}
        <button
          className="proj-subnav-grm-link"
          onClick={handleGoToGrievance}
        >
          <span>&#9878; Resident Complaints Portal</span>
          <span>&#8599;</span>
        </button>
      </div>

      {/* ── Sticky Enquire Tab ── */}
      <button className="proj-enquire-tab">Enquire Now</button>

      {/* ── Overview Section ── */}
      <section className="proj-overview-section">
        <div className="proj-overview-img-wrap">
          <img
            src="/purva_heritage.jpg"
            alt="Purva Heritage Balconies and Residences"
            className="proj-overview-img"
          />
        </div>

        <div className="proj-overview-content">
          <h2 className="proj-overview-heading">Overview</h2>
          <p className="proj-overview-p">
            Purva Heritage by Puravankara is a premium residential community
            strategically located in Kudlu Gate, South Bengaluru. The project
            offers masterfully designed 2 and 3 BHK luxury apartments crafted for
            modern families seeking comfort, convenience, and a well-connected
            urban lifestyle.
          </p>
          <p className="proj-overview-p">
            Designed to create an elevated living experience, Purva Heritage
            combines spacious layouts, contemporary architecture, premium
            specifications, and thoughtfully curated amenities. Every home is
            designed to offer abundant natural light, fresh air, privacy, and
            elevated living spaces that complement the needs of today&apos;s
            homebuyers.
          </p>
          <p className="proj-overview-p">
            Strategically located near Kudlu Gate Metro Station, Hosur Road, HSR
            Layout, Electronic City, Bommanahalli, and Central Silk Board, the
            project offers excellent connectivity to major IT hubs, business
            districts, educational institutions, healthcare facilities, and
            lifestyle destinations. Combining a prime South Bangalore location
            with modern amenities, high quality construction, and excellent metro
            connectivity, Purva Heritage is an ideal choice for homebuyers and
            investors seeking premium 2 and 3 BHK apartments in Kudlu Gate with
            strong long-term value potential.
          </p>

          <div className="proj-overview-actions">
            <button className="proj-brochure-btn">
              Download Brochure
            </button>
          </div>
        </div>
      </section>

      {/* ── Project Tour Section ── */}
      <section className="proj-tour-section">
        <h2 className="proj-tour-heading">Project Tour</h2>

        <div className="proj-tour-tabs">
          <button
            className={`proj-tour-tab ${activeTourTab === "location" ? "active" : ""}`}
            onClick={() => setActiveTourTab("location")}
          >
            Location
          </button>
          <button
            className={`proj-tour-tab ${activeTourTab === "walkthrough" ? "active" : ""}`}
            onClick={() => setActiveTourTab("walkthrough")}
          >
            Walkthrough
          </button>
          <button
            className={`proj-tour-tab ${activeTourTab === "lifestyle" ? "active" : ""}`}
            onClick={() => setActiveTourTab("lifestyle")}
          >
            Lifestyle
          </button>
          <button
            className={`proj-tour-tab ${activeTourTab === "sustainability" ? "active" : ""}`}
            onClick={() => setActiveTourTab("sustainability")}
          >
            Sustainability
          </button>
        </div>

        <div className="proj-tour-media-wrap">
          <img
            src="/purva_complex.jpg"
            alt="Purva Heritage Project Tour Kudlu Gate"
            className="proj-tour-img"
          />

          <div className="proj-tour-overlay">
            <span className="proj-tour-watermark">PURAVANKARA</span>

            <div className="proj-tour-center-badge">
              <div className="proj-tour-badge-name">PURVA HERITAGE</div>
              <div className="proj-tour-badge-sub">KUDLU GATE</div>
            </div>

            <div className="proj-tour-bottom-labels">
              <span>KUDLU GATE METRO STATION</span>
              <span>HOSUR ROAD</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Premium Amenities Section (Dark Blue) ── */}
      <section className="proj-amenities-section">
        <div className="proj-amenities-container">
          <div className="proj-amenities-header">
            <div>
              <div className="proj-amenities-subtitle">
                <span>&#9650;</span>
                <span>PROJECT AMENITIES</span>
              </div>
              <h2 className="proj-amenities-title">Premium Amenities</h2>
            </div>

            <div className="proj-amenities-tabs">
              <button
                className={`proj-amenity-tab ${activeAmenityTab === "indoor" ? "active" : ""}`}
                onClick={() => setActiveAmenityTab("indoor")}
              >
                Indoor
              </button>
              <button
                className={`proj-amenity-tab ${activeAmenityTab === "outdoor" ? "active" : ""}`}
                onClick={() => setActiveAmenityTab("outdoor")}
              >
                Outdoor
              </button>
            </div>
          </div>

          <div className="proj-amenities-layout">
            <div className="proj-amenities-photo-wrap">
              <img
                src="/purva_heritage.jpg"
                alt="Badminton Sports Facility"
                className="proj-amenities-photo"
              />
            </div>

            <div className="proj-amenities-grid">
              {AMENITIES_LIST.map((item, idx) => (
                <div className="proj-amenity-card" key={idx}>
                  <div className="proj-amenity-icon-circle">
                    <span>{item.icon}</span>
                  </div>
                  <span className="proj-amenity-label">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Corporate Footer with Quick Links Grievance Link ── */}
      <PurvaFooter projectName={projectName} />

      {/* Backdrop & Drawer for Header Menu */}
      <div
        className={`purva-menu-backdrop ${isMenuOpen ? "active" : ""}`}
        onClick={() => setIsMenuOpen(false)}
      />
      <aside className={`purva-drawer ${isMenuOpen ? "open" : ""}`}>
        <div className="purva-drawer-header">
          <span className="purva-drawer-title">Menu</span>
          <button
            className="purva-drawer-close"
            onClick={() => setIsMenuOpen(false)}
          >
            &#x2715;
          </button>
        </div>
        <div className="purva-drawer-viewport">
          <div
            className={`purva-nav-pane main-pane ${
              currentMenuLevel === "residential" ? "slide-left" : ""
            }`}
          >
            <button
              className="purva-nav-item"
              onClick={() => {
                setIsMenuOpen(false);
                navigate("/");
              }}
            >
              <span>Home</span>
            </button>
            <button
              className="purva-nav-item"
              onClick={() => setCurrentMenuLevel("residential")}
            >
              <span>Residential</span>
              <span className="purva-nav-chevron">&#x203A;</span>
            </button>
            <div
              className="purva-portal-switch"
              onClick={() => navigate("/dashboard")}
            >
              Go to Complaints Portal &rarr;
            </div>
          </div>
          <div
            className={`purva-nav-pane sub-pane ${
              currentMenuLevel === "residential" ? "slide-in" : ""
            }`}
          >
            <button
              className="purva-back-btn"
              onClick={() => setCurrentMenuLevel("main")}
            >
              <span className="purva-back-circle">&lsaquo;</span>
              <span>Back</span>
            </button>
            <button
              className="purva-sub-item active"
              onClick={() => {
                setIsMenuOpen(false);
                navigate("/residential/bengaluru");
              }}
            >
              <span className="purva-sub-dot" />
              <span>Bengaluru</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default ProjectDetail;
