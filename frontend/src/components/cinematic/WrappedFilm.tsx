import { useState } from 'react'
import { ArrowLeft, ArrowRight, Music2, RotateCcw } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import type { Concert } from '../../types'
import { resizeArtwork } from '../../lib/artwork'
import { MotionToggle } from './CinematicMotion'
import { useCinematicMotion, useCinematicScene } from '../../hooks/useCinematicMotion'

export function WrappedFilm({ attended, period }: { attended: Concert[]; period: string | number }) {
  const [chapter, setChapter] = useState(0)
  const { disabled } = useCinematicMotion()
  const { ref, playing } = useCinematicScene()
  const chronological = [...attended].sort((a, b) => a.date.localeCompare(b.date))
  const favourite = attended.filter(show => show.personal_rating !== null).sort((a, b) => (b.personal_rating ?? 0) - (a.personal_rating ?? 0) || b.date.localeCompare(a.date))[0]
  const first = chronological[0]
  const last = chronological.at(-1)
  const cover = favourite ?? last
  const artists = new Set(attended.map(show => show.artist)).size
  const chapters: { label: string; title: string; detail: string; show?: Concert; intro?: boolean }[] = [
    { label: period === 'all' ? 'All time' : String(period), title: period === 'all' ? 'Your shows' : 'Your year', detail: `${attended.length} ${attended.length === 1 ? 'show' : 'shows'} · ${artists} ${artists === 1 ? 'artist' : 'artists'}`, show: cover, intro: true },
    { label: favourite ? 'Highest rated' : 'Latest show', title: (favourite ?? last)?.artist ?? 'Your shows', detail: (favourite ?? last)?.venue.replace(/\s*\([^)]*\)\s*$/, '') ?? '', show: favourite ?? last },
    { label: 'First show', title: first?.artist ?? 'Your shows', detail: first?.venue.replace(/\s*\([^)]*\)\s*$/, '') ?? '', show: first },
    { label: 'Latest show', title: last?.artist ?? 'Your shows', detail: last?.venue.replace(/\s*\([^)]*\)\s*$/, '') ?? '', show: last },
  ]
  const current = chapters[chapter]
  const date = current.show ? new Intl.DateTimeFormat('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${current.show.date}T12:00:00`)) : ''
  return <section ref={ref} className="cinema-film wrapped-stage-film" aria-label="Concert recap" data-playing={playing} data-motion={disabled ? 'off' : 'on'}>
    {current.show?.image ? <img className="wrapped-stage-backdrop" src={resizeArtwork(current.show.image, 960)} alt="" /> : null}
    <div className="wrapped-stage-shade" aria-hidden="true" />
    <div className="wrapped-stage-year" aria-hidden="true">{period === 'all' ? 'LIVE' : period}</div>
    <MotionToggle />
    <AnimatePresence mode="wait" initial={false}>
      <m.div key={chapter} className="wrapped-stage-chapter" initial={disabled ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: disabled ? 0 : 0.3 }}>
        <div className="wrapped-stage-copy" aria-live="polite" aria-atomic="true">
          <span className="cinema-eyebrow">{current.label}</span>
          <h2 aria-label={current.intro ? `${current.title} live.` : current.title}>{current.title}{current.intro ? <span className="companion-outline"> live.</span> : null}</h2>
          <p>{current.detail}</p>
          {!current.intro ? <small>{date}</small> : null}
        </div>
        <div className="wrapped-stage-ticket">
          {current.show?.image ? <img src={resizeArtwork(current.show.image, 640)} alt={`${current.show.artist} artwork`} decoding="async" /> : <div className="wrapped-stage-placeholder"><Music2 size={64} aria-hidden="true" /></div>}
          <div className="wrapped-stage-stub"><strong>{current.intro ? `Encore / ${period === 'all' ? 'All time' : period}` : current.show?.artist}</strong><small>{current.intro ? 'WRAPPED' : 'ATTENDED'}</small></div>
          {!current.intro && current.show?.personal_rating != null ? <span className="wrapped-stage-score" aria-label={`Rating: ${current.show.personal_rating}`}>{current.show.personal_rating}</span> : null}
        </div>
      </m.div>
    </AnimatePresence>
    <div className="cinema-film-controls">
      <button className="cinema-arrow" type="button" aria-label="Previous chapter" disabled={chapter === 0} onClick={() => setChapter(chapter - 1)}><ArrowLeft size={18} /></button>
      <div className="wrapped-stage-progress" role="group" aria-label={`Chapter ${chapter + 1} of ${chapters.length}`}>
        {chapters.map((item, index) => <button key={index} type="button" aria-label={`Chapter ${index + 1}: ${item.label}`} aria-pressed={chapter === index} onClick={() => setChapter(index)} />)}
      </div>
      <button className="button button-secondary" type="button" onClick={() => setChapter((chapter + 1) % chapters.length)}>
        {chapter === 0 ? 'Start recap' : chapter === chapters.length - 1 ? 'Replay' : 'Next'}{chapter === chapters.length - 1 ? <RotateCcw size={15} /> : <ArrowRight size={15} />}
      </button>
    </div>
  </section>
}
