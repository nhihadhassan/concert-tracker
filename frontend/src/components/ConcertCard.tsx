import { Armchair, CalendarDays, MapPin, Music2, Pencil, Trash2, Users } from 'lucide-react'
import type { Concert } from '../types'

interface ConcertCardProps {
  concert: Concert
  onDelete: (id: string) => void
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  )

const ratingTone = (rating: number | null) => {
  if (rating === null) return 'rating-muted'
  if (rating >= 8.5) return 'rating-high'
  if (rating >= 7) return 'rating-mid'
  return 'rating-low'
}

export function ConcertCard({ concert, onDelete }: ConcertCardProps) {
  return (
    <article className="concert-card" id={`concert-${concert.id}`}>
      <div className="concert-card-head">
        <img className="concert-art" src={concert.image} alt={`${concert.artist} artwork`} width="58" height="58" loading="lazy" decoding="async" />
        <div className="concert-title">
          <h3>{concert.artist}</h3>
          <p title={concert.tour}>{concert.tour}</p>
        </div>
        <div className={`rating-badge ${ratingTone(concert.realized)}`} title="Realized rating">
          <strong>{concert.realized ?? 'N/A'}</strong>
          <span>{concert.realized === null ? 'unrated' : '/10'}</span>
        </div>
      </div>

      {concert.realized !== null && concert.projected !== null ? <span className="projected">proj {concert.projected}</span> : null}

      <div className="concert-meta">
        <span><CalendarDays size={16} />{formatDate(concert.date)}</span>
        <span><MapPin size={16} />{concert.venue}</span>
      </div>

      <div className="chips">
        <span className={`status-chip status-${concert.status.toLowerCase().replaceAll(' ', '-')}`}>{concert.status}</span>
        <span className="chip">{concert.genre}</span>
        <span className="chip">{concert.type}</span>
        {concert.rachelAttended ? <span className="chip rachel-chip">Rachel attended</span> : null}
        <span className="chip seat-chip"><Armchair size={14} />{concert.seat}</span>
      </div>

      <strong className="concert-price">{formatMoney(concert.price)}</strong>
      <span className="companions"><Users size={15} />{concert.companions}</span>
      {concert.notes ? <p className="concert-notes">{concert.notes}</p> : null}

      <div className="card-actions">
        <button className="text-action setlist-action" type="button" disabled title="Setlist links return in Stage 5">
          <Music2 size={16} />Setlist
        </button>
        <span className="card-action-spacer" />
        <button className="button button-secondary compact-action" type="button" disabled title="Editing returns in Stage 5">
          <Pencil size={16} /><span>Edit</span>
        </button>
        <button className="icon-button danger-action" type="button" onClick={() => onDelete(concert.id)} title={`Remove ${concert.artist} from this preview`} aria-label={`Remove ${concert.artist} from this preview`}>
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  )
}
