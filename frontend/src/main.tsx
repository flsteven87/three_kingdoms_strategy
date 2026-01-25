import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from './components/theme-provider'
import { RecurProvider } from './providers/RecurProvider'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      retry: (failureCount, error) => {
        // Don't retry on 4xx client errors
        const status = error?.response?.status;
        if (status && status >= 400 && status < 500) {
          return false;
        }
        // Don't retry on network errors after 3 attempts
        if (failureCount >= 3) {
          return false;
        }
        // Retry 5xx server errors and network issues
        return true;
      },
      retryDelay: (attemptIndex) => {
        // Exponential backoff with jitter
        const baseDelay = Math.min(1000 * (2 ** attemptIndex), 30000);
        const jitter = Math.random() * 1000;
        return baseDelay + jitter;
      },
    },
    mutations: {
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        // Don't retry 4xx errors except 429 (rate limit)
        if (status && status >= 400 && status < 500 && status !== 429) {
          return false;
        }
        return failureCount < 2;
      },
      retryDelay: 1000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="three-kingdoms-theme">
      <QueryClientProvider client={queryClient}>
        <RecurProvider>
          <App />
        </RecurProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
