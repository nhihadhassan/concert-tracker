import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BarChart3, Check, ListMusic, MapPin, Music2, Quote, Radio, Sparkles, Ticket, Trophy, Users, WalletCards } from 'lucide-react'
import { m, useReducedMotion } from 'motion/react'
import type { Analytics, GroupSummary, LyricBreakdown, RankingRow, SpotifyInsights, SpotifyRange, SpotifyRelease } from '../types'
import { connectSpotify, disconnectSpotify, fetchLyricBreakdown, fetchSpotifyInsights, fetchSpotifyPulse, fetchSpotifyStatus, startSpotifyLogin } from '../lib/api'

interface StatsDashboardProps {
  accessToken: string
  analytics: Analytics
  memberName: string
  rankings: RankingRow[]
  scope: 'personal' | 'shared'
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

function useSpotifyPulse(accessToken: string) {
  const [state, setState] = useState<SpotifyState>({ kind: 'loading' })

  const loadPulse = useCallback(async (signal?: AbortSignal) => {
    const pulse = await fetchSpotifyPulse(accessToken, signal)
    if (signal?.aborted) return
    if (!pulse.connected) {
      setState({ kind: 'disconnected' })
      return
    }
    setState({ kind: 'connected', releases: pulse.releases, checkedArtists: pulse.checked_artists })
  }, [accessToken])

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
          await connectSpotify(accessToken, refreshToken)
          if (!active) return
        } else {
          const status = await fetchSpotifyStatus(accessToken)
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
  }, [accessToken, loadPulse])

  const connect = useCallback(async () => {
    setState({ kind: 'connecting' })
    try {
      const { authorize_url } = await startSpotifyLogin(accessToken)
      window.location.href = authorize_url
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not start Spotify sign-in.' })
    }
  }, [accessToken])

  const disconnect = useCallback(async () => {
    try {
      await disconnectSpotify(accessToken)
      setState({ kind: 'disconnected' })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not disconnect Spotify.' })
    }
  }, [accessToken])

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

function useSpotifyInsights(accessToken: string, enabled: boolean) {
  const [range, setRange] = useState<SpotifyRange>('medium_term')
  const [state, setState] = useState<InsightsState>({ kind: 'idle' })

  useEffect(() => {
    if (!enabled) {
      setState({ kind: 'idle' })
      return
    }
    const controller = new AbortController()
    setState({ kind: 'loading' })
    fetchSpotifyInsights(accessToken, range, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ kind: 'ready', data }) })
      .catch((error) => { if (!controller.signal.aborted) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Spotify insights failed.' }) })
    return () => controller.abort()
  }, [accessToken, enabled, range])

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

function useLyricBreakdown(accessToken: string, subject: LyricSubject | undefined) {
  const [state, setState] = useState<LyricState>({ kind: 'idle' })

  useEffect(() => {
    if (!subject?.artist) {
      setState({ kind: 'idle' })
      return
    }
    const controller = new AbortController()
    setState({ kind: 'loading' })
    fetchLyricBreakdown(accessToken, subject.artist, subject.track, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ kind: 'ready', data }) })
      .catch((error) => { if (!controller.signal.aborted) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Lyric lookup failed.' }) })
    return () => controller.abort()
  }, [accessToken, subject?.artist, subject?.track])

  return state
}

