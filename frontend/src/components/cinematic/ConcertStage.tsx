import { selectFeaturedConcert } from '../../lib/cinematic'
import { Ticket } from 'lucide-react'
import type { Concert } from '../../types'
import { resizeArtwork } from '../../lib/artwork'
import { ArtworkTilt } from './ArtworkTilt'
import { MotionToggle } from './CinematicMotion'
import { useCinematicScene } from '../../hooks/useCinematicMotion'

export function ConcertStage({
  concerts,
  onOpen,
}: {
  concerts: Concert[]
  onOpen: (concert: Concert) => void
}) {
  const { ref, playing } = useCinematicScene()
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const concert = selectFeaturedConcert(concerts, today)
  if (!concert) return null
  const date = new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${concert.date}T12:00:00`))
  return (
    <section
      ref={ref}
      className="cinema-stage"
      data-playing={playing}
      aria-label="Featured concert"
    >
      <div className="cinema-beams" aria-hidden="true">
        <i />
        <i />
      </div>
      <MotionToggle />
      <div className="cinema-stage-copy">
        <span className="cinema-eyebrow">
          {concert.status === 'Want to Go' ? 'Up next' : 'Last show'}
        </span>
        <h2>
          Your concert
          <br />
          archive.
        </h2>
        <p>
          {concert.artist}
          <span>{date}</span>
        </p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => onOpen(concert)}
        >
          View concert
        </button>
      </div>
      <div className="cinema-ticket-space">
        <div className="cinema-ticket-float">
          <ArtworkTilt
            className="cinema-ticket"
            label={`Open featured concert: ${concert.artist}`}
            onClick={() => onOpen(concert)}
          >
            {concert.image ? (
              <img
                src={resizeArtwork(concert.image, 480)}
                alt=""
                decoding="async"
                draggable={false}
              />
            ) : (
              <span className="cinema-ticket-placeholder">
                <Ticket size={64} aria-hidden="true" />
              </span>
            )}
            <span className="cinema-ticket-copy">
              <small>{date}</small>
              <strong>{concert.artist}</strong>
              <span>{concert.venue.replace(/\s*\([^)]*\)\s*$/, '')}</span>
            </span>
            <span className="cinema-ticket-stub">
              <span>{concert.status}</span>
              <i aria-hidden="true" />
            </span>
          </ArtworkTilt>
        </div>
      </div>
    </section>
  )
}
