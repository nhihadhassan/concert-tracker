import { Download, LogOut, Mic2, Moon, Plus, Sun } from 'lucide-react'

interface AppHeaderProps {
  darkMode: boolean
  memberName: string
  onAdd: () => void
  onExport: () => void
  onSignOut: () => void
  onThemeToggle: () => void
}

export function AppHeader({ darkMode, memberName, onAdd, onExport, onSignOut, onThemeToggle }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Mic2 size={22} strokeWidth={2.3} />
          </span>
          <div className="brand-copy">
            <h1>Nhihad's Concerts</h1>
            <p>
              Personal concert tracker <span aria-hidden="true">·</span>{' '}
              <span className="sync-label"><span className="sync-dot" />{memberName} · Staging access</span>
            </p>
          </div>
        </div>

        <div className="header-actions">
          <button className="button button-secondary button-icon" type="button" onClick={onThemeToggle} title={darkMode ? 'Use light theme' : 'Use dark theme'}>
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            <span className="button-label">{darkMode ? 'Light' : 'Dark'}</span>
          </button>
          <button className="button button-secondary" type="button" onClick={onExport}>
            <Download size={18} />
            <span>Export CSV</span>
          </button>
          <button className="button button-primary" type="button" onClick={onAdd}>
            <Plus size={18} />
            <span>Add concert</span>
          </button>
          <button className="button button-secondary sign-out" type="button" onClick={onSignOut}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </header>
  )
}
