import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Settings } from "lucide-react";
import Logo from "../../../components/Common/Logo";
import SettingsModal from "../../settings/components/SettingsModal";

const navItems = [
  { label: "Dashboard", icon: "dashboard", route: "/doctor-dashboard" },
  { label: "Patients", icon: "groups", route: "/doctor/patients" },
  { label: "AI Insights", icon: "smart_toy", route: "/doctor/clinical-intelligence" },
  { label: "Ask Swastha", icon: "auto_awesome", route: "/doctor/ask-swastha" },
];

export default function DoctorSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-white border-r border-slate-200 h-screen overflow-y-auto px-4 py-6">
      <div className="px-2 mb-8">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ label, icon, route }) => {
          const isActive = location.pathname === route || location.pathname.startsWith(`${route}/`);
          return (
            <button
              key={label}
              type="button"
              onClick={() => route && navigate(route)}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-blue-50 text-blue-700 font-semibold border-r-4 border-blue-600 "
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 "
              }`}
            >
              <span className="material-symbols-outlined text-[18px] transition-transform duration-200">
                {icon}
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 pt-4 border-t border-slate-100 ">
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-200"
        >
          <Settings size={18} />
          Settings
        </button>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </aside>
  );
}
