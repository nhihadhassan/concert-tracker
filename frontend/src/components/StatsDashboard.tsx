import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BarChart3, CalendarDays, Flame, Headphones, MapPin, Music2, Radio, Sparkles, Ticket, Trophy, Users, WalletCards, Waves } from 'lucide-react'
import { m, useReducedMotion } from 'motion/react'
import type { Analytics, GroupSummary, RankingRow } from '../types'

interface StatsDashboardProps {
  analytics: Analytics
  memberName: string
  rankings: RankingRow[]
  scope: 'personal' | 'shared'
  onScopeChange: (scope: 'personal' | 'shared') => void
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value)
const formatPercent = (value: number) => `${Math.round(value)}%`

const sortGroups = (rows: GroupSummary[]) => [...rows].sort((left, right) =>
  right.attended - left.attended || right.concerts - left.concerts || left.key.localeCompare(right.key),
)

export function StatsDashboard({ analytics, memberName, rankings, scope, onScopeChange }: StatsDashboardProps) {
  const reduceMotion = useReducedMotion()
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
      value: 'Ready for Spotify + news APIs',
      detail: 'No fake feed here. Connect Spotify listening history and an artist-news source to make this current.',
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
