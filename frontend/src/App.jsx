import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from "./pages/Login";
import FamilyVault from "./pages/FamilyVault";
import Timeline from "./pages/Timeline";
import Dashboard from "./pages/Dashboard";
import RoleSelection from "./pages/RoleSelection";
import RecordDetail from "./pages/RecordDetail";
import LabTrends from "./pages/LabTrends";
//import Search from "./pages/Search";


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/vault" element={<FamilyVault />} />
        <Route path="/timeline/:profileId" element={<Timeline />} />
        <Route path="/record/:recordId" element={<RecordDetail />} />
        <Route path="/lab-trends/:profileId" element={<LabTrends />} />
        <Route path="/search/:profileId" element={<Search />} />
        <Route path="/vault" element={<FamilyVaultPage />} />
      </Routes>
    </BrowserRouter>
  )
}
