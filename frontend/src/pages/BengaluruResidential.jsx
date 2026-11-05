import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PurvaFooter from "../components/PurvaFooter";
import "./PurvaSimulation.css";
import "./BengaluruResidential.css";

const PROJECTS_DATA = [
  {
    id: "purva-heritage",
    title: "Purva Heritage",
    location: "Kudlu Gate, Bengaluru",
    badge: "Newly Launched",
    price: "₹3.10 Cr Onwards*",
    type: "3 BHK",
    size: "1,924 Sq.Ft. Onwards*",
    image: "/purva_heritage.jpg",
    status: "newly-launched",
  },
  {
    id: "northern-lights",
    title: "Northern Lights by Puravankara | KVN",
    location: "KIADB, Aerospace Park, Bengaluru",
    badge: "Newly Launched",
    price: "₹77 L Onwards*",
    type: "1, 2, 3 & 4 BHK",
    size: "678 Sq.Ft. Onwards*",
    image: "/purva_complex.jpg",
    status: "newly-launched",
  },
  {
    id: "purva-silversky",
    title: "Purva Silversky",
    location: "Electronic City, Bengaluru",
    badge: "Newly Launched",
    price: "₹2.55 Cr Onwards*",
    type: "3 & 4 BHK",
    size: "1864 Sq.Ft. Onwards*",
    image: "/purva_complex.jpg",
    status: "newly-launched",
  },
  {
    id: "purva-blubelle",
    title: "Purva Blubelle",
    location: "Magadi Road, Bengaluru",
    badge: "Ongoing",
    price: "₹2.30 Cr Onwards*",
    type: "3 BHK L Type 1 & 3 BHK R Type 2",
    size: "1434 Sq.Ft. Onwards*",
    image: "/purva_heritage.jpg",
    status: "ongoing",
  },
  {
    id: "purva-orient-grand",
    title: "Purva Orient Grand",
    location: "Lalbagh Road, Bengaluru",
    badge: "Ongoing",
    price: "₹9 Cr Onwards*",
    type: "3, 4 BHK",
    size: "1992 Sq.Ft. Onwards*",
    image: "/purva_heritage.jpg",
    status: "ongoing",
  },
  {
    id: "purva-atmosphere",
    title: "Purva Atmosphere",
    location: "Thanisandra Road, Bengaluru",
    badge: "Ongoing",
    price: "₹2.85 Cr Onwards*",
    type: "2, 3 & 4 BHK",
    size: "1680 Sq.Ft. Onwards*",
    image: "/purva_complex.jpg",
    status: "ongoing",
  },
];

const FAQS_DATA = [
  {
    q: "What are the best options for a 2 BHK apartment for sale in Bangalore?",
    a: "A 2 BHK apartment can be a practical choice for couples, small families, first-time buyers and professionals looking for a well-planned home. When comparing a 2 BHK apartment for sale in Bangalore, buyers should consider carpet area, floor-plan efficiency, natural light, ventilation, amenities, connectivity and proximity to workplaces and essential services. Puravankara offers residential communities in Bengaluru where buyers can explore suitable configurations based on project availability.",
  },
  {
    q: "How do I choose a 2 BHK flat for sale in Bangalore?",
    a: "Evaluate project location, developer track record, RERA approvals, amenities like gym, swimming pool, clubhouse, and proximity to major IT corridors and metro lines.",
  },
  {
    q: "What should I consider when buying a 3 BHK apartment in Bangalore?",
    a: "Look for smart spatial layouts, natural ventilation, dedicated parking, safety features, high resale value in prime zones like Sarjapur, Whitefield, or North Bangalore.",
  },
  {
    q: "Are there new 3 BHK flats for sale in Bangalore?",
    a: "Yes, Puravankara has recently launched premium developments with world-class themed amenities across North, South, and East Bangalore.",
  },
  {
    q: "Where can I find luxury apartments in Bangalore for sale?",
    a: "Prime luxury micro-markets include Central Bengaluru (Lalbagh, Richmond Road) and ultra-luxury green corridors with expansive penthouses.",
  },
  {
    q: "Is a 4 BHK apartment in Bangalore suitable for larger families?",
    a: "Yes, 4 BHK units provide generous master suites, servant quarters, dedicated study spaces, and expansive living rooms ideal for multi-generational families.",
  },
  {
    q: "Which factors should I consider when looking for flats for sale in Bangalore?",
    a: "Key factors include builder reputation, legal verification/RERA certification, water supply infrastructure, traffic connectivity, and proximity to schools & hospitals.",
  },
  {
    q: "Are there ready-to-move apartments in Bangalore?",
    a: "Yes, Puravankara offers both ongoing under-construction and ready-to-move-in residences with immediate occupancy.",
  },
];

