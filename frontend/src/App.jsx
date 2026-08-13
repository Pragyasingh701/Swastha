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
import DoctorDashboard from "./modules/doctor/pages/DoctorDashboard";
import DoctorPatients from "./modules/doctor/pages/DoctorPatients";
import ClinicalIntelligence from "./modules/doctor/pages/ClinicalIntelligence";
import ClinicalAnalytics from "./modules/doctor/pages/ClinicalAnalytics";
import ModernHealthDashboard from "./modules/doctor/pages/ModernHealthDashboard";
import DoctorReports from "./modules/doctor/pages/DoctorReports";
import DoctorMessages from "./modules/doctor/pages/DoctorMessages";
import DoctorSettings from "./modules/doctor/pages/DoctorSettings";

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

// Helper function to check if user has completed role selection
function hasCompletedRole(user) {
  if (!user) return false;
  return Boolean(user.hasSelectedRole || (user.role && user.role !== 'none'));
}

// GuestRoute: Restricted to unauthenticated users (or users who haven't completed role setup yet).
// If authenticated & role is completed -> redirect to /dashboard.
// If authenticated & NO role -> redirect to /role-selection.
function GuestRoute({ children }) {
  const { isAuthenticated, user, authReady } = useAuth();

  if (!authReady) {
    return <LoadingSpinner />;
  }

  if (isAuthenticated) {
    if (hasCompletedRole(user)) {
      return <Navigate to="/dashboard" replace />;
    } else {
      return <Navigate to="/role-selection" replace />;
    }
  }

  return children;
}

// OnboardingRoute: Accessible during role setup & registration.
// Unauthenticated users -> redirect to /login.
// Authenticated users who ALREADY completed role selection -> redirect to /dashboard.
function OnboardingRoute({ children }) {
  const { isAuthenticated, user, authReady } = useAuth();

  if (!authReady) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (hasCompletedRole(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// OTPRoute: Accessible for users verifying OTP code during login or registration.
function OTPRoute({ children }) {
  const { isAuthenticated, user, authReady } = useAuth();

  if (!authReady) {
    return <LoadingSpinner />;
  }

  if (isAuthenticated && hasCompletedRole(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// ProtectedRoute: Restricted to authenticated users who have completed role setup.
// Unauthenticated users -> redirect to /login.
// Authenticated users without role -> redirect to /role-selection.
function ProtectedRoute({ children }) {
  const { isAuthenticated, user, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasCompletedRole(user)) {
    return <Navigate to="/role-selection" replace />;
  }

  return children;
}
// DoctorRoute: same as ProtectedRoute, but also requires role === "doctor".
// Patients who are logged in and try to access this get bounced to /dashboard.
function DoctorRoute({ children }) {
  const { isAuthenticated, user, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasCompletedRole(user)) {
    return <Navigate to="/role-selection" replace />;
  }

  if (user.role !== "doctor") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// Fallback route redirect based on auth status
function WildcardRedirect() {
  const { isAuthenticated, user, authReady } = useAuth();

  if (!authReady) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Navigate to={hasCompletedRole(user) ? "/dashboard" : "/role-selection"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing & Guest-only Auth Routes */}
        <Route path="/" element={<GuestRoute><LandingPage /></GuestRoute>} />
        <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
        <Route path="/doctor-login" element={<GuestRoute><DoctorLogin /></GuestRoute>} />
        <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
        <Route path="/reset-password" element={<GuestRoute><ResetPassword /></GuestRoute>} />

        {/* Onboarding & Verification Routes */}
        <Route path="/verify-otp" element={<OTPRoute><VerifyOTP /></OTPRoute>} />
        <Route path="/role-selection" element={<OnboardingRoute><RoleSelection /></OnboardingRoute>} />
        <Route path="/doctor-register" element={<OnboardingRoute><DoctorRegister /></OnboardingRoute>} />
        <Route path="/patient-register" element={<OnboardingRoute><PatientRegister /></OnboardingRoute>} />

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
  path="/doctor-dashboard"
  element={
    <DoctorRoute>
      <DoctorDashboard />
    </DoctorRoute>
  }
/>

        <Route
          path="/doctor/patients"
          element={
            <DoctorRoute>
              <DoctorPatients />
            </DoctorRoute>
          }
        />

        <Route
          path="/doctor/clinical-intelligence"
          element={
            <DoctorRoute>
              <ClinicalIntelligence />
            </DoctorRoute>
          }
        />

        <Route
          path="/doctor/clinical-analytics"
          element={
            <DoctorRoute>
              <ClinicalAnalytics />
            </DoctorRoute>
          }
        />

        <Route
          path="/doctor/modern-dashboard"
          element={
            <DoctorRoute>
              <ModernHealthDashboard />
            </DoctorRoute>
          }
        />

        <Route
          path="/doctor/reports"
          element={
            <DoctorRoute>
              <DoctorReports />
            </DoctorRoute>
          }
        />

        <Route
          path="/doctor/messages"
          element={
            <DoctorRoute>
              <DoctorMessages />
            </DoctorRoute>
          }
        />

        <Route
          path="/doctor/settings"
          element={
            <DoctorRoute>
              <DoctorSettings />
            </DoctorRoute>
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