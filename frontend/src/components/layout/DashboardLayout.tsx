import { useState, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from '../theme-toggle'
import { cn } from '@/lib/utils'

interface DashboardLayoutProps {
  readonly children?: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="h-screen flex bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 shrink-0">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
            aria-label="Open sidebar"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <img
              src="/assets/logo.png"
              alt="三國志戰略版"
              className="h-6 w-6 object-contain"
            />
            <span className="font-bold text-sm">三國志戰略版</span>
          </div>

          {/* Spacer for desktop */}
          <div className="hidden lg:block" />

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 max-w-7xl">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>

      {/* Mobile close button when sidebar is open */}
      {sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(false)}
          className="fixed top-4 right-4 z-50 lg:hidden inline-flex items-center justify-center rounded-md p-2 bg-card border border-border text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
