import React from "react";
import DoctorSidebar from "../components/DoctorSidebar";

export default function DoctorSettings() {
  return (
    <div className="min-h-screen bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <main className="flex-1 px-6 md:px-10 py-8">
        <div className="bg-white rounded-2xl border border-[#c3c6d7]/20 shadow-sm p-6 md:p-8">
          <p className="text-sm uppercase tracking-[0.18em] text-[#004ac6] font-medium">Settings</p>
          <h2 className="mt-2 text-4xl font-bold tracking-tight">Doctor Settings</h2>
          <p className="mt-4 text-[#434655]">This configuration page is connected to the sidebar route so account and clinic preferences can be extended later.</p>
        </div>
      </main>
    </div>
  );
}
