import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ArrowLeft, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { EncoreLoading, SessionError } from './session/SessionScreens'
import { useSession } from './session/useSession'
import type { SessionMember } from './session/useSession'
import { AppHeader } from './components/AppHeader'
import { ConcertCard } from './components/ConcertCard'
import { ConcertDetailOverlay } from './components/ConcertDetailOverlay'
import { FiltersBar } from './components/FiltersBar'
import { RankedSummary } from './components/RankedSummary'
import { StatsStrip } from './components/StatsStrip'
import { ConcertStage } from './components/cinematic/ConcertStage'
import { MemoryLane } from './components/MemoryLane'
import { useConcertLibrary } from './hooks/useConcertLibrary'
import { useAlbumLibrary } from './hooks/useAlbumLibrary'
import { downloadCsv, saveAlbumReview } from './lib/api'
import { downloadJsonBackup, downloadUpcomingCalendar } from './lib/exports'
import { buildMemoryLane, buildMilestones } from './lib/archiveInsights'
import { useCinematicMotion } from './hooks/useCinematicMotion'
import { stageTransition } from './lib/stageTransition'
import { buildPageMetadata, usePageMetadata } from './lib/metadata'
import type {
  Album,
  AlbumReviewWrite,
  AttendanceWrite,
  Concert,
  ConcertCreate,
  ConcertFormSubmission,
  ConcertUpdate,
  QueuedMutation,
  Review,
} from './types'
import './App.css'
import './components/cinematic/cinematic.css'
import './components/AppHeader.css'

const StageConcerts = lazy(() => import('./components/stage/StageConcerts').then((module) => ({ default: module.StageConcerts })))

const AlbumJournal = lazy(() => import('./components/AlbumJournal').then((module) => ({
  default: module.AlbumJournal,
})))
const AddConcertDialog = lazy(() => import('./components/AddConcertDialog').then((module) => ({
  default: module.AddConcertDialog,
})))
const AlbumImportDialog = lazy(() => import('./components/AlbumImportDialog').then((module) => ({
  default: module.AlbumImportDialog,
})))
const AlbumLibrary = lazy(() => import('./components/AlbumLibrary').then((module) => ({
  default: module.AlbumLibrary,
})))
const AlbumReviewStudio = lazy(() => import('./components/AlbumReviewStudio').then((module) => ({
  default: module.AlbumReviewStudio,
})))
const ArtworkDialog = lazy(() => import('./components/ArtworkDialog').then((module) => ({
  default: module.ArtworkDialog,
})))
const ConcertDetail = lazy(() => import('./components/ConcertDetail').then((module) => ({
  default: module.ConcertDetail,
})))
const ConflictDialog = lazy(() => import('./components/ConflictDialog').then((module) => ({
  default: module.ConflictDialog,
})))
const BackupRestoreDialog = lazy(() => import('./components/BackupRestoreDialog').then((module) => ({
  default: module.BackupRestoreDialog,
})))
const StatsDashboard = lazy(() => import('./components/StatsDashboard').then((module) => ({
  default: module.StatsDashboard,
})))
const LiveWrapped = lazy(() => import('./components/LiveWrapped').then((module) => ({
  default: module.LiveWrapped,
})))

const AlbumViewLoading = () => (
  <main className="feature-shell">
    <section className="detail-not-found" aria-label="Loading album journal">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-field" />
    </section>
  </main>
)

const FeatureViewLoading = () => (
  <section className="detail-not-found" aria-label="Loading view">
    <div className="skeleton skeleton-title" />
    <div className="skeleton skeleton-field" />
  </section>
)

const sortConcerts = (rows: Concert[], sort: string) => [...rows].sort((left, right) => {
  if (sort === 'date-asc') return left.date.localeCompare(right.date)
  if (sort === 'price-desc') return (right.price ?? -1) - (left.price ?? -1)
  if (sort === 'rating-desc') return (right.personal_rating ?? -1) - (left.personal_rating ?? -1)
  if (sort === 'artist-asc') return left.artist.localeCompare(right.artist)
  return right.date.localeCompare(left.date)
})

