import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Eye,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Save,
  Send,
  X,
} from 'lucide-react'
import { MarkdownReview } from './MarkdownReview'
import type {
  Album,
  AlbumReview,
  AlbumReviewWrite,
  AlbumTrack,
  AlbumTrackReviewWrite,
} from '../types'

interface AlbumReviewStudioProps {
  album: Album
  currentUserId: string
  error: string
  saving: boolean
  onCancel: () => void
  onSave: (review: AlbumReviewWrite) => Promise<void>
}

interface TrackDraft {
  id: string
  rank: string
  score: string
  notes: string
}

const numberOrNull = (value: string) => value.trim() ? Number(value) : null

const initialTrackDrafts = (album: Album, review: AlbumReview | undefined) =>
  Object.fromEntries(album.tracks.map((track) => {
    const value = review?.track_reviews.find((row) => row.album_track_id === track.id)
    return [track.id, {
      id: value?.id ?? crypto.randomUUID(),
      rank: value?.personal_rank?.toString() ?? '',
      score: value?.score?.toString() ?? '',
      notes: value?.notes ?? '',
    }]
  }))

export function AlbumReviewStudio({
  album,
  currentUserId,
  error,
  saving,
  onCancel,
  onSave,
}: AlbumReviewStudioProps) {
  const personalReview = album.reviews.find((review) => review.reviewer_user_id === currentUserId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [markdown, setMarkdown] = useState(personalReview?.review_markdown ?? '')
  const [overallScore, setOverallScore] = useState(personalReview?.overall_score?.toString() ?? '')
  const [preview, setPreview] = useState(false)
  const [localError, setLocalError] = useState('')
  const [tracks, setTracks] = useState<Record<string, TrackDraft>>(
    () => initialTrackDrafts(album, personalReview),
  )

  useEffect(() => {
    setMarkdown(personalReview?.review_markdown ?? '')
    setOverallScore(personalReview?.overall_score?.toString() ?? '')
    setTracks(initialTrackDrafts(album, personalReview))
    setLocalError('')
  }, [album, personalReview])

  const rankedTracks = useMemo(() => album.tracks
    .filter((track) => numberOrNull(tracks[track.id]?.rank ?? '') !== null)
    .sort((left, right) => (
      numberOrNull(tracks[left.id].rank)! - numberOrNull(tracks[right.id].rank)!
    )), [album.tracks, tracks])

  const updateTrack = (trackId: string, patch: Partial<TrackDraft>) => {
    setTracks((current) => ({
      ...current,
      [trackId]: { ...current[trackId], ...patch },
    }))
  }

  const moveRank = (track: AlbumTrack, direction: -1 | 1) => {
    const currentRank = numberOrNull(tracks[track.id].rank)
    if (currentRank === null) {
      updateTrack(track.id, { rank: String(rankedTracks.length + 1) })
      return
    }
    const index = rankedTracks.findIndex((row) => row.id === track.id)
    const target = rankedTracks[index + direction]
    if (!target) return
    const targetRank = tracks[target.id].rank
    updateTrack(track.id, { rank: targetRank })
    updateTrack(target.id, { rank: String(currentRank) })
  }

  const applyFormat = (
    before: string,
    after = before,
    placeholder = 'text',
    linePrefix = false,
  ) => {
    const field = textareaRef.current
    if (!field) return
    const start = field.selectionStart
    const end = field.selectionEnd
    const selected = markdown.slice(start, end) || placeholder
    const insertion = linePrefix
      ? selected.split('\n').map((line) => `${before}${line}`).join('\n')
      : `${before}${selected}${after}`
    const next = `${markdown.slice(0, start)}${insertion}${markdown.slice(end)}`
    setMarkdown(next)
    window.requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(start + before.length, start + insertion.length - after.length)
    })
  }

  const submit = async (status: 'draft' | 'published') => {
    setLocalError('')
    const rankValues = album.tracks
      .map((track) => numberOrNull(tracks[track.id].rank))
      .filter((value): value is number => value !== null)
    if (rankValues.some((value) => !Number.isInteger(value) || value < 1)) {
      setLocalError('Track ranks need to be whole numbers greater than zero.')
      return
    }
    if (new Set(rankValues).size !== rankValues.length) {
      setLocalError('Each ranked song needs a unique position.')
      return
    }
    if (status === 'published' && !markdown.trim()) {
      setLocalError('Write something about the album before publishing your review.')
      return
    }
    const trackReviews: AlbumTrackReviewWrite[] = album.tracks.map((track) => ({
      id: tracks[track.id].id,
      album_track_id: track.id,
      personal_rank: numberOrNull(tracks[track.id].rank),
      score: numberOrNull(tracks[track.id].score),
      notes: tracks[track.id].notes.trim() || null,
    }))
    await onSave({
      id: personalReview?.id ?? crypto.randomUUID(),
      expected_row_version: personalReview?.row_version ?? null,
      overall_score: numberOrNull(overallScore),
      review_markdown: markdown.trim() || null,
      status,
      track_reviews: trackReviews,
    })
  }

  return (
    <main className="album-studio">
      <header className="album-studio-header">
        <div>
          {album.image_url
            ? <img src={album.image_url} alt="" />
            : null}
          <div>
            <span>Editing album review</span>
            <h1 data-view-heading tabIndex={-1}>{album.title}</h1>
            <p>{album.artist}</p>
          </div>
        </div>
        <button className="button button-secondary" type="button" onClick={onCancel}>
          <X size={17} />Close editor
        </button>
      </header>

      <div className="album-studio-layout">
        <section className="album-writing-pane" aria-labelledby="album-writing-title">
          <div className="album-pane-heading">
            <div>
              <h2 id="album-writing-title">Write your review</h2>
              <p>Use simple formatting to shape a readable journal entry.</p>
            </div>
            <button
              className="text-action"
              type="button"
              aria-pressed={preview}
              onClick={() => setPreview((value) => !value)}
            >
              <Eye size={16} />{preview ? 'Keep writing' : 'Preview review'}
            </button>
          </div>

          <label className="field album-score-field">
            <span>Overall score</span>
            <span><input type="number" min="0" max="10" step="0.1" value={overallScore} onChange={(event) => setOverallScore(event.target.value)} /><b>/10</b></span>
          </label>

          {preview ? (
            markdown.trim()
              ? <MarkdownReview markdown={markdown} />
              : <div className="album-preview-empty">Your formatted review will appear here.</div>
          ) : (
            <>
              <div className="markdown-toolbar" role="toolbar" aria-label="Review formatting">
                <button type="button" onClick={() => applyFormat('## ', '', 'Heading', true)} aria-label="Add heading"><Heading2 size={17} /></button>
                <button type="button" onClick={() => applyFormat('**', '**', 'bold text')} aria-label="Bold"><Bold size={17} /></button>
                <button type="button" onClick={() => applyFormat('*', '*', 'italic text')} aria-label="Italic"><Italic size={17} /></button>
                <button type="button" onClick={() => applyFormat('> ', '', 'Quote', true)} aria-label="Block quote"><Quote size={17} /></button>
                <button type="button" onClick={() => applyFormat('- ', '', 'List item', true)} aria-label="Bulleted list"><List size={17} /></button>
                <button type="button" onClick={() => applyFormat('1. ', '', 'List item', true)} aria-label="Numbered list"><ListOrdered size={17} /></button>
                <button type="button" onClick={() => applyFormat('[', '](https://)', 'link text')} aria-label="Add link"><Link size={17} /></button>
              </div>
              <label className="field album-markdown-field">
                <span>Review</span>
                <textarea
                  ref={textareaRef}
                  rows={18}
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                  placeholder="What stayed with you after the last track ended?"
                />
              </label>
              <p className="markdown-help">Headings, emphasis, quotes, lists, and links are supported.</p>
            </>
          )}
        </section>

        <section className="album-track-editor" aria-labelledby="track-editor-title">
          <div className="album-pane-heading">
            <div>
              <h2 id="track-editor-title">Track notes</h2>
              <p>Original order stays fixed. Your ranking is personal.</p>
            </div>
            <span>{rankedTracks.length} ranked</span>
          </div>
          <div className="track-editor-head" aria-hidden="true">
            <span>Track</span><span>Score</span><span>Rank</span><span>Note</span>
          </div>
          <div className="track-editor-list">
            {album.tracks.map((track) => {
              const draft = tracks[track.id]
              const rankIndex = rankedTracks.findIndex((row) => row.id === track.id)
              return (
                <article key={track.id}>
                  <div className="track-title-cell">
                    <span>{track.disc_number > 1 ? `${track.disc_number}.` : ''}{track.track_number}</span>
                    <strong>{track.title}</strong>
                  </div>
                  <label>
                    <span>Score for {track.title}</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={draft.score}
                      onChange={(event) => updateTrack(track.id, { score: event.target.value })}
                      aria-label={`${track.title} score`}
                    />
                  </label>
                  <div className="track-rank-control">
                    <label>
                      <span>Personal rank for {track.title}</span>
                      <input
                        type="number"
                        min="1"
                        max={album.tracks.length}
                        step="1"
                        value={draft.rank}
                        onChange={(event) => updateTrack(track.id, { rank: event.target.value })}
                        aria-label={`${track.title} personal rank`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => moveRank(track, -1)}
                      disabled={rankIndex === 0}
                      aria-label={rankIndex < 0 ? `Add ${track.title} to ranking` : `Move ${track.title} up`}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRank(track, 1)}
                      disabled={rankIndex < 0 || rankIndex === rankedTracks.length - 1}
                      aria-label={`Move ${track.title} down`}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <label className="track-note-field">
                    <span>Short note for {track.title}</span>
                    <input
                      value={draft.notes}
                      maxLength={1000}
                      onChange={(event) => updateTrack(track.id, { notes: event.target.value })}
                      placeholder="Optional note"
                      aria-label={`${track.title} short note`}
                    />
                  </label>
                </article>
              )
            })}
          </div>
        </section>
      </div>

      <footer className="album-studio-actions">
        <div>
          {(localError || error) ? <p role="alert">{localError || error}</p> : <span>{personalReview ? `Last saved as ${personalReview.status}` : 'Not saved yet'}</span>}
        </div>
        <button className="button button-secondary" type="button" disabled={saving} onClick={() => void submit('draft')}>
          <Save size={17} />{saving ? 'Saving draft' : 'Save draft'}
        </button>
        <button className="button button-primary" type="button" disabled={saving} onClick={() => void submit('published')}>
          <Send size={17} />{saving ? 'Publishing' : 'Publish review'}
        </button>
      </footer>
    </main>
  )
}
