import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login/Login'
import FamilyVault from './pages/FamilyVault/FamilyVault'
import Timeline from './pages/Timeline/Timeline'
import RecordDetail from './pages/RecordDetail/RecordDetail'
import LabTrends from './pages/LabTrends/LabTrends'
import Search from './pages/Search/Search'

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
      </Routes>
    </BrowserRouter>
  )
}
