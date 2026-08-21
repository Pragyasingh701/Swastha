import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { startGoogleAuth } from "../../utils/googleAuth";
import { sanitizePhoneInput, isValidIndianPhone, isValidEmail, isValidFullName } from "../../utils/formValidation";
import swasthaLogo from "../../assets/swastha-logo.png"; // adjust this path to wherever you keep the logo asset

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    fullname: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const handleChange = (e) => {
    const { id, value } = e.target;
    if (id === "phone") {
      setFormData((prev) => ({ ...prev, phone: sanitizePhoneInput(value) }));
      return;
    }
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreedToTerms) {
      setErrorMessage("Please accept the Terms of Service & Privacy Policy.");
      return;
    }
    if (!isValidFullName(formData.fullname)) {
      setErrorMessage("Please enter your full name using letters only (2-60 characters).");
      return;
    }
    if (!isValidEmail(formData.email)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!isValidIndianPhone(formData.phone)) {
      setErrorMessage("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    if (formData.password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    setErrorMessage("");
    setShowLoginPrompt(false);
    setIsLoading(true);

    try {
      const result = await register({
        fullName: formData.fullname,
        email: formData.email,
        password: formData.password,
        phone: formData.phone,
        role: "none",
      });
      setIsLoading(false);

      if (result?.requiresOTP) {
        setIsSuccess(true);
        setTimeout(() => {
          navigate("/verify-otp", { state: { email: formData.email, isRegister: true } });
        }, 500);
        return;
      }

      setIsSuccess(true);
      setTimeout(() => {
        navigate("/role-selection", { replace: true });
      }, 800);
    } catch (err) {
      setIsLoading(false);
      if (err.message?.includes("already exists") || err.message?.includes("log in instead")) {
        setErrorMessage("An account with this email already exists.");
        setShowLoginPrompt(true);
      } else {
        setErrorMessage(err.message || "Registration failed. Please try again.");
      }
    }
  };

  const handleGoogleRegister = () => startGoogleAuth({ mode: "register", role: "none" });

  return (
    <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center overflow-x-hidden">
      {/* Ambient Background Element */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-secondary/5 rounded-full blur-[100px]"></div>
      </div>

      {/* Main Content Split Layout */}
      <main className="w-full max-w-[1440px] min-h-[90vh] md:min-h-[80vh] flex flex-col md:flex-row shadow-2xl rounded-3xl overflow-hidden mx-4 md:mx-12 my-8 bg-surface-container-lowest ">
        {/* Left Column: Visual/Atmospheric (Hidden on mobile) */}
        <section className="hidden lg:flex lg:w-1/2 relative bg-primary-container items-center justify-center p-16 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              className="w-full h-full object-cover opacity-60"
              alt="A futuristic medical laboratory with clean white lines, holographic health data visualizations floating in the air, and a clinical yet inviting atmosphere."
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDz5wWv8vfn1PR2dJNowbF5vldudSF8uYZFB0d4ejH30ciczx74st_aCvYvKRppkxH1jyXvjs7bEyKGMnF0y1YKilevmdg_rFjIfZzIwtybiutLa4WMTSgeGGdFYzzUvPKaKo_awe3ko9RNMWRDuwLadQa8ksRlkXLOZdzjpOprlcpfHZjmGEBFs1DeaXq62aFLEFrYr6UlH3lOfStHxEEymssdUHWfFkLaf-N9AqqQQNS9gqTrtFaL"
            />
          </div>
          <div className="relative z-10 glass-panel p-12 rounded-[2rem] max-w-lg border-white/20 shadow-2xl">
            <div className="flex items-center mb-8">
              <img src={swasthaLogo} alt="Swastha AI" className="h-10 w-auto" />
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface mb-4 leading-tight">
              Your entire medical journey,{" "}
              <span className="text-primary">unified by intelligence.</span>
            </h1>
            <p className="font-label-md text-label-md text-primary font-bold tracking-[0.12em] uppercase mb-1.5">
              AI-Powered Clinical Intelligence Platform
            </p>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Smarter Insights. Better Decisions. Improved Outcomes.
            </p>
            <div className="mt-12 pt-8 border-t border-outline-variant/30 flex items-center gap-4">
              <div className="flex -space-x-3">
                <div className="w-10 h-10 rounded-full border-2 border-white bg-surface-dim"></div>
                <div className="w-10 h-10 rounded-full border-2 border-white bg-surface-dim"></div>
                <div className="w-10 h-10 rounded-full border-2 border-white bg-surface-dim"></div>
              </div>
              <p className="font-label-md text-label-md text-on-surface-variant">
                Joined by 10k+ health enthusiasts
              </p>
            </div>
          </div>
        </section>

        {/* Right Column: Registration Form */}
        <section className="w-full lg:w-1/2 flex flex-col p-8 md:p-16 lg:p-20 bg-surface-container-lowest justify-center">
          <div className="max-w-md mx-auto w-full">
            {/* Mobile Branding */}
            <div className="lg:hidden flex items-center mb-10">
              <img src={swasthaLogo} alt="Swastha AI" className="h-8 w-auto" />
            </div>

            <div className="mb-10">
              <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight mb-2">
                Create your account
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant ">
                Start your journey to better health management today.
              </p>
            </div>

            {errorMessage && (
              <div className="mb-6 p-4 rounded-xl bg-error-container text-on-error-container text-body-sm flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px]">error</span>
                  <span>{errorMessage}</span>
                </div>
                {showLoginPrompt && (
                  <Link
                    to="/login"
                    className="mt-2 inline-flex items-center justify-center py-2 px-4 bg-primary text-white text-label-md rounded-lg font-semibold hover:bg-primary/90 transition-all"
                  >
                    Log into existing account
                  </Link>
                )}
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Full Name */}
              <div>
                <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5 ml-1" htmlFor="fullname">
                  Full Name
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors !text-[20px]">
                    person
                  </span>
                  <input
                    required
                    className="w-full h-11 pl-11 bg-surface border border-outline-variant rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-outline-variant/60 font-body-md text-body-md text-on-surface "
                    id="fullname"
                    placeholder="Dr. Sarah Johnson"
                    type="text"
                    value={formData.fullname}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5 ml-1" htmlFor="email">
                  Email Address
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors !text-[20px]">
                    mail
                  </span>
                  <input
                    required
                    className="w-full h-11 pl-11 bg-surface border border-outline-variant rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-outline-variant/60 font-body-md text-body-md text-on-surface "
                    id="email"
                    placeholder="sarah.j@healthcare.com"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5 ml-1" htmlFor="phone">
                  Phone Number
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors !text-[20px]">
                    call
                  </span>
                  <input
                    required
                    className="w-full h-11 pl-11 bg-surface border border-outline-variant rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-outline-variant/60 font-body-md text-body-md text-on-surface "
                    id="phone"
                    placeholder="98765 43210"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Password Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5 ml-1" htmlFor="password">
                    Password
                  </label>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors !text-[20px]">
                      lock
                    </span>
                    <input
                      required
                      className="w-full h-11 pl-11 bg-surface border border-outline-variant rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-outline-variant/60 font-body-md text-body-md text-on-surface "
                      id="password"
                      placeholder="••••••••"
                      type="password"
                      value={formData.password}
                      onChange={handleChange}
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5 ml-1" htmlFor="confirmPassword">
                    Confirm Password
                  </label>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors !text-[20px]">
                      shield_lock
                    </span>
                    <input
                      required
                      className="w-full h-11 pl-11 bg-surface border border-outline-variant rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-outline-variant/60 font-body-md text-body-md text-on-surface "
                      id="confirmPassword"
                      placeholder="••••••••"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>

              {/* Terms & Privacy */}
              <div className="flex items-start gap-3 py-2">
                <div className="flex items-center h-5">
                  <input
                    className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary/20 transition-all cursor-pointer"
                    id="terms"
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                  />
                </div>
                <label className="font-body-sm text-body-sm text-on-surface-variant leading-tight" htmlFor="terms">
                  I agree to the{" "}
                  <a className="text-primary hover:underline font-semibold" href="#">
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a className="text-primary hover:underline font-semibold" href="#">
                    Privacy Policy
                  </a>
                  .
                </label>
              </div>

              {/* Actions */}
              <button
                className="w-full bg-primary text-white h-12 rounded-xl font-body-md text-body-md font-bold shadow-lg hover:shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                type="submit"
                disabled={isLoading || !agreedToTerms}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </button>

              <div className="relative py-4 flex items-center gap-4">
                <div className="h-px bg-outline-variant/50 flex-1"></div>
                <span className="font-label-sm text-label-sm text-outline-variant ">OR CONTINUE WITH</span>
                <div className="h-px bg-outline-variant/50 flex-1"></div>
              </div>

              <button
                className="w-full h-12 border border-outline-variant rounded-xl flex items-center justify-center gap-3 font-body-md text-body-md font-semibold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                type="button"
                onClick={handleGoogleRegister}
                disabled={isLoading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
                </svg>
                Sign up with Google
              </button>
            </form>

            <div className="mt-10 text-center">
              <p className="font-body-md text-body-md text-on-surface-variant ">
                Already have an account?{" "}
                <Link className="text-primary font-bold hover:underline" to="/login">
                  Login
                </Link>
              </p>
            </div>

            {/* Security Trust Badges */}
            <div className="mt-12 flex flex-col items-center gap-4">
              <div className="flex items-center gap-6 opacity-60">
                <div className="flex items-center gap-1.5 text-on-surface ">
                  <span className="material-symbols-outlined !text-[18px]">verified_user</span>
                  <span className="font-label-sm text-label-sm">Secure SSL Encryption</span>
                </div>
                <div className="flex items-center gap-1.5 text-on-surface ">
                  <span className="material-symbols-outlined !text-[18px]">verified_user</span>
                  <span className="font-label-sm text-label-sm">Verified Doctors</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-container rounded-full opacity-70">
                <span
                  className="material-symbols-outlined !text-[14px] text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  mail
                </span>
                <span className="font-label-sm text-[10px] uppercase tracking-widest font-bold text-on-surface ">
                  OTP-Verified Signup
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Component (Minimal) */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 flex justify-between items-center z-50 pointer-events-none">
        <div className="pointer-events-auto">
          <span className="font-label-sm text-label-sm text-on-surface-variant/50 ">
            © 2026 Swastha Healthcare SaaS.
          </span>
        </div>
        <div className="pointer-events-auto flex gap-6">
          <a className="font-label-sm text-label-sm text-on-surface-variant/50 hover:text-primary transition-colors" href="#">
            Privacy
          </a>
          <a className="font-label-sm text-label-sm text-on-surface-variant/50 hover:text-primary transition-colors" href="#">
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}