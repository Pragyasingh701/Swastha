import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Settings } from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: "dashboard", route: "/doctor-dashboard" },
  { label: "Modern Overview", icon: "dashboard_customize", route: "/doctor/modern-dashboard" },
  { label: "Patients", icon: "groups", route: "/doctor/patients" },
  { label: "AI Insights", icon: "smart_toy", route: "/doctor/clinical-intelligence" },
  { label: "Analytics", icon: "monitoring", route: "/doctor/clinical-analytics" },
  { label: "Reports", icon: "assessment", route: "/doctor/reports" },
  { label: "Messages", icon: "mail", route: "/doctor/messages" },
];

export default function DoctorSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-white border-r border-slate-200 min-h-screen px-4 py-6">
      <div className="px-2 mb-8">
        <h1 className="text-xl font-bold text-blue-700 leading-tight">Swastha</h1>
        <p className="text-[10px] tracking-[0.18em] text-slate-400 font-medium uppercase">Clinical Intelligence</p>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ label, icon, route }) => {
          const isActive = location.pathname === route;
          return (
            <button
              key={label}
              type="button"
              onClick={() => route && navigate(route)}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-blue-50 text-blue-700 font-semibold border-r-4 border-blue-600"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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

      <div className="space-y-1 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => navigate("/doctor/messages")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-200"
        >
          <Bell size={18} />
          Notifications
        </button>
        <button
          type="button"
          onClick={() => navigate("/doctor/settings")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-200"
        >
          <Settings size={18} />
          Settings
        </button>
      </div>
    </aside>
  );
}
