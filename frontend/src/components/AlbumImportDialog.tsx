import { useEffect, useRef, useState } from 'react'
import { Check, Disc3, LoaderCircle, Search, X } from 'lucide-react'
import { importSpotifyAlbum, searchSpotifyAlbums } from '../lib/api'
import type { SpotifyAlbumOption } from '../types'

interface AlbumImportDialogProps {
  accessToken: string
  open: boolean
  onClose: () => void
  onImported: (albumId: string, message: string) => void
}

const resultYear = (value: string | null) => value?.slice(0, 4) || 'Unknown year'

export function AlbumImportDialog({
  accessToken,
  open,
  onClose,
  onImported,
}: AlbumImportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpotifyAlbumOption[]>([])
  const [searching, setSearching] = useState(false)
  const [importingId, setImportingId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    if (open) {
      setError('')
      setImportingId('')
    }
    return () => requestRef.current?.abort()
  }, [open])

  const search = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = query.trim()
    if (value.length < 2) {
      setError('Enter at least two letters from an album or artist name.')
      return
    }
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setSearching(true)
    setError('')
    try {
      const response = await searchSpotifyAlbums(accessToken, value, controller.signal)
      setResults(response.results)
      if (!response.results.length) {
        setError('Spotify did not find a matching album. Try the artist and album title together.')
      }
    } catch (searchError) {
      if (searchError instanceof DOMException && searchError.name === 'AbortError') return
      setResults([])
      setError(searchError instanceof Error ? searchError.message : 'Spotify search failed. Try again.')
    } finally {
      if (requestRef.current === controller) setSearching(false)
    }
  }

  const importAlbum = async (album: SpotifyAlbumOption) => {
    setImportingId(album.spotify_album_id)
    setError('')
    try {
      const response = await importSpotifyAlbum(accessToken, album.spotify_album_id)
      onImported(response.album_id, response.message)
      setQuery('')
      setResults([])
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'The album could not be imported.')
    } finally {
      setImportingId('')
    }
  }

  return (
    <dialog ref={dialogRef} className="album-import-dialog" onCancel={onClose} onClose={onClose}>
      <div className="album-import-shell">
        <header>
          <div>
            <h2>Find an album</h2>
            <p>Spotify supplies the artwork, release details, and original track order.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close album search">
            <X size={20} />
          </button>
        </header>

        <form className="album-search-form" onSubmit={(event) => void search(event)}>
          <label htmlFor="album-search">Album or artist</label>
          <div>
            <Search size={18} aria-hidden="true" />
            <input
              id="album-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. In Rainbows Radiohead"
              autoComplete="off"
              autoFocus
            />
            <button className="button button-primary" type="submit" disabled={searching}>
              {searching ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}
              {searching ? 'Searching' : 'Search Spotify'}
            </button>
          </div>
        </form>

        {error ? <p className="album-import-error" role="alert">{error}</p> : null}

        <div className="album-search-results" aria-live="polite">
          {results.map((album) => (
            <article key={album.spotify_album_id}>
              <span className="album-search-art">
                {album.image_url
                  ? <img src={album.image_url} alt="" />
                  : <Disc3 size={28} aria-hidden="true" />}
              </span>
              <div>
                <h3>{album.title}</h3>
                <p>{album.artist}</p>
                <small>{resultYear(album.release_date)} · {album.total_tracks} tracks · {album.album_type}</small>
              </div>
              <button
                className="button button-secondary"
                type="button"
                disabled={Boolean(importingId)}
                onClick={() => void importAlbum(album)}
              >
                {importingId === album.spotify_album_id
                  ? <><LoaderCircle className="spin" size={16} />Adding</>
                  : <><Check size={16} />Add album</>}
              </button>
            </article>
          ))}
        </div>
      </div>
    </dialog>
  )
}
