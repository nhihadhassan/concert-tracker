import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BarChart3, Check, ListMusic, MapPin, Music2, Quote, Radio, Share2, Sparkles, Ticket, Users, WalletCards } from 'lucide-react'
import { m } from 'motion/react'
import { MotionToggle } from './cinematic/CinematicMotion'
import { useCinematicMotion, useCinematicScene } from '../hooks/useCinematicMotion'
import { resizeArtwork } from '../lib/artwork'
import './stage/companion.css'
import type { Analytics, Concert, GroupSummary, LyricBreakdown, RankingRow, SpotifyInsights, SpotifyRange, SpotifyRelease } from '../types'
import { connectSpotify, disconnectSpotify, fetchLyricBreakdown, fetchSpotifyInsights, fetchSpotifyPulse, fetchSpotifyStatus, startSpotifyLogin } from '../lib/api'
import { buildConcertStory } from '../lib/concertInsights'
import { archiveHealth, compareYear, comparisonObservations } from '../lib/archiveInsights'
import { createShowShareCard } from '../lib/showShareCard'
import { downloadBlob } from '../lib/exports'

interface StatsDashboardProps {
  analytics: Analytics
  concerts: Concert[]
  memberName: string
  rankings: RankingRow[]
  scope: 'personal' | 'shared'
  onEditConcert: (concert: Concert) => void
  onScopeChange: (scope: 'personal' | 'shared') => void
}

type SpotifyState =
  | { kind: 'loading' }
  | { kind: 'disconnected' }
  | { kind: 'connecting' }
  | { kind: 'connected'; releases: SpotifyRelease[]; checkedArtists: number }
  | { kind: 'error'; message: string }

const SPOTIFY_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Spotify access was declined. Reconnect to see your latest drops.',
  exchange_failed: "Spotify couldn't complete the connection. Try again.",
  no_refresh_token: 'Spotify did not return a refresh token. Try reconnecting.',
  missing_code: 'Spotify returned no authorization code. Try again.',
}

function useSpotifyPulse() {
  const [state, setState] = useState<SpotifyState>({ kind: 'loading' })

  const loadPulse = useCallback(async (signal?: AbortSignal) => {
    const pulse = await fetchSpotifyPulse(signal)
    if (signal?.aborted) return
    if (!pulse.connected) {
      setState({ kind: 'disconnected' })
      return
    }
    setState({ kind: 'connected', releases: pulse.releases, checkedArtists: pulse.checked_artists })
  }, [])

  // Finalize an OAuth redirect (refresh token / error arrives in the URL fragment),
  // then load status + pulse.
  useEffect(() => {
    const controller = new AbortController()
    let active = true

    const run = async () => {
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
      const params = new URLSearchParams(hash)
      const refreshToken = params.get('spotify_refresh')
      const errorCode = params.get('spotify_error')

      if (refreshToken || errorCode) {
        // Strip the fragment immediately so the token never lingers in history.
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }

      if (errorCode) {
        if (active) setState({ kind: 'error', message: SPOTIFY_ERROR_MESSAGES[errorCode] ?? 'Spotify connection failed. Try again.' })
        return
      }

      try {
        if (refreshToken) {
          await connectSpotify(refreshToken)
          if (!active) return
        } else {
          const status = await fetchSpotifyStatus()
          if (!active) return
          if (!status.connected) {
            setState({ kind: 'disconnected' })
            return
          }
        }
        setState({ kind: 'loading' })
        await loadPulse(controller.signal)
      } catch (error) {
        if (active) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Spotify request failed.' })
      }
    }

    void run()
    return () => { active = false; controller.abort() }
  }, [loadPulse])

  const connect = useCallback(async () => {
    setState({ kind: 'connecting' })
    try {
      const { authorize_url } = await startSpotifyLogin()
      window.location.href = authorize_url
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not start Spotify sign-in.' })
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      await disconnectSpotify()
      setState({ kind: 'disconnected' })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not disconnect Spotify.' })
    }
  }, [])

  return { state, connect, disconnect }
}

type InsightsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: SpotifyInsights }
  | { kind: 'error'; message: string }

