import { useEffect, useRef, useState } from 'react'
import { BarChart3, CalendarPlus, Cloud, Disc3, Download, FileJson, ListMusic, Mic2, Moon, Plus, RefreshCw, Sparkles, Sun, Table2, TriangleAlert, WifiOff } from 'lucide-react'
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
  onExportCalendar: () => void
  onExportCsv: () => void
  onExportJson: () => void
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

const PrimaryNavigation = ({ className, activeView, onViewChange }: Pick<AppHeaderProps, 'activeView' | 'onViewChange'> & { className: string }) => (
  <nav className={`primary-nav ${className}`} aria-label={className.includes('mobile') ? 'Mobile navigation' : 'Primary navigation'}>
    <button type="button" className={activeView === 'concerts' ? 'active' : ''} aria-current={activeView === 'concerts' ? 'page' : undefined} onClick={() => onViewChange('concerts')}><ListMusic size={17} />Concerts</button>
    <button type="button" className={activeView === 'albums' ? 'active' : ''} aria-current={activeView === 'albums' ? 'page' : undefined} onClick={() => onViewChange('albums')}><Disc3 size={17} />Albums</button>
    <button type="button" className={activeView === 'stats' ? 'active' : ''} aria-current={activeView === 'stats' ? 'page' : undefined} onClick={() => onViewChange('stats')}><BarChart3 size={17} />Stats</button>
    <button type="button" className={activeView === 'wrapped' ? 'active' : ''} aria-current={activeView === 'wrapped' ? 'page' : undefined} onClick={() => onViewChange('wrapped')}><Sparkles size={17} />Wrapped</button>
  </nav>
)

export function AppHeader(props: AppHeaderProps) {
  const exportMenu = useRef<HTMLDetailsElement>(null)
  const exportToggle = useRef<HTMLElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const sync = syncDisplay(props.syncState, props.pendingCount)
  const SyncIcon = sync.icon
  const runExport = (action: () => void) => {
    setExportOpen(false)
    action()
  }
  useEffect(() => {
    if (!exportOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !exportMenu.current?.contains(event.target)) setExportOpen(false)
    }
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setExportOpen(false)
      exportToggle.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithKeyboard)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithKeyboard)
    }
  }, [exportOpen])
  return <>
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><Mic2 size={22} strokeWidth={2.3} /></span>
          <div className="brand-copy">
            <h1>Nhihad's Concerts</h1>
            <p>{props.memberName} <span aria-hidden="true">·</span> <AnimatePresence mode="popLayout" initial={false}><m.span key={`${props.syncState}-${sync.label}`} className={`sync-label sync-${props.syncState}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}><SyncIcon size={13} />{sync.label}</m.span></AnimatePresence></p>
          </div>
        </div>
        <PrimaryNavigation className="primary-nav-desktop" activeView={props.activeView} onViewChange={props.onViewChange} />
        <div className="header-actions">
          <button className="button button-secondary button-icon" type="button" onClick={props.onThemeToggle} title={props.darkMode ? 'Use light theme' : 'Use dark theme'}>
            {props.darkMode ? <Sun size={18} /> : <Moon size={18} />}<span className="button-label">{props.darkMode ? 'Light' : 'Dark'}</span>
          </button>
          <details className="export-menu" ref={exportMenu} open={exportOpen} onToggle={(event) => setExportOpen(event.currentTarget.open)}>
            <summary ref={exportToggle} className="button button-secondary" role="button" aria-label="Export options" aria-expanded={exportOpen}><Download size={18} aria-hidden="true" /><span>Export</span></summary>
            <div className="export-menu-popover" role="group" aria-label="Export concert data">
              <button type="button" onClick={() => runExport(props.onExportCsv)}><Table2 size={17} aria-hidden="true" /><span><strong>CSV spreadsheet</strong><small>Concert rows for analysis</small></span></button>
              <button type="button" onClick={() => runExport(props.onExportJson)}><FileJson size={17} aria-hidden="true" /><span><strong>JSON backup</strong><small>Complete library snapshot</small></span></button>
              <button type="button" onClick={() => runExport(props.onExportCalendar)}><CalendarPlus size={17} aria-hidden="true" /><span><strong>Upcoming calendar</strong><small>ICS file for calendar apps</small></span></button>
            </div>
          </details>
          <button className="button button-primary" type="button" onClick={props.onAdd}><Plus size={18} /><span>{props.addLabel}</span></button>
        </div>
      </div>
    </header>
    <PrimaryNavigation className="primary-nav-mobile" activeView={props.activeView} onViewChange={props.onViewChange} />
  </>
}
