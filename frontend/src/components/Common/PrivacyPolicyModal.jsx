import React, { useEffect } from "react";
import { legalContent } from "../../modules/landing/pages/LegalPage";

export default function PrivacyPolicyModal({ onClose, type = "privacy" }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const policy = legalContent[type];
  return (
    <div
      aria-labelledby="legal-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <div>
            <h2 id="legal-modal-title" className="text-xl font-bold text-on-surface">
              {policy.title}
            </h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Effective date: {policy.effectiveDate}
            </p>
          </div>
          <button
            aria-label={`Close ${policy.title}`}
            className="rounded-lg px-3 py-2 text-2xl leading-none text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
            type="button"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          <p className="leading-7 text-on-surface-variant">{policy.intro}</p>
          <div className="mt-6 space-y-6">
            {policy.sections.map(([heading, text]) => (
              <section key={heading}>
                <h3 className="text-base font-semibold text-on-surface">{heading}</h3>
                <p className="mt-2 leading-7 text-on-surface-variant">{text}</p>
              </section>
            ))}
          </div>
          <p className="mt-6 border-t border-outline-variant/30 pt-5 text-sm text-on-surface-variant">
            Have a basic question?{" "}
            <a className="font-semibold text-primary hover:underline" href="/#faq" onClick={onClose}>
              Visit the FAQ
            </a>
            .
          </p>
        </div>
        <div className="border-t border-outline-variant/30 px-6 py-4 text-right">
          <button
            className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary/90"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
