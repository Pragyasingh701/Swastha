import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authService } from "../../services/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const result = await authService.forgotPassword(email);
      setIsLoading(false);
      setSubmitted(true);
      setMessage(result.message || `Password reset instructions sent to ${email}`);
    } catch (err) {
      setIsLoading(false);
      setError(err.message || "Failed to process request. Please check your email address.");
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center p-6 bg-surface font-body-md text-on-surface selection:bg-primary-fixed">
      <div className="w-full max-w-[440px]">
        <div className="bg-white shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] rounded-[20px] p-8 lg:p-10 border border-outline-variant/20 ">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 bg-primary-container/10 text-primary rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[30px]">lock_reset</span>
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface ">Forgot Password?</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
              Enter the email address associated with your Swastha account and we&apos;ll send you a password reset link.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-error-container text-on-error-container text-body-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {submitted ? (
            <div className="text-center space-y-6">
              <div className="p-4 rounded-xl bg-green-50 text-green-800 text-body-sm flex items-center gap-3">
                <span className="material-symbols-outlined text-green-600 text-[24px]">mark_email_read</span>
                <span>{message}</span>
              </div>
              <p className="font-body-sm text-on-surface-variant ">
                Didn&apos;t receive the email? Check your spam folder or{" "}
                <button onClick={() => setSubmitted(false)} className="text-primary font-semibold hover:underline">
                  try again
                </button>
              </p>
              <Link
                to="/login"
                className="w-full h-[48px] font-label-md text-body-md bg-primary-container text-white rounded-xl flex items-center justify-center gap-2"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1" htmlFor="resetEmail">
                  Email Address
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[20px]">
                    mail
                  </span>
                  <input
                    required
                    id="resetEmail"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl font-body-md text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[48px] font-label-md text-body-md bg-primary-container text-white rounded-xl hover:bg-primary-container/90 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? "Sending Instructions..." : "Send Reset Link"}
              </button>

              <div className="text-center pt-2">
                <Link to="/login" className="font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}