const BengaluruResidential = () => {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("all");
  const [openFaq, setOpenFaq] = useState(0); // 0 expanded by default as in screenshot
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentMenuLevel, setCurrentMenuLevel] = useState("main");

  const filteredProjects = PROJECTS_DATA.filter((project) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "newly-launched") return project.status === "newly-launched";
    if (activeFilter === "ongoing") return project.status === "ongoing";
    if (activeFilter === "sold-out") return false;
    return true;
  });

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? -1 : index);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="blore-page">
      {/* ── Top Navigation Bar ── */}
      <header className="blore-topbar">
        <div className="blore-topbar-left">
          <button
            className="blore-menu-btn"
            onClick={() => {
              setCurrentMenuLevel("main");
              setIsMenuOpen(true);
            }}
          >
            <div className="blore-hamburger">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span>Menu</span>
          </button>

          <Link to="/" className="blore-nav-link">
            Home
          </Link>
          <span className="blore-nav-link">About Us</span>
        </div>

        <Link to="/" className="blore-brand-logo">
          PURAVANKARA
        </Link>

        <div className="blore-topbar-right">
          <div className="blore-dropdown-link">
            <span>Residential</span>
            <span>▾</span>
          </div>
          <div className="blore-dropdown-link">
            <span>Commercial</span>
            <span>▾</span>
          </div>

          <button className="blore-icon-btn" aria-label="Search">
            <svg viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
          </button>

          <button className="blore-icon-btn" aria-label="Phone">
            <svg viewBox="0 0 24 24">
              <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1v3.5a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.47 11.47 0 00.57 3.58 1 1 0 01-.25 1.01l-2.2 2.2z" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Hero Banner ── */}
      <section
        className="blore-hero"
        style={{ backgroundImage: `url('/purva_bengaluru_balcony.jpg')` }}
      >
        <h1 className="blore-hero-title">Bengaluru</h1>
      </section>

      {/* ── Sticky Enquire Tab ── */}
      <button className="blore-enquire-tab">Enquire Now</button>

      {/* ── Main Content Container ── */}
      <main className="blore-container">
        {/* Breadcrumb */}
        <nav className="blore-breadcrumb">
          <Link to="/">Home</Link>
          <span>/</span>
          <span>Residential</span>
          <span>/</span>
          <span className="active">Bengaluru</span>
        </nav>

        {/* Intro Section */}
        <section className="blore-intro-section">
          {/* Decorative geometric wireframe */}
          <svg className="blore-wireframe-icon" viewBox="0 0 100 100" fill="none">
            <polygon points="50,5 95,30 80,85 20,85 5,30" stroke="#e0c37b" strokeWidth="1.5" />
            <polygon points="55,10 90,40 75,90 25,80 15,25" stroke="#e0c37b" strokeWidth="1" strokeDasharray="3 3" />
          </svg>

          <h2 className="blore-heading">
            Residential Projects &amp; Apartments for Sale in Bangalore
          </h2>
          <p className="blore-desc">
            Bengaluru is one of India&apos;s most sought-after cities for homebuyers,
            offering excellent connectivity, a thriving IT ecosystem, established
            social infrastructure and diverse residential opportunities. From
            well-connected neighbourhoods to emerging growth corridors, buyers can
            explore a wide range of apartments in Bangalore designed for different
            lifestyles and family needs.
          </p>

          <button className="blore-readmore-btn">Read More</button>
        </section>

        {/* Filter Tabs */}
        <div className="blore-filters-row">
          <button
            className={`blore-filter-tab ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            All
          </button>
          <button
            className={`blore-filter-tab ${activeFilter === "newly-launched" ? "active" : ""}`}
            onClick={() => setActiveFilter("newly-launched")}
          >
            Newly Launched
          </button>
          <button
            className={`blore-filter-tab ${activeFilter === "ongoing" ? "active" : ""}`}
            onClick={() => setActiveFilter("ongoing")}
          >
            Ongoing
          </button>
          <button
            className={`blore-filter-tab ${activeFilter === "sold-out" ? "active" : ""}`}
            onClick={() => setActiveFilter("sold-out")}
          >
            Sold Out
          </button>
        </div>

        {/* Projects Grid */}
        <div className="blore-projects-grid">
          {filteredProjects.map((project) => (
            <div className="blore-card" key={project.id}>
              <div className="blore-card-img-wrap">
                <img
                  src={project.image}
                  alt={project.title}
                  className="blore-card-img"
                  loading="lazy"
                />
                <span
                  className={`blore-card-badge ${
                    project.status === "ongoing" ? "ongoing" : ""
                  }`}
                >
                  {project.badge}
                </span>
              </div>

              <div className="blore-card-body">
                <h3 className="blore-card-title">{project.title}</h3>
                <p className="blore-card-location">{project.location}</p>

                <div className="blore-card-specs">
                  <div>
                    <div className="blore-spec-label">Price</div>
                    <div className="blore-spec-val">{project.price}</div>
                  </div>
                  <div>
                    <div className="blore-spec-label">Residential Apartments</div>
                    <div className="blore-spec-val">{project.type}</div>
                  </div>
                  <div>
                    <div className="blore-spec-label">Unit Size</div>
                    <div className="blore-spec-val">{project.size}</div>
                  </div>
                  <div className="blore-view-proj-wrap">
                    <button
                      className="blore-view-proj-btn"
                      onClick={() => navigate(`/residential/bengaluru/${project.id}`)}
                    >
                      <span>View Project</span>
                      <span>&#8599;</span>
                    </button>
                  </div>
                </div>

                <div className="blore-card-actions">
                  <button className="blore-action-btn site-visit">
                    Book a Site Visit
                  </button>
                  <button className="blore-action-btn enquire">
                    Enquire Now
                  </button>
                </div>
                <div className="text-center pt-2">
                  <button
                    type="button"
                    className="btn btn-link p-0 text-decoration-none text-muted"
                    style={{ fontSize: "0.78rem" }}
                    onClick={() => {
                      sessionStorage.setItem("purva_selected_project", project.title);
                      navigate(`/lodge-selection?project=${encodeURIComponent(project.title)}`);
                    }}
                  >
                    <span className="text-danger me-1">&#9878;</span> File a Complaint for this Site &rarr;
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="blore-pagination">
          <span className="blore-page-num active">1</span>
          <span className="blore-page-num">2</span>
          <span className="blore-page-num">3</span>
          <span className="blore-page-num">4</span>
          <span className="blore-page-num">5</span>
          <span className="blore-page-num">&raquo;</span>
        </div>

        {/* FAQs Accordion */}
        <section className="blore-faqs-section">
          <h2 className="blore-faqs-title">FAQ&apos;s</h2>
          <div className="blore-faqs-list">
            {FAQS_DATA.map((faq, idx) => (
              <div className="blore-faq-item" key={idx}>
                <button
                  className="blore-faq-question"
                  onClick={() => toggleFaq(idx)}
                >
                  <span>{faq.q}</span>
                  <span className="blore-faq-icon">
                    {openFaq === idx ? "—" : "+"}
                  </span>
                </button>
                {openFaq === idx && (
                  <div className="blore-faq-answer">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Comprehensive Puravankara Corporate Footer */}
      <PurvaFooter />

      <button className="blore-chat-bubble" aria-label="Customer Support">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="#ffffff">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
        </svg>
      </button>

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
              onClick={() => setIsMenuOpen(false)}
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

export default BengaluruResidential;
