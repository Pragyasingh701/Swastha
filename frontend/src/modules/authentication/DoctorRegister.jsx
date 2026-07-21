import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function DoctorRegister() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [specialty, setSpecialty] = useState("General Medicine");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    try {
      await register({ fullName, email, password, role: "doctor", specialty, licenseNumber });
      setIsLoading(false);
      navigate("/dashboard");
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(err.message || "Registration failed.");
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center p-6 bg-surface font-body-md text-on-surface selection:bg-primary-fixed">
      <div className="w-full max-w-[480px]">
        <div className="bg-white shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] rounded-[20px] p-8 lg:p-10 border border-outline-variant/20">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[30px]">medical_services</span>
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface">Doctor Verification Register</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
              Join Swastha&apos;s provider network to access structured patient timelines & RAG diagnostic tools
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-error-container text-on-error-container text-body-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px]">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="font-label-md text-label-md text-on-surface-variant ml-1" htmlFor="docName">Full Name</label>
              <input
                required
                id="docName"
                type="text"
                placeholder="Dr. Ananya Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl font-body-md text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="font-label-md text-label-md text-on-surface-variant ml-1" htmlFor="docEmailReg">Professional Email</label>
              <input
                required
                id="docEmailReg"
                type="email"
                placeholder="ananya@aiims.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl font-body-md text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1" htmlFor="specialty">Specialty</label>
                <select
                  id="specialty"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full px-3 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl font-body-md text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="General Medicine">General Medicine</option>
                  <option value="Cardiology">Cardiology</option>
                  <option value="Endocrinology">Endocrinology</option>
                  <option value="Pediatrics">Pediatrics</option>
                  <option value="Neurology">Neurology</option>
                  <option value="Oncology">Oncology</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1" htmlFor="licNo">NMC Registration No</label>
                <input
                  required
                  id="licNo"
                  type="text"
                  placeholder="NMC-987654"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl font-body-md text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-label-md text-label-md text-on-surface-variant ml-1" htmlFor="docPass">Password</label>
              <input
                required
                id="docPass"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl font-body-md text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[48px] mt-4 font-label-md text-body-md bg-primary-container text-white rounded-xl hover:bg-primary-container/90 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? "Submitting Application..." : "Submit Doctor Registration"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Already verified?{" "}
              <Link to="/doctor-login" className="text-primary font-semibold hover:underline">
                Doctor Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
