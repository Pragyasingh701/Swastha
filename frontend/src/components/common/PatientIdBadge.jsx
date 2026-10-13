import React from "react";
import { useAuth } from "../../context/AuthContext";

/**
 * Shows the logged-in patient's shareable Patient ID in a page header.
 * Reads directly from useAuth() (the cached login/session user) rather
 * than requiring every page to fetch and pass a fresh profile — every
 * header already renders regardless of whether that page bothers to
 * fetch its own profile object.
 *
 * Only patients have a patient_code (see backend/db/doctorPatients.js —
 * linking a doctor to a patient requires this code, not the raw user id),
 * so this renders nothing for doctors or for a patient whose code hasn't
 * been generated yet, rather than showing a blank/null value.
 *
 * customProfile lets a page override with a just-fetched profile (e.g.
 * Dashboard.jsx, MedicalVault.jsx already load one) so the badge reflects
 * the latest server data instead of a possibly-stale cached user.
 */
export default function PatientIdBadge({ customProfile }) {
  const { user: authUser } = useAuth();
  const profile = customProfile || authUser;

  if (!profile || profile.role === "doctor" || !profile.patient_code) {
    return null;
  }

  return (
    <span
      className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-medium text-slate-600 shrink-0"
      title="Your Patient ID — share this with a doctor to let them link your records"
    >
      <span className="text-slate-400">Patient ID</span>
      <span className="font-mono text-base font-semibold text-slate-800 tracking-wide">
        {profile.patient_code}
      </span>
    </span>
  );
}
