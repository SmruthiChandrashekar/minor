import { createContext, useContext, useState, useEffect } from "react";
import translations from "./translations";

const LanguageContext = createContext();

// Maps display language names → ISO 639-1 codes used by the backend
const LANG_CODES = {
  English: "en",
  Hindi: "hi",
  Kannada: "kn",
};

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(
    () => localStorage.getItem("grm_language") || "English"
  );

  // ISO code derived from the selected language — sent with every API call
  const langCode = LANG_CODES[language] || "en";

  const setLanguage = (lang) => {
    setLanguageState(lang);
    localStorage.setItem("grm_language", lang);
  };

  // t() — static UI translation (instant, no API call)
  const t = (key) => {
    return translations[language]?.[key] || translations["English"]?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, langCode, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
