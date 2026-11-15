import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'

// Switch between dark and light mode.
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button className="btn btn-icon" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle}>
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  )
}
