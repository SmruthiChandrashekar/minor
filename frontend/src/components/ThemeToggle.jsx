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
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleTheme();
        }
      }}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className="theme-slider-switch"
      style={{
        width: "60px",
        height: "32px",
        borderRadius: "999px",
        padding: "3px",
        border: isDark ? "1.5px solid rgba(255, 255, 255, 0.16)" : "1.5px solid rgba(0, 0, 0, 0.12)",
        background: isDark
          ? "linear-gradient(135deg, #141418 0%, #202028 100%)"
          : "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)",
        display: "flex",
        alignItems: "center",
        position: "relative",
        cursor: "pointer",
        outline: "none",
        boxShadow: isDark
          ? "inset 0 1px 3px rgba(0, 0, 0, 0.6), 0 1px 2px rgba(255, 255, 255, 0.05)"
          : "inset 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.05)",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Track background icons */}
      <span
        style={{
          position: "absolute",
          left: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isDark ? "rgba(255, 255, 255, 0.2)" : "#d97706",
          opacity: isDark ? 0.3 : 0.8,
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </span>

      <span
        style={{
          position: "absolute",
          right: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isDark ? "#c4b5fd" : "#94a3b8",
          opacity: isDark ? 0.9 : 0.35,
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>

      {/* Sliding Thumb Knob */}
      <div
        className="theme-slider-thumb"
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          transform: isDark ? "translateX(28px)" : "translateX(0px)",
          background: isDark
            ? "linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)"
            : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
          boxShadow: isDark
            ? "0 2px 8px rgba(167, 139, 250, 0.45), 0 1px 2px rgba(0,0,0,0.5)"
            : "0 2px 6px rgba(245, 158, 11, 0.5), 0 1px 2px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.3s ease, box-shadow 0.3s ease",
          zIndex: 2,
        }}
      >
        {isDark ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#312e81" stroke="#312e81" strokeWidth="1">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" strokeWidth="1.2">
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
    </button>
  );
};

export default ThemeToggle;
