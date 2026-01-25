import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Charts library - largest dependency (~400KB)
          recharts: ['recharts'],
          // Radix UI primitives - grouped for better caching
          'radix-ui': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-dialog',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-slot',
            '@radix-ui/react-tabs',
          ],
          // React core + React-dependent libraries
          'react-vendor': [
            'react',
            'react-dom',
            'react-router-dom',
            'lucide-react',
            'cmdk',
            'sonner',
            'react-hook-form',
            'recur-tw',
          ],
          // Data fetching
          tanstack: ['@tanstack/react-query'],
          // Backend services
          supabase: ['@supabase/supabase-js'],
          // Pure utility libraries (no React dependency)
          vendor: [
            'axios',
            'clsx',
            'tailwind-merge',
            'class-variance-authority',
            'zod',
          ],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5187,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8087',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
