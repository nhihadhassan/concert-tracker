import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Disc3 } from 'lucide-react'
import type { Album } from '../../types'
import { ArtworkTilt } from './ArtworkTilt'
import { MotionToggle } from './CinematicMotion'
import { useCinematicMotion, useCinematicScene } from '../../hooks/useCinematicMotion'

export function RecordRoom({ albums, onOpen }: { albums: Album[]; onOpen: (album: Album) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try { return sessionStorage.getItem('encore-selected-record') } catch { return null }
  })
  const { disabled } = useCinematicMotion()
  const { ref, playing } = useCinematicScene()
  const selected = Math.max(0, albums.findIndex(album => album.id === selectedId))
  const album = albums[selected]
  const focusSelected = useRef(false)
  useEffect(() => {
    if (focusSelected.current && album) {
      document.getElementById(`album-open-${album.id}`)?.focus({ preventScroll: true })
      focusSelected.current = false
    }
  }, [album])
  if (!album) return null
  const choose = (index: number) => {
    const next = albums[Math.max(0, Math.min(albums.length - 1, index))]
    setSelectedId(next.id)
    try { sessionStorage.setItem('encore-selected-record', next.id) } catch { /* Storage is optional. */ }
  }
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      focusSelected.current = true
      choose(selected + (event.key === 'ArrowRight' ? 1 : -1))
    }
  }
  return <section ref={ref} className="record-room record-room-stage" aria-label="Record room" onKeyDown={keyDown} data-motion={disabled ? 'off' : 'on'} data-playing={playing}>
    <div className="companion-atmosphere" aria-hidden="true" />
    <MotionToggle />
    <div className="record-stage-hero">
      <div className="record-stage-copy">
        <h2>Record<span className="companion-outline">room.</span></h2>
        <div className="record-stage-caption" aria-live="polite" aria-atomic="true">
          <strong>{album.title}</strong><span>{album.artist}</span>
          <small>{album.release_date?.slice(0, 4) ?? 'Date unknown'} · {album.total_tracks} tracks</small>
        </div>
        <button className="button button-primary" type="button" onClick={() => onOpen(album)}>Open album <ArrowUpRight size={17} aria-hidden="true" /></button>
        <div className="record-stage-controls">
          <button className="cinema-arrow" type="button" aria-label="Previous album" disabled={selected === 0} onClick={() => choose(selected - 1)}><ArrowLeft size={18} /></button>
          <span>{selected + 1} / {albums.length}</span>
          <button className="cinema-arrow" type="button" aria-label="Next album" disabled={selected === albums.length - 1} onClick={() => choose(selected + 1)}><ArrowRight size={18} /></button>
        </div>
      </div>
      <div className="record-stage-art">
        <div className="record-stage-float">
          <ArtworkTilt id={`album-open-${album.id}`} className="record-room-sleeve" vinyl glowImage={album.image_url ?? undefined} label={`Open ${album.title} by ${album.artist}`} onClick={() => onOpen(album)}>
            {album.image_url ? <img src={album.image_url} alt="" draggable={false} decoding="async" /> : <span className="record-room-placeholder"><Disc3 size={60} aria-hidden="true" /></span>}
          </ArtworkTilt>
        </div>
        <div className="record-stage-floor" aria-hidden="true" />
      </div>
    </div>
    <section className="record-stage-shelf" aria-labelledby="record-shelf-title">
      <h3 id="record-shelf-title">On the shelf.</h3>
      <div className="record-stage-sleeves">
        {albums.map((record, index) => <button className="record-stage-pick" type="button" key={record.id} aria-label={`Select ${record.title} by ${record.artist}`} aria-pressed={record.id === album.id} onClick={() => choose(index)}>
          <span className="record-stage-thumb">{record.image_url ? <img src={record.image_url} alt="" loading="lazy" decoding="async" /> : <Disc3 size={36} aria-hidden="true" />}</span>
          <strong>{record.title}</strong><small>{record.artist}</small>
        </button>)}
      </div>
    </section>
  </section>
}
