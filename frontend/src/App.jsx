import { BrowserRouter, Routes, Route } from "react-router-dom";

// Landing Page
import LandingPage from "./modules/landing/pages/LandingPage";

// Authentication
import Login from "./modules/authentication/Login";
import Register from "./modules/authentication/Register";
// import ForgotPassword from "./modules/authentication/ForgotPassword";
import RoleSelection from "./modules/authentication/RoleSelection";
import DoctorLogin from "./modules/authentication/DoctorLogin";
import DoctorRegister from "./modules/authentication/DoctorRegister";

// Dashboard
import Dashboard from "./modules/dashboard/pages/Dashboard";
// Family
import FamilyVault from "./modules/family/pages/FamilyVault";

// Reports
import LabTrends from "./modules/reports/components/pages/LabTrends";

// Search
import AISearch from "./modules/search/pages/AISearch";

// Timeline
import Timeline from "./modules/timeline/components/pages/Timeline";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing Page */}
        <Route path="/" element={<LandingPage />} />

        {/* Authentication */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* <Route path="/forgot-password" element={<ForgotPassword />} /> */}
        <Route path="/role-selection" element={<RoleSelection />} />
        <Route path="/doctor-login" element={<DoctorLogin />} />
        <Route path="/doctor-register" element={<DoctorRegister />} />

        {/* Main App */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vault" element={<FamilyVault />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/lab-trends" element={<LabTrends />} />
        <Route path="/search" element={<AISearch />} />
      </Routes>
    </BrowserRouter>
  );
}