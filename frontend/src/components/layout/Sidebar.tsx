import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Calendar, Database, Trophy, Users, BarChart3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  readonly className?: string
}

interface NavigationItem {
  readonly name: string
  readonly href: string
  readonly icon: React.ComponentType<{ className?: string }>
}

const navigation: readonly NavigationItem[] = [
  {
    name: '總覽',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    name: '賽季管理',
    href: '/seasons',
    icon: Calendar,
  },
  {
    name: '資料管理',
    href: '/data',
    icon: Database,
  },
  {
    name: '霸業權重',
    href: '/hegemony',
    icon: Trophy,
  },
  {
    name: '同盟分析',
    href: '/analytics',
    icon: BarChart3,
  },
  {
    name: '成員表現',
    href: '/members',
    icon: Users,
  },
  {
    name: '設定',
    href: '/settings',
    icon: Settings,
  },
]

export const Sidebar: React.FC<SidebarProps> = ({ className }) => {
  const location = useLocation()

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(href)
  }

  return (
    <div className={cn('flex h-full w-64 flex-col bg-card border-r border-border', className)}>
      {/* Logo Section */}
      <div className="flex h-16 items-center px-6 border-b border-border">
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/assets/logo.png"
            alt="三國志戰略版"
            className="h-8 w-8 object-contain"
          />
          <div className="flex flex-col">
            <span className="font-bold text-sm leading-tight">三國志戰略版</span>
            <span className="text-xs text-muted-foreground leading-tight">盟友表現管理</span>
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer Info */}
      <div className="border-t border-border p-4">
        <div className="text-xs text-muted-foreground">
          <p className="font-medium">Version 0.1.0</p>
        </div>
      </div>
    </div>
  )
}
