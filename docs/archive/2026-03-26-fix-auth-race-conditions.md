# Fix Auth Race Conditions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate 3 auth race conditions that cause random logouts — 401 cascade, getSession/onAuthStateChange race, async deadlock.

**Architecture:** Two files change. `base-client.ts` gets a token-refresh-and-retry interceptor (queues parallel 401s, refreshes once, retries all). `AuthContext.tsx` drops `getSession()` in favor of `onAuthStateChange` as single source of truth, with deferred async side-effects.

**Tech Stack:** Supabase JS v2.74+, Axios interceptors, React context

---

## Context for Implementer

### The Problem

Users get randomly logged out. Three bugs cause this:

1. **`base-client.ts:32-33`** — On ANY 401, the interceptor calls `setAuthToken(null)`, nuking the Authorization header. When Supabase's access token expires and multiple requests are in-flight, the first 401 clears the token, cascading all remaining requests into 401s. Supabase's background refresh eventually fires `TOKEN_REFRESHED`, but by then the damage is done.

2. **`AuthContext.tsx:23-31 + 33-53`** — `getSession()` and `onAuthStateChange` run in parallel. The one that resolves second overwrites the first's token. Since supabase-js v2.33+, `onAuthStateChange` fires `INITIAL_SESSION` synchronously at registration time, making `getSession()` redundant and a race hazard.

3. **`AuthContext.tsx:34`** — The `onAuthStateChange` callback is `async` and `await`s `apiClient.processPendingInvitations()` inside it. Supabase docs warn this can deadlock the internal auth queue, hanging subsequent token refreshes.

### Files That Change

| File | Action |
|------|--------|
| `frontend/src/lib/api/base-client.ts` | Rewrite interceptor with refresh+retry queue |
| `frontend/src/contexts/AuthContext.tsx` | Simplify to onAuthStateChange only |

### Files NOT Touched (verify they still work)

All 10 feature API modules (`alliance-api.ts`, `season-api.ts`, etc.) import `axiosInstance` from `base-client.ts`. The interceptor is global — they get the fix automatically. No changes needed.

---

## Task 1: Rewrite base-client.ts Interceptor

**Files:**
- Modify: `frontend/src/lib/api/base-client.ts` (full rewrite)
- Reference: `frontend/src/lib/supabase.ts` (new import)

### Step 1: Read current file

Read `frontend/src/lib/api/base-client.ts` to confirm current state matches plan.

### Step 2: Rewrite base-client.ts

Replace the entire file with:

```typescript
/**
 * Base API Client
 *
 * Shared axios instance with interceptors and auth handling.
 * All feature-specific API modules extend this base.
 *
 * Auth strategy:
 * - Token set by AuthContext via onAuthStateChange (single source of truth)
 * - 401 interceptor attempts token refresh + retry (with queue for parallel requests)
 * - Only signs out when Supabase confirms no valid session exists
 */

import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { supabase } from '@/lib/supabase'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8087'

// Token refresh state — shared across all requests
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve(token!)
  })
  failedQueue = []
}

class BaseApiClient {
  protected client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    this.setupInterceptors()
  }

  private setupInterceptors() {
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

        // Only handle 401 with a retryable request config
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
          // Another request is already refreshing — queue this one
          if (isRefreshing) {
            return new Promise<string>((resolve, reject) => {
              failedQueue.push({ resolve, reject })
            }).then((token) => {
              originalRequest.headers['Authorization'] = `Bearer ${token}`
              return this.client(originalRequest)
            })
          }

          originalRequest._retry = true
          isRefreshing = true

          try {
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
              // No valid session — this is a real logout
              processQueue(new Error('No session'), null)
              this.setAuthToken(null)
              return Promise.reject(error)
            }

            // Got a valid (possibly refreshed) token — retry
            const token = session.access_token
            this.setAuthToken(token)
            processQueue(null, token)
            originalRequest.headers['Authorization'] = `Bearer ${token}`
            return this.client(originalRequest)
          } catch (refreshError) {
            processQueue(refreshError, null)
            this.setAuthToken(null)
            return Promise.reject(refreshError)
          } finally {
            isRefreshing = false
          }
        }

        // Network errors (no response)
        if (!error.response) {
          console.error('Network error:', error.message)
        }

        return Promise.reject(error)
      }
    )
  }

  setAuthToken(token: string | null) {
    if (token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete this.client.defaults.headers.common['Authorization']
    }
  }

  getAxiosInstance(): AxiosInstance {
    return this.client
  }
}

// Singleton instance
export const baseClient = new BaseApiClient()

// Export the axios instance for feature modules
export const axiosInstance = baseClient.getAxiosInstance()

// Export setAuthToken for AuthContext
export const setAuthToken = (token: string | null) => baseClient.setAuthToken(token)
```

