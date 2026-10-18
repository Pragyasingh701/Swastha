import React from "react";
import { LayoutGrid, TrendingUp, Folder, Users, Sparkles } from "lucide-react";
import ResponsiveSidebar from "./ResponsiveSidebar";
import { openSettings } from "./settingsEvents";

// The patient app's navigation, the same on every page. The current page is
// highlighted from the URL.
export const PATIENT_NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Vault", icon: Users, route: "/family-vault" },
  { label: "Lab Trends", icon: TrendingUp, route: "/lab-trends" },
  { label: "Ask Swastha", icon: Sparkles, route: "/search" },
];

/** `action` is the page's main button at the bottom: { label, icon, route } or { label, icon, onClick }. */
export default function PatientSidebar({ action }) {
  return (
    <ResponsiveSidebar
      navItems={PATIENT_NAV_ITEMS}
      action={action}
      onOpenSettings={openSettings}
      className="bg-slate-50"
    />
  );
}
