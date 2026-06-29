import { CalendarDays } from 'lucide-react'
import { baselineStats, concerts } from '../data/fixtures'

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  )

export function StatsStrip() {
  const nextConcert = concerts.find((concert) => concert.status === 'Want to Go')

  return (
    <section className="stats-strip" aria-label="Concert totals">
      <article className="stat-panel">
        <span className="stat-label">Total concerts</span>
        <strong>{baselineStats.total}</strong>
        <span className="stat-detail">
          {baselineStats.attended} attended <span aria-hidden="true">·</span> {baselineStats.upcoming} upcoming
        </span>
      </article>

      <article className="stat-panel next-concert">
        <span className="stat-label">Next concert</span>
        {nextConcert ? (
          <div className="next-concert-row">
            <img src={nextConcert.image} alt="" width="54" height="54" decoding="async" />
            <div>
              <strong>{nextConcert.artist}</strong>
              <span className="stat-detail"><CalendarDays size={14} />{formatDate(nextConcert.date)}</span>
            </div>
          </div>
        ) : null}
      </article>

      <article className="stat-panel">
        <span className="stat-label">Total spent</span>
        <strong>{formatMoney(baselineStats.totalSpent)}</strong>
        <span className="stat-detail">excludes cancelled</span>
      </article>
    </section>
  )
}
