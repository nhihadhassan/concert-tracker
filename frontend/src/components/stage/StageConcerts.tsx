import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { m, useMotionValue, useSpring } from 'motion/react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Music2,
  Play,
  RotateCcw,
} from 'lucide-react'
import type { Concert } from '../../types'
import { artworkSrcSet, resizeArtwork } from '../../lib/artwork'
import { selectFeaturedConcert } from '../../lib/cinematic'
import { parseGuests } from '../../lib/guests'
import { MotionToggle } from '../cinematic/CinematicMotion'
import {
  useCinematicMotion,
  useCinematicScene,
} from '../../hooks/useCinematicMotion'
import { StageReplay } from './StageReplay'
import './stage.css'

import { stageDate } from './stageDate'
const venueName = (venue: string) =>
  venue.replace(/\s*\([^)]*\)\s*$/, '').trim()
const palettes = ['#ff7149', '#ad8ff0', '#50cbb8', '#e8a559', '#e985b0']

function Tilt({
  children,
  className,
}: {
  children: ReactNode
  className: string
}) {
  const { disabled } = useCinematicMotion()
  const x = useMotionValue(0),
    y = useMotionValue(0)
  const rotateX = useSpring(x, { stiffness: 180, damping: 24 })
  const rotateY = useSpring(y, { stiffness: 180, damping: 24 })
  useEffect(() => {
    if (disabled) {
      x.set(0)
      y.set(0)
      rotateX.jump(0)
      rotateY.jump(0)
    }
  }, [disabled, x, y, rotateX, rotateY])
  return (
    <m.div
      className={className}
      style={{ rotateX, rotateY }}
      onPointerMove={(event) => {
        if (disabled || event.pointerType === 'touch') return
        const rect = event.currentTarget.getBoundingClientRect()
        x.set((0.5 - (event.clientY - rect.top) / rect.height) * 9)
        y.set(((event.clientX - rect.left) / rect.width - 0.5) * 13)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
      onPointerCancel={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </m.div>
  )
}

function Ticket({
  concert,
  onOpen,
}: {
  concert: Concert
  onOpen: (concert: Concert) => void
}) {
  const [flipped, setFlipped] = useState(false)
  const guests = [
    ...concert.attendees
      .filter((a) => a.attendance_status !== 'Did Not Attend')
      .map((a) => a.display_name),
    ...parseGuests(concert.companions),
  ]
  return (
    <div className="stage-ticket-space">
      <div className="stage-ticket-float">
        <Tilt className="stage-ticket-tilt">
          <div className={`stage-ticket-turn${flipped ? ' is-flipped' : ''}`}>
            <button
              type="button"
              className="stage-ticket-front"
              aria-label={`Open featured concert: ${concert.artist}`}
              onClick={() => onOpen(concert)}
              tabIndex={flipped ? -1 : 0}
              aria-hidden={flipped}
              inert={flipped}
            >
              {concert.image ? (
                <img
                  src={resizeArtwork(concert.image, 640)}
                  alt=""
                  data-stage-featured-art
                  data-concert-id={concert.id}
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <span className="stage-art-fallback">
                  <Music2 size={70} />
                </span>
              )}
              <span className="stage-ticket-label">
                <strong>{concert.tour || concert.artist}</strong>
                <small>{stageDate(concert.date)}</small>
              </span>
              <span className="stage-ticket-stub">
                <span>{concert.status}</span>
                <i aria-hidden="true" />
              </span>
            </button>
            <div
              className="stage-ticket-back"
              aria-hidden={!flipped}
              inert={!flipped}
            >
              <span className="stage-eyebrow">{stageDate(concert.date)}</span>
              <h2>{concert.artist}</h2>
              <dl>
                <div>
                  <dt>Venue</dt>
                  <dd>{venueName(concert.venue) || 'Not added'}</dd>
                </div>
                <div>
                  <dt>Seat</dt>
                  <dd>{concert.seat || 'Not added'}</dd>
                </div>
                <div>
                  <dt>
                    {concert.status === 'Want to Go'
                      ? 'Going with'
                      : 'Who went'}
                  </dt>
                  <dd>{[...new Set(guests)].join(', ') || 'Not added'}</dd>
                </div>
              </dl>
              <button
                className="stage-action"
                type="button"
                onClick={() => onOpen(concert)}
              >
                Open concert <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </Tilt>
      </div>
      <button
        className="stage-ticket-flip"
        type="button"
        aria-pressed={flipped}
        onClick={() => setFlipped((v) => !v)}
      >
        <RotateCcw size={14} />
        {flipped ? 'Show artwork' : 'Flip ticket'}
      </button>
    </div>
  )
}

function StageHero({
  concert,
  onOpen,
  onAdd,
}: {
  concert?: Concert
  onOpen: (concert: Concert) => void
  onAdd: () => void
}) {
  const { ref, playing } = useCinematicScene()
  const parts = concert?.artist.split(/\s+(?:and|&)\s+/i)
  return (
    <section
      className="stage-hero"
      ref={ref}
      data-playing={playing}
      aria-label="Featured concert"
    >
      {concert?.image ? (
        <img
          className="stage-backdrop"
          src={resizeArtwork(concert.image, 960)}
          alt=""
        />
      ) : null}
      <div className="stage-haze" aria-hidden="true" />
      <div className="stage-beam" aria-hidden="true" />
      <div className="stage-beam stage-beam-two" aria-hidden="true" />
      <div className="stage-grain" aria-hidden="true" />
      <div className="stage-hero-copy">
        <span className="stage-eyebrow">
          <i />
          {concert
            ? concert.status === 'Want to Go'
              ? 'Up next'
              : 'Last show'
            : 'Concerts'}
          {concert ? ` · ${stageDate(concert.date)}` : ''}
        </span>
        <h1
          data-view-heading
          tabIndex={-1}
          className={
            (concert?.artist.length ?? 0) > 30 ? 'stage-title-long' : ''
          }
        >
          {parts?.length === 2 ? (
            <>
              {parts[0]}
              <span>
                <b>+</b>
                {parts[1]}
              </span>
            </>
          ) : (
            concert?.artist || 'Your next show.'
          )}
        </h1>
        {concert ? (
          <>
            <p>
              <strong>{concert.tour}</strong>
              {concert.tour ? <br /> : null}
              {venueName(concert.venue)}
            </p>
            <button
              className="stage-action"
              type="button"
              onClick={() => onOpen(concert)}
            >
              Open concert <ArrowUpRight size={17} />
            </button>
          </>
        ) : (
          <button className="stage-action" type="button" onClick={onAdd}>
            Add concert
          </button>
        )}
      </div>
      {concert ? (
        <Ticket key={concert.id} concert={concert} onOpen={onOpen} />
      ) : null}
      <span className="stage-hero-year" aria-hidden="true">
        {concert?.date.slice(0, 4)}
      </span>
      <a className="stage-archive-jump" href="#stage-archive">
        The archive <ArrowDown size={13} />
      </a>
    </section>
  )
}

function ConcertRibbon({
  concerts,
  onOpen,
}: {
  concerts: Concert[]
  onOpen: (concert: Concert) => void
}) {
  const { ref, playing } = useCinematicScene()
  const rows = useMemo(
    () =>
      [...concerts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
    [concerts],
  )
  if (!rows.length) return null
  return (
    <section
      ref={ref}
      className="stage-ticker"
      data-playing={playing}
      aria-label="Concert strip"
    >
      <div className="stage-ribbon">
        {[false, true].map((duplicate) => (
          <div
            key={String(duplicate)}
            className="stage-ribbon-group"
            aria-hidden={duplicate}
          >
            {rows.map((concert) => (
              <button
                type="button"
                key={concert.id}
                onClick={() => onOpen(concert)}
                tabIndex={duplicate ? -1 : 0}
              >
                <span>{concert.artist}</span>
                <small>{stageDate(concert.date)}</small>
                <i aria-hidden="true">✦</i>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

export function StageConcerts({
  concerts,
  allConcerts,
  personalConcerts,
  onOpen,
  onClassic,
  onAdd,
  children,
}: {
  concerts: Concert[]
  allConcerts: Concert[]
  personalConcerts: Concert[]
  onOpen: (concert: Concert) => void
  onClassic: (event: MouseEvent<HTMLAnchorElement>) => void
  onAdd: () => void
  children: ReactNode
}) {
  const [year, setYear] = useState('all')
  const [replay, setReplay] = useState(false)
  const replayButton = useRef<HTMLButtonElement>(null)
  const { disabled } = useCinematicMotion()
  const years = useMemo(
    () =>
      [...new Set(allConcerts.map((c) => c.date.slice(0, 4)))].sort().reverse(),
    [allConcerts],
  )
  const selectedYear = year === 'all' || years.includes(year) ? year : 'all'
  const filtered = concerts.filter(
    (c) => selectedYear === 'all' || c.date.startsWith(selectedYear),
  )
  const attended = personalConcerts
    .filter(
      (c) =>
        c.status === 'Attended' &&
        (selectedYear === 'all' || c.date.startsWith(selectedYear)),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
  const today = new Date()
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const featured = selectFeaturedConcert(personalConcerts, localDate)
  const palette =
    selectedYear === 'all' ? 0 : Number(selectedYear) % palettes.length
  return (
    <main
      className="stage-page"
      data-motion={disabled || replay ? 'off' : 'on'}
      style={{ '--stage-accent': palettes[palette] } as CSSProperties}
    >
      <div className="stage-toolbar">
        <a href="/?view=classic" onClick={onClassic}>
          <ArrowLeft size={15} />
          Classic view
        </a>
        <MotionToggle />
      </div>
      <StageHero concert={featured} onOpen={onOpen} onAdd={onAdd} />
      <ConcertRibbon concerts={allConcerts} onOpen={onOpen} />
      <section
        className="stage-archive"
        id="stage-archive"
        aria-labelledby="stage-archive-title"
      >
        <div className="stage-archive-head">
          <div>
            <span className="stage-eyebrow">Concert archive</span>
            <h2 id="stage-archive-title">Your shows.</h2>
          </div>
          <button
            ref={replayButton}
            type="button"
            className="stage-replay-launch"
            disabled={!attended.length}
            onClick={() => setReplay(true)}
          >
            <Play size={15} />
            Replay{selectedYear === 'all' ? '' : ` ${selectedYear}`}
          </button>
        </div>
        <div
          className="stage-year-tabs"
          role="group"
          aria-label="Filter by year"
        >
          {['all', ...years].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={selectedYear === value}
              onClick={() => setYear(value)}
            >
              {value === 'all' ? 'All years' : value}
            </button>
          ))}
        </div>
        {children}
        <p className="stage-result-count" role="status">
          {filtered.length} {filtered.length === 1 ? 'show' : 'shows'}
        </p>
        <div className="stage-poster-area">
          <span
            key={selectedYear}
            className="stage-year-ghost"
            aria-hidden="true"
          >
            {selectedYear === 'all' ? 'ENCORE' : selectedYear}
          </span>
          {filtered.length ? (
            <div className="stage-posters">
              {filtered.map((concert) => (
                <div className="stage-poster" key={concert.id}>
                  {concert.image ? (
                    <img
                      className="stage-poster-glow"
                      alt=""
                      src={resizeArtwork(concert.image, 300)}
                      loading="lazy"
                    />
                  ) : null}
                  <Tilt className="stage-poster-tilt">
                    <button
                      type="button"
                      className="stage-poster-open"
                      id={`stage-open-${concert.id}`}
                      aria-label={`Open ${concert.artist} concert`}
                      onClick={() => onOpen(concert)}
                    >
                      <span className="stage-poster-image">
                        {concert.image ? (
                          <img
                            src={resizeArtwork(concert.image, 640)}
                            srcSet={artworkSrcSet(
                              concert.image,
                              [300, 640, 960],
                            )}
                            sizes="(max-width: 700px) 44vw, 28vw"
                            alt=""
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                          />
                        ) : (
                          <span className="stage-art-fallback">
                            <Music2 size={64} />
                          </span>
                        )}
                        <span className="stage-poster-shade" />
                        {concert.personal_rating != null ? (
                          <span className="stage-poster-rating" aria-label={`Rating: ${concert.personal_rating}`}>
                            {concert.personal_rating}
                          </span>
                        ) : (
                          <span className="stage-poster-status">{concert.status}</span>
                        )}
                        <strong className="stage-poster-title">
                          {concert.artist}
                        </strong>
                      </span>
                      <span className="stage-poster-meta">
                        <span>{venueName(concert.venue)}</span>
                        <span>{stageDate(concert.date)}</span>
                      </span>
                    </button>
                  </Tilt>
                </div>
              ))}
            </div>
          ) : (
            <div className="stage-empty">
              <h3>
                {allConcerts.length
                  ? 'No matching shows.'
                  : 'Add your first concert.'}
              </h3>
              {allConcerts.length ? (
                <p>Try another year or clear a filter.</p>
              ) : (
                <button type="button" className="stage-action" onClick={onAdd}>
                  Add concert
                </button>
              )}
            </div>
          )}
        </div>
      </section>
      {replay ? (
        <StageReplay
          concerts={attended}
          period={selectedYear}
          onClose={() => {
            setReplay(false)
            requestAnimationFrame(() => replayButton.current?.focus())
          }}
        />
      ) : null}
    </main>
  )
}
