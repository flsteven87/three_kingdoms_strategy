import { useState, type ComponentType } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Calendar, Database, Trophy, Users, User, BarChart3, Settings, LogOut, Swords, MessageSquare, Gem, Coins, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'

interface SidebarProps {
  readonly className?: string
}

interface NavigationItem {
  readonly name: string
  readonly href: string
  readonly icon: ComponentType<{ className?: string }>
}

interface NavigationGroup {
  readonly name: string
  readonly icon: ComponentType<{ className?: string }>
  readonly children: readonly NavigationItem[]
}

type NavigationEntry = NavigationItem | NavigationGroup

function isNavigationGroup(entry: NavigationEntry): entry is NavigationGroup {
  return 'children' in entry
}

const navigation: readonly NavigationEntry[] = [
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
    name: '銅礦管理',
    href: '/copper-mines',
    icon: Gem,
  },
  {
    name: '捐獻管理',
    href: '/contributions',
    icon: Coins,
  },
  {
    name: '事件戰役',
    href: '/events',
    icon: Swords,
  },
  {
    name: '數據分析',
    icon: BarChart3,
    children: [
      {
        name: '同盟分析',
        href: '/analytics',
        icon: BarChart3,
      },
      {
        name: '組別分析',
        href: '/groups',
        icon: Users,
      },
      {
        name: '成員分析',
        href: '/members',
        icon: User,
      },
    ],
  },
  {
    name: 'LINE 三國小幫手',
    href: '/line-binding',
    icon: MessageSquare,
  },
  {
    name: '設定',
    href: '/settings',
    icon: Settings,
  },
]

export function Sidebar({ className }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    '數據分析': true, // 預設展開
  })

  const isActive = (href: string) => {
    return location.pathname.startsWith(href)
  }

  const isGroupActive = (group: NavigationGroup) => {
    return group.children.some((child) => isActive(child.href))
  }

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }))
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/landing')
    } catch {
      // Silent error handling
    }
  }

  return (
    <div className={cn('flex h-full w-64 flex-col bg-card border-r border-border', className)}>
      {/* Logo Section */}
      <div className="flex h-16 items-center px-6 border-b border-border">
        <Link to="/analytics" className="flex items-center gap-2">
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
        {navigation.map((entry) => {
          if (isNavigationGroup(entry)) {
            const Icon = entry.icon
            const isExpanded = expandedGroups[entry.name] ?? false
            const groupActive = isGroupActive(entry)

            return (
              <div key={entry.name}>
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(entry.name)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    groupActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{entry.name}</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 transition-transform duration-200',
                      isExpanded ? 'rotate-0' : '-rotate-90'
                    )}
                  />
                </button>

                {/* Group Children */}
                <div
                  className={cn(
                    'overflow-hidden transition-all duration-200',
                    isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  )}
                >
                  <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
                    {entry.children.map((child) => {
                      const ChildIcon = child.icon
                      const active = isActive(child.href)

                      return (
                        <Link
                          key={child.href}
                          to={child.href}
                          className={cn(
                            'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                            active
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          )}
                        >
                          <ChildIcon className="h-4 w-4 shrink-0" />
                          <span>{child.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          }

          // Regular navigation item
          const Icon = entry.icon
          const active = isActive(entry.href)

          return (
            <Link
              key={entry.href}
              to={entry.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{entry.name}</span>
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
          <p className="font-medium">Version {import.meta.env.VITE_APP_VERSION || '0.3.0'}</p>
        </div>
      </div>
    </div>
  )
}
