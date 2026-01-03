import { useEffect, useState, type ReactNode } from 'react'
import { ThemeProviderContext } from '@/contexts/theme-context'

type Theme = 'dark' | 'light'

interface ThemeProviderProps {
  readonly children: ReactNode
  readonly defaultTheme?: Theme
  readonly storageKey?: string
}

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  storageKey = 'three-kingdoms-theme',
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
  }

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
