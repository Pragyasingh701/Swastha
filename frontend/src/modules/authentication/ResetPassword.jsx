import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authService } from "../../services/auth";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingToken, setIsVerifyingToken] = useState(true);
  const [isTokenInvalid, setIsTokenInvalid] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setIsTokenInvalid(true);
      setIsVerifyingToken(false);
      setError("No password reset token provided. Please request a new link.");
      return;
    }

    const checkToken = async () => {
      try {
        await authService.verifyResetToken(token);
        setIsVerifyingToken(false);
      } catch (err) {
        setIsVerifyingToken(false);
        setIsTokenInvalid(true);
        setError(err.message || "This password reset link is invalid or has already been used.");
      }
    };

    checkToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isTokenInvalid) return;

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      await authService.resetPassword(token, password);
      setIsLoading(false);
      setIsSuccess(true);
      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err) {
      setIsLoading(false);
      if (err.message?.includes("invalid") || err.message?.includes("expired")) {
        setIsTokenInvalid(true);
      }
      setError(err.message || "Failed to reset password.");
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center p-6 bg-surface dark:bg-slate-950 font-body-md text-on-surface dark:text-slate-100 selection:bg-primary-fixed">
      <div className="w-full max-w-[440px]">
        <div className="bg-white dark:bg-slate-900 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] rounded-[20px] p-8 lg:p-10 border border-outline-variant/20 dark:border-slate-700">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 bg-primary-container/10 text-primary rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[30px]">key</span>
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface dark:text-slate-100">Reset Your Password</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400 mt-2">
              {isTokenInvalid ? "Expired or Used Reset Link" : "Please enter your new password below."}
            </p>
          </div>

          {isVerifyingToken ? (
            <div className="text-center py-6 text-on-surface-variant dark:text-slate-400 flex flex-col items-center justify-center gap-3">
              <svg className="animate-spin h-6 w-6 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Verifying reset link...</span>
            </div>
          ) : error && isTokenInvalid ? (
            <div className="mb-6 p-4 rounded-xl bg-error-container dark:bg-rose-500/10 text-on-error-container dark:text-rose-300 text-body-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px]">error</span>
              <span>{error}</span>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 p-4 rounded-xl bg-error-container dark:bg-rose-500/10 text-on-error-container dark:text-rose-300 text-body-sm flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px]">error</span>
                  <span>{error}</span>
                </div>
              )}

              {isSuccess ? (
                <div className="text-center space-y-4 py-4">
                  <div className="w-12 h-12 mx-auto bg-green-100 dark:bg-emerald-500/10 text-green-600 dark:text-emerald-400 rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-[28px]">check</span>
                  </div>
                  <h3 className="font-headline-sm text-on-surface dark:text-slate-100">Password Updated!</h3>
                  <p className="font-body-sm text-on-surface-variant dark:text-slate-400">Redirecting to login...</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 ml-1" htmlFor="newPassword">
                      New Password
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline dark:text-slate-500 text-[20px]">
                        lock
                      </span>
                      <input
                        required
                        id="newPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-11 pr-11 py-3 bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-700 rounded-xl font-body-md text-on-surface dark:text-slate-100 focus:outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-outline dark:text-slate-500 hover:text-on-surface dark:hover:text-slate-100"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {showPassword ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 ml-1" htmlFor="confirmPassword">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline dark:text-slate-500 text-[20px]">
                        lock_reset
                      </span>
                      <input
                        required
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-11 pr-11 py-3 bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-700 rounded-xl font-body-md text-on-surface dark:text-slate-100 focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || isTokenInvalid}
                    className="w-full h-[48px] font-label-md text-body-md bg-primary-container text-white rounded-xl hover:bg-primary-container/90 transition-all flex items-center justify-center gap-2"
                  >
                    {isLoading ? "Updating Password..." : "Update Password"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
