import { Armchair, CalendarDays, Image, MapPin, Music2, Pencil, Trash2, Users } from 'lucide-react'
import type { Concert } from '../types'

interface ConcertCardProps {
  concert: Concert
  onDelete: (concert: Concert) => void
  onEdit: (concert: Concert) => void
}

const formatMoney = (value: number | null) => value === null ? 'Price not set' :
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`))

const ratingTone = (rating: number | null) => {
  if (rating === null) return 'rating-muted'
  if (rating >= 8.5) return 'rating-high'
  if (rating >= 7) return 'rating-mid'
  return 'rating-low'
}

export function ConcertCard({ concert, onDelete, onEdit }: ConcertCardProps) {
  const activeAttendees = concert.attendees.filter((attendee) => attendee.attendance_status !== 'Did Not Attend')
  return (
    <article className={`concert-card${concert.pending ? ' concert-pending' : ''}`} id={`concert-${concert.id}`}>
      <div className="concert-card-head">
        {concert.image ? <img className="concert-art" src={concert.image} alt={`${concert.artist} artwork`} width="58" height="58" loading="lazy" decoding="async" /> : <span className="concert-art concert-art-empty" aria-hidden="true"><Image size={22} /></span>}
        <div className="concert-title"><h3>{concert.artist}</h3><p title={concert.tour ?? ''}>{concert.tour || 'Tour not set'}</p></div>
        <div className={`rating-badge ${ratingTone(concert.personal_rating)}`} title="Your rating"><strong>{concert.personal_rating ?? 'N/A'}</strong><span>{concert.personal_rating === null ? 'unrated' : '/10'}</span></div>
      </div>
      {concert.combined_rating !== null ? <span className="projected">combined {concert.combined_rating}{concert.projected !== null ? ` · proj ${concert.projected}` : ''}</span> : concert.projected !== null ? <span className="projected">proj {concert.projected}</span> : null}
      <div className="concert-meta"><span><CalendarDays size={16} />{formatDate(concert.date)}</span><span><MapPin size={16} />{concert.venue}</span></div>
      <div className="chips">
        <span className={`status-chip status-${concert.status.toLowerCase().replaceAll(' ', '-')}`}>{concert.status}</span>
        {concert.genre ? <span className="chip">{concert.genre}</span> : null}<span className="chip">{concert.type}</span>
        {activeAttendees.some((attendee) => attendee.display_name === 'Rachel') ? <span className="chip rachel-chip">Rachel attended</span> : null}
        {concert.pending ? <span className="chip pending-chip">Pending sync</span> : null}
        {concert.seat ? <span className="chip seat-chip"><Armchair size={14} />{concert.seat}</span> : null}
      </div>
      <strong className="concert-price">{formatMoney(concert.price)}</strong>
      {activeAttendees.length || concert.companions ? <span className="companions"><Users size={15} />{[activeAttendees.map((row) => row.display_name).join(', '), concert.companions].filter(Boolean).join(' · ')}</span> : null}
      {concert.notes ? <p className="concert-notes">{concert.notes}</p> : null}
      <div className="card-actions">
        {concert.spotify_url ? <a className="text-action setlist-action" href={concert.spotify_url} target="_blank" rel="noreferrer"><Music2 size={16} />Setlist</a> : <span />}
        <span className="card-action-spacer" />
        <button className="button button-secondary compact-action" type="button" onClick={() => onEdit(concert)} aria-label={`Edit ${concert.artist}`}><Pencil size={16} /><span>Edit</span></button>
        <button className="icon-button danger-action" type="button" onClick={() => onDelete(concert)} title={`Delete ${concert.artist}`} aria-label={`Delete ${concert.artist}`}><Trash2 size={17} /></button>
      </div>
    </article>
  )
}
