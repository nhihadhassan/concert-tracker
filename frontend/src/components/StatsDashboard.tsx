import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BarChart3, CalendarDays, Flame, Headphones, MapPin, Music2, Radio, Sparkles, Ticket, Trophy, Users, WalletCards, Waves } from 'lucide-react'
import { m, useReducedMotion } from 'motion/react'
import type { Analytics, GroupSummary, RankingRow, SpotifyRelease } from '../types'
import { connectSpotify, disconnectSpotify, fetchSpotifyPulse, fetchSpotifyStatus, startSpotifyLogin } from '../lib/api'

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

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value)
const formatPercent = (value: number) => `${Math.round(value)}%`

const sortGroups = (rows: GroupSummary[]) => [...rows].sort((left, right) =>
  right.attended - left.attended || right.concerts - left.concerts || left.key.localeCompare(right.key),
)

export function StatsDashboard({ accessToken, analytics, memberName, rankings, scope, onScopeChange }: StatsDashboardProps) {
  const reduceMotion = useReducedMotion()
  const spotify = useSpotifyPulse(accessToken)
  const years = useMemo(() => [...new Set(analytics.monthly_trends.map((row) => row.year))].sort((a, b) => b - a), [analytics.monthly_trends])
  const [year, setYear] = useState(() => years[0] ?? new Date().getFullYear())

  useEffect(() => {
    if (years.length && !years.includes(year)) setYear(years[0])
  }, [year, years])

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
  const hotArtist = topArtists[0]
  const topGenre = topGenres[0]
  const topVenue = topVenues[0]
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
  const mixSeeds = [
    hotArtist?.key,
    repeatArtist?.key && repeatArtist.key !== hotArtist?.key ? repeatArtist.key : null,
    topGenre?.key ? `${topGenre.key} setlist energy` : null,
    topRanking?.artist && topRanking.artist !== hotArtist?.key ? topRanking.artist : null,
  ].filter(Boolean).slice(0, 4)
  const pulseCards = [
    {
      icon: Flame,
      title: 'Hot artist of the week',
      value: hotArtist?.key ?? 'No artist yet',
      detail: hotArtist ? `${hotArtist.attended} attended ${hotArtist.attended === 1 ? 'show' : 'shows'} in this scope.` : 'Add attended shows to pick a current library leader.',
    },
    {
      icon: Headphones,
      title: 'Suggested mix',
      value: mixSeeds.length ? mixSeeds.join(' + ') : 'Build from your first concert',
      detail: mixSeeds.length ? 'Queue these as a Spotify seed mix before the next show.' : 'Spotify seeds will get smarter as the library grows.',
    },
    {
      icon: Sparkles,
      title: 'Song meaning lane',
      value: topRanking?.artist ?? hotArtist?.key ?? 'Waiting on ratings',
      detail: topRanking ? `Your top-rated night points to ${topRanking.artist}. Add Spotify Genius or Musixmatch later for real song breakdowns.` : 'Rate concerts to surface artists worth a deeper lyric read.',
    },
    {
      icon: Radio,
      title: 'Live news hookup',
      value: spotify.state.kind === 'connected'
        ? (spotify.state.releases.length ? `${spotify.state.releases.length} fresh ${spotify.state.releases.length === 1 ? 'drop' : 'drops'}` : 'No new drops right now')
        : spotify.state.kind === 'loading' || spotify.state.kind === 'connecting' ? 'Checking Spotify…'
        : 'Connect Spotify below',
      detail: spotify.state.kind === 'connected'
        ? `Latest releases from the ${spotify.state.checkedArtists} artists you follow and play most.`
        : 'Live releases from your Spotify artists appear in the panel below once connected.',
    },
  ]
  const funFacts = [
    hotArtist ? `${hotArtist.key} leads this scope with ${hotArtist.concerts} total ${hotArtist.concerts === 1 ? 'record' : 'records'}.` : 'Your top artist will appear once concerts are added.',
    topGenre ? `${topGenre.key} is the strongest genre lane with ${topGenre.attended} attended ${topGenre.attended === 1 ? 'show' : 'shows'}.` : 'Genre facts unlock once concerts have genres.',
    repeatArtist ? `${repeatArtist.key} is a repeat artist, which makes them a strong Spotify tracker candidate.` : 'No repeat artist yet, which means the library is still in discovery mode.',
    topVenue ? `${topVenue.key} is the current home base with ${topVenue.concerts} ${topVenue.concerts === 1 ? 'record' : 'records'}.` : 'Venue patterns will appear once more locations are saved.',
  ]

  return (
    <m.section className="stats-page stats-page-animated" aria-labelledby="stats-title" initial={reduceMotion ? false : { opacity: 0, y: 16, rotateX: -4 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}>
      <div className="stats-shader" aria-hidden="true" />
      <header className="stats-page-head">
        <div>
          <p className="journal-kicker">Live music, by the numbers</p>
          <h2 id="stats-title" data-view-heading tabIndex={-1}>{scope === 'personal' ? `${memberName}'s stats` : 'Shared stats'}</h2>
          <p>{scope === 'personal' ? 'Concerts connected to your attendance history.' : 'The complete concert library for both members.'}</p>
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
          <article><WalletCards aria-hidden="true" /><span>Avg ticket</span><strong>{analytics.spending.average_attended_ticket === null ? 'N/A' : formatMoney(analytics.spending.average_attended_ticket)}</strong></article>
        </section>

        <div className="stats-grid">
          <section className="stats-panel stats-pulse" aria-labelledby="pulse-title">
            <div className="stats-panel-head"><h3 id="pulse-title"><Waves aria-hidden="true" />Artist pulse</h3><span>Library powered</span></div>
            <div className="pulse-grid">{pulseCards.map((card, index) => {
              const Icon = card.icon
              return <m.article key={card.title} className="pulse-card" initial={reduceMotion ? false : { opacity: 0, y: 18, rotateY: -8 }} animate={{ opacity: 1, y: 0, rotateY: 0 }} transition={{ delay: reduceMotion ? 0 : index * 0.045, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}><Icon aria-hidden="true" /><span>{card.title}</span><strong>{card.value}</strong><p>{card.detail}</p></m.article>
            })}</div>
          </section>

          <section className="stats-panel stats-artists" aria-labelledby="top-artists-title">
            <div className="stats-panel-head"><h3 id="top-artists-title"><Music2 aria-hidden="true" />Top artists</h3><span>By attended shows</span></div>
            <ol className="stats-ranked-list">{topArtists.map((artist, index) => <li key={artist.key}><span>{String(index + 1).padStart(2, '0')}</span><strong>{artist.key}</strong><small>{artist.attended} attended</small></li>)}</ol>
          </section>

          <section className="stats-panel stats-activity" aria-labelledby="activity-title">
            <div className="stats-panel-head"><h3 id="activity-title"><BarChart3 aria-hidden="true" />Monthly heatmap</h3>{years.length ? <label className="stats-year"><span className="sr-only">Highlight year</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((value) => <option key={value}>{value}</option>)}</select></label> : null}</div>
            <p className="stats-panel-note">{monthlySummary}</p>
            <div className="monthly-chart monthly-heatmap" role="img" aria-label="Monthly concert activity heatmap across years">
              <div className="heatmap-month-labels" aria-hidden="true">{months.map((label) => <span key={label}>{label}</span>)}</div>
              {activityRows.map((activityRow) => <div className={`heatmap-row${activityRow.year === year ? ' active' : ''}`} key={activityRow.year}>
                <span className="heatmap-year">{activityRow.year}</span>
                <div className="heatmap-cells">{activityRow.months.map((row) => {
                  const intensity = row.concerts ? Math.max(0.18, row.concerts / monthlyMax) : 0
                  return <span key={`${activityRow.year}-${row.label}`} className="heatmap-cell" style={{ '--heat': intensity } as CSSProperties} title={`${row.label} ${activityRow.year}: ${row.concerts} records, ${row.attended} attended`}><span>{row.concerts || ''}</span></span>
                })}</div>
              </div>)}
              <div className="heatmap-legend" aria-hidden="true"><span>Quiet</span><i /><span>Loud</span></div>
            </div>
          </section>

          <section className="stats-panel stats-fun-facts" aria-labelledby="fun-facts-title">
            <div className="stats-panel-head"><h3 id="fun-facts-title"><Sparkles aria-hidden="true" />Fun facts</h3><span>{formatPercent(attendedShare)} attended</span></div>
            <ul>{funFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
            <div className="spotify-signal"><strong>{formatPercent(discoveryShare)}</strong><span>artist discovery ratio</span></div>
          </section>

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
              : spotify.state.releases.length === 0 ? <p className="stats-panel-note">No releases in the last two months from your top artists. Check back soon.</p>
              : <ul className="spotify-release-list">{spotify.state.releases.map((release) => {
                  const card = <><span className="spotify-release-meta"><strong>{release.artist}</strong><small>{release.title}</small></span><span className="spotify-release-tag">{release.release_type} · {release.release_date}</span></>
                  return <li key={`${release.artist}-${release.title}-${release.release_date}`} className="spotify-release">{release.url ? <a href={release.url} target="_blank" rel="noopener">{card}</a> : card}</li>
                })}</ul>}
          </section>

          <section className="stats-panel stats-genres" aria-labelledby="genres-title">
            <div className="stats-panel-head"><h3 id="genres-title"><Ticket aria-hidden="true" />Top genres</h3><span>{analytics.genre_summaries.length} total</span></div>
            <div className="genre-cloud">{topGenres.map((genre) => <span key={genre.key}><strong>{genre.key}</strong><small>{genre.attended} attended</small></span>)}</div>
          </section>

          <section className="stats-panel stats-venues" aria-labelledby="venues-title">
            <div className="stats-panel-head"><h3 id="venues-title"><MapPin aria-hidden="true" />Top venues</h3><span>By records</span></div>
            <ol className="venue-list">{topVenues.map((venue) => <li key={venue.key}><strong>{venue.key}</strong><span>{venue.concerts}</span></li>)}</ol>
          </section>

          <section className="stats-panel stats-weekday" aria-labelledby="weekday-title">
            <CalendarDays aria-hidden="true" />
            <div><span>Most attended day</span><h3 id="weekday-title">{analytics.most_attended_weekday?.weekday ?? 'No attended shows'}</h3><p>{analytics.most_attended_weekday ? `${analytics.most_attended_weekday.count} attended ${analytics.most_attended_weekday.count === 1 ? 'show' : 'shows'}` : 'Add an attended concert to see this stat.'}</p></div>
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
