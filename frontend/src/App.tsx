import { Suspense, lazy, type ComponentType } from 'react'
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

// Retry dynamic imports on chunk load failure (stale deployment)
function lazyWithRetry<T extends ComponentType>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch((error: unknown) => {
      const hasReloaded = sessionStorage.getItem('chunk_reload')
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_reload', '1')
        window.location.reload()
        return new Promise<{ default: T }>(() => {})
      }
      sessionStorage.removeItem('chunk_reload')
      throw error
    })
  )
}

// Protected pages — lazy loaded (only after auth)
const DashboardLayout = lazyWithRetry(() => import('./components/layout/DashboardLayout').then(m => ({ default: m.DashboardLayout as ComponentType })))
const Seasons = lazyWithRetry(() => import('./pages/Seasons').then(m => ({ default: m.Seasons as ComponentType })))
const DataManagement = lazyWithRetry(() => import('./pages/DataManagement').then(m => ({ default: m.DataManagement as ComponentType })))
const HegemonyWeights = lazyWithRetry(() => import('./pages/HegemonyWeights').then(m => ({ default: m.HegemonyWeights as ComponentType })))
const MemberPerformance = lazyWithRetry(() => import('./pages/MemberPerformance').then(m => ({ default: m.MemberPerformance as ComponentType })))
const AllianceAnalytics = lazyWithRetry(() => import('./pages/AllianceAnalytics').then(m => ({ default: m.AllianceAnalytics as ComponentType })))
const GroupAnalytics = lazyWithRetry(() => import('./pages/GroupAnalytics').then(m => ({ default: m.GroupAnalytics as ComponentType })))
const EventAnalytics = lazyWithRetry(() => import('./pages/EventAnalytics').then(m => ({ default: m.EventAnalytics as ComponentType })))
const EventDetail = lazyWithRetry(() => import('./pages/EventDetail').then(m => ({ default: m.EventDetail as ComponentType })))
const DonationAnalytics = lazyWithRetry(() => import('./pages/DonationAnalytics').then(m => ({ default: m.DonationAnalytics as ComponentType })))
const Settings = lazyWithRetry(() => import('./pages/Settings').then(m => ({ default: m.Settings as ComponentType })))
const PurchaseSeason = lazyWithRetry(() => import('./pages/PurchaseSeason').then(m => ({ default: m.PurchaseSeason as ComponentType })))
const LineBinding = lazyWithRetry(() => import('./pages/LineBinding').then(m => ({ default: m.LineBinding as ComponentType })))
const CopperMines = lazyWithRetry(() => import('./pages/CopperMines').then(m => ({ default: m.CopperMines as ComponentType })))
const QuickSetup = lazyWithRetry(() => import('./pages/QuickSetup').then(m => ({ default: m.QuickSetup as ComponentType })))

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

          {/* Protected routes — lazy loaded */}
          <Route element={<ProtectedRoute />}>
            {/* Quick Setup — standalone page, no DashboardLayout */}
            <Route path="setup" element={
              <Suspense fallback={<FullPageSpinner />}>
                <QuickSetup />
              </Suspense>
            } />

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
