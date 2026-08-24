import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Building2, Loader2, ArrowRight } from "lucide-react";
import OtpInput from "../../../components/Common/OtpInput";
import { verifyClinicCode, sendClinicOtp, verifyClinicOtp } from "../../../api/clinic";

// Clinic Check-In flow (PRD §3/§5): code entry -> doctor confirmation
// ("Is this your doctor?", name/clinic only) -> OTP-to-email, reusing the
// shared OtpInput component. On success, hands the already-started intake
// session off to IntakeChat.jsx via router state so the patient drops
// straight into the same chat UI remote patients use — no route/UI fork
// past this screen.
const STEPS = { CODE: "code", CONFIRM: "confirm", OTP: "otp" };

export default function ClinicCheckIn() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.CODE);
  const [code, setCode] = useState("");
  const [doctor, setDoctor] = useState(null); // { doctorId, doctorName, clinicName }
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCodeSubmit(e) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setIsLoading(true);
    setError("");
    try {
      const result = await verifyClinicCode(trimmed);
      setDoctor(result);
      setStep(STEPS.CONFIRM);
    } catch (err) {
      // Deliberately the same generic message the backend returns for every
      // failure mode (PRD §3.4) — never guess at a more specific reason here.
      setError(err.message || "Invalid or expired code.");
    } finally {
      setIsLoading(false);
    }
  }

  async function startOtpStep() {
    setIsLoading(true);
    setError("");
    try {
      await sendClinicOtp();
      setStep(STEPS.OTP);
      setTimer(60);
      startCountdown();
    } catch (err) {
      setError(err.message || "Failed to send verification code.");
    } finally {
      setIsLoading(false);
    }
  }

  function startCountdown() {
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleOtpSubmit(e) {
    e.preventDefault();
    const otpCode = otp.join("");
    if (otpCode.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const session = await verifyClinicOtp({ doctorId: doctor.doctorId, otpCode });
      // Hand off into the existing chat UI — same shape as
      // POST /api/intake/start's response (see api/clinic.js).
      navigate("/intake", { replace: true, state: { preStartedSession: session } });
    } catch (err) {
      setError(err.message || "Invalid OTP code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    setOtp(["", "", "", "", "", ""]);
    setError("");
    try {
      await sendClinicOtp();
      setTimer(60);
      startCountdown();
    } catch (err) {
      setError(err.message || "Failed to resend verification code.");
    }
  }

  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center p-6 bg-slate-50">
      <div className="w-full max-w-[440px]">
        <div className="bg-white shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] rounded-[20px] p-8 lg:p-10 border border-slate-100">
          {step === STEPS.CODE && (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 mx-auto mb-4 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <Building2 size={28} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Clinic Check-In</h2>
                <p className="text-sm text-slate-500 mt-2">
                  Enter the check-in code displayed at your doctor's clinic.
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>
              )}

              <form onSubmit={handleCodeSubmit} className="space-y-6">
                <input
                  type="text"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
                  placeholder="e.g. 7K9M2P"
                  className="w-full h-14 text-center text-2xl font-bold tracking-[0.3em] uppercase bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-all"
                />
                <button
                  type="submit"
                  disabled={isLoading || !code.trim()}
                  className="w-full h-12 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                  {isLoading ? "Checking..." : "Continue"}
                </button>
              </form>
            </>
          )}

          {step === STEPS.CONFIRM && doctor && (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 mx-auto mb-4 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                  <ShieldCheck size={28} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Is this your doctor?</h2>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-center mb-6">
                <p className="text-lg font-semibold text-slate-900">{doctor.doctorName}</p>
                {doctor.clinicName && <p className="text-sm text-slate-500 mt-1">{doctor.clinicName}</p>}
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep(STEPS.CODE);
                    setDoctor(null);
                    setCode("");
                  }}
                  className="flex-1 h-12 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                >
                  No, go back
                </button>
                <button
                  type="button"
                  onClick={startOtpStep}
                  disabled={isLoading}
                  className="flex-1 h-12 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : "Yes, continue"}
                </button>
              </div>
            </>
          )}

          {step === STEPS.OTP && (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 mx-auto mb-4 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <ShieldCheck size={28} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Verify it's you</h2>
                <p className="text-sm text-slate-500 mt-2">
                  We've sent a 6-digit verification code to your account email.
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>
              )}

              <form onSubmit={handleOtpSubmit} className="space-y-8">
                <OtpInput value={otp} onChange={setOtp} disabled={isLoading} />

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
                >
                  {isLoading ? "Verifying..." : "Verify & Start Intake"}
                </button>
              </form>

              <div className="mt-6 text-center">
                {timer > 0 ? (
                  <p className="text-sm text-slate-500">
                    Resend code in <span className="font-semibold text-blue-700">{timer}s</span>
                  </p>
                ) : (
                  <button onClick={handleResend} className="text-sm font-semibold text-blue-700 hover:underline">
                    Resend Verification Code
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
