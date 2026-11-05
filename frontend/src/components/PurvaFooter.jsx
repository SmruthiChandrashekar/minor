import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./PurvaFooter.css";

const PurvaFooter = ({ projectName = null }) => {
  const [showOnlineBadge, setShowOnlineBadge] = useState(true);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="purva-footer-wrapper">
      {/* Notch toggle indicator */}
      <div className="purva-footer-notch" onClick={scrollToTop} title="Scroll to Top">
        <span>&#9662;</span>
      </div>

      {/* Main Multi-Column Section */}
      <div className="purva-footer-main">
        <div className="purva-footer-grid">
          {/* Column 1: Brand & Contact Info */}
          <div className="purva-footer-col-brand">
            <h2 className="purva-footer-logo">PURAVANKARA</h2>
            <div className="purva-footer-logo-line" />

            <div className="purva-contact-title">Contact Us</div>

            <div className="purva-contact-list">
              <div className="purva-contact-item">
                <div className="purva-contact-icon-circle">
                  <span>&#9906;</span>
                </div>
                <div className="purva-contact-text">
                  Puravankara Limited,<br />
                  #130/1, Ulsoor Road,<br />
                  Bengaluru - 560 042
                </div>
              </div>

              <div className="purva-contact-item">
                <div className="purva-contact-icon-circle">
                  <span>&#9993;</span>
                </div>
                <div className="purva-contact-text">
                  <a
                    href="mailto:sales@puravankara.com"
                    className="purva-contact-link"
                  >
                    sales@puravankara.com
                  </a>
                </div>
              </div>

              <div className="purva-contact-item">
                <div className="purva-contact-icon-circle">
                  <span>&#9742;</span>
                </div>
                <div className="purva-contact-text">
                  <a href="tel:08044555555" className="purva-contact-link">
                    080 44555555
                  </a>
                </div>
              </div>
            </div>

            <div className="purva-follow-divider">
              <span className="purva-follow-label">Follow Us</span>
            </div>

            <div className="purva-social-icons">
              <a href="#facebook" className="purva-social-btn" aria-label="Facebook">
                f
              </a>
              <a href="#instagram" className="purva-social-btn" aria-label="Instagram">
                &#9900;
              </a>
              <a href="#linkedin" className="purva-social-btn" aria-label="LinkedIn">
                in
              </a>
              <a href="#x" className="purva-social-btn" aria-label="X">
                &#120143;
              </a>
              <a href="#youtube" className="purva-social-btn" aria-label="YouTube">
                &#9658;
              </a>
            </div>
          </div>

          {/* Column 2: PROJECTS */}
          <div className="purva-footer-col">
            <h3 className="purva-footer-heading">Projects</h3>
            <ul className="purva-footer-links-list">
              <li><Link to="/residential/bengaluru">Bengaluru</Link></li>
              <li><a href="#chennai">Chennai</a></li>
              <li><a href="#coimbatore">Coimbatore</a></li>
              <li><a href="#kochi">Kochi</a></li>
              <li><a href="#pune">Pune</a></li>
              <li><a href="#mumbai">Mumbai</a></li>
              <li><a href="#hyderabad">Hyderabad</a></li>
            </ul>
          </div>

          {/* Column 3: QUICK LINKS */}
          <div className="purva-footer-col">
            <h3 className="purva-footer-heading">Quick Links</h3>
            <ul className="purva-footer-links-list">
              <li><a href="#blog">Blog</a></li>
              <li><a href="#channel-partner">Channel Partner</a></li>
              <li><a href="#careers">Careers</a></li>
              <li><a href="#media-assets">Media Assets</a></li>
              <li><a href="#tv-coverage">TV Coverage</a></li>
              <li><a href="#sustainability">Sustainability</a></li>
              <li><a href="#board-of-directors">Board Of Directors</a></li>
              <li><a href="#leadership">Leadership</a></li>
              <li><a href="#testimonials">Testimonials</a></li>
            </ul>
          </div>

          {/* Column 4: OTHER LINKS */}
          <div className="purva-footer-col">
            <h3 className="purva-footer-heading">Other Links</h3>
            <ul className="purva-footer-links-list">
              <li>
                <Link
                  to={projectName ? `/lodge-selection?project=${encodeURIComponent(projectName)}` : "/lodge-selection"}
                  onClick={() => {
                    if (!projectName) {
                      sessionStorage.removeItem("purva_selected_project");
                    }
                  }}
                  style={{ color: "#0b3558", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <span>&#9878;</span> File a Complaint
                </Link>
              </li>
              <li><a href="#land-enquiry">Land Enquiry</a></li>
              <li><a href="#corporate-citizen">Corporate Citizen</a></li>
              <li><a href="#investors">Investors</a></li>
              <li><a href="#blunex-life">Blunex Life</a></li>
              <li><a href="#csr">CSR</a></li>
              <li><a href="#payments-refunds">Payments &amp; Refunds</a></li>
              <li><a href="#privacy-policy">Privacy Policy</a></li>
              <li><a href="#disclaimer">Disclaimer</a></li>
            </ul>
          </div>

          {/* Column 5: OTHER LINKS */}
          <div className="purva-footer-col">
            <h3 className="purva-footer-heading">Other Links</h3>
            <ul className="purva-footer-links-list">
              <li><a href="#awards">Awards</a></li>
              <li><a href="#amore-magazine">Amore Magazine</a></li>
              <li><a href="#press-coverage">Press Coverage</a></li>
              <li><a href="#press-release">Press Release</a></li>
              <li><a href="#nri-corner">NRI Corner</a></li>
              <li><a href="#purva-interiors">Purva Interiors</a></li>
              <li><a href="#purva-privilege">Purva Privilege</a></li>
              <li><a href="#contact-us">Contact Us</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="purva-bottom-bar">
        <div className="purva-copyright">
          &copy; 2026 Puravankara Limited. All rights reserved.
        </div>

        <div className="purva-quicklinks-dropdown">
          <span>QUICK LINKS</span>
          <span>&#8964;</span>
        </div>

        <div className="purva-bottom-legal">
          <a href="#privacy">Privacy Policy</a>
          <span>|</span>
          <a href="#disclaimer">Disclaimer</a>
          <span>|</span>
          <a href="#sitemap">Sitemap</a>
          <span>|</span>
          <button className="purva-back-to-top-btn" onClick={scrollToTop}>
            <span className="purva-back-to-top-circle">&uarr;</span>
            <span>Back to Top</span>
          </button>
        </div>
      </div>

      {/* Floating WhatsApp and 'We are Online' Widget */}
      <button className="purva-whatsapp-bubble" aria-label="WhatsApp Us">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="#ffffff">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.05 7.42C8.86 7.42 8.56 7.49 8.3 7.78C8.04 8.07 7.3 8.76 7.3 10.17C7.3 11.58 8.33 12.94 8.47 13.13C8.62 13.33 10.45 16.14 13.25 17.35C13.92 17.64 14.44 17.81 14.85 17.94C15.52 18.15 16.13 18.12 16.61 18.05C17.15 17.97 18.27 17.37 18.5 16.72C18.74 16.07 18.74 15.52 18.67 15.4C18.6 15.28 18.42 15.21 18.14 15.07C17.86 14.93 16.48 14.25 16.22 14.16C15.96 14.07 15.77 14.02 15.58 14.31C15.39 14.6 14.86 15.21 14.7 15.4C14.54 15.59 14.38 15.61 14.1 15.47C13.82 15.33 12.92 15.03 11.85 14.08C11.02 13.34 10.46 12.43 10.3 12.15C10.14 11.87 10.28 11.71 10.42 11.57C10.55 11.44 10.71 11.23 10.85 11.07C10.99 10.91 11.04 10.79 11.13 10.61C11.22 10.43 11.18 10.27 11.11 10.13C11.04 9.99 10.48 8.62 10.25 8.06C10.03 7.51 9.8 7.59 9.63 7.58C9.47 7.57 9.29 7.42 9.05 7.42Z" />
        </svg>
      </button>

      {showOnlineBadge && (
        <div className="purva-online-badge">
          <span>&#128075; We are Online!</span>
          <button
            className="purva-online-badge-close"
            onClick={() => setShowOnlineBadge(false)}
            aria-label="Dismiss online badge"
          >
            &#10005;
          </button>
        </div>
      )}
    </footer>
  );
};

export default PurvaFooter;