**Key changes from current code:**
- Removed `withCredentials: true` (not needed for Bearer token auth)
- 401 no longer blindly clears token — tries `supabase.auth.getSession()` first
- Parallel 401s are queued — only one refresh attempt at a time
- Only clears token when Supabase confirms no session exists
- Added `InternalAxiosRequestConfig` import for proper typing of `_retry`

### Step 3: Type check

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

### Step 4: Commit

```bash
git add frontend/src/lib/api/base-client.ts
git commit -m "fix: replace destructive 401 interceptor with token refresh retry queue"
```

---

## Task 2: Simplify AuthContext to Single Source of Truth

**Files:**
- Modify: `frontend/src/contexts/AuthContext.tsx` (rewrite useEffect)

### Step 1: Read current file

Read `frontend/src/contexts/AuthContext.tsx` to confirm current state.

### Step 2: Rewrite AuthContext.tsx

Replace the entire file with:

```typescript
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Synchronous state update — safe inside callback
        apiClient.setAuthToken(session?.access_token ?? null)
        setAuthState({
          user: session?.user ?? null,
          session,
          loading: false
        })

        // Async side-effects MUST be deferred to avoid deadlocking
        // Supabase's internal auth queue (auth-js issue #762)
        if (event === 'SIGNED_IN' && session) {
          setTimeout(() => {
            apiClient.processPendingInvitations()
              .then(result => {
                if (result.processed_count > 0) {
                  queryClient.invalidateQueries({ queryKey: ['alliance'] })
                }
              })
              .catch(() => {
                // Don't block login on invitation processing failure
              })
          }, 0)
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
```

**Key changes from current code:**
- Removed `getSession()` call (lines 24-31) — `INITIAL_SESSION` event replaces it
- Callback is no longer `async` — prevents deadlock
- `processPendingInvitations` is deferred with `setTimeout(() => ..., 0)`
- `queryClient.invalidateQueries` is chained in `.then()` instead of `await`

### Step 3: Type check

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

### Step 4: Run existing auth tests

Run: `cd frontend && npx vitest run src/hooks/__tests__/use-auth.test.tsx`
Expected: 3 tests PASS (these test `useAuth` hook, not `AuthProvider` internals — they should be unaffected)

### Step 5: Commit

```bash
git add frontend/src/contexts/AuthContext.tsx
git commit -m "fix: eliminate auth race conditions — single source of truth via onAuthStateChange"
```

---

## Task 3: Verify No Regressions

### Step 1: Run full frontend test suite

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

### Step 2: Run lint

Run: `cd frontend && npm run lint`
Expected: No errors

### Step 3: Type check full project

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

### Step 4: Build check

Run: `cd frontend && npm run build`
Expected: Build succeeds without warnings related to auth

---

## Verification Checklist

After implementation, manually verify these scenarios:

- [ ] App loads → user is logged in (INITIAL_SESSION fires correctly)
- [ ] Token expires → next API call refreshes and retries (no logout)
- [ ] Multiple concurrent API calls during token expiry → all eventually succeed
- [ ] Supabase completely unreachable → user is NOT logged out (graceful degradation)
- [ ] Real logout via UI → user is redirected to `/landing`
- [ ] Page refresh → session persists (localStorage + INITIAL_SESSION)
- [ ] New user signs in → pending invitations are processed (deferred, no deadlock)
