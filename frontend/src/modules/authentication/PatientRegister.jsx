import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { sanitizePhoneInput, isValidIndianPhone, isValidPastDate } from "../../utils/formValidation";
import swasthaLogo from "../../assets/swastha-logo.png";

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
    if (name === "phone") {
      setFormData((prev) => ({ ...prev, phone: sanitizePhoneInput(value) }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!agreedToTerms) {
      setErrorMessage("Please accept the Terms of Service & Privacy Policy before completing registration.");
      return;
    }

    if (!isValidIndianPhone(formData.phone)) {
      setErrorMessage("Please enter a valid 10-digit mobile number.");
      return;
    }

    if (!isValidPastDate(formData.dob)) {
      setErrorMessage("Please enter a valid date of birth.");
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
    <div className="min-h-screen flex flex-col text-on-surface bg-[#faf8ff]">
      <nav className="bg-surface/80 backdrop-blur-lg border-b border-outline-variant/30 sticky top-0 z-50 shadow-sm">
        <div className="flex justify-between items-center w-full px-6 py-3 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-8">
            <img src={swasthaLogo} alt="Swastha" className="h-9 w-auto" />
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
          <div className="text-center mb-12">
            <h1 className="font-display text-[40px] md:text-display text-on-surface mb-4">Patient Registration</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
              Start your digital health journey. Complete your profile to unlock secure, connected care.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-error-container text-on-error-container text-body-sm flex items-center gap-3 border border-error/20 shadow-sm">
              <span className="material-symbols-outlined text-[20px] text-error">error</span>
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          <form className="space-y-8" onSubmit={handleSubmit}>
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
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">person_outline</span>
                      <input
                        readOnly
                        className="w-full h-11 pl-10 pr-4 bg-surface-container-low border border-outline-variant/60 rounded-xl font-body-md text-on-surface cursor-not-allowed opacity-90 select-none"
                        placeholder="Johnathan Doe"
                        type="text"
                        name="fullName"
                        value={formData.fullName}
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
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">mail</span>
                      <input
                        readOnly
                        className="w-full h-11 pl-10 pr-4 bg-surface-container-low border border-outline-variant/60 rounded-xl font-body-md text-on-surface cursor-not-allowed opacity-90 select-none"
                        placeholder="john@healthcare.com"
                        type="email"
                        name="email"
                        value={formData.email}
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
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">phone</span>
                      <input
                        readOnly={!!(user?.phone || user?.mobile)}
                        className={`w-full h-11 pl-10 pr-4 rounded-xl border border-outline-variant transition-all ${
                          user?.phone || user?.mobile
                            ? "bg-surface-container-low cursor-not-allowed opacity-90 select-none"
                            : "bg-surface focus:border-primary focus:ring-4 focus:ring-primary/10"
                        }`}
                        placeholder="98765 43210"
                        required
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        name="phone"
                        value={formData.phone}
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
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">calendar_today</span>
                      <input
                        className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-body-md text-on-surface"
                        required
                        type="date"
                        name="dob"
                        max={new Date().toISOString().split('T')[0]}
                        value={formData.dob}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="font-label-md text-label-md text-on-surface-variant">Gender</label>
                      <span className="text-[11px] text-primary font-medium">Mandatory</span>
                    </div>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">wc</span>
                      <select
                        className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all appearance-none"
                        required
                        name="gender"
                        value={formData.gender}
                        onChange={handleChange}
                      >
                        <option disabled value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant pointer-events-none">expand_more</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="font-label-md text-label-md text-on-surface-variant">Blood Group</label>
                      <span className="text-[11px] text-primary font-medium">Mandatory</span>
                    </div>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant">water_drop</span>
                      <select
                        className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all appearance-none"
                        required
                        name="bloodGroup"
                        value={formData.bloodGroup}
                        onChange={handleChange}
                      >
                        <option value="" disabled>Select Blood Group</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant pointer-events-none">expand_more</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-morphism rounded-[24px] shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="p-8 md:p-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">privacy_tip</span>
                  </div>
                  <h2 className="font-headline-md text-headline-md text-on-surface">Consent & Security</h2>
                </div>

                <div className="flex items-start gap-3 py-2">
                  <input
                    required
                    className="mt-1 w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary/20 cursor-pointer"
                    id="terms"
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                  />
                  <label className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed" htmlFor="terms">
                    I agree to the{" "}
                    <a className="text-primary hover:underline font-medium" href="#">Terms of Service</a>{" "}
                    and{" "}
                    <a className="text-primary hover:underline font-medium" href="#">Privacy Policy</a>
                    . I understand how my health data is stored and used.
                  </label>
                </div>

                <button
                  className="w-full h-[52px] bg-primary-container text-on-primary-container font-label-md text-label-md font-semibold rounded-xl hover:shadow-lg hover:shadow-primary/10 transition-all active:scale-[0.99] mt-8 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
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
              </div>
            </div>
          </form>

          <div className="text-center pt-6">
            <p className="font-body-md text-body-md text-on-surface-variant">
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

          <div className="mt-8 flex justify-center gap-8 opacity-40 grayscale pointer-events-none">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">mail</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">OTP-Verified Signup</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">verified_user</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">Verified Doctors</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}