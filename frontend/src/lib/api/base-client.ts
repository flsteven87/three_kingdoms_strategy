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
  for (const { resolve, reject } of failedQueue) {
    if (error) {
      reject(error)
    } else {
      resolve(token!)
    }
  }
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
            const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()

            if (refreshError || !session) {
              processQueue(refreshError ?? new Error('No session'), null)
              this.setAuthToken(null)
              return Promise.reject(refreshError ?? error)
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

export const baseClient = new BaseApiClient()
export const axiosInstance = baseClient.getAxiosInstance()
export const setAuthToken = (token: string | null) => baseClient.setAuthToken(token)
