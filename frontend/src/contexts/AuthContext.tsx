import { useEffect, useRef, useState } from 'react'
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
  const invitationsProcessedRef = useRef(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        apiClient.setAuthToken(session?.access_token ?? null)
        setAuthState({
          user: session?.user ?? null,
          session,
          loading: false
        })

        // Deferred to avoid deadlocking Supabase's auth queue (auth-js #762).
        // Ref guard prevents re-running on TOKEN_REFRESHED (fires as SIGNED_IN).
        if (event === 'SIGNED_IN' && session && !invitationsProcessedRef.current) {
          invitationsProcessedRef.current = true
          setTimeout(() => {
            apiClient.processPendingInvitations()
              .then(result => {
                if (result.processed_count > 0) {
                  queryClient.invalidateQueries({ queryKey: ['alliance'] })
                }
              })
              .catch(() => {})
          }, 0)
        }

        if (event === 'SIGNED_OUT') {
          invitationsProcessedRef.current = false
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [queryClient])

  const signInWithOAuth = async (provider: Provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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
