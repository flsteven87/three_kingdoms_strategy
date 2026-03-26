import { Link, Outlet } from 'react-router-dom'
import { ThemeToggle } from '../theme-toggle'
import { PublicFooter } from './PublicFooter'

export function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/landing" className="flex items-center gap-2.5">
            <img
              src="/assets/logo.svg"
              alt="三國志戰略版"
              className="h-8 w-8 object-contain"
            />
            <span className="font-semibold text-sm">
              三國志戰略版 · 同盟管理中心
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <PublicFooter />
    </div>
  )
}
