import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/use-auth'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { Landing } from './pages/Landing'
import { AuthCallback } from './pages/AuthCallback'
import { Seasons } from './pages/Seasons'
import { DataManagement } from './pages/DataManagement'
import { HegemonyWeights } from './pages/HegemonyWeights'
import { MemberPerformance } from './pages/MemberPerformance'
import { AllianceAnalytics } from './pages/AllianceAnalytics'
import { GroupAnalytics } from './pages/GroupAnalytics'
import { EventAnalytics } from './pages/EventAnalytics'
import { EventDetail } from './pages/EventDetail'
import { Settings } from './pages/Settings'
import { LineBinding } from './pages/LineBinding'
import { LiffLayout } from './liff/components/LiffLayout'
import { LiffHome } from './liff/pages/LiffHome'

function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">載入中...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/landing" replace />
  }

  return <Outlet />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/landing" element={<Landing />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* LIFF Routes - No Supabase auth required */}
          <Route path="/liff" element={<LiffLayout />}>
            <Route index element={<LiffHome />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route index element={<Navigate to="/analytics" replace />} />
              <Route path="dashboard" element={<Navigate to="/analytics" replace />} />
              <Route path="seasons" element={<Seasons />} />
              <Route path="data" element={<DataManagement />} />
              <Route path="hegemony" element={<HegemonyWeights />} />
              <Route path="members" element={<MemberPerformance />} />
              <Route path="analytics" element={<AllianceAnalytics />} />
              <Route path="groups" element={<GroupAnalytics />} />
              <Route path="events" element={<EventAnalytics />} />
              <Route path="events/:eventId" element={<EventDetail />} />
              <Route path="line-binding" element={<LineBinding />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
