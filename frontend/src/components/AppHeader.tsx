import { BarChart3, Cloud, Disc3, Download, ListMusic, Mic2, Moon, Plus, RefreshCw, Sparkles, Sun, TriangleAlert, WifiOff } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import type { SyncState } from '../types'

interface AppHeaderProps {
  activeView: 'concerts' | 'albums' | 'stats' | 'wrapped'
  addLabel: string
  darkMode: boolean
  memberName: string
  pendingCount: number
  syncState: SyncState
  onAdd: () => void
  onExport: () => void
  onThemeToggle: () => void
  onViewChange: (view: 'concerts' | 'albums' | 'stats' | 'wrapped') => void
}

const syncDisplay = (state: SyncState, pendingCount: number) => {
  if (state === 'offline') return { icon: WifiOff, label: pendingCount ? `Offline, ${pendingCount} pending` : 'Offline' }
  if (state === 'syncing') return { icon: RefreshCw, label: `Syncing ${pendingCount || ''}`.trim() }
  if (state === 'pending') return { icon: Cloud, label: `${pendingCount} pending` }
  if (state === 'conflict') return { icon: TriangleAlert, label: 'Needs review' }
  if (state === 'error') return { icon: TriangleAlert, label: pendingCount ? `Sync error, ${pendingCount} pending` : 'Sync error' }
  if (state === 'loading') return { icon: RefreshCw, label: 'Loading' }
  return { icon: Cloud, label: 'Synced' }
}

export function AppHeader(props: AppHeaderProps) {
  const sync = syncDisplay(props.syncState, props.pendingCount)
  const SyncIcon = sync.icon
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><Mic2 size={22} strokeWidth={2.3} /></span>
          <div className="brand-copy">
            <h1>Nhihad's Concerts</h1>
            <p>{props.memberName} <span aria-hidden="true">·</span> <AnimatePresence mode="popLayout" initial={false}><m.span key={`${props.syncState}-${sync.label}`} className={`sync-label sync-${props.syncState}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}><SyncIcon size={13} />{sync.label}</m.span></AnimatePresence></p>
          </div>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button type="button" className={props.activeView === 'concerts' ? 'active' : ''} aria-current={props.activeView === 'concerts' ? 'page' : undefined} onClick={() => props.onViewChange('concerts')}><ListMusic size={17} />Concerts</button>
          <button type="button" className={props.activeView === 'albums' ? 'active' : ''} aria-current={props.activeView === 'albums' ? 'page' : undefined} onClick={() => props.onViewChange('albums')}><Disc3 size={17} />Albums</button>
          <button type="button" className={props.activeView === 'stats' ? 'active' : ''} aria-current={props.activeView === 'stats' ? 'page' : undefined} onClick={() => props.onViewChange('stats')}><BarChart3 size={17} />Stats</button>
          <button type="button" className={props.activeView === 'wrapped' ? 'active' : ''} aria-current={props.activeView === 'wrapped' ? 'page' : undefined} onClick={() => props.onViewChange('wrapped')}><Sparkles size={17} />Wrapped</button>
        </nav>
        <div className="header-actions">
          <button className="button button-secondary button-icon" type="button" onClick={props.onThemeToggle} title={props.darkMode ? 'Use light theme' : 'Use dark theme'}>
            {props.darkMode ? <Sun size={18} /> : <Moon size={18} />}<span className="button-label">{props.darkMode ? 'Light' : 'Dark'}</span>
          </button>
          <button className="button button-secondary" type="button" onClick={props.onExport}><Download size={18} /><span>Export CSV</span></button>
          <button className="button button-primary" type="button" onClick={props.onAdd}><Plus size={18} /><span>{props.addLabel}</span></button>
        </div>
      </div>
    </header>
  )
}