const RANGE_OPTIONS: { value: SpotifyRange; label: string }[] = [
  { value: 'short_term', label: '4 weeks' },
  { value: 'medium_term', label: '6 months' },
  { value: 'long_term', label: 'All time' },
]

function useSpotifyInsights(enabled: boolean) {
  const [range, setRange] = useState<SpotifyRange>('medium_term')
  const [state, setState] = useState<InsightsState>({ kind: 'idle' })

  useEffect(() => {
    if (!enabled) {
      setState({ kind: 'idle' })
      return
    }
    const controller = new AbortController()
    setState({ kind: 'loading' })
    fetchSpotifyInsights(range, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ kind: 'ready', data }) })
      .catch((error) => { if (!controller.signal.aborted) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Spotify insights failed.' }) })
    return () => controller.abort()
  }, [enabled, range])

  return { state, range, setRange }
}

type LyricState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: LyricBreakdown }
  | { kind: 'error'; message: string }

interface LyricSubject {
  label: string
  artist: string
  track?: string
}

function useLyricBreakdown(subject: LyricSubject | undefined) {
  const [state, setState] = useState<LyricState>({ kind: 'idle' })

  useEffect(() => {
    if (!subject?.artist) {
      setState({ kind: 'idle' })
      return
    }
    const controller = new AbortController()
    setState({ kind: 'loading' })
    fetchLyricBreakdown(subject.artist, subject.track, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ kind: 'ready', data }) })
      .catch((error) => { if (!controller.signal.aborted) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Lyric lookup failed.' }) })
    return () => controller.abort()
  }, [subject?.artist, subject?.track])

  return state
}

const daySeed = () => Math.floor(Date.now() / 86_400_000)
const dailyPick = <T,>(items: T[], offset = 0): T | undefined =>
  items.length ? items[(daySeed() + offset) % items.length] : undefined

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value)
const formatPercent = (value: number) => `${Math.round(value)}%`

const sortGroups = (rows: GroupSummary[]) => [...rows].sort((left, right) =>
  right.attended - left.attended || right.concerts - left.concerts || left.key.localeCompare(right.key),
)

