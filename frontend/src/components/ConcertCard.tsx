import { Armchair, CalendarDays, Image, MapPin, Music2, Pencil, Star, Trash2, Users } from 'lucide-react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import type { Concert } from '../types'

interface ConcertCardProps {
  concert: Concert
  index: number
  onDelete: (concert: Concert) => void
  onEdit: (concert: Concert) => void
  onOpen: (concert: Concert) => void
}

const formatMoney = (value: number | null) => value === null ? 'Price not set' :
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const venueName = (value: string) => value.replace(/\s*\([^)]*\)\s*$/, '').trim()

const ratingTone = (rating: number | null) => {
  if (rating === null) return 'rating-muted'
  if (rating >= 8.5) return 'rating-high'
  if (rating >= 7) return 'rating-mid'
  return 'rating-low'
}

export function ConcertCard({ concert, index, onDelete, onEdit, onOpen }: ConcertCardProps) {
  const activeAttendees = concert.attendees.filter((attendee) => attendee.attendance_status !== 'Did Not Attend')
  const reduceMotion = useReducedMotion()
  return (
    <m.article
      className={`concert-card${concert.pending ? ' concert-pending' : ''}`}
      id={`concert-${concert.id}`}
      layout="position"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : Math.min(index, 5) * 0.035, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduceMotion ? undefined : { y: -2 }}
    >
      <button id={`concert-open-${concert.id}`} className={`concert-visual${concert.image ? '' : ' concert-visual-empty'}`} type="button" onClick={() => onOpen(concert)} aria-label={`View ${concert.artist} details`}>
        <AnimatePresence mode="wait" initial={false}>{concert.image ? <m.img key={concert.image} className="concert-art" src={concert.image} alt={`${concert.artist} artwork`} loading="lazy" decoding="async" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /> : <m.span key="empty-art" className="concert-art concert-art-empty" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Image size={34} /></m.span>}</AnimatePresence>
        <span className="concert-image-scrim" aria-hidden="true" />
        <div className="concert-visual-top">
          {concert.genre ? <span className="genre-chip">#{concert.genre.replaceAll(' ', '')}</span> : null}
          {concert.pending ? <span className="chip pending-chip">Pending sync</span> : null}
        </div>
        <div className="concert-card-head">
          <div className="concert-title"><h3>{concert.artist}</h3><p title={concert.tour ?? ''}>{concert.tour || 'Tour not set'}</p><span className="concert-venue"><MapPin size={14} />{venueName(concert.venue)}</span></div>
          <AnimatePresence mode="popLayout" initial={false}><m.div key={concert.personal_rating ?? 'unrated'} className={`rating-badge ${ratingTone(concert.personal_rating)}`} title="Your rating" initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }}><Star size={16} fill="currentColor" aria-hidden="true" /><strong>{concert.personal_rating ?? 'N/A'}</strong><span>{concert.personal_rating === null ? 'unrated' : '/10'}</span>{concert.projected !== null ? <small>Proj {concert.projected}</small> : null}</m.div></AnimatePresence>
        </div>
      </button>
      <div className="concert-card-body">
        <div className="concert-meta"><span><CalendarDays size={16} />{formatDate(concert.date)}</span><strong className="concert-price">{formatMoney(concert.price)}</strong></div>
        <div className="chips">
          <span className={`status-chip status-${concert.status.toLowerCase().replaceAll(' ', '-')}`}>{concert.status}</span>
          <span className="chip">{concert.type}</span>
          {concert.seat ? <span className="chip seat-chip"><Armchair size={14} />{concert.seat}</span> : null}
          {activeAttendees.some((attendee) => attendee.display_name === 'Rachel') ? <span className="chip rachel-chip">Rachel attended</span> : null}
        </div>
        {activeAttendees.length || concert.companions ? <span className="companions"><Users size={15} />{[activeAttendees.map((row) => row.display_name).join(', '), concert.companions].filter(Boolean).join(' · ')}</span> : null}
        {concert.notes ? <p className="concert-notes">{concert.notes}</p> : null}
        <div className="card-actions">
          {concert.spotify_url ? <a className="text-action setlist-action" href={concert.spotify_url} target="_blank" rel="noreferrer"><Music2 size={16} />Setlist</a> : <span />}
          <span className="card-action-spacer" />
          <button className="button button-secondary compact-action" type="button" onClick={() => onEdit(concert)} aria-label={`Edit ${concert.artist}`}><Pencil size={16} /><span>Edit</span></button>
          <button className="icon-button danger-action" type="button" onClick={() => onDelete(concert)} title={`Delete ${concert.artist}`} aria-label={`Delete ${concert.artist}`}><Trash2 size={17} /></button>
        </div>
      </div>
    </m.article>
  )
}
