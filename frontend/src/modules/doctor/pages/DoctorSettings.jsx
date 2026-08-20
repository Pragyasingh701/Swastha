import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Phone, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import SettingsModal from "../../settings/components/SettingsModal";
import { useAuth } from "../../../context/AuthContext";
import { authService } from "../../../services/auth";

export default function DoctorSettings() {
  const navigate = useNavigate();
  const { token, user: authUser } = useAuth();
  const [profile, setProfile] = useState(authUser);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!token) return;

      try {
        const result = await authService.getProfile(token);
        if (active && result?.user) setProfile(result.user);
      } catch {
        // Keep the authenticated profile when the profile endpoint is unavailable.
      }
    }

    loadProfile();
    return () => { active = false; };
  }, [token]);

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

          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto px-6 md:px-10 py-8">
          <div className="bg-white rounded-2xl border border-[#c3c6d7]/20 shadow-sm p-6 md:p-8">
            <p className="text-sm uppercase tracking-[0.18em] text-[#004ac6] font-medium">Settings</p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-4xl font-bold tracking-tight">Doctor Settings</h2>
                <p className="mt-2 text-[#434655]">Manage the profile for the currently signed-in doctor.</p>
              </div>
              <button type="button" onClick={() => setIsSettingsOpen(true)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                Edit Profile
              </button>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="text-blue-600" size={20} />
                  <h3 className="font-semibold text-slate-900">Account</h3>
                </div>
                <p className="mt-4 text-lg font-semibold text-slate-900">{profile?.name || profile?.fullName || 'Doctor'}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Mail size={15} />{profile?.email || 'Email unavailable'}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Phone size={15} />{profile?.phone || profile?.mobile || 'Phone unavailable'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-3">
                  <Stethoscope className="text-blue-600" size={20} />
                  <h3 className="font-semibold text-slate-900">Professional details</h3>
                </div>
                <p className="mt-4 text-sm text-slate-600">Specialty</p>
                <p className="font-semibold text-slate-900">{profile?.specialty || profile?.specialization || 'Not set'}</p>
                <p className="mt-3 text-sm text-slate-600">License number</p>
                <p className="font-semibold text-slate-900">{profile?.licenseNumber || profile?.license_number || 'Not set'}</p>
              </div>
            </div>
          </div>
        </main>
      </div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