const formatShowDate = (iso: string) => {
  const parsed = new Date(`${iso}T00:00:00`)
  return Number.isNaN(parsed.valueOf()) ? iso : parsed.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

const readinessText = (next: SpotifyInsights['next_show']): string => {
  if (!next) return ''
  if (next.listens_rank !== null) return `They're your #${next.listens_rank} most-played artist right now. You're ready.`
  if (next.recently_played) return "They're in your recent rotation, but not a current top artist yet."
  return 'Not in your current Spotify rotation. Cram time before the show.'
}

function LyricCard({ state, subject }: { state: LyricState; subject: LyricSubject | undefined }) {
  const title = subject?.track ? `${subject.track} · ${subject.artist}` : subject?.artist
  return (
    <article className="lyric-card">
      <span className="lyric-card-kicker">{subject?.label ?? 'Daily pick'}</span>
      {!subject ? <p className="stats-panel-note">No artist available in this scope.</p>
        : state.kind === 'loading' || state.kind === 'idle' ? <p className="stats-panel-note">Loading lyric breakdown…</p>
        : state.kind === 'error' ? <p className="stats-panel-note">{state.message}</p>
        : !state.data.configured ? <p className="stats-panel-note">Lyric breakdowns are currently unavailable.</p>
        : !state.data.found ? <p className="stats-panel-note">No annotated breakdown for {state.data.artist ?? title ?? 'this artist'} yet. Check back tomorrow.</p>
        : <div className="lyric-body">
            <div className="lyric-song">
              {state.data.image ? <img src={state.data.image} alt="" loading="lazy" /> : <span className="chip-fallback lyric-art-fallback" aria-hidden="true" />}
              <div className="lyric-song-meta"><strong>{state.data.song}</strong><span>{state.data.artist}</span></div>
              {state.data.url ? <a href={state.data.url} target="_blank" rel="noopener">Open on Genius</a> : null}
            </div>
            <div className="lyric-text">
              {state.data.fragment ? <p className="lyric-fragment">"{state.data.fragment}"</p> : null}
              <p className="lyric-annotation">{state.data.annotation}</p>
            </div>
          </div>}
    </article>
  )
}

export function StatsDashboard({ analytics, concerts, memberName, rankings, scope, onEditConcert, onScopeChange }: StatsDashboardProps) {
  const { disabled: reduceMotion } = useCinematicMotion()
  const { ref: sceneRef, playing } = useCinematicScene()
  const [sharingRankingId, setSharingRankingId] = useState<string | null>(null)
  const [shareResult, setShareResult] = useState<{ concertId: string; message: string; success: boolean } | null>(null)
  const orderedRankings = useMemo(() => [...rankings].sort((a, b) => b.rating - a.rating || a.rank - b.rank), [rankings])
  const concertById = useMemo(() => new Map(concerts.map(concert => [concert.id, concert])), [concerts])
  const yearBars = [...analytics.yearly_trends].sort((a, b) => a.year - b.year)
  const yearMax = Math.max(1, ...yearBars.map(row => row.attended))
  const spotify = useSpotifyPulse()
  const insights = useSpotifyInsights(spotify.state.kind === 'connected')
  const lyricSubjects = useMemo(() => {
    const archiveSubjects = concerts.filter((concert) => concert.status !== 'Cancelled').map((concert) => ({ label: concert.status === 'Want to Go' ? 'Upcoming concert' : 'From your archive', artist: concert.artist.replace(/\s+20\d{2}$/i, '') }))
    if (insights.state.kind !== 'ready') return {
      recent: dailyPick(archiveSubjects),
      concert: dailyPick(archiveSubjects, 3),
    }
    const topTrackSubjects = insights.state.data.top_tracks.map((track) => ({
      label: 'Recent rotation',
      artist: track.artist,
      track: track.name,
    }))
    const topArtistSubjects = insights.state.data.top_artists.map((artist) => ({
      label: 'Daily artist pick',
      artist: artist.name,
    }))
    return {
      recent: dailyPick(topTrackSubjects.length ? topTrackSubjects : archiveSubjects),
      concert: insights.state.data.next_show
        ? { label: `Upcoming concert · ${formatShowDate(insights.state.data.next_show.date)}`, artist: insights.state.data.next_show.artist }
        : dailyPick(topArtistSubjects.length ? topArtistSubjects : archiveSubjects, 3),
    }
  }, [concerts, insights.state])
  const recentLyric = useLyricBreakdown(lyricSubjects.recent)
  const concertLyric = useLyricBreakdown(lyricSubjects.concert)
  const years = useMemo(() => [...new Set(analytics.monthly_trends.map((row) => row.year))].sort((a, b) => b - a), [analytics.monthly_trends])
  const latestYear = years[0]
  const archiveStory = useMemo(() => buildConcertStory(concerts, 'all'), [concerts])
  const health = useMemo(() => archiveHealth(concerts, scope), [concerts, scope])
  const comparisonYears = years.slice(0, 2)
  const comparison = comparisonYears.length === 2 ? comparisonYears.map((year) => compareYear(concerts, year, scope)) : []
  const comparisonNotes = comparison.length === 2 ? comparisonObservations(comparison[0], comparison[1]) : []

  const activityRows = [...years].reverse().map((activityYear) => ({
    year: activityYear,
    months: months.map((label, index) => {
      const row = analytics.monthly_trends.find((item) => item.year === activityYear && item.month === index + 1)
      return { label, concerts: row?.concerts ?? 0, attended: row?.attended ?? 0 }
    }),
  }))
  const monthlyMax = Math.max(1, ...analytics.monthly_trends.map((row) => row.concerts))
  const topArtists = sortGroups(analytics.artist_summaries).slice(0, 5)
  const topGenres = sortGroups(analytics.genre_summaries).slice(0, 8)
  const topVenues = [...analytics.venue_summaries].sort((left, right) => right.concerts - left.concerts || left.key.localeCompare(right.key)).slice(0, 5)
  const topRanking = orderedRankings[0]
  const busiestMonth = analytics.monthly_trends.reduce<(typeof analytics.monthly_trends)[number] | null>((best, row) =>
    !best || row.concerts > best.concerts ? row : best, null)
  const attended = analytics.status_counts.Attended ?? 0
  const upcoming = analytics.status_counts['Want to Go'] ?? 0
  const cancelled = analytics.status_counts.Cancelled ?? 0
  const attendedShare = analytics.total_concerts ? attended / analytics.total_concerts * 100 : 0
  const monthlySummary = busiestMonth
    ? `${months[busiestMonth.month - 1]} ${busiestMonth.year} is the loudest month with ${busiestMonth.concerts} ${busiestMonth.concerts === 1 ? 'record' : 'records'}.`
    : 'Add concerts across a few months to light up the activity grid.'
  const yearlyTotals = analytics.monthly_trends.reduce<Record<number, number>>((totals, row) => {
    totals[row.year] = (totals[row.year] ?? 0) + row.concerts
    return totals
  }, {})
  const busiestYear = Object.entries(yearlyTotals).sort((left, right) => right[1] - left[1])[0]
  const archiveStories = [
    topRanking ? `Your highest-rated night: ${topRanking.artist} at ${topRanking.rating}/10 back in ${topRanking.concert_date.slice(0, 4)}.` : 'Rate a concert to crown your best night.',
    archiveStory.closestRun ? `Your tightest run was ${archiveStory.closestRun.days} ${archiveStory.closestRun.days === 1 ? 'day' : 'days'} between ${archiveStory.closestRun.first.artist} and ${archiveStory.closestRun.second.artist}.` : 'A second attended show will reveal your tightest live run.',
    archiveStory.longestMonthlyStreak > 1 ? `Your longest streak ran for ${archiveStory.longestMonthlyStreak} consecutive months with at least one show.` : busiestYear ? `${busiestYear[0]} was your biggest year with ${busiestYear[1]} ${busiestYear[1] === 1 ? 'show' : 'shows'}.` : 'Your busiest year appears once the archive spans the calendar.',
    archiveStory.repeatArtists.length ? `${archiveStory.repeatArtists.length} ${archiveStory.repeatArtists.length === 1 ? 'artist has' : 'artists have'} earned repeat status; ${archiveStory.repeatArtists[0][0]} leads with ${archiveStory.repeatArtists[0][1]} shows.` : `${archiveStory.uniqueArtists} artists have made the archive so far.`,
  ]

  const shareRanking = async (row: RankingRow) => {
    if (sharingRankingId) return
    setSharingRankingId(row.concert_id)
    setShareResult(null)
    const safeArtist = row.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'concert'
    const filename = `encore-${safeArtist}-${row.concert_date}.png`
    try {
      const blob = await createShowShareCard({
        artist: row.artist,
        date: row.concert_date,
        rating: row.rating,
        image: concertById.get(row.concert_id)?.image ? resizeArtwork(concertById.get(row.concert_id)?.image ?? '', 960) : null,
        scope,
      })
      const file = new File([blob], filename, { type: 'image/png' })
      let message = 'Image saved'
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            title: `${row.artist} live rating`,
            text: `Encore · ${formatShowDate(row.concert_date)} · ${row.rating}/10`,
            files: [file],
          })
          message = 'Image shared'
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          downloadBlob(blob, filename)
        }
      } else {
        downloadBlob(blob, filename)
      }
      setShareResult({ concertId: row.concert_id, message, success: true })
      window.setTimeout(() => setShareResult((current) => current?.concertId === row.concert_id ? null : current), 1800)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setShareResult({ concertId: row.concert_id, message: 'Could not create image', success: false })
        window.setTimeout(() => setShareResult((current) => current?.concertId === row.concert_id ? null : current), 2400)
      }
    } finally {
      setSharingRankingId(null)
    }
  }

  return (
    <m.section ref={sceneRef} data-playing={playing} data-motion={reduceMotion ? 'off' : 'on'} className="stats-page stats-page-animated stage-companion companion-stats" aria-labelledby="stats-title" initial={reduceMotion ? false : { opacity: 0, y: 16, rotateX: -4 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}>
      <div className="companion-atmosphere" aria-hidden="true" />
      <header className="stats-page-head">
        <div>
          <h1 id="stats-title" aria-label="Concert Stats" data-view-heading tabIndex={-1}>The live<span className="companion-outline">numbers.</span></h1>
          <p>{scope === 'personal' ? `${memberName}'s personal archive` : 'Shared archive'}</p>
        </div>
        <div className="companion-header-controls"><MotionToggle /><div className="stats-scope" role="group" aria-label="Stats scope">
          <button type="button" className={scope === 'personal' ? 'active' : ''} aria-pressed={scope === 'personal'} onClick={() => onScopeChange('personal')}>Personal</button>
          <button type="button" className={scope === 'shared' ? 'active' : ''} aria-pressed={scope === 'shared'} onClick={() => onScopeChange('shared')}>Shared</button>
        </div></div>
      </header>
      {analytics.total_concerts ? <nav className="stats-section-links" aria-label="Stats sections">
        <a href="#rankings-title">All rankings</a>
        <a href={spotify.state.kind === 'connected' ? '#your-spotify-title' : '#spotify-title'}>Spotify</a>
        <a href="#lyrics-title">Lyrics</a>
        <a href="#activity-title">Activity</a>
      </nav> : null}

      {analytics.total_concerts ? <>
        <section className="stats-overview" aria-label="Stats overview">
          <article className="stats-total">
            <span>All records</span>
            <strong>{analytics.total_concerts}</strong>
            <p>{attended} attended <span aria-hidden="true">·</span> {upcoming} upcoming <span aria-hidden="true">·</span> {cancelled} cancelled</p>
          </article>
          <article><Users aria-hidden="true" /><span>Artists</span><strong>{analytics.artist_summaries.length}</strong></article>
          <article><MapPin aria-hidden="true" /><span>Venues</span><strong>{analytics.venue_summaries.length}</strong></article>
          <article><WalletCards aria-hidden="true" /><span>Median ticket</span><strong>{analytics.spending.median_attended_ticket === null ? 'N/A' : formatMoney(analytics.spending.median_attended_ticket)}</strong></article>
        </section>

        <div className="stats-stage-summary">
          <section className="stats-year-chart" aria-labelledby="stats-year-chart-title">
            <div className="stats-panel-head"><h2 id="stats-year-chart-title">Through the years.</h2><span>Attended shows</span></div>
            <div className="stats-stage-bars" role="img" aria-label={yearBars.map(row => `${row.year}: ${row.attended} attended`).join(', ')}>
              {yearBars.map((row, index) => <div key={row.year} className="stats-stage-bar-column"><span className="stats-stage-bar" style={{ '--bar-height': `${row.attended / yearMax * 100}%`, '--bar-index': index } as CSSProperties}><strong>{row.attended}</strong></span><small>{row.year}</small></div>)}
            </div>
          </section>
          <section className="stats-spotlight" aria-labelledby="stats-spotlight-title">
            <div className="stats-panel-head"><h2 id="stats-spotlight-title">Highest rated.</h2><span>{scope === 'personal' ? memberName : 'Combined'}</span></div>
            {orderedRankings.slice(0, 3).map(row => {
              const concert = concertById.get(row.concert_id)
              return <a className="stats-spotlight-show" href={`/?concert=${encodeURIComponent(row.concert_id)}`} key={row.concert_id}>
                {concert?.image ? <img src={resizeArtwork(concert.image, 160)} alt="" loading="lazy" /> : <span className="stats-art-placeholder"><Music2 aria-hidden="true" /></span>}
                <span><strong>{row.artist}</strong><small>{formatShowDate(row.concert_date)} · {row.concert_date.slice(0, 4)}</small></span><b>{row.rating}</b>
              </a>
            })}
            {!orderedRankings.length ? <p className="stats-inline-empty">No rated concerts in this scope yet.</p> : null}
          </section>
        </div>
        <section className="stats-panel stats-rankings" aria-labelledby="rankings-title">
          <div className="stats-panel-head"><h2 id="rankings-title">Rankings</h2><span>{orderedRankings.length} rated shows · Highest first</span></div>
          {orderedRankings.length ? <ol className="stats-all-ranking-list" aria-label="All concert rankings, highest rating first">{orderedRankings.map(row => {
            const concert = concertById.get(row.concert_id)
            return <li key={row.concert_id}>
              <a className="stats-spotlight-show" href={`/?concert=${encodeURIComponent(row.concert_id)}`} aria-label={`Rank ${row.rank}: ${row.artist}, ${formatShowDate(row.concert_date)}, rated ${row.rating} out of 10`}>
                {concert?.image ? <img src={resizeArtwork(concert.image, 160)} alt="" loading="lazy" /> : <span className="stats-art-placeholder"><Music2 aria-hidden="true" /></span>}
                <span><strong>{row.artist}</strong><small>{formatShowDate(row.concert_date)} · {row.concert_date.slice(0, 4)}</small></span><b aria-hidden="true">{row.rating}</b>
              </a>
              <button className="stats-ranking-share" type="button" aria-label={sharingRankingId === row.concert_id ? `Creating image for ${row.artist}` : shareResult?.concertId === row.concert_id ? shareResult.message : `Share ${row.artist} image`} title={shareResult?.concertId === row.concert_id ? shareResult.message : 'Share or save image'} disabled={sharingRankingId !== null} onClick={() => void shareRanking(row)}>
                {shareResult?.concertId === row.concert_id && shareResult.success ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}
              </button>
            </li>
          })}</ol> : <p className="stats-inline-empty">No rated concerts in this scope yet.</p>}
        </section>

        <div className="stats-grid">
          {comparison.length === 2 ? <section className="stats-panel stats-year-comparison" aria-labelledby="year-comparison-title"><div className="stats-panel-head"><h3 id="year-comparison-title"><BarChart3 aria-hidden="true" />Year comparison</h3><span>{comparison[0].year} · {comparison[1].year}</span></div><div className="year-comparison-grid">{comparison.map((year) => <div key={year.year}><strong>{year.year}</strong><span>{year.attended} attended · {year.artists} artists · {year.venues} venues</span><span>{formatMoney(year.spend)} spent · {year.averageRating === null ? 'Unrated' : `${year.averageRating}/10`}</span><span>{year.newArtists} new artists · {year.busiestMonth ?? 'No busiest month'}</span><small>{year.mostSeenArtist ? `Most seen: ${year.mostSeenArtist}` : 'No repeat artist yet'}</small></div>)}</div>{comparisonNotes.length ? <ul className="stats-observations">{comparisonNotes.map((note) => <li key={note}>{note}</li>)}</ul> : null}</section> : null}

          {health.length ? <section className="stats-panel stats-archive-health" aria-labelledby="archive-health-title"><div className="stats-panel-head"><h3 id="archive-health-title"><Sparkles aria-hidden="true" />Archive Health</h3><span>{health.length} records to enrich</span></div><p className="stats-panel-note">Optional details that can make older concert memories richer.</p><ul className="archive-health-list">{health.slice(0, 6).map(({ concert, issues }) => <li key={concert.id}><div><strong>{concert.artist}</strong><small>{concert.date} · Missing {issues.join(', ')}</small></div><button type="button" onClick={() => onEditConcert(concert)}>Update record</button></li>)}</ul></section> : null}

          <div className="stats-connections-heading">Music connections</div>
          {spotify.state.kind === 'connected' || insights.state.kind === 'ready' ? (
            <section className="stats-panel stats-your-spotify" aria-labelledby="your-spotify-title">
              <div className="stats-panel-head">
                <h3 id="your-spotify-title"><ListMusic aria-hidden="true" />Your Spotify</h3>
                <div className="stats-range" role="group" aria-label="Listening range">
                  {RANGE_OPTIONS.map((opt) => <button key={opt.value} type="button" className={insights.range === opt.value ? 'active' : ''} aria-pressed={insights.range === opt.value} onClick={() => insights.setRange(opt.value)}>{opt.label}</button>)}
                </div>
              </div>
              {insights.state.kind === 'error' ? <p className="stats-panel-note">{insights.state.message}</p>
                : insights.state.kind !== 'ready' ? <p className="stats-panel-note">Pulling your Spotify listening…</p>
                : <>
                  <div className="spotify-insight-summary">
                    <div className="spotify-insight-stat"><strong>{insights.state.data.overlap.seen_count}<span>/{insights.state.data.overlap.top_count}</span></strong><span>of your top artists seen live</span></div>
                    {insights.state.data.next_show ? <div className="spotify-insight-next"><span>Next show · {formatShowDate(insights.state.data.next_show.date)}</span><strong>{insights.state.data.next_show.artist}</strong><p>{readinessText(insights.state.data.next_show)}</p></div> : null}
                  </div>
                  <div className="spotify-insight-body">
                    <div className="spotify-insight-col">
                      <h4>Top artists</h4>
                      <ol className="spotify-artist-chips">{insights.state.data.top_artists.slice(0, 8).map((artist) => {
                        const inner = <><span className="chip-rank">{artist.rank}</span>{artist.image ? <img src={artist.image} alt="" loading="lazy" /> : <span className="chip-fallback" aria-hidden="true" />}<span className="chip-name">{artist.name}</span>{artist.seen_live ? <Check className="chip-seen" aria-label="Seen live" /> : null}</>
                        return <li key={artist.name}>{artist.url ? <a href={artist.url} target="_blank" rel="noopener">{inner}</a> : <span>{inner}</span>}</li>
                      })}</ol>
                    </div>
                    <div className="spotify-insight-col">
                      <h4>Top tracks</h4>
                      <ol className="spotify-track-list">{insights.state.data.top_tracks.slice(0, 8).map((track) => {
                        const inner = <>{track.image ? <img src={track.image} alt="" loading="lazy" /> : <span className="chip-fallback" aria-hidden="true" />}<span className="track-meta"><strong>{track.name}</strong><small>{track.artist}</small></span></>
                        return <li key={`${track.name}-${track.artist}`}>{track.url ? <a href={track.url} target="_blank" rel="noopener">{inner}</a> : <span>{inner}</span>}</li>
                      })}</ol>
                    </div>
                  </div>
                  {insights.state.data.recently_played.length ? <div className="spotify-recent"><span>Recently played</span><ul>{insights.state.data.recently_played.slice(0, 6).map((track) => <li key={`${track.name}-${track.played_at}`}>{track.url ? <a href={track.url} target="_blank" rel="noopener">{track.name} · {track.artist}</a> : `${track.name} · ${track.artist}`}</li>)}</ul></div> : null}
                </>}
            </section>
          ) : null}

          {(
            <section className="stats-panel stats-lyrics" aria-labelledby="lyrics-title">
              <div className="stats-panel-head"><h3 id="lyrics-title"><Quote aria-hidden="true" />Today's lyric breakdowns</h3><span>via Genius</span></div>
              <div className="lyric-card-grid">
                <LyricCard state={recentLyric} subject={lyricSubjects.recent} />
                {lyricSubjects.concert ? <LyricCard state={concertLyric} subject={lyricSubjects.concert} /> : null}
              </div>
            </section>
          )}

          <section className="stats-panel stats-spotify" aria-labelledby="spotify-title">
            <div className="stats-panel-head">
              <h3 id="spotify-title"><Radio aria-hidden="true" />New from your artists</h3>
              {spotify.state.kind === 'connected'
                ? <button type="button" className="stats-spotify-link" onClick={() => void spotify.disconnect()}>Disconnect</button>
                : <span>Spotify</span>}
            </div>
            {spotify.state.kind === 'loading' ? <p className="stats-panel-note">Checking Spotify for recent releases…</p>
              : spotify.state.kind === 'connecting' ? <p className="stats-panel-note">Opening Spotify sign-in…</p>
              : spotify.state.kind === 'error' ? <div className="stats-spotify-connect"><p className="stats-panel-note">{spotify.state.message}</p><button type="button" className="button button-primary" onClick={() => void spotify.connect()}>Retry Spotify</button></div>
              : spotify.state.kind === 'disconnected' ? <div className="stats-spotify-connect"><p className="stats-panel-note">Connect Spotify to surface new singles and albums from the artists you follow and play most.</p><button type="button" className="button button-primary" onClick={() => void spotify.connect()}>Connect Spotify</button></div>
              : spotify.state.releases.length === 0 ? <p className="stats-panel-note">No new releases in the last few months across your top 50 artists. Check back soon.</p>
              : <ul className="spotify-release-list">{spotify.state.releases.map((release) => {
                  const card = <><span className="spotify-release-meta"><strong>{release.artist}</strong><small>{release.title}</small></span><span className="spotify-release-tag">{release.release_type} · {release.release_date}</span></>
                  return <li key={`${release.artist}-${release.title}-${release.release_date}`} className="spotify-release">{release.url ? <a href={release.url} target="_blank" rel="noopener">{card}</a> : card}</li>
                })}</ul>}
          </section>

          <section className="stats-panel stats-artists" aria-labelledby="top-artists-title">
            <div className="stats-panel-head"><h3 id="top-artists-title"><Music2 aria-hidden="true" />Top artists</h3><span>By attended shows</span></div>
            <ol className="stats-ranked-list">{topArtists.map((artist, index) => <li key={artist.key}><span>{String(index + 1).padStart(2, '0')}</span><strong>{artist.key}</strong><small>{artist.attended} attended</small></li>)}</ol>
          </section>

          <section className="stats-panel stats-activity" aria-labelledby="activity-title">
            <div className="stats-panel-head"><h3 id="activity-title"><BarChart3 aria-hidden="true" />Monthly heatmap</h3></div>
            <p className="stats-panel-note">{monthlySummary}</p>
            <div className="monthly-chart monthly-heatmap" role="img" aria-label="Monthly concert activity heatmap across years">
              <div className="heatmap-month-labels" aria-hidden="true">{months.map((label) => <span key={label}>{label}</span>)}</div>
              {activityRows.map((activityRow) => <div className={`heatmap-row${activityRow.year === latestYear ? ' active' : ''}`} key={activityRow.year}>
                <span className="heatmap-year">{activityRow.year}</span>
                <div className="heatmap-cells">{activityRow.months.map((row) => {
                  const intensity = row.concerts ? Math.max(0.18, row.concerts / monthlyMax) : 0
                  return <span key={`${activityRow.year}-${row.label}`} className="heatmap-cell" data-lit={intensity > 0.45} style={{ '--heat': intensity } as CSSProperties} title={`${row.label} ${activityRow.year}: ${row.concerts} records, ${row.attended} attended`}><span>{row.concerts || ''}</span></span>
                })}</div>
              </div>)}
              <div className="heatmap-legend" aria-hidden="true"><span>Quiet</span><i /><span>Loud</span></div>
            </div>
          </section>

          <section className="stats-panel stats-venues" aria-labelledby="venues-title">
            <div className="stats-panel-head"><h3 id="venues-title"><MapPin aria-hidden="true" />Top venues</h3><span>By records</span></div>
            <ol className="venue-list">{topVenues.map((venue) => <li key={venue.key}><strong>{venue.key}</strong><span>{venue.concerts}</span></li>)}</ol>
          </section>

          <section className="stats-panel stats-fun-facts" aria-labelledby="fun-facts-title">
            <div className="stats-panel-head"><h3 id="fun-facts-title"><Sparkles aria-hidden="true" />Archive stories</h3><span>{formatPercent(attendedShare)} attended</span></div>
            <ul>{archiveStories.map((fact) => <li key={fact}>{fact}</li>)}</ul>
            <div className="spotify-signal"><strong>{archiveStory.weekendShare}%</strong><span>of attended shows landed on weekends</span></div>
          </section>

          <section className="stats-panel stats-genres" aria-labelledby="genres-title">
            <div className="stats-panel-head"><h3 id="genres-title"><Ticket aria-hidden="true" />Top genres</h3><span>{analytics.genre_summaries.length} total</span></div>
            <div className="genre-cloud">{topGenres.map((genre) => <span key={genre.key}><strong>{genre.key}</strong><small>{genre.attended} attended</small></span>)}</div>
          </section>


        </div>
      </> : <section className="stats-empty"><BarChart3 size={28} aria-hidden="true" /><h3>No stats in this scope yet</h3><p>Concerts will appear here once they are connected to this attendance history.</p></section>}
    </m.section>
  )
}
