import { BrowserRouter, Routes, Route } from "react-router-dom";

// Authentication
import Login from "./modules/authentication/Login";
import Register from "./modules/authentication/Register";
import ForgotPassword from "./modules/authentication/ForgotPassword";
import RoleSelection from "./modules/authentication/RoleSelection";

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
        {/* Authentication */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/role-selection" element={<RoleSelection />} />

        {/* Main App */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vault" element={<FamilyVault />} />
        <Route path="/lab-trends" element={<LabTrends />} />
        <Route path="/search" element={<AISearch />} />
      </Routes>
    </BrowserRouter>
  );
}