import React, { useContext } from "react";
import { ThemeContext } from "../context/ThemeContext";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useContext(ThemeContext);

  return (
    <button
      onClick={toggleTheme}
      className="btn btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center p-2"
      title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
      style={{ width: "40px", height: "40px", transition: "0.3s" }}
    >
      <i className={`fas ${theme === "light" ? "fa-moon" : "fa-sun"}`}></i>
    </button>
  );
};

export default ThemeToggle;
