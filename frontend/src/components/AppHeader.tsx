import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { BarChart3, CalendarPlus, Cloud, Disc3, Download, FileJson, FileUp, ListMusic, Mic2, Moon, Plus, RefreshCw, Sparkles, Sun, Table2, TriangleAlert, WifiOff } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import type { SyncState } from '../types'

interface AppHeaderProps {
  activeView: 'concerts' | 'albums' | 'stats' | 'wrapped'
  addLabel?: string
  darkMode: boolean
  loading?: boolean
  memberName?: string
  pendingCount?: number
  syncState?: SyncState
  onAdd?: () => void
  onExportCalendar?: () => void
  onExportCsv?: () => void
  onExportJson?: () => void
  onHome?: (event: MouseEvent<HTMLAnchorElement>) => void
  onRestoreBackup?: () => void
  onThemeToggle?: () => void
  onViewNavigate?: (event: MouseEvent<HTMLAnchorElement>, view: AppHeaderProps['activeView']) => void
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

const navigationItems: Array<{ href: string; icon: typeof ListMusic; label: string; view: AppHeaderProps['activeView'] }> = [
  { href: '/', icon: ListMusic, label: 'Concerts', view: 'concerts' },
  { href: '/?view=albums', icon: Disc3, label: 'Albums', view: 'albums' },
  { href: '/?view=stats', icon: BarChart3, label: 'Stats', view: 'stats' },
  { href: '/?view=wrapped', icon: Sparkles, label: 'Wrapped', view: 'wrapped' },
]

const PrimaryNavigation = ({ className, activeView, onViewNavigate }: Pick<AppHeaderProps, 'activeView' | 'onViewNavigate'> & { className: string }) => (
  <nav className={`primary-nav ${className}`} aria-label={className.includes('mobile') ? 'Mobile navigation' : 'Primary navigation'}>
    {navigationItems.map(({ href, icon: Icon, label, view }) => (
      <a key={view} href={href} className={activeView === view ? 'active' : ''} aria-current={activeView === view ? 'page' : undefined} onClick={(event) => onViewNavigate?.(event, view)}>
        <Icon size={17} aria-hidden="true" />{label}
      </a>
    ))}
  </nav>
)

export function AppHeader(props: AppHeaderProps) {
  const exportMenu = useRef<HTMLDetailsElement>(null)
  const exportToggle = useRef<HTMLElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const sync = syncDisplay(props.syncState ?? 'loading', props.pendingCount ?? 0)
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
        <a className="brand-lockup" href="/" onClick={props.onHome} aria-label="Nhihad's Concerts, return to Concert Archive">
          <span className="brand-mark" aria-hidden="true"><Mic2 size={22} strokeWidth={2.3} /></span>
          <div className="brand-copy">
            <span className="brand-title">Nhihad's Concerts</span>
            <p>{props.memberName ? <>{props.memberName} <span aria-hidden="true">·</span> </> : null}<AnimatePresence mode="popLayout" initial={false}><m.span key={`${props.syncState}-${sync.label}`} className={`sync-label sync-${props.syncState ?? 'loading'}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}><SyncIcon size={13} aria-hidden="true" />{sync.label}</m.span></AnimatePresence></p>
          </div>
        </a>
        <PrimaryNavigation className="primary-nav-desktop" activeView={props.activeView} onViewNavigate={props.onViewNavigate} />
        {props.loading ? <div className="header-actions header-actions-loading" aria-hidden="true"><span className="skeleton" /><span className="skeleton" /></div> : <div className="header-actions">
          <button className="button button-secondary button-icon" type="button" onClick={props.onThemeToggle} title={props.darkMode ? 'Use light theme' : 'Use dark theme'}>
            {props.darkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}<span className="button-label">{props.darkMode ? 'Light' : 'Dark'}</span>
          </button>
          <details className="export-menu" ref={exportMenu} open={exportOpen} onToggle={(event) => setExportOpen(event.currentTarget.open)}>
            <summary ref={exportToggle} className="button button-secondary" role="button" aria-label="Export options" aria-expanded={exportOpen}><Download size={18} aria-hidden="true" /><span>Export</span></summary>
            <div className="export-menu-popover" role="group" aria-label="Export concert data">
              <button type="button" onClick={() => props.onExportCsv && runExport(props.onExportCsv)}><Table2 size={17} aria-hidden="true" /><span><strong>CSV spreadsheet</strong><small>Concert rows for analysis</small></span></button>
              <button type="button" onClick={() => props.onExportJson && runExport(props.onExportJson)}><FileJson size={17} aria-hidden="true" /><span><strong>JSON backup</strong><small>Complete library snapshot</small></span></button>
              <button type="button" onClick={() => props.onRestoreBackup && runExport(props.onRestoreBackup)}><FileUp size={17} aria-hidden="true" /><span><strong>Restore backup</strong><small>Preview changes before restoring</small></span></button>
              <button type="button" onClick={() => props.onExportCalendar && runExport(props.onExportCalendar)}><CalendarPlus size={17} aria-hidden="true" /><span><strong>Upcoming calendar</strong><small>ICS file for calendar apps</small></span></button>
            </div>
          </details>
          <button className="button button-primary" type="button" onClick={props.onAdd}><Plus size={18} aria-hidden="true" /><span>{props.addLabel}</span></button>
        </div>}
      </div>
    </header>
    <PrimaryNavigation className="primary-nav-mobile" activeView={props.activeView} onViewNavigate={props.onViewNavigate} />
  </>
}
