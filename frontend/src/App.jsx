import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

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

// Timeline
import Timeline from "./modules/timeline/components/pages/Timeline";
import MedicalVault from "./modules/vault/pages/MedicalVault";

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        <p className="text-sm text-slate-500 font-medium">Verifying access...</p>
      </div>
    </div>
  );
}

// GuestRoute: Restricted to unauthenticated users only.
// Authenticated users trying to access these routes are redirected to /dashboard.
function GuestRoute({ children }) {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return <LoadingSpinner />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// ProtectedRoute: Restricted to authenticated users only.
// Unauthenticated users trying to access these routes are redirected to /login.
function ProtectedRoute({ children }) {
  const { isAuthenticated, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// Fallback route redirect based on auth status
function WildcardRedirect() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return <LoadingSpinner />;
  }

  return <Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing & Guest-only Auth Routes */}
        <Route path="/" element={<GuestRoute><LandingPage /></GuestRoute>} />
        <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
        <Route path="/role-selection" element={<GuestRoute><RoleSelection /></GuestRoute>} />
        <Route path="/verify-otp" element={<GuestRoute><VerifyOTP /></GuestRoute>} />
        <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
        <Route path="/reset-password" element={<GuestRoute><ResetPassword /></GuestRoute>} />
        <Route path="/doctor-login" element={<GuestRoute><DoctorLogin /></GuestRoute>} />
        <Route path="/doctor-register" element={<GuestRoute><DoctorRegister /></GuestRoute>} />
        <Route path="/patient-register" element={<GuestRoute><PatientRegister /></GuestRoute>} />

        {/* Protected Main Application Routes */}
       <Route
  path="/dashboard"
  element={
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  }
/>

<Route
  path="/vault"
  element={
    <ProtectedRoute>
      <MedicalVault />
    </ProtectedRoute>
  }
/>

<Route
  path="/family-vault"
  element={
    <ProtectedRoute>
      <FamilyVault />
    </ProtectedRoute>
  }
/>

<Route
  path="/timeline"
  element={
    <ProtectedRoute>
      <Timeline />
    </ProtectedRoute>
  }
/>

<Route
  path="/lab-trends"
  element={
    <ProtectedRoute>
      <LabTrends />
    </ProtectedRoute>
  }
/>

<Route
  path="/search"
  element={
    <ProtectedRoute>
      <AISearch />
    </ProtectedRoute>
  }
/>

        {/* 404 / Wildcard Fallback */}
        <Route path="*" element={<WildcardRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}