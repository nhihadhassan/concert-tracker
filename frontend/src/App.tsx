import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { AuthProvider } from './auth/AuthProvider'
import type { AuthMember } from './auth/AuthContext'
import { AuthLoading, LoginPage } from './auth/LoginPage'
import { useAuth } from './auth/useAuth'
import { AddConcertDialog } from './components/AddConcertDialog'
import { AppHeader } from './components/AppHeader'
import { ArtworkDialog } from './components/ArtworkDialog'
import { ConcertDetail } from './components/ConcertDetail'
import { ConflictDialog } from './components/ConflictDialog'
import { ConcertCard } from './components/ConcertCard'
import { FiltersBar } from './components/FiltersBar'
import { RankedSummary } from './components/RankedSummary'
import { StatsStrip } from './components/StatsStrip'
import { StatsDashboard } from './components/StatsDashboard'
import { LiveWrapped } from './components/LiveWrapped'
import { useConcertLibrary } from './hooks/useConcertLibrary'
import { downloadCsv } from './lib/api'
import type {
  AttendanceWrite,
  Concert,
  ConcertCreate,
  ConcertFormSubmission,
  ConcertUpdate,
  QueuedMutation,
  Review,
} from './types'
import './App.css'

const sortConcerts = (rows: Concert[], sort: string) => [...rows].sort((left, right) => {
  if (sort === 'date-asc') return left.date.localeCompare(right.date)
  if (sort === 'price-desc') return (right.price ?? -1) - (left.price ?? -1)
  if (sort === 'rating-desc') return (right.personal_rating ?? -1) - (left.personal_rating ?? -1)
  if (sort === 'artist-asc') return left.artist.localeCompare(right.artist)
  return right.date.localeCompare(left.date)
})

type DashboardRoute =
  | { kind: 'concerts' }
  | { kind: 'stats'; scope: 'personal' | 'shared' }
  | { kind: 'wrapped' }
  | { kind: 'detail'; concertId: string }

const readDashboardRoute = (): DashboardRoute => {
  const params = new URLSearchParams(window.location.search)
  const concertId = params.get('concert')
  if (concertId) return { kind: 'detail', concertId }
  if (params.get('view') === 'stats') {
    return { kind: 'stats', scope: params.get('scope') === 'shared' ? 'shared' : 'personal' }
  }
  if (params.get('view') === 'wrapped') return { kind: 'wrapped' }
  return { kind: 'concerts' }
}

const routeUrl = (route: DashboardRoute) => {
  const params = new URLSearchParams()
  if (route.kind === 'detail') params.set('concert', route.concertId)
  if (route.kind === 'stats') {
    params.set('view', 'stats')
    params.set('scope', route.scope)
  }
  if (route.kind === 'wrapped') params.set('view', 'wrapped')
  const query = params.toString()
  return `${window.location.pathname}${query ? `?${query}` : ''}`
}

const makeMutation = (
  method: QueuedMutation['method'],
  path: string,
  body: unknown,
  label: string,
): QueuedMutation => ({
  id: crypto.randomUUID(),
  idempotencyKey: crypto.randomUUID(),
  method,
  path,
  body,
  label,
  createdAt: new Date().toISOString(),
})

const optimisticReview = (submission: ConcertFormSubmission, member: AuthMember): Review[] => {
  if (!submission.review) return []
  return [{
    id: submission.review.id,
    reviewer_user_id: member.user_id,
    reviewer_name: member.display_name,
    enjoyment_score: submission.review.enjoyment_score,
    stage_score: submission.review.stage_score,
    setlist_score: submission.review.setlist_score,
    seat_score: submission.review.seat_score,
    override_rating: submission.review.override_rating,
    override_reason: submission.review.override_reason,
    notes: submission.review.notes,
    calculated_rating: null,
    final_rating: null,
    is_overridden: submission.review.override_rating !== null,
    row_version: submission.review.expected_row_version ?? 1,
  }]
}

interface DashboardProps {
  accessToken: string
  member: AuthMember
  onSignOut: () => void
}

