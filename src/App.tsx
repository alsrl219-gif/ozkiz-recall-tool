import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import StoreView from './pages/StoreView'
import Analytics from './pages/Analytics'
import RecallHistory from './pages/RecallHistory'
import Settings from './pages/Settings'
import Guide from './pages/Guide'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/stores" element={<StoreView />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/history" element={<RecallHistory />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/guide" element={<Guide />} />
      </Routes>
    </Layout>
  )
}
