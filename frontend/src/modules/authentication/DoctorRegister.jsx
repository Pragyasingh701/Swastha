import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function DoctorRegister() {
  const navigate = useNavigate();
  const { user, updateProfile, uploadDocument, setUserRole, logout } = useAuth();

  useEffect(() => {
    // Check if user has already completed registration
    const storedUser = JSON.parse(localStorage.getItem('swastha_user') || 'null');
    const activeUser = user || storedUser;

    if (activeUser?.hasSelectedRole || (activeUser?.role && activeUser?.role !== 'none')) {
      navigate(activeUser?.role === 'doctor' ? "/doctor-dashboard" : "/dashboard", { replace: true });
      return;
    }

    // Check if user is not authenticated
    const hasToken = localStorage.getItem('swastha_token');
    if (!activeUser && !hasToken) {
      navigate("/login", { replace: true });
    }
  }, [user, navigate]);

  const [form, setForm] = useState({
    fullName: user?.fullName || user?.name || "",
    email: user?.email || "",
    mobile: user?.phone || user?.mobile || "",
    dob: user?.dob || "",
    password: "",
    regNumber: "",
    council: "",
    degree: "",
    specialization: "",
    experience: 5,
    hospitalName: "",
    address: "",
  });
  const [files, setFiles] = useState({
    regCertificate: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const regCertInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (key) => (e) => {
    const file = e.target.files?.[0] || null;
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Mobile Number Correctness Check
    const cleanedMobile = form.mobile ? form.mobile.replace(/[\s\-\+\(\)]/g, '') : '';
    if (!/^\d{10,15}$/.test(cleanedMobile) || /^(\d)\1{9,}$/.test(cleanedMobile) || cleanedMobile === '1234567890' || cleanedMobile === '0123456789') {
      setErrorMessage("Please enter a valid 10-digit mobile number.");
      return;
    }

    if (!form.dob) {
      setErrorMessage("Date of Birth is required.");
      return;
    }

    if (!files.regCertificate) {
      setErrorMessage("Medical Registration Certificate is required. Please upload your document.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      let regCertificateUrl = null;

      if (files.regCertificate && uploadDocument) {
        try {
          const res = await uploadDocument(files.regCertificate);
          regCertificateUrl = res.url;
        } catch (fErr) {
          console.warn("Registration certificate upload notice:", fErr.message);
        }
      }

      if (updateProfile) {
        await updateProfile({
          fullName: form.fullName,
          email: form.email,
          phone: form.mobile,
          mobile: form.mobile,
          dob: form.dob,
          regNumber: form.regNumber,
          licenseNumber: form.regNumber,
          council: form.council,
          degree: form.degree,
          specialization: form.specialization,
          specialty: form.specialization,
          experience: form.experience,
          hospitalName: form.hospitalName,
          address: form.address,
          regCertificateUrl,
          role: "doctor",
          hasSelectedRole: true,
        });
      } else {
        setUserRole("doctor");
      }
      setIsSubmitting(false);
      navigate("/doctor-dashboard", { replace: true });
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage(err.message || "Failed to complete registration. Please check your credentials and try again.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col text-on-surface" style={{ backgroundColor: "#faf8ff" }}>
      {/* TopNavBar */}
      <nav className="bg-surface/80 dark:bg-surface-dim/80 backdrop-blur-lg border-b border-outline-variant/30 sticky top-0 z-50 shadow-sm">
        <div className="flex justify-between items-center w-full px-6 py-3 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-8">
            <span className="font-headline-md text-headline-md font-bold text-primary tracking-tight">Swastha</span>
            <div className="hidden md:flex gap-6 items-center">
              <span className="text-on-surface-variant hover:text-primary transition-colors font-body-md text-body-md cursor-pointer">Features</span>
              <span className="text-on-surface-variant hover:text-primary transition-colors font-body-md text-body-md cursor-pointer">ABHA Sync</span>
              <span className="text-on-surface-variant hover:text-primary transition-colors font-body-md text-body-md cursor-pointer">Vault</span>
              <span className="text-on-surface-variant hover:text-primary transition-colors font-body-md text-body-md cursor-pointer">Timeline</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              className="font-label-md text-label-md text-primary font-bold hover:underline transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">account_circle</span>
              Login using another account
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-grow flex items-center justify-center p-4 md:p-12 lg:p-16">
        <div className="w-full max-w-4xl">
          {/* Registration Header */}
          <div className="text-center mb-12">
            <h1 className="font-display text-[40px] md:text-display text-on-surface mb-4">Doctor Registration</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
              Join the Swastha network to provide intelligent, data-driven healthcare. Please complete all sections
              below.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-error-container text-on-error-container text-body-sm flex items-center gap-3 border border-error/20 shadow-sm">
              <span className="material-symbols-outlined text-[20px] text-error">error</span>
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          <form className="space-y-8" onSubmit={handleSubmit}>
            {/* Section 1: Personal Information */}
            <div className="glass-morphism rounded-[24px] shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="p-8 md:p-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">person</span>
                  </div>
                  <h2 className="font-headline-md text-headline-md text-on-surface">Personal Information</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="font-label-md text-label-md text-on-surface-variant">Full Name</label>
                      <span className="text-[11px] text-outline font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">lock</span> Account Name
                      </span>
                    </div>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">
                        person_outline
                      </span>
                      <input
                        readOnly
                        className="w-full h-11 pl-10 pr-4 bg-surface-container-low border border-outline-variant/60 rounded-xl font-body-md text-on-surface cursor-not-allowed opacity-90 select-none"
                        placeholder="e.g. Dr. Jane Doe"
                        type="text"
                        name="fullName"
                        value={form.fullName}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="font-label-md text-label-md text-on-surface-variant">Email Address</label>
                      <span className="text-[11px] text-outline font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">lock</span> Account Email
                      </span>
                    </div>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">
                        mail
                      </span>
                      <input
                        readOnly
                        className="w-full h-11 pl-10 pr-4 bg-surface-container-low border border-outline-variant/60 rounded-xl font-body-md text-on-surface cursor-not-allowed opacity-90 select-none"
                        placeholder="doctor@example.com"
                        type="email"
                        name="email"
                        value={form.email}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="font-label-md text-label-md text-on-surface-variant">Mobile Number</label>
                      {user?.phone || user?.mobile ? (
                        <span className="text-[11px] text-outline font-medium flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">lock</span> Account Phone
                        </span>
                      ) : (
                        <span className="text-[11px] text-primary font-medium">10-digit mobile number</span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">
                        phone
                      </span>
                      <input
                        readOnly={!!(user?.phone || user?.mobile)}
                        className={`w-full h-11 pl-10 pr-4 rounded-xl border border-outline-variant transition-all ${
                          user?.phone || user?.mobile
                            ? "bg-surface-container-low cursor-not-allowed opacity-90 select-none"
                            : "bg-surface focus:border-primary focus:ring-4 focus:ring-primary/10"
                        }`}
                        placeholder="+91 98765 43210"
                        required
                        type="tel"
                        name="mobile"
                        value={form.mobile}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="font-label-md text-label-md text-on-surface-variant">Date of Birth</label>
                      <span className="text-[11px] text-primary font-medium">Mandatory</span>
                    </div>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">
                        calendar_today
                      </span>
                      <input
                        className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-body-md text-on-surface"
                        required
                        type="date"
                        name="dob"
                        value={form.dob}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Professional Credentials */}
            <div className="glass-morphism rounded-[24px] shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="p-8 md:p-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">badge</span>
                  </div>
                  <h2 className="font-headline-md text-headline-md text-on-surface">Professional Credentials</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="font-label-md text-label-md text-on-surface-variant block ml-1">
                      Medical Registration Number
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">
                        receipt_long
                      </span>
                      <input
                        className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-outline-variant/60"
                        placeholder="e.g. MCI-12345"
                        required
                        type="text"
                        name="regNumber"
                        value={form.regNumber}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="font-label-md text-label-md text-on-surface-variant block ml-1">
                      Medical Council
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">
                        account_balance
                      </span>
                      <select
                        className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all appearance-none"
                        required
                        name="council"
                        value={form.council}
                        onChange={handleChange}
                      >
                        <option disabled value="">
                          Select Medical Council
                        </option>
                        <option>National Medical Commission (NMC)</option>
                        <option>State Medical Council</option>
                        <option>Dental Council of India</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant pointer-events-none">
                        expand_more
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="font-label-md text-label-md text-on-surface-variant block ml-1">
                      Primary Degree
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">
                        school
                      </span>
                      <input
                        className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-outline-variant/60"
                        placeholder="e.g. MBBS, MD, MS"
                        required
                        type="text"
                        name="degree"
                        value={form.degree}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="font-label-md text-label-md text-on-surface-variant block ml-1">
                      Specialization
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">
                        stethoscope
                      </span>
                      <input
                        className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-outline-variant/60"
                        placeholder="e.g. Cardiology, Neurology"
                        required
                        type="text"
                        name="specialization"
                        value={form.specialization}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="font-label-md text-label-md text-on-surface-variant block ml-1">
                      Years of Experience
                    </label>
                    <div className="relative flex items-center gap-4">
                      <input
                        className="w-full h-2 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                        type="range"
                        min="0"
                        max="50"
                        step="1"
                        name="experience"
                        value={form.experience}
                        onChange={handleChange}
                      />
                      <div className="min-w-[80px] text-center bg-primary-container/20 text-primary font-bold px-3 py-1.5 rounded-lg border border-primary/10">
                        <span>{form.experience}</span> yrs
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Insight Component */}
                <div className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-primary-container/10 to-secondary-container/10 border border-primary/10 flex gap-4 items-start relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] -z-10"></div>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                      auto_awesome
                    </span>
                  </div>
                  <div>
                    <h4 className="font-label-md text-label-md text-primary font-bold mb-1">Vision AI Verification Sync</h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                      Our Google Gemini Vision AI automatically scans your uploaded Medical Certificate to verify your registration number and validity.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Hospital/Clinic Details */}
            <div className="glass-morphism rounded-[24px] shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="p-8 md:p-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">domain</span>
                  </div>
                  <h2 className="font-headline-md text-headline-md text-on-surface">Hospital/Clinic Details</h2>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="font-label-md text-label-md text-on-surface-variant block ml-1">
                      Hospital or Clinic Name
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">
                        home_health
                      </span>
                      <input
                        className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-outline-variant/60"
                        placeholder="Name of your primary practice"
                        required
                        type="text"
                        name="hospitalName"
                        value={form.hospitalName}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="font-label-md text-label-md text-on-surface-variant block ml-1">Full Address</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-4 text-outline-variant">
                        location_on
                      </span>
                      <textarea
                        className="w-full min-h-[100px] pl-10 pr-4 py-3 bg-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-outline-variant/60 resize-none"
                        placeholder="Enter complete practice address..."
                        required
                        name="address"
                        value={form.address}
                        onChange={handleChange}
                      ></textarea>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Document Upload */}
            <div className="glass-morphism rounded-[24px] shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="p-8 md:p-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">upload_file</span>
                  </div>
                  <h2 className="font-headline-md text-headline-md text-on-surface">Medical Certificate Upload</h2>
                </div>
                <div>
                  <div className="space-y-4">
                    <label className="font-label-md text-label-md text-on-surface-variant block ml-1">
                      Official Medical Registration Certificate
                    </label>
                    <div
                      className="border-2 border-dashed border-outline-variant/50 rounded-2xl p-10 text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                      onClick={() => regCertInputRef.current?.click()}
                    >
                      <span
                        className="material-symbols-outlined text-outline-variant group-hover:text-primary mb-4 block"
                        style={{ fontSize: "56px" }}
                      >
                        cloud_upload
                      </span>
                      <p className="font-headline-sm text-headline-sm text-on-surface mb-1 font-semibold">
                        {files.regCertificate ? files.regCertificate.name : "Click or drag to upload Medical Registration Certificate"}
                      </p>
                      <p className="font-body-sm text-body-sm text-outline-variant">Supports PDF, PNG, JPG (Max 5MB)</p>
                      <input
                        className="hidden"
                        type="file"
                        ref={regCertInputRef}
                        onChange={handleFileChange("regCertificate")}
                        accept=".pdf,.png,.jpg,.jpeg"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-8">
              <button
                className="w-full py-4 rounded-2xl font-headline-md text-headline-md bg-primary text-on-primary shadow-xl shadow-primary/20 hover:scale-[0.99] transition-transform flex items-center justify-center gap-3 disabled:opacity-80 disabled:cursor-not-allowed"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                    Scanning & Verifying Credentials...
                  </>
                ) : (
                  <>
                    Complete Registration
                    <span className="material-symbols-outlined">how_to_reg</span>
                  </>
                )}
              </button>
              <p className="text-center mt-6 font-body-sm text-body-sm text-on-surface-variant">
                By clicking "Complete Registration", you agree to our{" "}
                <a className="text-primary hover:underline" href="#">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a className="text-primary hover:underline" href="#">
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-surface-container-low dark:bg-surface-container-lowest p-12 mt-auto border-t border-outline-variant/50">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-7xl mx-auto">
          <div className="space-y-4">
            <span className="font-headline-md text-headline-md font-bold text-primary tracking-tight">Swastha</span>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              The future of clinical intelligence and data-driven healthcare SaaS for the modern world.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-label-sm text-label-sm text-on-surface font-bold">Platform</span>
            <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">
              Privacy Policy
            </a>
            <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">
              Terms of Service
            </a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-label-sm text-label-sm text-on-surface font-bold">Resources</span>
            <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">
              Documentation
            </a>
            <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">
              API Access
            </a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-label-sm text-label-sm text-on-surface font-bold">Connect</span>
            <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">
              Support
            </a>
            <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">
              Contact Us
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}