export function Dashboard({ accessToken, member, onSignOut }: DashboardProps) {
  const cloud = useConcertLibrary(accessToken)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('concert-theme') !== 'light')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Concert | null>(null)
  const [artworkEditing, setArtworkEditing] = useState<Concert | null>(null)
  const [artworkDialogOpen, setArtworkDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [artworkSaving, setArtworkSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [artworkError, setArtworkError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [genre, setGenre] = useState('')
  const [sort, setSort] = useState('date-desc')
  const [route, setRoute] = useState<DashboardRoute>(readDashboardRoute)
  const [notice, setNotice] = useState<{ message: string; celebratory: boolean } | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const returnFocusConcertId = useRef<string | null>(null)

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
  }, [])

  useEffect(() => {
    const onPopState = () => setRoute(readDashboardRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    const frame = window.requestAnimationFrame(() => {
      if (route.kind === 'concerts' && returnFocusConcertId.current) {
        document.getElementById(`concert-open-${returnFocusConcertId.current}`)?.focus()
        returnFocusConcertId.current = null
        return
      }
      document.querySelector<HTMLElement>('[data-view-heading]')?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [route])

  const navigate = useCallback((nextRoute: DashboardRoute, replace = false) => {
    const method = replace ? 'replaceState' : 'pushState'
    window.history[method]({ concertTracker: true }, '', routeUrl(nextRoute))
    setRoute(nextRoute)
  }, [])

  const library = cloud.library
  const filteredConcerts = useMemo(() => {
    if (!library) return []
    const query = search.trim().toLowerCase()
    return sortConcerts(library.concerts.filter((concert) => {
      if (status && concert.status !== status) return false
      if (genre && concert.genre !== genre) return false
      if (query && !`${concert.artist} ${concert.venue}`.toLowerCase().includes(query)) return false
      return true
    }), sort)
  }, [genre, library, search, sort, status])
  const genres = useMemo(() => [...new Set(
    (library?.concerts ?? []).map((concert) => concert.genre).filter((value): value is string => Boolean(value)),
  )].sort(), [library])

  const flashNotice = (message: string, celebratory = false) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    setNotice({ message, celebratory })
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
  }

  const openNew = () => {
    setEditing(null)
    setFormError('')
    setDialogOpen(true)
  }

  const openArtwork = (concert: Concert) => {
    setArtworkEditing(concert)
    setArtworkError('')
    setArtworkDialogOpen(true)
  }

  const saveConcert = async (submission: ConcertFormSubmission) => {
    if (!library) return
    setSaving(true)
    setFormError('')
    try {
      if (!editing) {
        const id = crypto.randomUUID()
        const payload: ConcertCreate = { id, ...submission.fields, attendee_user_ids: submission.attendee_user_ids, review: submission.review }
        await cloud.executeMutation(
          makeMutation('POST', '/v1/concerts', payload, `Add ${payload.artist}`),
          (current) => ({
            ...current,
            concerts: [{
              id,
              ...submission.fields,
              row_version: 1,
              attendees: current.members.filter((row) => submission.attendee_user_ids.includes(row.user_id) || row.user_id === member.user_id).map((row) => ({ user_id: row.user_id, display_name: row.display_name, attendance_status: submission.fields.status === 'Attended' ? 'Attended' : submission.fields.status === 'Cancelled' ? 'Did Not Attend' : 'Planned', row_version: 1 })),
              reviews: optimisticReview(submission, member),
              personal_rating: null,
              combined_rating: null,
              pending: true,
            }, ...current.concerts],
          }),
        )
        flashNotice(`${payload.artist} queued for cloud sync`, payload.status === 'Attended')
      } else {
        const update: ConcertUpdate = { ...submission.fields, expected_row_version: editing.row_version }
        await cloud.executeMutation(
          makeMutation('PATCH', `/v1/concerts/${editing.id}`, update, `Edit ${editing.artist}`),
          (current) => ({ ...current, concerts: current.concerts.map((concert) => concert.id === editing.id ? { ...concert, ...submission.fields, pending: true } : concert) }),
        )
        const attendance: AttendanceWrite = {
          attendee_user_ids: submission.attendee_user_ids,
          expected_versions: Object.fromEntries(editing.attendees.map((row) => [row.user_id, row.row_version])),
        }
        await cloud.executeMutation(
          makeMutation('PUT', `/v1/concerts/${editing.id}/attendees`, attendance, `Update ${editing.artist} attendance`),
          (current) => current,
        )
        if (submission.review) {
          await cloud.executeMutation(
            makeMutation('PUT', `/v1/concerts/${editing.id}/review`, submission.review, `Review ${editing.artist}`),
            (current) => ({ ...current, concerts: current.concerts.map((concert) => concert.id === editing.id ? { ...concert, reviews: [...concert.reviews.filter((review) => review.reviewer_user_id !== member.user_id), ...optimisticReview(submission, member)], pending: true } : concert) }),
          )
        }
        flashNotice(`${submission.fields.artist} changes queued`, submission.fields.status === 'Attended')
      }
      setDialogOpen(false)
      setEditing(null)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Concert could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const deleteConcert = async (concert: Concert) => {
    if (!window.confirm(`Delete ${concert.artist}? This removes it from the shared library.`)) return false
    await cloud.executeMutation(
      makeMutation('DELETE', `/v1/concerts/${concert.id}`, { expected_row_version: concert.row_version }, `Delete ${concert.artist}`),
      (current) => ({ ...current, concerts: current.concerts.filter((row) => row.id !== concert.id) }),
    )
    flashNotice(`${concert.artist} queued for deletion`)
    return true
  }

  const saveArtwork = async (concert: Concert, image: string | null) => {
    setArtworkSaving(true)
    setArtworkError('')
    try {
      const update: ConcertUpdate = {
        artist: concert.artist,
        tour: concert.tour,
        date: concert.date,
        venue: concert.venue,
        price: concert.price,
        genre: concert.genre,
        projected: concert.projected,
        seat: concert.seat,
        status: concert.status,
        type: concert.type,
        spotify_url: concert.spotify_url,
        image,
        notes: concert.notes,
        companions: concert.companions,
        expected_row_version: concert.row_version,
      }
      await cloud.executeMutation(
        makeMutation('PATCH', `/v1/concerts/${concert.id}`, update, `Update ${concert.artist} artwork`),
        (current) => ({ ...current, concerts: current.concerts.map((row) => row.id === concert.id ? { ...row, image, pending: true } : row) }),
      )
      setArtworkDialogOpen(false)
      setArtworkEditing(null)
      navigate({ kind: 'concerts' }, true)
      flashNotice(`${concert.artist} image queued for cloud sync`)
    } catch (error) {
      setArtworkError(error instanceof Error ? error.message : 'Artwork could not be saved.')
    } finally {
      setArtworkSaving(false)
    }
  }

  const exportCsv = async () => {
    try {
      await downloadCsv(accessToken)
      flashNotice('Cloud CSV exported')
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'CSV export failed')
    }
  }

  const toggleTheme = () => {
    setDarkMode((value) => {
      localStorage.setItem('concert-theme', value ? 'light' : 'dark')
      return !value
    })
  }

  if (!library) {
    return <main className="app auth-page theme-dark"><section className="auth-panel auth-skeleton" aria-label="Loading concert library"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-field" /><div className="skeleton skeleton-field" />{cloud.error ? <p className="auth-error" role="alert">{cloud.error}</p> : null}<button className="button button-secondary" type="button" onClick={() => void cloud.refetch()}><RefreshCw size={17} />Retry</button></section></main>
  }

  const combinedRankings = library.analytics.rankings.combined ?? []
  const personalScopedRankings = library.personal_analytics.rankings[member.user_id] ?? []
  const selectedConcert = route.kind === 'detail' ? library.concerts.find((concert) => concert.id === route.concertId) : null
  const activeView = route.kind === 'stats' ? 'stats' : route.kind === 'wrapped' ? 'wrapped' : 'concerts'
  const backToConcerts = () => {
    navigate({ kind: 'concerts' }, true)
  }
  const openConcert = (concert: Concert) => {
    returnFocusConcertId.current = concert.id
    navigate({ kind: 'detail', concertId: concert.id })
  }
  return (
    <div className={darkMode ? 'app theme-dark' : 'app theme-light'}>
      <AppHeader activeView={activeView} darkMode={darkMode} memberName={member.display_name} pendingCount={cloud.pendingCount} syncState={cloud.syncState} onAdd={openNew} onExport={() => void exportCsv()} onSignOut={onSignOut} onThemeToggle={toggleTheme} onViewChange={(view) => navigate(view === 'stats' ? { kind: 'stats', scope: 'personal' } : view === 'wrapped' ? { kind: 'wrapped' } : { kind: 'concerts' })} />
      {route.kind === 'concerts' ? <main className="page-shell page-shell-feed" data-view-heading tabIndex={-1}>
        <div className="dashboard-column">
          <StatsStrip concerts={library.concerts} />
          {cloud.error ? <div className="sync-error-banner" role="status">{cloud.error}<button type="button" onClick={() => void cloud.flushOutbox()}>Retry sync</button></div> : null}
          <FiltersBar genres={genres} genre={genre} search={search} sort={sort} status={status} onGenreChange={setGenre} onSearchChange={setSearch} onSortChange={setSort} onStatusChange={setStatus} />
          <p className="list-meta">Showing {filteredConcerts.length} of {library.concerts.length} cloud concerts</p>
          {filteredConcerts.length ? <section className="concert-grid" aria-label="Concerts">{filteredConcerts.map((concert, index) => <ConcertCard key={concert.id} concert={concert} index={index} onArtwork={openArtwork} onDelete={(row) => void deleteConcert(row)} onEdit={(row) => { setEditing(row); setFormError(''); setDialogOpen(true) }} onOpen={openConcert} />)}</section> : <section className="empty-state"><h2>{library.concerts.length ? 'No concerts match' : 'Add the first staging concert'}</h2><p>{library.concerts.length ? 'Clear a filter or try another artist or venue.' : 'The shared normalized library is empty and ready for testing.'}</p>{!library.concerts.length ? <button className="button button-primary" type="button" onClick={openNew}>Add concert</button> : null}</section>}
        </div>
        <div className="ranking-column"><RankedSummary personal={personalScopedRankings} /></div>
      </main> : route.kind === 'stats' ? <main className="feature-shell"><StatsDashboard accessToken={accessToken} analytics={route.scope === 'personal' ? library.personal_analytics : library.analytics} memberName={member.display_name} rankings={route.scope === 'personal' ? personalScopedRankings : combinedRankings} scope={route.scope} onScopeChange={(scope) => navigate({ kind: 'stats', scope }, true)} /></main> : route.kind === 'wrapped' ? <main className="feature-shell"><LiveWrapped concerts={library.concerts} analytics={library.personal_analytics} memberName={member.display_name} /></main> : <main className="feature-shell">{selectedConcert ? <ConcertDetail concert={selectedConcert} member={member} onArtwork={openArtwork} onBack={backToConcerts} onEdit={(row) => { setEditing(row); setFormError(''); setDialogOpen(true) }} onDelete={(row) => { void deleteConcert(row).then((deleted) => { if (deleted) navigate({ kind: 'concerts' }, true) }) }} /> : <section className="detail-not-found"><ArrowLeft size={22} aria-hidden="true" /><h1 data-view-heading tabIndex={-1}>Concert not found</h1><p>This concert may have been deleted or is not available in your library.</p><button className="button button-primary" type="button" onClick={() => navigate({ kind: 'concerts' }, true)}>Back to concerts</button></section>}</main>}
      <AddConcertDialog accessToken={accessToken} concert={editing} currentUserId={member.user_id} error={formError} members={library.members} open={dialogOpen} saving={saving} onClose={() => { setDialogOpen(false); setEditing(null) }} onSave={saveConcert} />
      <ArtworkDialog accessToken={accessToken} concert={artworkEditing} error={artworkError} open={artworkDialogOpen} saving={artworkSaving} onClose={() => { setArtworkDialogOpen(false); setArtworkEditing(null) }} onSave={saveArtwork} />
      <ConflictDialog conflict={cloud.conflict} onDiscard={() => void cloud.discardConflict()} onRetry={() => void cloud.retryConflict()} />
      <AnimatePresence>{notice ? <m.div className={`toast${notice.celebratory ? ' toast-celebration' : ''}`} role="status" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>{notice.celebratory ? <Sparkles size={18} /> : <CheckCircle2 size={18} />}{notice.message}</m.div> : null}</AnimatePresence>
    </div>
  )
}

function AuthenticatedApp() {
  const { accessToken, member, signOut, status } = useAuth()
  if (status === 'loading' || status === 'validating') return <AuthLoading />
  if (status === 'signed-in' && member && accessToken) return <Dashboard accessToken={accessToken} member={member} onSignOut={() => void signOut()} />
  return <LoginPage />
}

function App() {
  return <AuthProvider><AuthenticatedApp /></AuthProvider>
}

export default App
