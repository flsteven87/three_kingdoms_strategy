import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, type Session, type User } from '@/lib/supabase'
import { apiClient } from '@/lib/api-client'
import type { Provider } from '@supabase/supabase-js'

const IS_DEV = import.meta.env.DEV

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

interface AuthContextType extends AuthState {
  signInWithOAuth: (provider: Provider) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true
  })
  const queryClient = useQueryClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      apiClient.setAuthToken(session?.access_token ?? null)

      setAuthState({
        user: session?.user ?? null,
        session,
        loading: false
      })
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (IS_DEV) {
          console.log('🔐 Auth state changed:', event, session?.user?.email)
        }

        apiClient.setAuthToken(session?.access_token ?? null)

        setAuthState({
          user: session?.user ?? null,
          session,
          loading: false
        })

        // Process pending invitations on sign-in
        if (event === 'SIGNED_IN' && session) {
          try {
            if (IS_DEV) {
              console.log('🔄 Processing pending invitations for:', session.user?.email)
            }

            const result = await apiClient.processPendingInvitations()

            if (IS_DEV) {
              console.log('✅ Invitation processing result:', result)
            }

            // If invitations were processed, invalidate alliance queries
            if (result.processed_count > 0) {
              if (IS_DEV) {
                console.log(`🎉 ${result.processed_count} invitation(s) accepted!`)
              }

              // Invalidate alliance query to refetch
              await queryClient.invalidateQueries({ queryKey: ['alliance'] })
            }
          } catch (error) {
            if (IS_DEV) {
              console.error('❌ Failed to process pending invitations:', error)
            }
            // Don't block login
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
        redirectTo: `${window.location.origin}/auth/callback`,
        // Request additional scopes to get user's name and profile picture
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

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
