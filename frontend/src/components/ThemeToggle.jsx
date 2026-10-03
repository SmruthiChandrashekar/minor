import React, { useContext } from "react";
import { ThemeContext } from "../context/ThemeContext";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      style={{
        width: "46px",
        height: "24px",
        borderRadius: "9999px",
        padding: "2px",
        border: isDark ? "1px solid #334155" : "1px solid #cbd5e1",
        background: isDark ? "#0f172a" : "#f1f5f9",
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
        cursor: "pointer",
        outline: "none",
        transition: "background-color 0.25s ease, border-color 0.25s ease",
        boxShadow: isDark
          ? "inset 0 1px 2px rgba(0, 0, 0, 0.4)"
          : "inset 0 1px 2px rgba(0, 0, 0, 0.06)",
      }}
    >
      {/* Sliding White Knob */}
      <div
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          transform: isDark ? "translateX(22px)" : "translateX(1px)",
          background: "#ffffff",
          boxShadow: isDark
            ? "0 1px 3px rgba(0, 0, 0, 0.5)"
            : "0 1px 3px rgba(0, 0, 0, 0.18), 0 1px 2px rgba(0, 0, 0, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {isDark ? (
          /* ONLY the Moon icon is colored Dark Blue */
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="#001a4d"
            stroke="#001a4d"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          /* ONLY the Sun icon is colored Red */
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4" fill="var(--accent)" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </div>
    </button>
  );
};

export default ThemeToggle;
