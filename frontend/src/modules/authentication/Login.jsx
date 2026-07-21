import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { useAuth } from "../../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { login, loginWithGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setShowRegisterPrompt(false);
    setIsLoading(true);

    try {
      const result = await login(email, password);
      setIsLoading(false);

      if (result?.requiresOTP) {
        setIsSuccess(true);
        setTimeout(() => {
          navigate("/verify-otp", { state: { email, isLogin: true } });
        }, 500);
        return;
      }

      setIsSuccess(true);
      setTimeout(() => {
        if (result?.user?.hasSelectedRole || (result?.user?.role && result?.user?.role !== 'none')) {
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/role-selection", { replace: true });
        }
      }, 800);
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(err.message || "Invalid credentials. Please try again.");
    }
  };

  const handleGoogleAuth = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsGoogleLoading(true);
      setErrorMessage("");
      setShowRegisterPrompt(false);

      try {
        const result = await loginWithGoogle(tokenResponse.access_token || tokenResponse);
        setIsGoogleLoading(false);
        setTimeout(() => {
          if (result?.user?.hasSelectedRole || (result?.user?.role && result?.user?.role !== 'none')) {
            navigate("/dashboard", { replace: true });
          } else {
            navigate("/role-selection", { replace: true });
          }
        }, 500);
      } catch (err) {
        setIsGoogleLoading(false);
        if (err.message?.includes("No account found") || err.message?.includes("register first")) {
          setErrorMessage("No account found with this Google email address.");
          setShowRegisterPrompt(true);
        } else {
          setErrorMessage(err.message || "Google Sign-In failed. Please try again.");
        }
      }
    },
    onError: () => {
      setIsGoogleLoading(false);
      setErrorMessage("Google Sign-In popup failed or was closed.");
    },
  });

  return (
    <main className="flex min-h-screen w-full flex-col md:flex-row bg-surface font-body-md text-on-surface antialiased overflow-hidden selection:bg-primary-fixed">
      {/* LEFT SIDE: Marketing / Illustration */}
      <section className="relative hidden lg:flex lg:w-1/2 xl:w-7/12 flex-col items-center justify-center p-xl overflow-hidden bg-surface-container-low">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-secondary-container/10 rounded-full blur-3xl"></div>

        <div className="relative z-10 max-w-2xl w-full flex flex-col items-center text-center">
          <div className="w-full mb-12 animate-float">
            <img
              alt="Swastha Healthcare AI Dashboard"
              className="w-full h-auto drop-shadow-2xl rounded-2xl"
              src="https://lh3.googleusercontent.com/aida/AP1WRLuDIwvGiKVVfWRy9nrLbB1tB-F2hMnLJmOF5Uk8i9UmRObLrHe0tE5Sh2kchdPdADaUei6YUcasoIjZB6ZkJbMt8_Gh88Rjv0Rd8dwzCpzCoFiPQcKRXZXYNHh4a7N4u3jH8eG8vfUCdGyv95Eg7S89twb05dz9w_kTT_3StrxqdTcClQrOl65BWyQ4-C-TfxJVSxqAllN1xQjWdTofpsMVjLBLLLgbPURPUgEj9DuSC6RPDnqO_kU_vSw"
            />
          </div>

          <div className="space-y-md">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              Your Family&apos;s Health. <br /> <span className="text-primary">Organized by AI.</span>
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-lg mx-auto">
              Securely access all your medical records, AI insights, medicine alerts, and family health timeline from one place.
            </p>
          </div>

          {/* Trust Badges */}
          <div className="mt-xl flex flex-wrap justify-center gap-md">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 border border-outline-variant/30 rounded-xl">
              <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>enhanced_encryption</span>
              <span className="font-label-md text-label-md text-on-surface-variant">End-to-End Encryption</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 border border-outline-variant/30 rounded-xl">
              <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              <span className="font-label-md text-label-md text-on-surface-variant">ABHA Ecosystem</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 border border-outline-variant/30 rounded-xl">
              <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <span className="font-label-md text-label-md text-on-surface-variant">AI-Powered Insights</span>
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT SIDE: Login Form */}
      <section className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 xl:p-24 bg-surface lg:bg-background">
        <div className="lg:hidden mb-8">
          <img
            alt="Swastha Logo"
            className="h-12 w-auto"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAJoSkUGc0Hv6hSwIbvCI4jXqfw51IEzG1-YtxI6ZPVQAgKF2gkF9bZKnreKdmbtKhGGVqaqifsmWUgklpWmQ5HOc8wCuxt1qRATJ_Lh2di1I5X4T6NAM789pr-DkSrLSej3v9HOhj7ZqEGyH6HQ8WcLrklNBJCzOHWE8w-F08fLnZHhFij-XNf_1_6ZyvNho1amapTks9-HG-P_KngfQr2YcLy_0llXOm7YKhNMA02JRcuWLpa7xSq"
          />
        </div>

        <div className="w-full max-w-[440px] flex flex-col">
          <div className="bg-white lg:shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] rounded-[16px] p-8 lg:p-10 border border-outline-variant/20 lg:border-none">
            <div className="text-center mb-10 hidden lg:block">
              <img
                alt="Swastha Logo"
                className="h-14 w-auto mx-auto mb-6"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAJoSkUGc0Hv6hSwIbvCI4jXqfw51IEzG1-YtxI6ZPVQAgKF2gkF9bZKnreKdmbtKhGGVqaqifsmWUgklpWmQ5HOc8wCuxt1qRATJ_Lh2di1I5X4T6NAM789pr-DkSrLSej3v9HOhj7ZqEGyH6HQ8WcLrklNBJCzOHWE8w-F08fLnZHhFij-XNf_1_6ZyvNho1amapTks9-HG-P_KngfQr2YcLy_0llXOm7YKhNMA02JRcuWLpa7xSq"
              />
              <h2 className="font-headline-md text-headline-md text-on-surface">Welcome Back</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">Log in to manage your clinical data</p>
            </div>

            <div className="lg:hidden mb-10 text-center">
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Welcome Back</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Access your family&apos;s health reports</p>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mb-6 p-4 rounded-xl bg-error-container text-on-error-container text-body-sm flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px]">error</span>
                  <span>{errorMessage}</span>
                </div>
                {showRegisterPrompt && (
                  <Link
                    to="/register"
                    className="mt-2 inline-flex items-center justify-center py-2 px-4 bg-primary text-white text-label-md rounded-lg font-semibold hover:bg-primary/90 transition-all"
                  >
                    Create a new Swastha account
                  </Link>
                )}
              </div>
            )}

            {/* Social Logins */}
            <div className="space-y-3 mb-8">
              <button
                type="button"
                onClick={() => handleGoogleAuth()}
                disabled={isGoogleLoading}
                className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white border border-outline-variant rounded-xl font-label-md text-label-md text-on-surface hover:bg-surface-container-low transition-colors duration-200"
              >
                {isGoogleLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Authenticating Google...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>
              <button
                className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl font-label-md text-label-md text-outline cursor-not-allowed"
                disabled
              >
                <span className="material-symbols-outlined text-[20px]">badge</span>
                Continue with ABHA(Coming Soon)
              </button>
            </div>

            {/* Divider */}
            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-outline-variant"></div>
              </div>
              <div className="relative flex justify-center text-label-sm">
                <span className="px-3 bg-white text-on-surface-variant font-label-md uppercase tracking-widest text-[10px]">Or with email</span>
              </div>
            </div>

            {/* Login Form */}
            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Email */}
              <div className="space-y-2">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1" htmlFor="email">
                  Email Address
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[20px]">mail</span>
                  <input
                    required
                    className="w-full pl-11 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl font-body-md text-body-md text-on-surface placeholder:text-outline/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200"
                    id="email"
                    placeholder="name@example.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[20px]">lock</span>
                  <input
                    required
                    className="w-full pl-11 pr-11 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl font-body-md text-body-md text-on-surface placeholder:text-outline/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-200"
                    id="password"
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Remember / Forgot */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary-container"
                    id="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <label className="ml-2 font-label-md text-label-md text-on-surface-variant cursor-pointer" htmlFor="remember">
                    Remember Me
                  </label>
                </div>
                <Link className="font-label-md text-label-md text-primary hover:underline transition-all" to="/forgot-password">
                  Forgot Password?
                </Link>
              </div>

              {/* Submit */}
              <button
                className={`w-full h-[48px] font-label-md text-body-md rounded-xl active:scale-[0.98] transition-all duration-200 shadow-md shadow-primary-container/20 flex items-center justify-center gap-2 ${
                  isSuccess
                    ? "bg-green-600 text-white"
                    : "bg-primary-container text-white hover:bg-primary-container/90"
                }`}
                type="submit"
                disabled={isLoading || isSuccess || isGoogleLoading}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Authenticating...
                  </>
                ) : isSuccess ? (
                  <>
                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    Sending Verification Code...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Don&apos;t have an account?{" "}
                <Link className="text-primary font-semibold hover:underline" to="/register">
                  Create an account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}