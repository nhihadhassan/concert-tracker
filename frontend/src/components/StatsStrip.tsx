import { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { animate, m, useReducedMotion } from 'motion/react'
import type { Concert } from '../types'

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const formatWeekday = (value: string) =>
  new Intl.DateTimeFormat('en-CA', { weekday: 'long' }).format(new Date(`${value}T12:00:00`))
const daysUntil = (value: string) => {
  const today = new Date()
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const target = new Date(`${value}T12:00:00`)
  return Math.max(0, Math.ceil((target.getTime() - todayLocal.getTime()) / 86_400_000))
}

function AnimatedValue({ value, format = String }: { value: number; format?: (value: number) => string }) {
  const reduceMotion = useReducedMotion()
  const [displayValue, setDisplayValue] = useState(value)
  const currentValue = useRef(value)

  useEffect(() => {
    if (reduceMotion) {
      currentValue.current = value
      setDisplayValue(value)
      return
    }
    const controls = animate(currentValue.current, value, {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (nextValue) => {
        currentValue.current = nextValue
        setDisplayValue(nextValue)
      },
    })
    return () => controls.stop()
  }, [reduceMotion, value])

  return <>{format(displayValue)}</>
}

export function StatsStrip({ concerts }: { concerts: Concert[] }) {
  const nextConcert = [...concerts]
    .filter((concert) => concert.status === 'Want to Go' && concert.date >= new Date().toISOString().slice(0, 10))
    .sort((left, right) => left.date.localeCompare(right.date))[0]
  const attended = concerts.filter((concert) => concert.status === 'Attended').length
  const upcoming = concerts.filter((concert) => concert.status === 'Want to Go').length
  const nextConcertDays = nextConcert ? daysUntil(nextConcert.date) : null
  return (
    <section className="stats-strip" aria-label="Concert totals">
      <m.article className="stat-panel stat-total" layout><span className="stat-label">Total concerts</span><strong><AnimatedValue value={concerts.length} format={(value) => Math.round(value).toString()} /></strong><span className="stat-detail">{attended} attended <span aria-hidden="true">·</span> {upcoming} upcoming</span></m.article>
      <m.article className="stat-panel next-concert stat-next" layout>
        <span className="stat-label">Next concert</span>
        {nextConcert ? <div className="next-concert-row">
          {nextConcert.image ? <m.img key={nextConcert.image} initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={nextConcert.image} alt="" width="54" height="54" decoding="async" /> : null}
          <div><strong>{nextConcert.artist}</strong><span className="stat-detail"><CalendarDays size={14} />{formatDate(nextConcert.date)}</span></div>
          <div className="next-concert-countdown" aria-label={`${nextConcertDays} days until ${nextConcert.artist}`}>
            <strong>{nextConcertDays === 0 ? 'Today' : `${nextConcertDays}d`}</strong>
            <span>{formatWeekday(nextConcert.date)}</span>
          </div>
        </div> : <span className="stat-detail">Nothing upcoming yet</span>}
      </m.article>
    </section>
  )
}
