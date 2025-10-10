import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/use-auth'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { Landing } from './pages/Landing'
import { AuthCallback } from './pages/AuthCallback'
import Overview from './pages/Overview'
import Seasons from './pages/Seasons'
import DataManagement from './pages/DataManagement'
import HegemonyWeights from './pages/HegemonyWeights'
import MemberPerformance from './pages/MemberPerformance'
import AllianceAnalytics from './pages/AllianceAnalytics'
import Settings from './pages/Settings'

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
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

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/landing" element={<Landing />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Overview />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          {/* Redirect root to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/seasons"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Seasons />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/data"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <DataManagement />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/hegemony"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <HegemonyWeights />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/members"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <MemberPerformance />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <AllianceAnalytics />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Settings />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
