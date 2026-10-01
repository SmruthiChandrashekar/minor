import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { i18n } from "../i18n";

const LanguageContext = createContext();

const CODE_TO_NAME = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
};

const NAME_TO_CODE = {
  English: "en",
  Hindi: "hi",
  Kannada: "kn",
  en: "en",
  hi: "hi",
  kn: "kn",
};

export function LanguageProvider({ children }) {
  const [langCode, setLangCode] = useState(() => (i18n.language || "en").substring(0, 2));

  useEffect(() => {
    return i18n.subscribe((newLng) => {
      setLangCode(newLng.substring(0, 2));
    });
  }, []);

  const language = CODE_TO_NAME[langCode] || "English";

  const setLanguage = useCallback((langOrCode) => {
    const code = NAME_TO_CODE[langOrCode] || "en";
    i18n.changeLanguage(code);
  }, []);

  const t = useCallback((key, params) => {
    return i18n.t(key, params);
  }, [langCode]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, langCode, t, i18n }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (context && context.t) {
    return context;
  }
  return {
    t: (key, params) => i18n.t(key, params),
    i18n,
    lng: i18n.language,
    changeLanguage: (l) => i18n.changeLanguage(l),
  };
}

export default LanguageContext;
