import { Armchair, ArrowLeft, CalendarDays, Image, MapPin, Music2, Pencil, Star, Ticket, Trash2, Users, WalletCards } from 'lucide-react'
import type { SessionMember } from '../session/useSession'
import type { Concert } from '../types'

interface ConcertDetailProps {
  concert: Concert
  member: SessionMember
  onArtwork: (concert: Concert) => void
  onBack: () => void
  onDelete: (concert: Concert) => void
  onEdit: (concert: Concert) => void
}

const formatDate = (value: string) => new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const formatMoney = (value: number | null) => value === null ? 'Price not set' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)

export function ConcertDetail({ concert, member, onArtwork, onBack, onDelete, onEdit }: ConcertDetailProps) {
  const personalReview = concert.reviews.find((review) => review.reviewer_user_id === member.user_id)
  const attendees = concert.attendees.filter((attendee) => attendee.attendance_status !== 'Did Not Attend')
  const scores = [
    ['Enjoyment', personalReview?.enjoyment_score],
    ['Stage', personalReview?.stage_score],
    ['Setlist', personalReview?.setlist_score],
    ['Seat', personalReview?.seat_score],
  ] as const

  return (
    <article className="detail-page" aria-labelledby="detail-title">
      <section className={`detail-hero${concert.image ? '' : ' detail-hero-empty'}`}>
        {concert.image ? <img src={concert.image} alt={`${concert.artist} concert artwork`} decoding="async" /> : <span className="detail-art-fallback" aria-hidden="true"><Image size={54} /></span>}
        <span className="detail-hero-scrim" aria-hidden="true" />
        <div className="detail-top-actions">
          <button className="detail-round-button" type="button" onClick={onBack} aria-label="Back to concerts"><ArrowLeft size={20} /></button>
          <div><button className="detail-round-button" type="button" onClick={() => onArtwork(concert)} aria-label={`Choose artwork for ${concert.artist}`}><Image size={18} /></button><button className="detail-round-button" type="button" onClick={() => onEdit(concert)} aria-label={`Edit ${concert.artist}`}><Pencil size={18} /></button><button className="detail-round-button detail-delete" type="button" onClick={() => onDelete(concert)} aria-label={`Delete ${concert.artist}`}><Trash2 size={18} /></button></div>
        </div>
        <header className="detail-hero-copy">
          <div className="detail-tags">{concert.genre ? <span className="genre-chip">#{concert.genre.replaceAll(' ', '')}</span> : null}<span className={`status-chip status-${concert.status.toLowerCase().replaceAll(' ', '-')}`}>{concert.status}</span>{concert.pending ? <span className="chip pending-chip">Pending sync</span> : null}</div>
          <h1 id="detail-title" data-view-heading tabIndex={-1}>{concert.artist}</h1>
          <p>{concert.tour || 'Tour not set'}</p>
        </header>
      </section>

      <div className="detail-content">
        <section className="detail-rating" aria-labelledby="detail-rating-title">
          <div className="detail-rating-primary"><span id="detail-rating-title">Your rating</span><strong>{concert.personal_rating ?? 'N/A'}</strong><small>{concert.personal_rating === null ? 'Not rated yet' : '/10'}</small></div>
          <div className="detail-rating-combined"><Star size={18} fill="currentColor" aria-hidden="true" /><span>Combined</span><strong>{concert.combined_rating ?? 'N/A'}</strong></div>
          <dl className="detail-scores">{scores.map(([label, score]) => <div key={label}><dt>{label}</dt><dd>{score ?? 'N/A'}</dd></div>)}</dl>
        </section>

        <section className="detail-people" aria-labelledby="detail-people-title">
          <div className="detail-section-heading"><Users aria-hidden="true" /><h2 id="detail-people-title">Who went</h2></div>
          {attendees.length || concert.companions ? <div className="people-list">{attendees.map((attendee) => <span key={attendee.user_id}><b aria-hidden="true">{attendee.display_name.slice(0, 1)}</b>{attendee.display_name}</span>)}{concert.companions ? <span><b aria-hidden="true">+</b>{concert.companions}</span> : null}</div> : <p className="detail-empty-copy">No companions recorded.</p>}
        </section>

        <section className="detail-facts" aria-label="Concert details">
          <div><CalendarDays aria-hidden="true" /><span>Date</span><strong>{formatDate(concert.date)}</strong></div>
          <div><MapPin aria-hidden="true" /><span>Venue</span><strong>{concert.venue}</strong></div>
          <div><Armchair aria-hidden="true" /><span>Seat</span><strong>{concert.seat || 'Not recorded'}</strong></div>
          <div><WalletCards aria-hidden="true" /><span>Price</span><strong>{formatMoney(concert.price)}</strong></div>
          <div><Ticket aria-hidden="true" /><span>Type</span><strong>{concert.type}</strong></div>
        </section>

        <section className="detail-notes" aria-labelledby="memory-title">
          <div className="detail-section-heading"><Star aria-hidden="true" /><h2 id="memory-title">Your memory</h2><button type="button" onClick={() => onEdit(concert)}><Pencil size={15} />Edit review</button></div>
          <p>{personalReview?.notes || 'No personal memory recorded yet.'}</p>
        </section>

        <section className="detail-notes detail-event-notes" aria-labelledby="event-notes-title"><div className="detail-section-heading"><Music2 aria-hidden="true" /><h2 id="event-notes-title">Event notes</h2></div><p>{concert.notes || 'No shared event notes recorded.'}</p></section>

        {concert.spotify_url ? <a className="detail-setlist" href={concert.spotify_url} target="_blank" rel="noreferrer"><Music2 aria-hidden="true" /><span><strong>Open setlist</strong><small>View the saved Spotify link</small></span></a> : <section className="detail-setlist detail-setlist-empty"><Music2 aria-hidden="true" /><span><strong>No setlist saved</strong><small>Add a Spotify setlist from Edit concert.</small></span></section>}
      </div>
    </article>
  )
}
