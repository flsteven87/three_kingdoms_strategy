/**
 * useAuth Hook
 *
 * Separated from AuthContext.tsx to avoid ESLint react-refresh/only-export-components warning
 * 符合 CLAUDE.md 🟡: Component files should only export components
 * 符合 React 2025 best practice: Custom hooks in separate files
 */

import { useContext } from 'react'
import { AuthContext } from '@/contexts/auth-context-definition'

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
