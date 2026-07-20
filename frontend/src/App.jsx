import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './modules/landing/pages/LandingPage'
import Login from './modules/authentication/components/pages/Login'
import FamilyVault from './modules/family/pages/FamilyVault'
import Timeline from './modules/timeline/components/pages/Timeline'
import Dashboard from './modules/dashboard/pages/Dashboard'
import RoleSelection from './modules/authentication/components/pages/RoleSelection'
import RecordDetail from './modules/reports/components/pages/ReportDetails'
import LabTrends from './modules/reports/components/pages/LabTrends'
import AISearch from './modules/search/pages/AISearch'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/role-selection" element={<RoleSelection />} />
        <Route path="/vault" element={<FamilyVault />} />
        <Route path="/timeline/:profileId" element={<Timeline />} />
        <Route path="/record/:recordId" element={<RecordDetail />} />
        <Route path="/lab-trends/:profileId" element={<LabTrends />} />
        <Route path="/search/:profileId" element={<AISearch />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}