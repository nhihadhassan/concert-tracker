import { CalendarDays } from 'lucide-react'
import type { Concert } from '../types'

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`))

export function StatsStrip({ concerts }: { concerts: Concert[] }) {
  const nextConcert = [...concerts]
    .filter((concert) => concert.status === 'Want to Go' && concert.date >= new Date().toISOString().slice(0, 10))
    .sort((left, right) => left.date.localeCompare(right.date))[0]
  const attended = concerts.filter((concert) => concert.status === 'Attended').length
  const upcoming = concerts.filter((concert) => concert.status === 'Want to Go').length
  const totalSpent = concerts.reduce(
    (total, concert) => total + (concert.status === 'Cancelled' ? 0 : concert.price ?? 0),
    0,
  )
  return (
    <section className="stats-strip" aria-label="Concert totals">
      <article className="stat-panel"><span className="stat-label">Total concerts</span><strong>{concerts.length}</strong><span className="stat-detail">{attended} attended <span aria-hidden="true">·</span> {upcoming} upcoming</span></article>
      <article className="stat-panel next-concert"><span className="stat-label">Next concert</span>{nextConcert ? <div className="next-concert-row">{nextConcert.image ? <img src={nextConcert.image} alt="" width="54" height="54" decoding="async" /> : null}<div><strong>{nextConcert.artist}</strong><span className="stat-detail"><CalendarDays size={14} />{formatDate(nextConcert.date)}</span></div></div> : <span className="stat-detail">Nothing upcoming yet</span>}</article>
      <article className="stat-panel"><span className="stat-label">Total spent</span><strong>{formatMoney(totalSpent)}</strong><span className="stat-detail">excludes cancelled</span></article>
    </section>
  )
}
