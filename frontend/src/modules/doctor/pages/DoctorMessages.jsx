import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Bell } from "lucide-react";
import NotificationBell from "../../../components/Common/NotificationBell";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";

export default function DoctorMessages() {
  const navigate = useNavigate();

  return (
    <div className="h-screen overflow-hidden bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="shrink-0 flex items-center gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
          <button
            type="button"
            onClick={() => navigate('/doctor/clinical-intelligence')}
            className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-600 "
          >
            <Sparkles size={16} />
            Ask Swastha about your health records...
          </button>

          <NotificationBell />


          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto px-6 md:px-10 py-8">
          <div className="bg-white rounded-2xl border border-[#c3c6d7]/20 shadow-sm p-6 md:p-8">
            <p className="text-sm uppercase tracking-[0.18em] text-[#004ac6] font-medium">Messages</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight ">Doctor Messages</h2>
            <p className="mt-4 text-[#434655] ">This message center is wired into the sidebar navigation so it can be expanded with real chat features later.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
