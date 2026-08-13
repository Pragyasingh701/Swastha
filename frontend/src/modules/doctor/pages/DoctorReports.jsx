import React from "react";
import DoctorSidebar from "../components/DoctorSidebar";

export default function DoctorReports() {
  return (
    <div className="min-h-screen bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <main className="flex-1 px-6 md:px-10 py-8">
        <div className="bg-white rounded-2xl border border-[#c3c6d7]/20 shadow-sm p-6 md:p-8">
          <p className="text-sm uppercase tracking-[0.18em] text-[#004ac6] font-medium">Reports</p>
          <h2 className="mt-2 text-4xl font-bold tracking-tight">Doctor Reports</h2>
          <p className="mt-4 text-[#434655]">This section is connected to the sidebar routing and ready for the report list implementation.</p>
        </div>
      </main>
    </div>
  );
}
