import React, { useState } from "react";
import { Link } from "react-router-dom";
import PrivacyPolicyModal from "./PrivacyPolicyModal";

const footerLinks = [
  { label: "Privacy Policy", to: "/privacy-policy" },
  { label: "Terms & Conditions", to: "/terms-and-conditions" },
];

export default function SiteFooter() {
  const [openPolicy, setOpenPolicy] = useState(null);

  return (
    <>
      <footer className="border-t border-outline-variant/30 bg-slate-950 text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link to="/" className="text-xl font-bold tracking-tight text-white">
            Swastha
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">
            A secure, organized home for your family&apos;s health records.
            Swastha helps you keep important medical information accessible
            when you need it.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            Explore
          </h2>
          <div className="mt-4 flex flex-col gap-3 text-sm">
            <a className="transition-colors hover:text-white" href="/#features">
              Features
            </a>
            <a className="transition-colors hover:text-white" href="/#intake">
              How It Works
            </a>
            <a className="transition-colors hover:text-white" href="/#faq">
              FAQ
            </a>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            Legal & Support
          </h2>
          <div className="mt-4 flex flex-col gap-3 text-sm">
            {footerLinks.map((link) => (
              <button
                key={link.label}
                className="text-left transition-colors hover:text-white"
                type="button"
                onClick={() => setOpenPolicy(link.to.includes("terms") ? "terms" : "privacy")}
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Swastha. All rights reserved.</span>
          <span>For information management only — not medical advice.</span>
        </div>
      </div>
      </footer>
      {openPolicy && (
        <PrivacyPolicyModal
          type={openPolicy}
          onClose={() => setOpenPolicy(null)}
        />
      )}
    </>
  );
}
