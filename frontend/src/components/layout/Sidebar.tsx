import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Calendar, Database, Trophy, Users, BarChart3, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'

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
    href: '/dashboard',
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
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location.pathname === '/dashboard'
    }
    return location.pathname.startsWith(href)
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login')
    } catch {
      // Silently handle logout errors - user will be redirected anyway
    }
  }

  return (
    <div className={cn('flex h-full w-64 flex-col bg-card border-r border-border', className)}>
      {/* Logo Section */}
      <div className="flex h-16 items-center px-6 border-b border-border">
        <Link to="/dashboard" className="flex items-center gap-2">
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

      {/* User Info & Logout */}
      <div className="border-t border-border p-4 space-y-3">
        {user && (
          <div className="flex items-center gap-3 px-2">
            {/* User Avatar - show Google profile picture if available */}
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt={user.user_metadata?.full_name || user.email || 'User'}
                className="h-8 w-8 rounded-full object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
                <span className="text-sm font-medium text-primary">
                  {(user.user_metadata?.full_name?.charAt(0) || user.email?.charAt(0) || '?').toUpperCase()}
                </span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.user_metadata?.full_name ? user.email : '已登入'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="登出"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="text-xs text-muted-foreground px-2">
          <p className="font-medium">Version 0.1.0</p>
        </div>
      </div>
    </div>
  )
}
