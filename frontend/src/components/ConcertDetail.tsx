import { Armchair, CalendarDays, ExternalLink, Image, MapPin, Music2, Pencil, Plus, Star, Ticket, Trash2, Users, WalletCards, X } from 'lucide-react'
import { m, useReducedMotion } from 'motion/react'
import { downloadConcertCalendar } from '../lib/exports'
import { spotifySearchUrl, verifiedSetlistsByConcertId } from '../lib/verifiedSetlists'
import type { Milestone } from '../lib/archiveInsights'
import type { SessionMember } from '../session/useSession'
import { parseGuests } from '../lib/guests'
import type { Concert } from '../types'

interface ConcertDetailProps {
  concert: Concert
  member: SessionMember
  milestones: Milestone[]
  onArtwork: (concert: Concert) => void
  onClose: () => void
  onDelete: (concert: Concert) => void
  onEdit: (concert: Concert) => void
}

const formatDate = (value: string) => new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const formatMoney = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)

export function ConcertDetail({ concert, member, milestones, onArtwork, onClose, onDelete, onEdit }: ConcertDetailProps) {
  const reduceMotion = useReducedMotion()
  const personalReview = concert.reviews.find((review) => review.reviewer_user_id === member.user_id)
  const attendees = concert.attendees.filter((attendee) => attendee.attendance_status !== 'Did Not Attend')
  const verifiedSetlist = verifiedSetlistsByConcertId[concert.id]
  const scores = [
    ['Enjoyment', personalReview?.enjoyment_score],
    ['Stage', personalReview?.stage_score],
    ['Setlist', personalReview?.setlist_score],
    ['Seat', personalReview?.seat_score],
  ] as const

  return (
    <article className="detail-page" aria-labelledby="detail-title">
      <section className={`detail-hero${concert.image ? '' : ' detail-hero-empty'}`}>
        {concert.image ? <m.img layoutId={reduceMotion ? undefined : `concert-art-${concert.id}`} src={concert.image} alt={`${concert.artist} concert artwork`} decoding="async" /> : <span className="detail-art-fallback" aria-hidden="true"><Image size={54} /></span>}
        <span className="detail-hero-scrim" aria-hidden="true" />
        <button className="detail-round-button concert-detail-close" type="button" onClick={onClose} aria-label="Close concert details" autoFocus><X size={20} aria-hidden="true" /></button>
      </section>

      <div className="detail-panel">
        <header className="detail-heading">
          <div className="detail-top-actions">
            <div><button className="detail-round-button" type="button" onClick={() => onArtwork(concert)} aria-label={`Choose artwork for ${concert.artist}`}><Image size={18} /></button><button className="detail-round-button" type="button" onClick={() => onEdit(concert)} aria-label={`Edit ${concert.artist}`}><Pencil size={18} /></button><button className="detail-round-button detail-delete" type="button" onClick={() => onDelete(concert)} aria-label={`Delete ${concert.artist}`}><Trash2 size={18} /></button></div>
          </div>
          <div className="detail-tags">{concert.genre ? <span className="genre-chip">#{concert.genre.replaceAll(' ', '')}</span> : null}<span className={`status-chip status-${concert.status.toLowerCase().replaceAll(' ', '-')}`}>{concert.status}</span>{concert.pending ? <span className="chip pending-chip">Pending sync</span> : null}</div>
          <h1 id="detail-title" data-view-heading tabIndex={-1}>{concert.artist}</h1>
          {concert.tour ? <p>{concert.tour}</p> : null}
        </header>

      <div className="detail-content">
        {concert.personal_rating !== null || concert.combined_rating !== null || scores.some(([, score]) => score !== null) ? <section className="detail-rating" aria-labelledby="detail-rating-title">
          {concert.personal_rating !== null ? <div className="detail-rating-primary"><span id="detail-rating-title">Your rating</span><strong>{concert.personal_rating}</strong><small>/10</small></div> : null}
          {concert.combined_rating !== null ? <div className="detail-rating-combined"><Star size={18} fill="currentColor" aria-hidden="true" /><span>Combined</span><strong>{concert.combined_rating}</strong></div> : null}
          {scores.some(([, score]) => score !== null) ? <dl className="detail-scores">{scores.filter(([, score]) => score !== null).map(([label, score]) => <div key={label}><dt>{label}</dt><dd>{score}</dd></div>)}</dl> : null}
        </section> : null}

        <section className="detail-people" aria-labelledby="detail-people-title">
          <div className="detail-section-heading"><Users aria-hidden="true" /><h2 id="detail-people-title">Who went</h2></div>
          {attendees.length || concert.companions ? <div className="people-list">{attendees.map((attendee) => <span key={attendee.user_id}><b aria-hidden="true">{attendee.display_name.slice(0, 1)}</b>{attendee.display_name}</span>)}{parseGuests(concert.companions).map((guest) => <span key={guest} className="guest-chip"><b aria-hidden="true">{guest.slice(0, 1).toUpperCase()}</b>{guest}</span>)}</div> : <p className="detail-empty-copy">No companions recorded.</p>}
        </section>

        <section className="detail-facts" aria-label="Concert details">
          <div><CalendarDays aria-hidden="true" /><span>Date</span><strong>{formatDate(concert.date)}</strong></div>
          <div><MapPin aria-hidden="true" /><span>Venue</span><strong>{concert.venue}</strong></div>
          {concert.seat ? <div><Armchair aria-hidden="true" /><span>Seat</span><strong>{concert.seat}</strong></div> : null}
          {concert.price !== null ? <div><WalletCards aria-hidden="true" /><span>Price</span><strong>{formatMoney(concert.price)}</strong></div> : null}
          <div><Ticket aria-hidden="true" /><span>Type</span><strong>{concert.type}</strong></div>
        </section>

        {verifiedSetlist ? <section className="detail-tracklist" aria-labelledby="detail-tracklist-title">
          <div className="detail-section-heading detail-tracklist-heading">
            <Music2 aria-hidden="true" />
            <h2 id="detail-tracklist-title">Setlist</h2>
            <span>{verifiedSetlist.tracks.length} songs</span>
            <a href={verifiedSetlist.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={13} aria-hidden="true" /></a>
          </div>
          <p className="detail-tracklist-caption">{verifiedSetlist.isPartial
            ? 'The online report marks this setlist as incomplete; only the songs listed there are shown.'
            : 'Set order is listed online; song-by-song performance time codes were not provided.'}</p>
          <ol className="detail-tracklist-songs">
            {verifiedSetlist.tracks.map((track, index) => <li key={`${track.title}-${index}`}>
              <span className="detail-tracklist-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="detail-tracklist-song">
                {track.segment ? <span className="detail-tracklist-segment">{track.segment}</span> : null}
                <strong>{track.title}</strong>
                {track.note ? <small>{track.note}</small> : null}
              </div>
              {track.timecode ? <time className="detail-tracklist-time">{track.timecode}</time> : null}
              <a className="detail-tracklist-spotify" href={spotifySearchUrl(track)} target="_blank" rel="noreferrer">Spotify <ExternalLink size={12} aria-hidden="true" /></a>
            </li>)}
          </ol>
        </section> : null}

        {personalReview?.notes ? <section className="detail-notes" aria-labelledby="memory-title">
          <div className="detail-section-heading"><Star aria-hidden="true" /><h2 id="memory-title">Your memory</h2><button type="button" onClick={() => onEdit(concert)}><Pencil size={15} />Edit review</button></div>
          <p>{personalReview.notes}</p>
        </section> : null}

        {concert.notes ? <section className="detail-notes detail-event-notes" aria-labelledby="event-notes-title"><div className="detail-section-heading"><Music2 aria-hidden="true" /><h2 id="event-notes-title">Event notes</h2></div><p>{concert.notes}</p></section> : null}

        {milestones.length ? <section className="detail-milestones" aria-label="Archive milestones">{milestones.map((milestone) => <p key={milestone.label}><Star size={15} aria-hidden="true" />{milestone.label}</p>)}</section> : null}

        {concert.setlist_url ? <a className="detail-setlist" href={concert.setlist_url} target="_blank" rel="noreferrer"><Music2 aria-hidden="true" /><span><strong>View setlist</strong><small>Open the saved concert setlist.</small></span></a> : null}
        {concert.spotify_url ? <a className="detail-setlist" href={concert.spotify_url} target="_blank" rel="noreferrer"><Music2 aria-hidden="true" /><span><strong>Open playlist</strong><small>Play the saved Spotify setlist playlist.</small></span></a> : null}
        {concert.status === 'Want to Go' ? <button className="detail-setlist" type="button" onClick={() => downloadConcertCalendar(concert)}><Plus aria-hidden="true" /><span><strong>Add to calendar</strong><small>Download this concert as an all-day calendar event.</small></span></button> : null}
      </div>
      </div>
    </article>
  )
}
