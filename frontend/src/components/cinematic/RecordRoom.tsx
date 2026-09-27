import {
  useState,
  useRef,
  useEffect,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { ArrowLeft, ArrowRight, Disc3 } from 'lucide-react'
import type { Album } from '../../types'
import { ArtworkTilt } from './ArtworkTilt'
import { MotionToggle } from './CinematicMotion'
import { useCinematicMotion } from '../../hooks/useCinematicMotion'

export function RecordRoom({
  albums,
  onOpen,
}: {
  albums: Album[]
  onOpen: (album: Album) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('encore-selected-record')
    } catch {
      return null
    }
  })
  const { disabled } = useCinematicMotion()
  const selected = Math.max(
    0,
    albums.findIndex((album) => album.id === selectedId),
  )
  const album = albums[selected]
  const focusSelected = useRef(false)
  useEffect(() => {
    if (focusSelected.current && album) {
      document
        .getElementById(`album-open-${album.id}`)
        ?.focus({ preventScroll: true })
      focusSelected.current = false
    }
  }, [album])
  if (!album) return null
  const choose = (index: number) => {
    const next = albums[Math.max(0, Math.min(albums.length - 1, index))]
    setSelectedId(next.id)
    try {
      sessionStorage.setItem('encore-selected-record', next.id)
    } catch {
      /* Storage is optional. */
    }
  }
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      focusSelected.current = true
      choose(selected + (event.key === 'ArrowRight' ? 1 : -1))
    }
  }
  return (
    <section
      className="record-room"
      aria-label="Record room"
      onKeyDown={keyDown}
      data-motion={disabled ? 'off' : 'on'}
    >
      <MotionToggle />
      <div className="record-room-deck">
        {albums.slice(Math.max(0, selected - 2), selected + 3).map((record) => {
          const offset = albums.indexOf(record) - selected
          return (
            <div
              className="record-room-position"
              key={record.id}
              data-selected={offset === 0}
              style={
                {
                  '--record-offset': offset,
                  '--record-depth': Math.abs(offset),
                  '--record-turn':
                    offset === 0 ? '-8deg' : offset < 0 ? '38deg' : '-38deg',
                  zIndex: 5 - Math.abs(offset),
                } as CSSProperties
              }
            >
              <ArtworkTilt
                id={`album-open-${record.id}`}
                className="record-room-sleeve"
                vinyl
                glowImage={record.image_url ?? undefined}
                label={`${offset === 0 ? 'Open' : 'Select'} ${record.title} by ${record.artist}`}
                onClick={() =>
                  offset === 0 ? onOpen(record) : choose(albums.indexOf(record))
                }
              >
                {record.image_url ? (
                  <img
                    src={record.image_url}
                    alt=""
                    draggable={false}
                    decoding="async"
                    loading="lazy"
                  />
                ) : (
                  <span className="record-room-placeholder">
                    <Disc3 size={60} aria-hidden="true" />
                  </span>
                )}
              </ArtworkTilt>
            </div>
          )
        })}
      </div>
      <div className="record-room-controls">
        <button
          className="cinema-arrow"
          type="button"
          aria-label="Previous album"
          disabled={selected === 0}
          onClick={() => choose(selected - 1)}
        >
          <ArrowLeft size={18} />
        </button>
        <div
          className="record-room-caption"
          aria-live="polite"
          aria-atomic="true"
        >
          <strong>{album.title}</strong>
          <span>{album.artist}</span>
          <small>
            {selected + 1} / {albums.length}
          </small>
        </div>
        <button
          className="cinema-arrow"
          type="button"
          aria-label="Next album"
          disabled={selected === albums.length - 1}
          onClick={() => choose(selected + 1)}
        >
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  )
}
