/**
 * Auth Context Definition
 *
 * Separated from AuthContext.tsx to avoid ESLint react-refresh/only-export-components warning
 * 符合 CLAUDE.md 🟡: Component files should only export components
 * 符合 React 2025 best practice: Separate context definitions from providers
 */

import { createContext } from 'react'
import type { Session, User } from '@/lib/supabase'
import type { Provider } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

export interface AuthContextType extends AuthState {
  signInWithOAuth: (provider: Provider) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
