import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Bell } from "lucide-react";
import DoctorSidebar from "../components/DoctorSidebar";
import ThemeToggle from "../../../components/Common/ThemeToggle";
import ProfileDropdown from "../../settings/components/ProfileDropdown";

export default function DoctorMessages() {
  const navigate = useNavigate();

  return (
    <div className="h-screen overflow-hidden bg-[#faf8ff] dark:bg-slate-950 text-[#191b23] dark:text-slate-100 antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="shrink-0 flex items-center gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={() => navigate('/search')}
            className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-400 dark:text-slate-500 transition-colors hover:border-blue-300 dark:hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400"
          >
            <Sparkles size={16} />
            Ask Swastha about your health records...
          </button>

          <button className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0">
            <Bell size={20} className="text-slate-600 dark:text-slate-300" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          <ThemeToggle />

          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto px-6 md:px-10 py-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#c3c6d7]/20 dark:border-slate-800 shadow-sm p-6 md:p-8">
            <p className="text-sm uppercase tracking-[0.18em] text-[#004ac6] dark:text-blue-400 font-medium">Messages</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight dark:text-slate-100">Doctor Messages</h2>
            <p className="mt-4 text-[#434655] dark:text-slate-300">This message center is wired into the sidebar navigation so it can be expanded with real chat features later.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
