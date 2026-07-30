import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { ArrowLeft, BookOpenText, Disc3, ExternalLink, Pencil, Star } from 'lucide-react'
import type { Album, AlbumReview, MemberSummary } from '../types'
import { MarkdownReview } from './MarkdownReview'

interface AlbumJournalProps {
  album: Album
  currentUserId: string
  members: MemberSummary[]
  onBack: () => void
  onEdit: () => void
}

const formatDuration = (durationMs: number) => {
  const seconds = Math.round(durationMs / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const albumDuration = (durationMs: number) => {
  const minutes = Math.round(durationMs / 60000)
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

const reviewDate = (review: AlbumReview) => new Intl.DateTimeFormat('en-CA', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
}).format(new Date(review.published_at || review.updated_at))

export function AlbumJournal({
  album,
  currentUserId,
  members,
  onBack,
  onEdit,
}: AlbumJournalProps) {
  const personalReview = album.reviews.find((review) => review.reviewer_user_id === currentUserId)
  const initialReviewer = personalReview?.reviewer_user_id
    ?? album.reviews[0]?.reviewer_user_id
    ?? currentUserId
  const [reviewerId, setReviewerId] = useState(initialReviewer)

  useEffect(() => setReviewerId(initialReviewer), [album.id, initialReviewer])

  const selectedReview = album.reviews.find((review) => review.reviewer_user_id === reviewerId)
  const trackReviewMap = useMemo(() => new Map(
    selectedReview?.track_reviews.map((review) => [review.album_track_id, review]) ?? [],
  ), [selectedReview])
  const reviewedByIds = new Set(album.reviews.map((review) => review.reviewer_user_id))
  const reviewMembers = members.filter((member) =>
    member.user_id === currentUserId || reviewedByIds.has(member.user_id),
  )
  const headerStyle = album.image_url
    ? ({ '--album-art': `url("${album.image_url.replaceAll('"', '\\"')}")` } as CSSProperties)
    : undefined

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + direction + reviewMembers.length) % reviewMembers.length
    setReviewerId(reviewMembers[nextIndex].user_id)
    document.getElementById(`album-review-tab-${reviewMembers[nextIndex].user_id}`)?.focus()
  }

  return (
    <main className="album-journal" style={headerStyle}>
      <section className="album-journal-hero">
        <button className="album-back-button" type="button" onClick={onBack}>
          <ArrowLeft size={18} />Back to albums
        </button>
        <div className="album-journal-identity">
          <span className="album-journal-art">
            {album.image_url
              ? <img src={album.image_url} alt={`${album.title} album cover`} />
              : <Disc3 size={54} aria-hidden="true" />}
          </span>
          <header>
            <h1 data-view-heading tabIndex={-1}>{album.title}</h1>
            <p>{album.artist}</p>
            <div>
              {album.release_date ? <span>{album.release_date.slice(0, 4)}</span> : null}
              <span>{album.total_tracks} tracks</span>
              <span>{albumDuration(album.duration_ms)}</span>
              {album.label ? <span>{album.label}</span> : null}
            </div>
            {album.genres.length ? <small>{album.genres.join(' · ')}</small> : null}
            {album.spotify_url ? (
              <a href={album.spotify_url} target="_blank" rel="noreferrer">
                Open in Spotify <ExternalLink size={14} />
              </a>
            ) : null}
          </header>
        </div>
        <div className="album-overall-score">
          <span>Your overall score</span>
          <strong>{personalReview?.overall_score ?? 'N/A'}</strong>
          <small>{personalReview?.overall_score === null || personalReview?.overall_score === undefined ? 'Not scored yet' : '/10'}</small>
        </div>
      </section>

      <div className="album-review-tabs" role="tablist" aria-label="Album reviews">
        {reviewMembers.map((member, index) => {
          const active = reviewerId === member.user_id
          const hasReview = reviewedByIds.has(member.user_id)
          return (
            <button
              id={`album-review-tab-${member.user_id}`}
              key={member.user_id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="album-review-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => setReviewerId(member.user_id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              <span aria-hidden="true">{member.display_name.slice(0, 1)}</span>
              {member.user_id === currentUserId ? 'Your review' : `${member.display_name}'s review`}
              {!hasReview ? <small>Not written</small> : null}
            </button>
          )
        })}
      </div>

      <div className="album-journal-layout" id="album-review-panel" role="tabpanel">
        <section className="album-track-journal" aria-labelledby="original-tracklist-title">
          <header>
            <div>
              <h2 id="original-tracklist-title">Original tracklist</h2>
              <p>Personal rank never changes album order.</p>
            </div>
            <span>{selectedReview?.track_reviews.filter((row) => row.personal_rank !== null).length ?? 0} ranked</span>
          </header>
          <div className="album-track-table" role="table" aria-label={`${album.title} tracklist`}>
            <div className="album-track-table-head" role="row">
              <span role="columnheader">Track</span>
              <span role="columnheader">Your rank</span>
              <span role="columnheader">Score</span>
              <span role="columnheader">Note</span>
            </div>
            {album.tracks.map((track) => {
              const review = trackReviewMap.get(track.id)
              return (
                <div className="album-track-row" role="row" key={track.id}>
                  <div role="cell">
                    <span>{track.disc_number > 1 ? `${track.disc_number}.` : ''}{track.track_number}</span>
                    <strong>{track.title}</strong>
                    <small>{formatDuration(track.duration_ms)}</small>
                  </div>
                  <span role="cell" data-label="Personal rank">{review?.personal_rank ?? '-'}</span>
                  <span role="cell" data-label="Score">{review?.score !== null && review?.score !== undefined ? `${review.score}/10` : '-'}</span>
                  <p role="cell" data-label="Note">{review?.notes || '-'}</p>
                </div>
              )
            })}
          </div>
        </section>

        <article className="album-review-reading" aria-labelledby="selected-review-title">
          <header>
            <div>
              <span className="album-review-avatar" aria-hidden="true">{reviewMembers.find((member) => member.user_id === reviewerId)?.display_name.slice(0, 1) ?? '?'}</span>
              <div>
                <h2 id="selected-review-title">{selectedReview?.reviewer_name ?? 'No review yet'}</h2>
                {selectedReview ? <p>{selectedReview.status === 'draft' ? 'Draft saved' : `Reviewed ${reviewDate(selectedReview)}`}</p> : <p>This album is waiting for a first impression.</p>}
              </div>
            </div>
            {reviewerId === currentUserId ? (
              <button className="button button-primary" type="button" onClick={onEdit}>
                <Pencil size={16} />{selectedReview ? 'Edit review' : 'Write review'}
              </button>
            ) : null}
          </header>
          {selectedReview?.overall_score !== null && selectedReview?.overall_score !== undefined ? (
            <div className="album-reading-score"><Star size={17} fill="currentColor" /><strong>{selectedReview.overall_score}</strong><span>/10</span></div>
          ) : null}
          {selectedReview?.review_markdown
            ? <MarkdownReview markdown={selectedReview.review_markdown} />
            : (
              <div className="album-review-empty">
                <BookOpenText size={28} aria-hidden="true" />
                <h3>{reviewerId === currentUserId ? 'Start your album journal' : 'No review published yet'}</h3>
                <p>{reviewerId === currentUserId ? 'Write what stayed with you, then score or rank as many tracks as you like.' : 'Their review will appear here when it is ready.'}</p>
                {reviewerId === currentUserId ? <button className="button button-secondary" type="button" onClick={onEdit}>Write your review</button> : null}
              </div>
            )}
        </article>
      </div>
    </main>
  )
}
