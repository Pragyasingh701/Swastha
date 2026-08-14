import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function DoctorLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [medicalLicense, setMedicalLicense] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password) {
      setErrorMessage("Please enter your professional email and password.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(email.trim(), password);
      setIsLoading(false);

      if (result?.requiresOTP) {
        navigate("/verify-otp", { state: { email: email.trim(), mode: "login" } });
        return;
      }

      if (result?.user?.hasSelectedRole || (result?.user?.role && result?.user?.role !== 'none')) {
        navigate(result?.user?.role === 'doctor' ? "/doctor-dashboard" : "/dashboard", { replace: true });
      } else {
        navigate("/doctor-register", { replace: true });
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(err.message || "Invalid doctor credentials.");
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center p-6 bg-surface dark:bg-slate-950 font-body-md text-on-surface dark:text-slate-100 selection:bg-primary-fixed">
      <div className="w-full max-w-[440px]">
        <div className="bg-white dark:bg-slate-900 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] rounded-[20px] p-8 lg:p-10 border border-outline-variant/20 dark:border-slate-700">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[30px]">stethoscope</span>
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface dark:text-slate-100">Doctor Clinical Portal</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400 mt-2">
              Sign in with your verified practitioner credentials
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-error-container dark:bg-rose-500/10 text-on-error-container dark:text-rose-300 text-body-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px]">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 ml-1" htmlFor="docEmail">
                Professional Email
              </label>
              <input
                required
                autoComplete="off"
                id="docEmail"
                type="email"
                placeholder="dr.name@hospital.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-700 rounded-xl font-body-md text-on-surface dark:text-slate-100 focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 ml-1" htmlFor="license">
                Medical License / NMC ID
              </label>
              <input
                autoComplete="off"
                id="license"
                type="text"
                placeholder="MCI-12345-2022"
                value={medicalLicense}
                onChange={(e) => setMedicalLicense(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-700 rounded-xl font-body-md text-on-surface dark:text-slate-100 focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 ml-1" htmlFor="docPassword">
                Password
              </label>
              <input
                required
                autoComplete="new-password"
                id="docPassword"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-700 rounded-xl font-body-md text-on-surface dark:text-slate-100 focus:outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[48px] mt-4 font-label-md text-body-md bg-primary-container text-white rounded-xl hover:bg-primary-container/90 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? "Authenticating Doctor..." : "Access Doctor Dashboard"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400">
              Not registered as a practitioner?{" "}
              <Link to="/doctor-register" className="text-primary font-semibold hover:underline">
                Apply for Doctor Portal
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
