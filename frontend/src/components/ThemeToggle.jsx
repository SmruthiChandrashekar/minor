import React, { useContext } from "react";
import { ThemeContext } from "../context/ThemeContext";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className="theme-toggle-btn"
      style={{
        width: "38px",
        height: "38px",
        borderRadius: "10px",
        border: "1px solid var(--line, rgba(0, 0, 0, 0.08))",
        background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
        backdropFilter: "blur(8px)",
        color: "var(--text-color, #1e293b)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        position: "relative",
        padding: "0",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: isDark
          ? "0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
          : "0 2px 6px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.borderColor = isDark ? "rgba(167, 139, 250, 0.4)" : "rgba(245, 158, 11, 0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "var(--line, rgba(0, 0, 0, 0.08))";
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.92)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
          transform: isDark ? "rotate(0deg) scale(1)" : "rotate(90deg) scale(1)",
        }}
      >
        {isDark ? (
          /* Moon icon with soft glow */
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: "drop-shadow(0 0 6px rgba(167, 139, 250, 0.5))",
            }}
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            <circle cx="19" cy="5" r="1" fill="#c4b5fd" stroke="none" />
          </svg>
        ) : (
          /* Sun icon with warm radiant rays */
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d97706"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: "drop-shadow(0 0 4px rgba(245, 158, 11, 0.4))",
            }}
          >
            <circle cx="12" cy="12" r="4.5" fill="#fef3c7" stroke="#d97706" strokeWidth="1.8" />
            <line x1="12" y1="1" x2="12" y2="3.5" />
            <line x1="12" y1="20.5" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.99" y2="5.99" />
            <line x1="18.01" y1="18.01" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3.5" y2="12" />
            <line x1="20.5" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.99" y2="18.01" />
            <line x1="18.01" y1="5.99" x2="19.78" y2="4.22" />
          </svg>
        )}
      </div>
    </button>
  );
};

export default ThemeToggle;
