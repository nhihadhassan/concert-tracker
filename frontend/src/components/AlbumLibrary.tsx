import { useState } from 'react'
import { RecordRoom } from './cinematic/RecordRoom'
import { BookOpenText, Disc3, Plus, Search } from 'lucide-react'
import type { Album } from '../types'

interface AlbumLibraryProps {
  albums: Album[]
  currentUserId: string
  error: string
  loading: boolean
  onAdd: () => void
  onOpen: (album: Album) => void
}

const albumYear = (value: string | null) => value?.slice(0, 4) || 'Date unknown'

export function AlbumLibrary({
  albums,
  currentUserId,
  error,
  loading,
  onAdd,
  onOpen,
}: AlbumLibraryProps) {
  const [view, setView] = useState<'shelf' | 'grid'>(() => {
    try { return sessionStorage.getItem('encore-album-view') === 'grid' ? 'grid' : 'shelf' } catch { return 'shelf' }
  })
  const changeView = (next: 'shelf' | 'grid') => {
    setView(next)
    try { sessionStorage.setItem('encore-album-view', next) } catch { /* Storage is optional. */ }
  }
  const reviewed = albums.filter((album) =>
    album.reviews.some((review) => review.reviewer_user_id === currentUserId),
  ).length

  return (
    <main className="album-library-shell">
      <header className="album-library-heading">
        <div>
          <span className="album-heading-icon" aria-hidden="true"><Disc3 size={21} /></span>
          <div>
            <h1 data-view-heading tabIndex={-1}>Album Journal</h1>
            <p>{albums.length ? `${reviewed} of ${albums.length} albums reviewed` : 'Add an album to get started.'}</p>
          </div>
        </div>
        <button className="button button-primary" type="button" onClick={onAdd}>
          <Plus size={18} />Find an album
        </button>
      </header>

      {error ? (
        <div className="sync-error-banner" role="status">
          {error}
          <button type="button" onClick={onAdd}>Try Spotify search</button>
        </div>
      ) : null}

      {albums.length && !loading ? <div className="album-view-switch" role="group" aria-label="Album view">
        <button type="button" aria-pressed={view === 'shelf'} onClick={() => changeView('shelf')}>Record room</button>
        <button type="button" aria-pressed={view === 'grid'} onClick={() => changeView('grid')}>Grid</button>
      </div> : null}

      {loading ? (
        <section className="album-shelf album-shelf-loading" aria-label="Loading albums">
          {[0, 1, 2, 3].map((value) => <div className="album-skeleton" key={value}><span /><i /><i /></div>)}
        </section>
      ) : albums.length ? view === 'shelf' ? (
        <RecordRoom albums={albums} onOpen={onOpen} />
      ) : (
        <section className="album-shelf" aria-label="Albums">
          {albums.map((album) => {
            const review = album.reviews.find((row) => row.reviewer_user_id === currentUserId)
            return (
              <button
                className="album-shelf-item"
                id={`album-open-${album.id}`}
                key={album.id}
                type="button"
                onClick={() => onOpen(album)}
                aria-label={`Open ${album.title} by ${album.artist}`}
              >
                <span className="album-cover">
                  {album.image_url
                    ? <img src={album.image_url} alt="" loading="lazy" decoding="async" />
                    : <Disc3 size={42} aria-hidden="true" />}
                  <span className="album-review-state">
                    {review
                      ? <><BookOpenText size={14} />{review.status === 'published' ? 'Reviewed' : 'Draft'}</>
                      : 'Not reviewed'}
                  </span>
                </span>
                <span className="album-shelf-copy">
                  <strong>{album.title}</strong>
                  <span>{album.artist}</span>
                  <small>{albumYear(album.release_date)} · {album.total_tracks} tracks{review?.overall_score !== null && review?.overall_score !== undefined ? ` · ${review.overall_score}/10` : ''}</small>
                </span>
              </button>
            )
          })}
        </section>
      ) : (
        <section className="album-empty-state">
          <span aria-hidden="true"><Search size={28} /></span>
          <h2>Find your first album</h2>
          <p>Search Spotify to add the artwork, release details, and original tracklist in one step.</p>
          <button className="button button-primary" type="button" onClick={onAdd}>
            <Search size={17} />Search Spotify
          </button>
        </section>
      )}
    </main>
  )
}