const CURRENT_LYRIC_PICKS: LyricSubject[] = [
  { label: 'Recent rotation', artist: 'Olivia Rodrigo', track: 'vampire' },
  { label: 'Recent rotation', artist: 'Drake', track: 'First Person Shooter' },
  { label: 'Recent rotation', artist: 'SZA', track: 'Saturn' },
  { label: 'Recent rotation', artist: 'Sabrina Carpenter', track: 'Espresso' },
  { label: 'Recent rotation', artist: 'Taylor Swift', track: 'Fortnight' },
  { label: 'Recent rotation', artist: 'Kendrick Lamar', track: 'Not Like Us' },
  { label: 'Recent rotation', artist: 'Chappell Roan', track: 'Good Luck, Babe!' },
]

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
      {state.kind === 'loading' || state.kind === 'idle' ? <p className="stats-panel-note">Finding a lyric worth unpacking...</p>
        : state.kind === 'error' ? <p className="stats-panel-note">{state.message}</p>
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

export function StatsDashboard({ accessToken, analytics, memberName, rankings, scope, onScopeChange }: StatsDashboardProps) {
  const reduceMotion = useReducedMotion()
  const spotify = useSpotifyPulse(accessToken)
  const insights = useSpotifyInsights(accessToken, spotify.state.kind === 'connected')
  const lyricSubjects = useMemo(() => {
    if (insights.state.kind !== 'ready') return {
      recent: dailyPick(CURRENT_LYRIC_PICKS),
      concert: dailyPick(CURRENT_LYRIC_PICKS.map((pick) => ({ ...pick, label: 'Wildcard daily pick' })), 3),
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
      recent: dailyPick(topTrackSubjects.length ? topTrackSubjects : CURRENT_LYRIC_PICKS),
      concert: insights.state.data.next_show
        ? { label: `Upcoming concert · ${formatShowDate(insights.state.data.next_show.date)}`, artist: insights.state.data.next_show.artist }
        : dailyPick(topArtistSubjects.length ? topArtistSubjects : CURRENT_LYRIC_PICKS.map((pick) => ({ ...pick, label: 'Wildcard daily pick' })), 3),
    }
  }, [insights.state])
  const recentLyric = useLyricBreakdown(accessToken, lyricSubjects.recent)
  const concertLyric = useLyricBreakdown(accessToken, lyricSubjects.concert)
  const years = useMemo(() => [...new Set(analytics.monthly_trends.map((row) => row.year))].sort((a, b) => b - a), [analytics.monthly_trends])
  const latestYear = years[0]

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
  const repeatArtist = sortGroups(analytics.repeat_artists)[0]
  const topGenre = topGenres[0]
  const topRanking = rankings[0]
  const busiestMonth = analytics.monthly_trends.reduce<(typeof analytics.monthly_trends)[number] | null>((best, row) =>
    !best || row.concerts > best.concerts ? row : best, null)
  const attended = analytics.status_counts.Attended ?? 0
  const upcoming = analytics.status_counts['Want to Go'] ?? 0
  const cancelled = analytics.status_counts.Cancelled ?? 0
  const attendedShare = analytics.total_concerts ? attended / analytics.total_concerts * 100 : 0
  const discoveryShare = analytics.total_concerts ? analytics.artist_summaries.length / analytics.total_concerts * 100 : 0
  const monthlySummary = busiestMonth
    ? `${months[busiestMonth.month - 1]} ${busiestMonth.year} is the loudest month with ${busiestMonth.concerts} ${busiestMonth.concerts === 1 ? 'record' : 'records'}.`
    : 'Add concerts across a few months to light up the activity grid.'
  const yearlyTotals = analytics.monthly_trends.reduce<Record<number, number>>((totals, row) => {
    totals[row.year] = (totals[row.year] ?? 0) + row.concerts
    return totals
  }, {})
  const busiestYear = Object.entries(yearlyTotals).sort((left, right) => right[1] - left[1])[0]
  const funFacts = [
    topRanking ? `Your highest-rated night: ${topRanking.artist} at ${topRanking.rating}/10 back in ${topRanking.concert_date.slice(0, 4)}.` : 'Rate a concert to crown your best night.',
    busiestYear ? `${busiestYear[0]} was your biggest year with ${busiestYear[1]} ${busiestYear[1] === 1 ? 'show' : 'shows'}.` : 'Your busiest year shows up once concerts span the calendar.',
    repeatArtist ? `${repeatArtist.key} is your most-seen artist, catching them ${repeatArtist.concerts} ${repeatArtist.concerts === 1 ? 'time' : 'times'}.` : 'See an artist twice to start a streak.',
    topGenre && attended ? `${topGenre.key} makes up ${formatPercent(topGenre.attended / attended * 100)} of the shows you have actually attended.` : 'Genre facts unlock once concerts have genres.',
  ]

  return (
    <m.section className="stats-page stats-page-animated" aria-labelledby="stats-title" initial={reduceMotion ? false : { opacity: 0, y: 16, rotateX: -4 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}>
      <div className="stats-shader" aria-hidden="true" />
      <header className="stats-page-head">
        <div>
          <h2 id="stats-title" data-view-heading tabIndex={-1}>{scope === 'personal' ? `${memberName}'s stats` : 'Shared stats'}</h2>
        </div>
        <div className="stats-scope" role="group" aria-label="Stats scope">
          <button type="button" className={scope === 'personal' ? 'active' : ''} aria-pressed={scope === 'personal'} onClick={() => onScopeChange('personal')}>Personal</button>
          <button type="button" className={scope === 'shared' ? 'active' : ''} aria-pressed={scope === 'shared'} onClick={() => onScopeChange('shared')}>Shared</button>
        </div>
      </header>

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

        <div className="stats-grid">
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

          {recentLyric.kind === 'loading' || concertLyric.kind === 'loading' || (recentLyric.kind === 'ready' && recentLyric.data.configured) || (concertLyric.kind === 'ready' && concertLyric.data.configured) ? (
            <section className="stats-panel stats-lyrics" aria-labelledby="lyrics-title">
              <div className="stats-panel-head"><h3 id="lyrics-title"><Quote aria-hidden="true" />Today's lyric breakdowns</h3><span>via Genius</span></div>
              <div className="lyric-card-grid">
                <LyricCard state={recentLyric} subject={lyricSubjects.recent} />
                {lyricSubjects.concert ? <LyricCard state={concertLyric} subject={lyricSubjects.concert} /> : null}
              </div>
            </section>
          ) : null}

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
                  return <span key={`${activityRow.year}-${row.label}`} className="heatmap-cell" style={{ '--heat': intensity } as CSSProperties} title={`${row.label} ${activityRow.year}: ${row.concerts} records, ${row.attended} attended`}><span>{row.concerts || ''}</span></span>
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
            <div className="stats-panel-head"><h3 id="fun-facts-title"><Sparkles aria-hidden="true" />Fun facts</h3><span>{formatPercent(attendedShare)} attended</span></div>
            <ul>{funFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
            <div className="spotify-signal"><strong>{formatPercent(discoveryShare)}</strong><span>artist discovery ratio</span></div>
          </section>

          <section className="stats-panel stats-genres" aria-labelledby="genres-title">
            <div className="stats-panel-head"><h3 id="genres-title"><Ticket aria-hidden="true" />Top genres</h3><span>{analytics.genre_summaries.length} total</span></div>
            <div className="genre-cloud">{topGenres.map((genre) => <span key={genre.key}><strong>{genre.key}</strong><small>{genre.attended} attended</small></span>)}</div>
          </section>

          <section className="stats-panel stats-rankings" aria-labelledby="rankings-title">
            <div className="stats-panel-head"><h3 id="rankings-title"><Trophy aria-hidden="true" />Rankings</h3><span>{scope === 'personal' ? memberName : 'Combined'}</span></div>
            {rankings.length ? <div className="stats-ranking-table"><table><thead><tr><th>Rank</th><th>Artist</th><th>Rating</th><th>Year</th></tr></thead><tbody>{rankings.slice(0, 12).map((row) => <tr key={row.concert_id}><td>#{row.rank}</td><td>{row.artist}</td><td><strong>{row.rating}</strong></td><td>{row.concert_date.slice(0, 4)}</td></tr>)}</tbody></table></div> : <p className="stats-inline-empty">No rated concerts in this scope yet.</p>}
          </section>
        </div>
      </> : <section className="stats-empty"><BarChart3 size={28} aria-hidden="true" /><h3>No stats in this scope yet</h3><p>Concerts will appear here once they are connected to this attendance history.</p></section>}
    </m.section>
  )
}
