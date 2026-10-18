import React from "react";

import ResponsiveSidebar from "../../../components/common/ResponsiveSidebar";
import { openSettings } from "../../../components/common/settingsEvents";

const navItems = [
  { label: "Dashboard", icon: "dashboard", route: "/doctor-dashboard" },
  { label: "Intake Queue", icon: "assignment", route: "/doctor/intake-queue" },
  { label: "Patients", icon: "groups", route: "/doctor/patients" },
  { label: "AI Insights", icon: "smart_toy", route: "/doctor/clinical-intelligence" },
  { label: "Ask Swastha", icon: "auto_awesome", route: "/doctor/ask-swastha" },
];

export default function DoctorSidebar() {
  return <ResponsiveSidebar navItems={navItems} onOpenSettings={openSettings} className="bg-white" />;
}
