import { BrowserRouter, Routes, Route } from "react-router-dom";

// Landing Page
import LandingPage from "./modules/landing/pages/LandingPage";

// Authentication
import Login from "./modules/authentication/Login";
import Register from "./modules/authentication/Register";
import RoleSelection from "./modules/authentication/RoleSelection";
import DoctorRegister from "./modules/authentication/DoctorRegister";
import PatientRegister from "./modules/authentication/PatientRegister";
import DoctorLogin from "./modules/authentication/DoctorLogin";
import VerifyOTP from "./modules/authentication/VerifyOTP";
import ForgotPassword from "./modules/authentication/ForgotPassword";
import ResetPassword from "./modules/authentication/ResetPassword";

// Dashboard
import Dashboard from "./modules/dashboard/pages/Dashboard";

// Family
import FamilyVault from "./modules/family/pages/FamilyVault";

// Reports
import LabTrends from "./modules/reports/components/pages/LabTrends";

// Search
import AISearch from "./modules/search/pages/AISearch";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing */}
        <Route path="/" element={<LandingPage />} />

        {/* Authentication */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/role-selection" element={<RoleSelection />} />
        <Route path="/verify-otp" element={<VerifyOTP />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Registration & Doctor Login Flows */}
        <Route path="/doctor-login" element={<DoctorLogin />} />
        <Route path="/doctor-register" element={<DoctorRegister />} />
        <Route path="/patient-register" element={<PatientRegister />} />

        {/* Main Application */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vault" element={<FamilyVault />} />
        <Route path="/lab-trends" element={<LabTrends />} />
        <Route path="/search" element={<AISearch />} />

        {/* 404 */}
        <Route path="*" element={<h1>404 - Page Not Found</h1>} />
      </Routes>
    </BrowserRouter>
  );
}