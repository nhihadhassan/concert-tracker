import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Image, LoaderCircle, Search, X } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { searchArtwork } from '../lib/api'
import type { ArtworkOption, Concert } from '../types'

interface ArtworkDialogProps {
  concert: Concert | null
  error: string
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (concert: Concert, image: string | null) => Promise<void>
}

const cleanArtistName = (value: string) => value
  .replace(/\b(19|20)\d{2}\b/g, ' ')
  .split(/\s+(?:ft\.?|feat\.?|x|&|,|\/)\s+/i)[0]
  .replace(/\s+/g, ' ')
  .trim()

export function ArtworkDialog({
  concert,
  error,
  open,
  saving,
  onClose,
  onSave,
}: ArtworkDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const artworkRequest = useRef<AbortController | null>(null)
  const [imageUrl, setImageUrl] = useState(concert?.image ?? '')
  const [artworkQuery, setArtworkQuery] = useState('')
  const [artworkResults, setArtworkResults] = useState<ArtworkOption[]>([])
  const [artworkLoading, setArtworkLoading] = useState(false)
  const [artworkError, setArtworkError] = useState('')

  const loadArtwork = useCallback(async (query: string) => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      setArtworkResults([])
      setArtworkError('Enter an artist, album, or tour name.')
      return
    }
    artworkRequest.current?.abort()
    const controller = new AbortController()
    artworkRequest.current = controller
    setArtworkLoading(true)
    setArtworkError('')
    try {
      const response = await searchArtwork(trimmedQuery, controller.signal)
      setArtworkResults(response.results)
      if (!response.results.length) setArtworkError('No artwork found. Try just the artist name.')
    } catch (searchError) {
      if (searchError instanceof DOMException && searchError.name === 'AbortError') return
      setArtworkResults([])
      setArtworkError('Artwork search failed. You can retry or paste an image URL.')
    } finally {
      if (artworkRequest.current === controller) setArtworkLoading(false)
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    if (open && concert) {
      setImageUrl(concert.image ?? '')
      const initialQuery = [cleanArtistName(concert.artist), concert.tour].filter(Boolean).join(' ')
      setArtworkQuery(initialQuery)
      setArtworkResults([])
      setArtworkError('')
      if (initialQuery) void loadArtwork(initialQuery)
    }
    return () => artworkRequest.current?.abort()
  }, [concert, loadArtwork, open])

  const searchArtistOnly = () => {
    if (!concert) return
    const query = cleanArtistName(concert.artist)
    setArtworkQuery(query)
    void loadArtwork(query)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!concert) return
    await onSave(concert, imageUrl.trim() || null)
  }

  return (
    <dialog ref={dialogRef} className="concert-dialog artwork-dialog" onClose={onClose} onCancel={onClose}>
      <m.form
        key={concert?.id ?? 'artwork'}
        className="dialog-shell artwork-dialog-shell"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="dialog-head">
          <div>
            <h2>Choose artwork</h2>
            <p>{concert ? `${concert.artist}${concert.tour ? ` · ${concert.tour}` : ''}` : 'Search Apple Music artwork.'}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Close" aria-label="Close artwork picker">
            <X size={20} />
          </button>
        </div>

        <div className="artwork-picker artwork-picker-fast">
          <div className="artwork-search-row">
            <label className="field"><span>Search artwork</span><span className="input-with-icon"><Search size={16} /><input type="search" value={artworkQuery} placeholder="Artist, album, or tour" onChange={(event) => setArtworkQuery(event.target.value)} onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              void loadArtwork(artworkQuery)
            }} /></span></label>
            <button className="button button-secondary" type="button" disabled={artworkLoading} onClick={() => void loadArtwork(artworkQuery)}>{artworkLoading ? <LoaderCircle className="artwork-spinner" size={16} /> : <Search size={16} />}{artworkLoading ? 'Searching...' : 'Search'}</button>
          </div>
          <button className="text-action artwork-artist-only" type="button" onClick={searchArtistOnly}>Try artist name only</button>
          {artworkError ? <p className="artwork-search-status" role="status">{artworkError}</p> : null}
          {artworkResults.length ? <div className="artwork-results artwork-results-large" aria-label="Artwork options">{artworkResults.map((option) => <button key={option.url} type="button" className={imageUrl === option.url ? 'selected' : ''} aria-label={`Use ${option.title} artwork`} aria-pressed={imageUrl === option.url} title={`${option.title} by ${option.artist}`} onClick={() => setImageUrl(option.url)}><img src={option.url} alt="" loading="lazy" />{imageUrl === option.url ? <span><Check size={16} />Selected</span> : null}</button>)}</div> : null}
        </div>

        <label className="field"><span>Artwork URL</span><input name="image" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label>
        <div className="image-preview artwork-preview-large">
          <AnimatePresence mode="wait" initial={false}>{imageUrl ? <m.img key={imageUrl} src={imageUrl} alt={`${concert?.artist ?? 'Concert'} artwork preview`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /> : <m.span key="empty-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Image size={18} />No artwork selected</m.span>}</AnimatePresence>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          {imageUrl ? <button className="button button-secondary" type="button" onClick={() => setImageUrl('')}>Remove image</button> : <span />}
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save image'}</button>
        </div>
      </m.form>
    </dialog>
  )
}
