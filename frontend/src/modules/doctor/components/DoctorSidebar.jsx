import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Settings } from "lucide-react";
import Logo from "../../../components/Common/Logo";
import ResponsiveSidebar from "../../../components/Common/ResponsiveSidebar";
import SettingsModal from "../../settings/components/SettingsModal";

const navItems = [
  { label: "Dashboard", icon: "dashboard", route: "/doctor-dashboard" },
  { label: "Intake Queue", icon: "assignment", route: "/doctor/intake-queue" },
  { label: "Patients", icon: "groups", route: "/doctor/patients" },
  { label: "AI Insights", icon: "smart_toy", route: "/doctor/clinical-intelligence" },
  { label: "Ask Swastha", icon: "auto_awesome", route: "/doctor/ask-swastha" },
];

export default function DoctorSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <ResponsiveSidebar
        navItems={navItems}
        onOpenSettings={() => setIsSettingsOpen(true)}
        className="bg-white"
      />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}
