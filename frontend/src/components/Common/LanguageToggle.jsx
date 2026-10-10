import React from "react";
import { useLanguage } from "../../context/LanguageContext";

const OPTIONS = [
  { code: "en", label: "EN" },
  { code: "hi", label: "हिं" },
];

/**
 * English / Hindi switch used in the doctor header, patient header and
 * landing page. Reads and writes the shared LanguageContext, so every
 * instance stays in sync. translate="no" keeps the page translator from
 * rewriting the option labels themselves.
 */
export default function LanguageToggle({ className = "" }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      translate="no"
      role="group"
      aria-label="Language"
      className={`notranslate inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 shrink-0 ${className}`}
    >
      {OPTIONS.map((option) => {
        const active = language === option.code;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => setLanguage(option.code)}
            aria-pressed={active}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              active ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
