import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function RoleSelection({ onSelectRole }) {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    // Only redirect to dashboard if user has completely finished role-specific registration
    if (user?.hasSelectedRole) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, isAuthenticated, navigate]);

  const handleSelect = (role) => {
    if (onSelectRole) {
      onSelectRole(role);
    }

    if (role === "doctor") {
      navigate("/doctor-register");
    } else {
      navigate("/patient-register");
    }
  };

  const handleLogoutAndSwitch = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col relative overflow-x-hidden">
      {/* Atmospheric Background Shader */}
      <div className="fixed inset-0 z-0 opacity-40 pointer-events-none" />

      {/* Navigation (TopAppBar) */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-lg border-b border-outline-variant/30">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="font-headline-md text-headline-md font-extrabold text-primary tracking-tight">
              Swastha
            </span>
            <div className="h-4 w-[1px] bg-outline-variant/50 mx-1" />
            <span className="font-label-md text-label-md text-on-surface-variant font-medium">
              Select Experience
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleLogoutAndSwitch}
              className="font-label-md text-label-md text-primary hover:text-primary/80 font-bold transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">account_circle</span>
              Login using another account
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="flex-grow flex items-center justify-center pt-28 pb-12 px-6 z-10">
        <div className="max-w-5xl w-full flex flex-col items-center">
          {/* Header Section */}
          <div className="text-center mb-12 space-y-4">
            <span className="inline-flex items-center px-4 py-1 rounded-full bg-primary-fixed text-on-primary-fixed-variant font-label-sm text-label-sm mb-2">
              Healthcare SaaS Platform
            </span>
            <h1 className="font-display text-display text-on-surface tracking-tight">
              How will you use Swastha?
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
              Personalized intelligence for patients and clinical tools for
              practitioners. Choose your workspace to begin.
            </p>
          </div>

          {/* Role Selection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
            {/* Card 1: Patient */}
            <div
              className="role-card-transition glass-card ai-border-gradient p-8 rounded-2xl flex flex-col items-center text-center cursor-pointer group"
              onClick={() => handleSelect("patient")}
            >
              <div className="w-20 h-20 rounded-2xl bg-primary-container/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span
                  className="material-symbols-outlined text-primary text-[40px]"
                >
                  person
                </span>
              </div>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-3">
                Patient
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mb-8 flex-grow">
                Access your health records, sync ABHA records, and receive
                AI-driven insights to manage your personal health journey
                with clinical precision.
              </p>
              <button
                type="button"
                className="w-full bg-primary-container text-white py-3.5 px-6 rounded-xl font-label-md text-label-md shadow-md hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect("patient");
                }}
              >
                Continue as Patient
                <span className="material-symbols-outlined text-[18px]">
                  arrow_forward
                </span>
              </button>
            </div>

            {/* Card 2: Doctor */}
            <div
              className="role-card-transition bg-surface-container-lowest/95 border border-outline-variant/30 p-8 rounded-2xl flex flex-col items-center text-center cursor-pointer group hover:border-primary/50"
              onClick={() => handleSelect("doctor")}
            >
              <div className="w-20 h-20 rounded-2xl bg-secondary-container/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span
                  className="material-symbols-outlined text-secondary text-[40px]"
                >
                  stethoscope
                </span>
              </div>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-3">
                Doctor
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mb-8 flex-grow">
                Streamline patient consultations with intelligent summaries,
                longitudinal data analysis, and advanced medical vault
                management tools.
              </p>
              <button
                type="button"
                className="w-full bg-secondary text-white py-3.5 px-6 rounded-xl font-label-md text-label-md shadow-md hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect("doctor");
                }}
              >
                Continue as Doctor
                <span className="material-symbols-outlined text-[18px]">
                  arrow_forward
                </span>
              </button>
            </div>
          </div>

          {/* Option to login using another account */}
          <div className="mt-10 text-center">
            <button
              type="button"
              onClick={handleLogoutAndSwitch}
              className="font-label-md text-label-md text-primary font-bold hover:underline transition-all inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">account_circle</span>
              Login using another account
            </button>
          </div>

          {/* Secondary Info */}
          <div className="mt-12 flex flex-wrap justify-center gap-12 opacity-60">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">
                verified_user
              </span>
              <span className="font-label-sm text-label-sm">
                HIPAA Compliant
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">
                security
              </span>
              <span className="font-label-sm text-label-sm">
                ABHA Integrated
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">
                lock
              </span>
              <span className="font-label-sm text-label-sm">
                End-to-End Encrypted
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Visual Accent Elements (Background) */}
      <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Footer */}
      <footer className="bg-surface-container-low border-t border-outline-variant/50 p-12 mt-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-7xl mx-auto">
          <div className="col-span-1 md:col-span-2">
            <span className="font-headline-md text-headline-md font-bold text-primary tracking-tight">
              Swastha
            </span>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-4 max-w-sm">
              Empowering the future of digital health through Clinical
              Intelligence and modern UI precision. Designed for the global
              healthcare ecosystem.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <h4 className="font-label-md text-label-md text-on-surface font-bold uppercase tracking-wider">
              Legal
            </h4>
            <a
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-opacity"
              href="#"
            >
              Privacy Policy
            </a>
            <a
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-opacity"
              href="#"
            >
              Terms of Service
            </a>
            <a
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-opacity"
              href="#"
            >
              Security Architecture
            </a>
          </div>
          <div className="flex flex-col gap-3">
            <h4 className="font-label-md text-label-md text-on-surface font-bold uppercase tracking-wider">
              Connect
            </h4>
            <a
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-opacity"
              href="#"
            >
              Contact Support
            </a>
            <a
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-opacity"
              href="#"
            >
              Documentation
            </a>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-outline-variant/30 flex justify-between items-center">
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            © 2026 Swastha Healthcare SaaS. HIPAA &amp; ABHA Compliant.
          </span>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-[18px]">
                share
              </span>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .ai-border-gradient {
          border: 1px solid transparent;
          background: linear-gradient(white, white) padding-box,
            linear-gradient(to right, #004ac6, #39b8fd) border-box;
        }
        .role-card-transition {
          transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .role-card-transition:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
        }
      `}</style>
    </div>
  );
}