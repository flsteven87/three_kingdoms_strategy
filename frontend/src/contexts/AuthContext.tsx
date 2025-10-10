import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, type Session, type User } from '@/lib/supabase'
import { apiClient } from '@/lib/api-client'
import type { Provider } from '@supabase/supabase-js'
import { AuthContext, type AuthContextType } from './auth-context-definition'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true
  })
  const queryClient = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      apiClient.setAuthToken(session?.access_token ?? null)
      setAuthState({
        user: session?.user ?? null,
        session,
        loading: false
      })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        apiClient.setAuthToken(session?.access_token ?? null)
        setAuthState({
          user: session?.user ?? null,
          session,
          loading: false
        })

        if (event === 'SIGNED_IN' && session) {
          try {
            const result = await apiClient.processPendingInvitations()
            if (result.processed_count > 0) {
              await queryClient.invalidateQueries({ queryKey: ['alliance'] })
            }
          } catch {
            // Don't block login on invitation processing failure
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [queryClient])

  const signInWithOAuth = async (provider: Provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        scopes: 'openid email profile'
      }
    })

    if (error) {
      throw error
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      throw error
    }
  }

  const value: AuthContextType = {
    ...authState,
    signInWithOAuth,
    signOut
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
