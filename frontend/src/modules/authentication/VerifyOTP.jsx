import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import OtpInput from "../../components/Common/OtpInput";

export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, verifyOTP, sendOTP } = useAuth();

  const email = location.state?.email || "user@example.com";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(60);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Only redirect if no active email state in navigation AND user is already fully authenticated with a selected role
    if (!location.state?.email && user && user.hasSelectedRole) {
      navigate(user.role === 'doctor' ? '/doctor-dashboard' : '/dashboard', { replace: true });
    }
  }, [user, navigate, location.state]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const otpString = otp.join("");
    if (otpString.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const result = await verifyOTP(email, otpString);
      setIsLoading(false);
      if (result?.user?.hasSelectedRole) {
        navigate(result?.user?.role === 'doctor' ? "/doctor-dashboard" : "/dashboard", { replace: true });
      } else {
        navigate("/role-selection", { replace: true });
      }
    } catch (err) {
      setIsLoading(false);
      setError(err.message || "Invalid OTP code. Please try again.");
    }
  };

  const handleResend = async () => {
    setTimer(60);
    setOtp(["", "", "", "", "", ""]);
    setError("");
    try {
      await sendOTP(email);
    } catch (err) {
      setError(err.message || "Failed to resend verification code.");
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center p-6 bg-surface font-body-md text-on-surface selection:bg-primary-fixed">
      <div className="w-full max-w-[440px]">
        <div className="bg-white shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] rounded-[20px] p-8 lg:p-10 border border-outline-variant/20 ">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 bg-primary-container/10 text-primary rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[30px]">phonelink_ring</span>
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface ">Verify Security Code</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
              We&apos;ve sent a 6-digit verification code to <span className="font-semibold text-on-surface ">{email}</span>
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-error-container text-on-error-container text-body-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px]">error</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <OtpInput value={otp} onChange={setOtp} disabled={isLoading} />

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[48px] font-label-md text-body-md bg-primary-container text-white rounded-xl hover:bg-primary-container/90 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? "Verifying..." : "Verify & Continue"}
            </button>
          </form>

          <div className="mt-8 text-center">
            {timer > 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant ">
                Resend code in <span className="font-semibold text-primary">{timer}s</span>
              </p>
            ) : (
              <button
                onClick={handleResend}
                className="font-label-md text-label-md text-primary font-semibold hover:underline"
              >
                Resend Verification Code
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
