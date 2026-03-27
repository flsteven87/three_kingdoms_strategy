import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/use-auth'

// Public pages — eagerly loaded (SEO + first paint)
import { Landing } from './pages/Landing'
import { AuthCallback } from './pages/AuthCallback'
import { PrivacyPolicy } from './pages/PrivacyPolicy'
import { TermsOfService } from './pages/TermsOfService'
import { Contact } from './pages/Contact'
import { PublicLayout } from './components/layout/PublicLayout'

// LIFF — eagerly loaded (separate entry point)
import { LiffLayout } from './liff/components/LiffLayout'
import { LiffHome } from './liff/pages/LiffHome'

// Protected pages — lazy loaded (only after auth)
const DashboardLayout = lazy(() => import('./components/layout/DashboardLayout').then(m => ({ default: m.DashboardLayout })))
const Seasons = lazy(() => import('./pages/Seasons').then(m => ({ default: m.Seasons })))
const DataManagement = lazy(() => import('./pages/DataManagement').then(m => ({ default: m.DataManagement })))
const HegemonyWeights = lazy(() => import('./pages/HegemonyWeights').then(m => ({ default: m.HegemonyWeights })))
const MemberPerformance = lazy(() => import('./pages/MemberPerformance').then(m => ({ default: m.MemberPerformance })))
const AllianceAnalytics = lazy(() => import('./pages/AllianceAnalytics').then(m => ({ default: m.AllianceAnalytics })))
const GroupAnalytics = lazy(() => import('./pages/GroupAnalytics').then(m => ({ default: m.GroupAnalytics })))
const EventAnalytics = lazy(() => import('./pages/EventAnalytics').then(m => ({ default: m.EventAnalytics })))
const EventDetail = lazy(() => import('./pages/EventDetail').then(m => ({ default: m.EventDetail })))
const DonationAnalytics = lazy(() => import('./pages/DonationAnalytics').then(m => ({ default: m.DonationAnalytics })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const PurchaseSeason = lazy(() => import('./pages/PurchaseSeason').then(m => ({ default: m.PurchaseSeason })))
const LineBinding = lazy(() => import('./pages/LineBinding').then(m => ({ default: m.LineBinding })))
const CopperMines = lazy(() => import('./pages/CopperMines').then(m => ({ default: m.CopperMines })))

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/landing" replace />

  return <Outlet />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-center" richColors />
        <Routes>
          <Route path="/landing" element={<Landing />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Public legal pages - no auth required */}
          <Route element={<PublicLayout />}>
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/contact" element={<Contact />} />
          </Route>

          {/* LIFF Routes - No Supabase auth required */}
          <Route path="/liff" element={<LiffLayout />}>
            <Route index element={<LiffHome />} />
          </Route>

          {/* Protected dashboard — lazy loaded */}
          <Route element={<ProtectedRoute />}>
            <Route element={
              <Suspense fallback={<FullPageSpinner />}>
                <DashboardLayout />
              </Suspense>
            }>
              <Route index element={<Navigate to="/analytics" replace />} />
              <Route path="dashboard" element={<Navigate to="/analytics" replace />} />
              <Route path="seasons" element={<Seasons />} />
              <Route path="data" element={<DataManagement />} />
              <Route path="hegemony" element={<HegemonyWeights />} />
              <Route path="copper-mines" element={<CopperMines />} />
              <Route path="donations" element={<DonationAnalytics />} />
              <Route path="members" element={<MemberPerformance />} />
              <Route path="analytics" element={<AllianceAnalytics />} />
              <Route path="groups" element={<GroupAnalytics />} />
              <Route path="events" element={<EventAnalytics />} />
              <Route path="events/:eventId" element={<EventDetail />} />
              <Route path="line-binding" element={<LineBinding />} />
              <Route path="purchase" element={<PurchaseSeason />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>

          {/* Catch-all: redirect unknown routes to landing */}
          <Route path="*" element={<Navigate to="/landing" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
