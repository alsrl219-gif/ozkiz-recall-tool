import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'

// 페이지별 코드 분할 — 첫 화면만 즉시 로드, 나머지는 필요 시 로드
const Dashboard     = lazy(() => import('./pages/Dashboard'))
const Upload        = lazy(() => import('./pages/Upload'))
const StoreView     = lazy(() => import('./pages/StoreView'))
const Analytics     = lazy(() => import('./pages/Analytics'))
const RecallHistory = lazy(() => import('./pages/RecallHistory'))
const Settings      = lazy(() => import('./pages/Settings'))
const Guide         = lazy(() => import('./pages/Guide'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"         element={<Dashboard />} />
          <Route path="/upload"   element={<Upload />} />
          <Route path="/stores"   element={<StoreView />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/history"  element={<RecallHistory />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/guide"    element={<Guide />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
