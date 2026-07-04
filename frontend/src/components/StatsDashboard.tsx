import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, MapPin, Music2, Ticket, Trophy, Users, WalletCards } from 'lucide-react'
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

const sortGroups = (rows: GroupSummary[]) => [...rows].sort((left, right) =>
  right.attended - left.attended || right.concerts - left.concerts || left.key.localeCompare(right.key),
)

export function StatsDashboard({ analytics, memberName, rankings, scope, onScopeChange }: StatsDashboardProps) {
  const years = useMemo(() => [...new Set(analytics.monthly_trends.map((row) => row.year))].sort((a, b) => b - a), [analytics.monthly_trends])
  const [year, setYear] = useState(() => years[0] ?? new Date().getFullYear())

  useEffect(() => {
    if (years.length && !years.includes(year)) setYear(years[0])
  }, [year, years])

  const monthly = months.map((label, index) => {
    const row = analytics.monthly_trends.find((item) => item.year === year && item.month === index + 1)
    return { label, concerts: row?.concerts ?? 0, attended: row?.attended ?? 0 }
  })
  const monthlyMax = Math.max(1, ...monthly.map((row) => row.concerts))
  const topArtists = sortGroups(analytics.artist_summaries).slice(0, 5)
  const topGenres = sortGroups(analytics.genre_summaries).slice(0, 8)
  const topVenues = [...analytics.venue_summaries].sort((left, right) => right.concerts - left.concerts || left.key.localeCompare(right.key)).slice(0, 5)
  const attended = analytics.status_counts.Attended ?? 0
  const upcoming = analytics.status_counts['Want to Go'] ?? 0
  const cancelled = analytics.status_counts.Cancelled ?? 0

  return (
    <section className="stats-page" aria-labelledby="stats-title">
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
          <article><WalletCards aria-hidden="true" /><span>Total spend</span><strong>{formatMoney(analytics.spending.total_spent_excluding_cancelled)}</strong></article>
        </section>

        <div className="stats-grid">
          <section className="stats-panel stats-artists" aria-labelledby="top-artists-title">
            <div className="stats-panel-head"><h3 id="top-artists-title"><Music2 aria-hidden="true" />Top artists</h3><span>By attended shows</span></div>
            <ol className="stats-ranked-list">{topArtists.map((artist, index) => <li key={artist.key}><span>{String(index + 1).padStart(2, '0')}</span><strong>{artist.key}</strong><small>{artist.attended} attended</small></li>)}</ol>
          </section>

          <section className="stats-panel stats-activity" aria-labelledby="activity-title">
            <div className="stats-panel-head"><h3 id="activity-title"><BarChart3 aria-hidden="true" />Monthly activity</h3>{years.length ? <label className="stats-year"><span className="sr-only">Activity year</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((value) => <option key={value}>{value}</option>)}</select></label> : null}</div>
            <div className="monthly-chart" role="img" aria-label={`Monthly concert activity for ${year}`}>
              {monthly.map((row) => <div className="month-column" key={row.label} title={`${row.label}: ${row.concerts} records, ${row.attended} attended`}><span className="month-value">{row.concerts || ''}</span><span className="month-bar-track"><span className="month-bar" style={{ height: `${Math.max(row.concerts ? 8 : 0, row.concerts / monthlyMax * 100)}%` }} /></span><small>{row.label}</small></div>)}
            </div>
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
    </section>
  )
}
