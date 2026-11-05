import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./PurvaSimulation.css";

const PurvaSimulation = () => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentMenuLevel, setCurrentMenuLevel] = useState("main"); // 'main' | 'residential'

  // Close menu on ESC key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleOpenMenu = () => {
    setCurrentMenuLevel("main");
    setIsMenuOpen(true);
  };

  const handleCloseMenu = () => {
    setIsMenuOpen(false);
  };

  const handleGoToResidential = () => {
    setCurrentMenuLevel("residential");
  };

  const handleBackToMain = () => {
    setCurrentMenuLevel("main");
  };

  const handleHomeClick = () => {
    setCurrentMenuLevel("main");
    setIsMenuOpen(false);
  };

  const handleCitySelect = (city) => {
    setIsMenuOpen(false);
    navigate("/residential/bengaluru");
  };

  return (
    <div className="purva-sim-container">
      {/* Hero Background Image */}
      <div
        className={`purva-hero ${isMenuOpen ? "dimmed" : ""}`}
        style={{ backgroundImage: `url('/purva_hero_bg.jpg')` }}
      >
        <div className="purva-hero-overlay" />
      </div>

      {/* Top Bar: Menu Hamburger (Left) and Phone Icon (Right) */}
      <header className="purva-topbar">
        <button
          className="purva-menu-btn"
          onClick={handleOpenMenu}
          aria-label="Open Navigation Menu"
        >
          <div className="purva-hamburger">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>Menu</span>
        </button>

        <button className="purva-phone-btn" aria-label="Contact Puravankara">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1v3.5a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.47 11.47 0 00.57 3.58 1 1 0 01-.25 1.01l-2.2 2.2z" />
          </svg>
        </button>
      </header>

      {/* Center Brand Logo */}
      <div className="purva-brand-logo">
        <h1 className="purva-brand-text">PURAVANKARA</h1>
      </div>

      {/* 50 Years Celebration & River of Life Typography (Right Bottom) */}
      <div className="purva-celebration-block">
        <div className="purva-badge-ring">
          <div className="purva-badge-number-row">
            <span className="purva-badge-num">50</span>
          </div>
          <span className="purva-badge-years-text">Years</span>
          <div className="purva-badge-divider" />
          <span className="purva-badge-since">Since 1975</span>
        </div>

        <h2 className="purva-celebrate-title">Celebrating 50 years of Puravankara</h2>
        <h3 className="purva-river-title">The River of Life</h3>
        <p className="purva-tagline">Always flowing forward</p>
      </div>

      {/* Enquire Now Tab on Far Right Edge */}
      <button className="purva-enquire-tab">
        Enquire Now
      </button>

      {/* Dark Backdrop Overlay */}
      <div
        className={`purva-menu-backdrop ${isMenuOpen ? "active" : ""}`}
        onClick={handleCloseMenu}
      />

      {/* Slide-out Sidebar Drawer */}
      <aside
        className={`purva-drawer ${isMenuOpen ? "open" : ""}`}
        aria-label="Main Navigation Drawer"
      >
        <div className="purva-drawer-header">
          <span className="purva-drawer-title">Menu</span>
          <button
            className="purva-drawer-close"
            onClick={handleCloseMenu}
            aria-label="Close Menu"
          >
            &#x2715;
          </button>
        </div>

        <div className="purva-drawer-viewport">
          {/* Level 1: Main Menu (Home & Residential) */}
          <div
            className={`purva-nav-pane main-pane ${
              currentMenuLevel === "residential" ? "slide-left" : ""
            }`}
          >
            <button className="purva-nav-item" onClick={handleHomeClick}>
              <span>Home</span>
            </button>

            <button className="purva-nav-item" onClick={handleGoToResidential}>
              <span>Residential</span>
              <span className="purva-nav-chevron">&#x203A;</span>
            </button>

            {/* Quick Switcher back to GRM portal */}
            <div
              className="purva-portal-switch"
              onClick={() => {
                sessionStorage.removeItem("purva_selected_project");
                navigate("/grm");
              }}
              title="Return to Grievance Redressal System"
            >
              Go to Complaints Portal &rarr;
            </div>
          </div>

          {/* Level 2: Residential Sub-menu (Bengaluru) */}
          <div
            className={`purva-nav-pane sub-pane ${
              currentMenuLevel === "residential" ? "slide-in" : ""
            }`}
          >
            <button className="purva-back-btn" onClick={handleBackToMain}>
              <span className="purva-back-circle">&lsaquo;</span>
              <span>Back</span>
            </button>

            <button
              className="purva-sub-item active"
              onClick={() => handleCitySelect("Bengaluru")}
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

export default PurvaSimulation;
