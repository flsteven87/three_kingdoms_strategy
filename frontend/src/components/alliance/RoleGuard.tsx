/**
 * RoleGuard Component
 *
 * 符合 CLAUDE.md 🔴:
 * - JSX syntax only
 * - Type-safe component
 * - Conditional rendering based on user role
 */

import type { ReactNode } from 'react'
import type { UserRole } from '@/hooks/use-user-role'
import { useUserRole } from '@/hooks/use-user-role'

interface RoleGuardProps {
  /**
   * Required roles to view children
   */
  readonly requiredRoles: UserRole[]

  /**
   * Content to display when user has permission
   */
  readonly children: ReactNode

  /**
   * Optional fallback content when user doesn't have permission
   */
  readonly fallback?: ReactNode
}

/**
 * RoleGuard - Conditionally render content based on user role
 *
 * @example
 * ```tsx
 * <RoleGuard requiredRoles={['owner', 'collaborator']}>
 *   <Button>Upload CSV</Button>
 * </RoleGuard>
 * ```
 */
export function RoleGuard({
  requiredRoles,
  children,
  fallback = null,
}: RoleGuardProps) {
  const { data: userRole, isLoading } = useUserRole()

  // While loading, show nothing (or could show loading state)
  if (isLoading) {
    return null
  }

  // Check if user has required role
  const hasPermission = userRole && requiredRoles.includes(userRole)

  if (!hasPermission) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