type DashboardRoute =
  | { kind: 'concerts' }
  | { kind: 'stage' }
  | { kind: 'albums' }
  | { kind: 'album-detail'; albumId: string; editing: boolean }
  | { kind: 'stats'; scope: 'personal' | 'shared' }
  | { kind: 'wrapped' }
  | { kind: 'detail'; concertId: string; stage?: boolean }
  | { kind: 'not-found' }

const readDashboardRoute = (): DashboardRoute => {
  if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') return { kind: 'not-found' }
  const params = new URLSearchParams(window.location.search)
  const albumId = params.get('album')
  if (albumId) return { kind: 'album-detail', albumId, editing: params.get('mode') === 'edit' }
  const concertId = params.get('concert')
  if (concertId) return { kind: 'detail', concertId, stage: params.get('view') !== 'classic' }
  if (params.get('view') === 'stage') return { kind: 'stage' }
  if (params.get('view') === 'stats') {
    return { kind: 'stats', scope: params.get('scope') === 'shared' ? 'shared' : 'personal' }
  }
  if (params.get('view') === 'wrapped') return { kind: 'wrapped' }
  if (params.get('view') === 'albums') return { kind: 'albums' }
  return { kind: params.get('view') === 'classic' ? 'concerts' : 'stage' }
}

const routeUrl = (route: DashboardRoute) => {
  const params = new URLSearchParams()
  if (route.kind === 'albums') params.set('view', 'albums')
  if (route.kind === 'album-detail') {
    params.set('album', route.albumId)
    if (route.editing) params.set('mode', 'edit')
  }
  if (route.kind === 'detail') {
    params.set('concert', route.concertId)
    if (!route.stage) params.set('view', 'classic')
  }
  if (route.kind === 'concerts') params.set('view', 'classic')
  if (route.kind === 'stats') {
    params.set('view', 'stats')
    if (route.scope === 'shared') params.set('scope', 'shared')
  }
  if (route.kind === 'wrapped') params.set('view', 'wrapped')
  const query = params.toString()
  return `/${query ? `?${query}` : ''}`
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

const optimisticReview = (submission: ConcertFormSubmission, member: SessionMember): Review[] => {
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
  member: SessionMember
}

export function Dashboard({ member }: DashboardProps) {
  const cloud = useConcertLibrary()
  const [route, setRoute] = useState<DashboardRoute>(readDashboardRoute)
  const stageView = route.kind === 'stage' || (route.kind === 'detail' && Boolean(route.stage))
  const { disabled: stageMotionDisabled } = useCinematicMotion()
  const activeView = route.kind === 'stats'
    ? 'stats'
    : route.kind === 'wrapped'
      ? 'wrapped'
      : route.kind === 'albums' || route.kind === 'album-detail'
        ? 'albums'
        : 'concerts'
  const albumCloud = useAlbumLibrary(activeView === 'albums')
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('concert-theme') !== 'light')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)
  const [albumSaving, setAlbumSaving] = useState(false)
  const [albumError, setAlbumError] = useState('')
  const [editing, setEditing] = useState<Concert | null>(null)
  const [artworkEditing, setArtworkEditing] = useState<Concert | null>(null)
  const [artworkDialogOpen, setArtworkDialogOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [artworkSaving, setArtworkSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [artworkError, setArtworkError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [genre, setGenre] = useState('')
  const [sort, setSort] = useState('date-desc')
  const [notice, setNotice] = useState<{ message: string; celebratory: boolean } | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const returnFocusConcertId = useRef<string | null>(null)
  const concertOpener = useRef<HTMLElement | null>(null)
  const returnFocusAlbumId = useRef<string | null>(null)
  const previousRoute = useRef(route)
  const stageSourceArt = useRef<HTMLImageElement | null>(null)

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
  }, [])

  useEffect(() => {
    const onPopState = () => {
      const next = readDashboardRoute()
      const previous = previousRoute.current
      const closingStage = previous.kind === 'detail' && previous.stage && next.kind === 'stage'
      const openingStage = next.kind === 'detail' && next.stage
      if (closingStage || openingStage) stageTransition(() => setRoute(next), stageMotionDisabled, openingStage ? stageSourceArt.current : null, closingStage ? stageSourceArt.current : null)
      else setRoute(next)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [stageMotionDisabled])

  useEffect(() => {
    const previous = previousRoute.current
    previousRoute.current = route
    const concertOverlayTransition = route.kind === 'detail'
      || (previous.kind === 'detail' && (route.kind === 'concerts' || route.kind === 'stage'))
    if (concertOverlayTransition) return

    window.scrollTo({ top: 0, behavior: 'auto' })
    const frame = window.requestAnimationFrame(() => {
      if (route.kind === 'albums' && returnFocusAlbumId.current) {
        document.getElementById(`album-open-${returnFocusAlbumId.current}`)?.focus()
        returnFocusAlbumId.current = null
        return
      }
      document.querySelector<HTMLElement>('[data-view-heading]')?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [route])

  const navigate = useCallback((
    nextRoute: DashboardRoute,
    replace = false,
    historyState: Record<string, unknown> = { concertTracker: true },
  ) => {
    const method = replace ? 'replaceState' : 'pushState'
    window.history[method](historyState, '', routeUrl(nextRoute))
    setRoute(nextRoute)
  }, [])
  const closeConcertOverlay = useCallback(() => {
    if (window.history.state?.concertOverlay === true) {
      window.history.back()
      return
    }
    if (stageView) stageTransition(() => navigate({ kind: 'stage' }, true), stageMotionDisabled, null, stageSourceArt.current)
    else navigate({ kind: 'concerts' }, true)
  }, [navigate, stageView, stageMotionDisabled])
  const restoreConcertFocus = useCallback(() => {
    const concertId = returnFocusConcertId.current
    window.requestAnimationFrame(() => {
      if (previousRoute.current.kind !== 'concerts' && previousRoute.current.kind !== 'stage') return
      const opener = concertOpener.current?.isConnected ? concertOpener.current : concertId ? document.getElementById(`concert-open-${concertId}`) : null
      concertOpener.current = null
      if (opener) opener.focus({ preventScroll: true })
      else document.querySelector<HTMLElement>('[data-view-heading]')?.focus({ preventScroll: true })
      if (returnFocusConcertId.current === concertId) returnFocusConcertId.current = null
    })
  }, [])

  useEffect(() => {
    if (route.kind === 'stage' && (returnFocusConcertId.current || document.activeElement === document.body)) restoreConcertFocus()
  }, [route, restoreConcertFocus])

  const navigateFromLink = useCallback((event: MouseEvent<HTMLAnchorElement>, nextRoute: DashboardRoute, replace = false) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.currentTarget.target) return
    event.preventDefault()
    navigate(nextRoute, replace)
  }, [navigate])

  const library = cloud.library
  const selectedConcert = route.kind === 'detail' ? library?.concerts.find((concert) => concert.id === route.concertId) ?? null : null
  const selectedAlbum = route.kind === 'album-detail' ? albumCloud.albums.find((album) => album.id === route.albumId) ?? null : null
  const pageMetadata = useMemo(() => buildPageMetadata({
    album: selectedAlbum,
    concert: selectedConcert,
    missing: route.kind === 'not-found'
      || (route.kind === 'detail' && Boolean(library) && !selectedConcert)
      || (route.kind === 'album-detail' && !albumCloud.loading && !albumCloud.error && !selectedAlbum),
    view: route.kind,
  }), [albumCloud.error, albumCloud.loading, route.kind, selectedAlbum, selectedConcert, library])
  usePageMetadata(pageMetadata)
  const loadingHeading = activeView === 'albums' ? 'Album Journal' : activeView === 'stats' ? 'Concert Stats' : activeView === 'wrapped' ? 'Live Recap' : 'Concert Archive'
  const personalConcerts = useMemo(() => library?.concerts.filter((concert) =>
    concert.attendees.some((attendee) => attendee.user_id === member.user_id && attendee.attendance_status !== 'Did Not Attend')
    || concert.reviews.some((review) => review.reviewer_user_id === member.user_id),
  ) ?? [], [library, member.user_id])
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
  const memory = useMemo(() => buildMemoryLane(library?.concerts ?? []), [library])
  const milestones = useMemo(() => buildMilestones(library?.concerts ?? []), [library])
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
        setlist_url: concert.setlist_url,
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
      flashNotice(`${concert.artist} image queued for cloud sync`)
    } catch (error) {
      setArtworkError(error instanceof Error ? error.message : 'Artwork could not be saved.')
    } finally {
      setArtworkSaving(false)
    }
  }

  const exportCsv = async () => {
    try {
      await downloadCsv()
      flashNotice('Cloud CSV exported')
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'CSV export failed')
    }
  }

  const exportJson = () => {
    if (!library) return
    downloadJsonBackup(library)
    flashNotice('Complete JSON backup downloaded')
  }

  const exportCalendar = () => {
    if (!library) return
    try {
      downloadUpcomingCalendar(library.concerts)
      flashNotice('Upcoming concerts calendar downloaded')
    } catch (error) {
      flashNotice(error instanceof Error ? error.message : 'Calendar export failed')
    }
  }

  const importedAlbum = async (albumId: string, message: string) => {
    setAlbumDialogOpen(false)
    await albumCloud.refetch()
    navigate({ kind: 'album-detail', albumId, editing: false })
    flashNotice(message, true)
  }

  const saveReview = async (album: Album, review: AlbumReviewWrite) => {
    setAlbumSaving(true)
    setAlbumError('')
    try {
      const response = await saveAlbumReview(album.id, review)
      await albumCloud.refetch()
      navigate({ kind: 'album-detail', albumId: album.id, editing: false }, true)
      flashNotice(response.message, response.message.includes('published'))
    } catch (error) {
      setAlbumError(error instanceof Error ? error.message : 'The album review could not be saved.')
    } finally {
      setAlbumSaving(false)
    }
  }

  const toggleTheme = () => {
    setDarkMode((value) => {
      localStorage.setItem('concert-theme', value ? 'light' : 'dark')
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value ? '#f3f5f9' : '#070b16')
      return !value
    })
  }

  if (!library) {
    return <div className={darkMode ? 'app theme-dark' : 'app theme-light'}>
      <a className="skip-link" href="#encore-main">Skip to content</a>
      <AppHeader activeView={activeView} darkMode={darkMode} loading memberName={member.display_name} pendingCount={cloud.pendingCount} syncState={cloud.syncState} onHome={(event) => navigateFromLink(event, { kind: 'stage' })} onViewNavigate={(event, view) => navigateFromLink(event, view === 'stats' ? { kind: 'stats', scope: 'personal' } : view === 'wrapped' ? { kind: 'wrapped' } : view === 'albums' ? { kind: 'albums' } : { kind: 'stage' })} />
      <div id="encore-main">
        <main className="page-shell page-shell-feed encore-loading-shell" aria-label="Loading concert library" aria-busy="true">
          <h1 className="sr-only">{loadingHeading}</h1>
          <div className="dashboard-column">
            {cloud.error ? <div className="sync-error-banner" role="alert">{cloud.error}<button type="button" onClick={() => void cloud.refetch()}><RefreshCw size={17} aria-hidden="true" />Retry</button></div> : null}
            <section className="loading-stats-row" aria-hidden="true"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></section>
            <div className="skeleton loading-filter" aria-hidden="true" />
            <section className="loading-card-grid" aria-hidden="true"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></section>
          </div>
          <div className="ranking-column" aria-hidden="true"><div className="skeleton loading-ranking" /></div>
        </main>
      </div>
    </div>
  }

  const combinedRankings = library.analytics.rankings.combined ?? []
  const personalScopedRankings = library.personal_analytics.rankings[member.user_id] ?? []
  const openConcert = (concert: Concert) => {
    returnFocusConcertId.current = concert.id
    concertOpener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    const show = () => navigate({ kind: 'detail', concertId: concert.id, stage: stageView }, false, { concertTracker: true, concertOverlay: true })
    if (stageView) {
      const opener = concertOpener.current
      const featuredArt = document.querySelector<HTMLImageElement>('[data-stage-featured-art]')
      stageSourceArt.current = opener?.querySelector<HTMLImageElement>('img') ?? (featuredArt?.dataset.concertId === concert.id ? featuredArt : document.getElementById(`stage-open-${concert.id}`)?.querySelector<HTMLImageElement>('img') ?? null)
      const requestedFrom = route
      void import('./components/ConcertDetail').then(() => {
        if (previousRoute.current === requestedFrom) stageTransition(show, stageMotionDisabled, stageSourceArt.current)
      }).catch(() => { if (previousRoute.current === requestedFrom) show() })
    } else show()
  }
  const openAlbum = (album: Album) => {
    returnFocusAlbumId.current = album.id
    navigate({ kind: 'album-detail', albumId: album.id, editing: false })
  }
  const concertOverlay = route.kind === 'detail' ? <ConcertDetailOverlay key={route.concertId} onClose={closeConcertOverlay} cinematic={stageView}>
    {selectedConcert ? <Suspense fallback={<FeatureViewLoading />}><ConcertDetail cinematic={stageView} concert={selectedConcert} member={member} milestones={milestones.get(selectedConcert.id) ?? []} onArtwork={openArtwork} onClose={closeConcertOverlay} onEdit={(row) => { setEditing(row); setFormError(''); setDialogOpen(true) }} onDelete={(row) => { void deleteConcert(row).then((deleted) => { if (deleted) navigate({ kind: stageView ? 'stage' : 'concerts' }, true) }) }} /></Suspense> : <section className="detail-not-found"><ArrowLeft size={22} aria-hidden="true" /><h1 id="detail-title" tabIndex={-1}>Concert not found</h1><p>This concert may have been deleted or is not available in your library.</p><button className="button button-primary" type="button" onClick={closeConcertOverlay}>Back to concerts</button></section>}
  </ConcertDetailOverlay> : null
  return (
    <div className={darkMode ? 'app theme-dark' : 'app theme-light'}>
      <a className="skip-link" href="#encore-main">Skip to content</a>
      <AppHeader activeView={activeView} addLabel={activeView === 'albums' ? 'Find album' : 'Add concert'} darkMode={darkMode} memberName={member.display_name} pendingCount={cloud.pendingCount} syncState={cloud.syncState} onAdd={activeView === 'albums' ? () => setAlbumDialogOpen(true) : openNew} onExportCalendar={exportCalendar} onExportCsv={() => void exportCsv()} onExportJson={exportJson} onHome={(event) => navigateFromLink(event, { kind: 'stage' })} onRestoreBackup={() => setRestoreOpen(true)} onThemeToggle={toggleTheme} onViewNavigate={(event, view) => navigateFromLink(event, view === 'stats' ? { kind: 'stats', scope: 'personal' } : view === 'wrapped' ? { kind: 'wrapped' } : view === 'albums' ? { kind: 'albums' } : { kind: 'stage' })} />
      <div id="encore-main" tabIndex={-1}>
      {stageView ? <Suspense fallback={<FeatureViewLoading />}><StageConcerts concerts={filteredConcerts} allConcerts={library.concerts} personalConcerts={personalConcerts} onOpen={openConcert} onAdd={openNew} onClassic={(event) => navigateFromLink(event, { kind: 'concerts' })}>
        {cloud.error ? <div className="sync-error-banner" role="status">{cloud.error}<button type="button" onClick={() => void cloud.flushOutbox()}>Retry sync</button></div> : null}
        <FiltersBar genres={genres} genre={genre} search={search} sort={sort} status={status} onGenreChange={setGenre} onSearchChange={setSearch} onSortChange={setSort} onStatusChange={setStatus} />
      </StageConcerts></Suspense> : route.kind === 'concerts' || route.kind === 'detail' ? <main className="page-shell page-shell-feed">
        <h1 className="sr-only" data-view-heading tabIndex={-1}>Concert Archive</h1>
        <a className="stage-view-link" href="/" onClick={(event) => navigateFromLink(event, { kind: 'stage' })}>Stage view <span aria-hidden="true">↗</span></a>
        <ConcertStage concerts={personalConcerts} onOpen={openConcert} />
        <div className="dashboard-column">
          <StatsStrip concerts={library.concerts} />
          <MemoryLane memory={memory} onOpen={(concert) => openConcert(concert)} onRandom={() => {
            const attended = library.concerts.filter((concert) => concert.status === 'Attended')
            const concert = attended[Math.floor(Math.random() * attended.length)]
            if (concert) openConcert(concert)
          }} />
          {cloud.error ? <div className="sync-error-banner" role="status">{cloud.error}<button type="button" onClick={() => void cloud.flushOutbox()}>Retry sync</button></div> : null}
          <FiltersBar genres={genres} genre={genre} search={search} sort={sort} status={status} onGenreChange={setGenre} onSearchChange={setSearch} onSortChange={setSort} onStatusChange={setStatus} />
          <p className="list-meta">Showing {filteredConcerts.length} of {library.concerts.length} cloud concerts</p>
          {filteredConcerts.length ? <><h2 className="sr-only" id="concert-archive-title">Concert archive</h2><section className="concert-grid" aria-labelledby="concert-archive-title">{filteredConcerts.map((concert, index) => <ConcertCard key={concert.id} concert={concert} index={index} onArtwork={openArtwork} onDelete={(row) => void deleteConcert(row)} onEdit={(row) => { setEditing(row); setFormError(''); setDialogOpen(true) }} onOpen={openConcert} />)}</section></> : <section className="empty-state"><h2>{library.concerts.length ? 'No concerts match' : 'Add the first staging concert'}</h2><p>{library.concerts.length ? 'Clear a filter or try another artist or venue.' : 'The shared normalized library is empty and ready for testing.'}</p>{!library.concerts.length ? <button className="button button-primary" type="button" onClick={openNew}>Add concert</button> : null}</section>}
        </div>
        <div className="ranking-column"><RankedSummary personal={personalScopedRankings} /></div>
      </main> : route.kind === 'albums' ? <Suspense fallback={<AlbumViewLoading />}><AlbumLibrary albums={albumCloud.albums} currentUserId={member.user_id} error={albumCloud.error} loading={albumCloud.loading} onAdd={() => setAlbumDialogOpen(true)} onOpen={openAlbum} /></Suspense> : route.kind === 'album-detail' ? selectedAlbum ? <Suspense fallback={<AlbumViewLoading />}>{route.editing ? <AlbumReviewStudio album={selectedAlbum} currentUserId={member.user_id} error={albumError} saving={albumSaving} onCancel={() => navigate({ kind: 'album-detail', albumId: selectedAlbum.id, editing: false }, true)} onSave={(review) => saveReview(selectedAlbum, review)} /> : <AlbumJournal album={selectedAlbum} currentUserId={member.user_id} members={library.members} onBack={(event) => navigateFromLink(event, { kind: 'albums' }, true)} onEdit={() => navigate({ kind: 'album-detail', albumId: selectedAlbum.id, editing: true })} />}</Suspense> : <main className="feature-shell"><section className="detail-not-found"><ArrowLeft size={22} aria-hidden="true" /><h1 data-view-heading tabIndex={-1}>Album not found</h1><p>This album may have been removed or is not available in the shared journal.</p><a className="button button-primary" href="/?view=albums" onClick={(event) => navigateFromLink(event, { kind: 'albums' }, true)}>Back to albums</a></section></main> : route.kind === 'stats' ? <main className="feature-shell"><Suspense fallback={<FeatureViewLoading />}><StatsDashboard analytics={route.scope === 'personal' ? library.personal_analytics : library.analytics} concerts={route.scope === 'personal' ? personalConcerts : library.concerts} memberName={member.display_name} rankings={route.scope === 'personal' ? personalScopedRankings : combinedRankings} scope={route.scope} onEditConcert={(row) => { setEditing(row); setFormError(''); setDialogOpen(true) }} onScopeChange={(scope) => navigate({ kind: 'stats', scope }, true)} /></Suspense></main> : route.kind === 'wrapped' ? <main className="feature-shell"><Suspense fallback={<FeatureViewLoading />}><LiveWrapped concerts={personalConcerts} analytics={library.personal_analytics} memberName={member.display_name} /></Suspense></main> : route.kind === 'not-found' ? <main className="feature-shell"><section className="detail-not-found"><span className="not-found-code">404</span><h1 data-view-heading tabIndex={-1}>This page missed the encore</h1><p>The link may be old, but your concert archive is still here.</p><a className="button button-primary" href="/" onClick={(event) => navigateFromLink(event, { kind: 'stage' }, true)}>Back to concerts</a></section></main> : null}
      {stageView ? concertOverlay : <AnimatePresence onExitComplete={restoreConcertFocus}>{concertOverlay}</AnimatePresence>}
      </div>
      {dialogOpen ? <Suspense fallback={null}><AddConcertDialog concert={editing} concerts={library.concerts} currentUserId={member.user_id} error={formError} members={library.members} open saving={saving} onClose={() => { setDialogOpen(false); setEditing(null) }} onSave={saveConcert} /></Suspense> : null}
      {albumDialogOpen ? <Suspense fallback={null}><AlbumImportDialog open onClose={() => setAlbumDialogOpen(false)} onImported={(albumId, message) => void importedAlbum(albumId, message)} /></Suspense> : null}
      {artworkDialogOpen ? <Suspense fallback={null}><ArtworkDialog concert={artworkEditing} error={artworkError} open saving={artworkSaving} onClose={() => { setArtworkDialogOpen(false); setArtworkEditing(null) }} onSave={saveArtwork} /></Suspense> : null}
      {restoreOpen ? <Suspense fallback={null}><BackupRestoreDialog online={cloud.syncState !== 'offline'} pendingCount={cloud.pendingCount} onClose={() => setRestoreOpen(false)} onRestored={(message) => { setRestoreOpen(false); void cloud.refetch(); flashNotice(message) }} /></Suspense> : null}
      {cloud.conflict ? <Suspense fallback={null}><ConflictDialog conflict={cloud.conflict} onDiscard={() => void cloud.discardConflict()} onRetry={() => void cloud.retryConflict()} /></Suspense> : null}
      <AnimatePresence>{notice ? <m.div className={`toast${notice.celebratory ? ' toast-celebration' : ''}`} role="status" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>{notice.celebratory ? <Sparkles size={18} /> : <CheckCircle2 size={18} />}{notice.message}</m.div> : null}</AnimatePresence>
    </div>
  )
}

function App() {
  const { error, member, status } = useSession()
  if (status === 'loading') return <EncoreLoading />
  if (status === 'ready' && member) return <Dashboard member={member} />
  return <SessionError message={error} />
}

export default App
