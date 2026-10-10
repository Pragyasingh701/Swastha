import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyPageLanguage, protectNonTextElements } from "../utils/googleTranslate";

const STORAGE_KEY = "swastha_language";
const SUPPORTED = ["en", "hi"];

const LanguageContext = createContext(null);

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(stored) ? stored : "en";
  } catch {
    return "en";
  }
}

/**
 * Single source of truth for the UI language ('en' | 'hi'), shared by every
 * LanguageToggle and by the AI requests that need to tell the backend which
 * language to answer in. Static text is translated at page level by
 * utils/googleTranslate.js; AI text is generated in this language directly.
 */
export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage);

  // Restore a saved Hindi choice on load.
  useEffect(() => {
    protectNonTextElements();
    if (language === "hi") applyPageLanguage("hi");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLanguage = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return;
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode / blocked storage: the choice just won't persist.
    }
    applyPageLanguage(next);
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
