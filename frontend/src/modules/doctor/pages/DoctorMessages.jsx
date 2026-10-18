import React from "react";
import { useNavigate } from "react-router-dom";

import DoctorSidebar from "../components/DoctorSidebar";

import AppHeader from "../../../components/common/AppHeader";

export default function DoctorMessages() {
  const navigate = useNavigate();

  return (
    <div className="h-screen overflow-hidden bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <AppHeader />

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
