import { useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import type { Concert } from '../../types'
import { resizeArtwork } from '../../lib/artwork'
import { MotionToggle } from './CinematicMotion'
import {
  useCinematicMotion,
  useCinematicScene,
} from '../../hooks/useCinematicMotion'

export function WrappedFilm({
  attended,
  period,
}: {
  attended: Concert[]
  period: string | number
}) {
  const [chapter, setChapter] = useState(0)
  const { disabled } = useCinematicMotion()
  const { ref, playing } = useCinematicScene()
  const favourite = attended
    .filter((show) => show.personal_rating !== null)
    .sort(
      (a, b) =>
        (b.personal_rating ?? 0) - (a.personal_rating ?? 0) ||
        b.date.localeCompare(a.date),
    )[0]
  const artists = new Set(attended.map((show) => show.artist)).size
  const artwork = attended.filter((show) => show.image).slice(0, 4)
  const chapters = [
    {
      label: period === 'all' ? 'All time' : String(period),
      title: 'Your year in music.',
      detail: `${attended.length} ${attended.length === 1 ? 'show' : 'shows'} · ${artists} ${artists === 1 ? 'artist' : 'artists'}`,
    },
    {
      label: favourite ? 'Highest rated' : 'Your shows',
      title:
        favourite?.artist ??
        `${attended.length} live ${attended.length === 1 ? 'show' : 'shows'}`,
      detail: favourite
        ? `${favourite.personal_rating}/10 · ${favourite.venue.replace(/\s*\([^)]*\)\s*$/, '')}`
        : 'No ratings yet',
    },
    {
      label: 'Encore',
      title: 'Until next year.',
      detail: `${new Set(attended.map((show) => show.venue)).size} venues`,
    },
  ]
  if (period === 'all') {
    chapters[0].title = 'Your music, live.'
    chapters[2].title = 'Until the next show.'
  }
  const current = chapters[chapter]
  return (
    <section
      ref={ref}
      className="cinema-film"
      aria-label="Concert recap"
      data-playing={playing}
    >
      <MotionToggle />
      <div className="cinema-film-orbit" aria-hidden="true">
        {artwork.map((show, index) => (
          <img
            key={show.id}
            src={resizeArtwork(show.image!, 320)}
            alt=""
            decoding="async"
            loading="lazy"
            style={{ '--orbit-index': index } as CSSProperties}
          />
        ))}
      </div>
      <div className="cinema-film-shade" aria-hidden="true" />
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          className="cinema-film-copy"
          key={chapter}
          aria-live="polite"
          aria-atomic="true"
          initial={disabled ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: disabled ? 0 : 0.28 }}
        >
          <span className="cinema-eyebrow">{current.label}</span>
          <h2>{current.title}</h2>
          <p>{current.detail}</p>
        </m.div>
      </AnimatePresence>
      <div className="cinema-film-controls">
        <button
          className="cinema-arrow"
          type="button"
          aria-label="Previous chapter"
          disabled={chapter === 0}
          onClick={() => setChapter(chapter - 1)}
        >
          <ArrowLeft size={18} />
        </button>
        <span
          className="cinema-film-progress"
          aria-label={`Chapter ${chapter + 1} of 3`}
        >
          {chapters.map((_, index) => (
            <i key={index} data-current={index <= chapter} />
          ))}
        </span>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => setChapter((chapter + 1) % chapters.length)}
        >
          {chapter === 0 ? 'Play' : chapter === 2 ? 'Replay' : 'Next'}
          {chapter === 2 ? <RotateCcw size={15} /> : <ArrowRight size={15} />}
        </button>
      </div>
    </section>
  )
}
