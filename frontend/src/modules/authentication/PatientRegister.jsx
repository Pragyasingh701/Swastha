import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function PatientRegister() {
  const navigate = useNavigate();
  const { user, register, updateProfile, setUserRole, logout } = useAuth();

  useEffect(() => {
    // Check if user has already completed registration
    const storedUser = JSON.parse(localStorage.getItem('swastha_user') || 'null');
    const activeUser = user || storedUser;

    if (activeUser?.hasSelectedRole || (activeUser?.role && activeUser?.role !== 'none')) {
      navigate("/dashboard", { replace: true });
      return;
    }

    // Check if user is not authenticated
    const hasToken = localStorage.getItem('swastha_token');
    if (!activeUser && !hasToken) {
      navigate("/login", { replace: true });
    }
  }, [user, navigate]);

  const [formData, setFormData] = useState({
    fullName: user?.fullName || user?.name || "",
    email: user?.email || "",
    phone: user?.phone || user?.mobile || "",
    dob: "",
    bloodGroup: "",
    gender: "",
    password: "",
    confirmPassword: "",
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!agreedToTerms) {
      setErrorMessage("Please accept the Terms of Service & Privacy Policy before completing registration.");
      return;
    }

    const cleanedPhone = formData.phone ? formData.phone.replace(/[\s\-\+\(\)]/g, '') : '';
    if (!/^\d{10,15}$/.test(cleanedPhone) || /^(\d)\1{9,}$/.test(cleanedPhone) || cleanedPhone === '1234567890' || cleanedPhone === '0123456789') {
      setErrorMessage("Please enter a valid 10-digit mobile number.");
      return;
    }

    if (!formData.gender) {
      setErrorMessage("Please select your gender before completing registration.");
      return;
    }

    setIsLoading(true);

    try {
      if (updateProfile) {
        await updateProfile({
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          dob: formData.dob,
          bloodGroup: formData.bloodGroup,
          blood_group: formData.bloodGroup,
          gender: formData.gender,
          role: "patient",
          hasSelectedRole: true,
        });
      } else {
        setUserRole("patient");
      }
      setIsLoading(false);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(err.message || "Failed to complete registration. Please try again.");
    }
  };

  return (
    <div className="bg-background dark:bg-slate-950 text-on-background dark:text-slate-100 min-h-screen">
      <main className="flex min-h-screen">
        {/* Left Side: Visual & Brand Content */}
        <section className="hidden lg:flex flex-col relative w-1/2 bg-on-primary-fixed overflow-hidden p-margin-desktop">
          {/* Background Atmosphere */}
          <div className="absolute inset-0 z-0">
            <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-20%] left-[-10%] w-[800px] h-[800px] bg-secondary/10 rounded-full blur-[150px]"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent"></div>
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col h-full">
            {/* Brand Anchor */}
            <div className="flex items-center gap-2 mb-2xl">
              <span
                className="material-symbols-outlined text-primary-container text-4xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                health_and_safety
              </span>
              <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight text-white">Swastha</h1>
            </div>

            <div className="mt-auto max-w-xl">
              <h2 className="font-display text-display text-white mb-md leading-tight">
                Start Your Digital Health Journey.
              </h2>
              <p className="font-body-lg text-body-lg text-primary-fixed/80 mb-xl">
                Join 10,000+ families managing their health with AI-powered precision and clinical-grade
                intelligence.
              </p>

              {/* Feature Grid */}
              <div className="grid grid-cols-2 gap-md mb-3xl">
                <div className="glass-panel p-md rounded-xl flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-container">verified_user</span>
                  <span className="font-label-md text-label-md text-white">ABHA Integrated</span>
                </div>
                <div className="glass-panel p-md rounded-xl flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-container">security</span>
                  <span className="font-label-md text-label-md text-white">HIPAA Compliant</span>
                </div>
                <div className="glass-panel p-md rounded-xl flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-container">lock</span>
                  <span className="font-label-md text-label-md text-white">End-to-End Encrypted</span>
                </div>
                <div className="glass-panel p-md rounded-xl flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-container">psychology</span>
                  <span className="font-label-md text-label-md text-white">AI Driven Analysis</span>
                </div>
              </div>
            </div>

            {/* High-Fidelity Medical Lab Illustration */}
            <div className="relative mt-auto w-full aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl group">
              <div className="absolute inset-0 bg-primary/10 group-hover:bg-primary/5 transition-colors duration-500 z-10"></div>
              <img
                className="w-full h-full object-cover grayscale-[0.2] contrast-[1.1]"
                alt="A futuristic medical laboratory with holographic displays showing glowing DNA strands and 3D heart models."
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCXt5sdBE4aMX5Sluz1JxsWLYcJamuNx6pdEi5WiYcfgrKYu_P_AYUV9uAyH1GYIV-k4nnQf-LQllX_gIybENGx99OiCi3BRJ8MEYjBlH8C5awamw34durhHtrcZ1MXW_ltcM059s7jOLNPCZDlcsXyNSZldS6K5JpJxcbAJFEMmC0xWUB6iEIYXMEBiKB2MlET_qX0Ii5cYumHz9MD_Kjov-0Am_iq97ih5KrMAQxPI0kxEWB-5uPU"
              />
              <div className="absolute bottom-4 right-4 z-20 flex gap-2">
                <div className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[10px] text-white/70 uppercase tracking-widest font-bold">
                  System Status: Active
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Side: Registration Form */}
        <section className="w-full lg:w-1/2 flex items-center justify-center p-margin-mobile md:p-margin-desktop bg-surface dark:bg-slate-900">
          <div className="w-full max-w-[480px]">
            {/* Mobile Branding */}
            <div className="lg:hidden flex items-center gap-2 mb-xl">
              <span
                className="material-symbols-outlined text-primary text-3xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                health_and_safety
              </span>
              <span className="font-headline-md text-headline-md font-bold text-primary">Swastha</span>
            </div>

            <div className="mb-xl">
              <h3 className="font-headline-lg text-headline-lg text-on-surface dark:text-slate-100 mb-xs">Create Patient Account</h3>
              <p className="font-body-md text-body-md text-on-surface-variant dark:text-slate-400">
                Step into the future of healthcare management.
              </p>
            </div>

            {/* Registration Card */}
            <div className="space-y-lg">
              {/* ABHA Integration Action */}
              <button
                type="button"
                className="w-full h-[52px] bg-primary text-white font-label-md text-label-md rounded-xl flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
              >
                <span className="material-symbols-outlined text-[20px]">fingerprint</span>
                Continue with ABHA
              </button>

              {errorMessage && (
                <div className="p-4 rounded-xl bg-error-container dark:bg-rose-500/10 text-on-error-container dark:text-rose-300 text-body-sm flex items-center gap-3 border border-error/20 dark:border-rose-500/20 shadow-sm">
                  <span className="material-symbols-outlined text-[20px] text-error">error</span>
                  <span className="font-medium">{errorMessage}</span>
                </div>
              )}

              {/* Form Fields */}
              <form className="space-y-md" onSubmit={handleSubmit}>
                <div className="space-y-sm">
                  <div className="flex items-center justify-between ml-1">
                    <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 block">Full Name</label>
                    <span className="text-[11px] text-outline dark:text-slate-500 font-medium flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">lock</span> Account Name
                    </span>
                  </div>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline dark:text-slate-500 text-[20px]">
                      person
                    </span>
                    <input
                      readOnly
                      className="w-full h-[48px] pl-12 pr-4 bg-surface-container-low dark:bg-slate-800 border border-outline-variant/60 dark:border-slate-700 rounded-xl font-body-md text-body-md text-on-surface dark:text-slate-100 cursor-not-allowed opacity-90 select-none"
                      placeholder="Johnathan Doe"
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                    />
                  </div>
                </div>

                <div className="space-y-sm">
                  <div className="flex items-center justify-between ml-1">
                    <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 block">
                      Email Address
                    </label>
                    <span className="text-[11px] text-outline dark:text-slate-500 font-medium flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">lock</span> Account Email
                    </span>
                  </div>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline dark:text-slate-500 text-[20px]">
                      mail
                    </span>
                    <input
                      readOnly
                      className="w-full h-[48px] pl-12 pr-4 bg-surface-container-low dark:bg-slate-800 border border-outline-variant/60 dark:border-slate-700 rounded-xl font-body-md text-body-md text-on-surface dark:text-slate-100 cursor-not-allowed opacity-90 select-none"
                      placeholder="john@healthcare.com"
                      type="email"
                      name="email"
                      value={formData.email}
                    />
                  </div>
                </div>

                <div className="space-y-sm">
                  <div className="flex items-center justify-between ml-1">
                    <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 block">
                      Phone Number
                    </label>
                    {user?.phone || user?.mobile ? (
                      <span className="text-[11px] text-outline dark:text-slate-500 font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">lock</span> Account Phone
                      </span>
                    ) : (
                      <span className="text-[11px] text-primary font-medium">Please enter your 10-digit phone number</span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline dark:text-slate-500 text-[20px]">
                      call
                    </span>
                    <input
                      readOnly={!!(user?.phone || user?.mobile)}
                      className={`w-full h-[48px] pl-12 pr-4 rounded-xl border border-outline-variant dark:border-slate-700 transition-all font-body-md text-body-md ${
                        user?.phone || user?.mobile
                          ? "bg-surface-container-low dark:bg-slate-800 cursor-not-allowed opacity-90 select-none"
                          : "bg-surface-container-low dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      }`}
                      placeholder="+91 98765 43210"
                      required
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                {/* Date of Birth, Blood Group & Gender */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                  <div className="space-y-sm">
                    <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 block ml-1">
                      Date of Birth
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline dark:text-slate-500 text-[20px]">
                        calendar_today
                      </span>
                      <input
                        required
                        className="w-full h-[48px] pl-12 pr-4 bg-surface-container-low dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body-md text-body-md placeholder:text-outline/50 dark:placeholder:text-slate-500"
                        type="date"
                        name="dob"
                        value={formData.dob}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                  <div className="space-y-sm">
                    <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 block ml-1">
                      Blood Group
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline dark:text-slate-500 text-[20px]">
                        water_drop
                      </span>
                      <select
                        required
                        className="w-full h-[48px] pl-12 pr-4 bg-surface-container-low dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body-md text-body-md appearance-none"
                        name="bloodGroup"
                        value={formData.bloodGroup}
                        onChange={handleChange}
                      >
                        <option value="" disabled>
                          Select Blood Group
                        </option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-sm">
                    <label className="font-label-md text-label-md text-on-surface-variant dark:text-slate-400 block ml-1">
                      Gender
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline dark:text-slate-500 text-[20px]">
                        person
                      </span>
                      <select
                        required
                        className="w-full h-[48px] pl-12 pr-4 bg-surface-container-low dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body-md text-body-md appearance-none"
                        name="gender"
                        value={formData.gender}
                        onChange={handleChange}
                      >
                        <option value="" disabled>
                          Select Gender
                        </option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Terms */}
                <div className="flex items-start gap-3 py-2">
                  <input
                    required
                    className="mt-1 w-5 h-5 rounded border-outline-variant dark:border-slate-700 text-primary focus:ring-primary/20 cursor-pointer"
                    id="terms"
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                  />
                  <label className="font-body-sm text-body-sm text-on-surface-variant dark:text-slate-400 leading-relaxed" htmlFor="terms">
                    I agree to the{" "}
                    <a className="text-primary hover:underline font-medium" href="#">
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a className="text-primary hover:underline font-medium" href="#">
                      Privacy Policy
                    </a>
                    . I understand how my health data is encrypted.
                  </label>
                </div>

                {/* Submit */}
                <button
                  className="w-full h-[52px] bg-primary-container text-on-primary-container font-label-md text-label-md font-semibold rounded-xl hover:shadow-lg hover:shadow-primary/10 transition-all active:scale-[0.99] mt-md disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating Account...
                    </>
                  ) : (
                    "Create My Health Account"
                  )}
                </button>
              </form>

              {/* Login Link */}
              <div className="text-center pt-md">
                <p className="font-body-md text-body-md text-on-surface-variant dark:text-slate-400">
                  Want to use another account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      navigate('/login', { replace: true });
                    }}
                    className="text-primary font-bold hover:underline ml-1 focus:outline-none"
                  >
                    Login
                  </button>
                </p>
              </div>
            </div>

            {/* Subtle Footer for form side */}
            <div className="mt-2xl flex justify-center gap-xl opacity-40 grayscale pointer-events-none">
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">shield</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">Secure TLS 1.3</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">verified</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">ISO 27001</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
