import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/use-theme'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      <span className="text-sm">{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  )
}
