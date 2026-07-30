import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Image, LoaderCircle, Search, Sparkles, X } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { searchArtwork, searchConcertSuggestions } from '../lib/api'
import { addGuests, parseGuests, serializeGuests } from '../lib/guests'
import type {
  ArtworkOption,
  Concert,
  ConcertFormSubmission,
  ConcertStatus,
  ConcertSuggestion,
  ConcertSuggestionMode,
  MemberSummary,
  ReviewWrite,
} from '../types'

interface ConcertDialogProps {
  concert: Concert | null
  currentUserId: string
  error: string
  members: MemberSummary[]
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (submission: ConcertFormSubmission) => Promise<void>
}

const numberOrNull = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim()
  return text ? Number(text) : null
}

const cleanArtistName = (value: string) => value
  .replace(/\b(19|20)\d{2}\b/g, ' ')
  .split(/\s+(?:ft\.?|feat\.?|x|&|,|\/)\s+/i)[0]
  .replace(/\s+/g, ' ')
  .trim()

export function AddConcertDialog({
  concert,
  currentUserId,
  error,
  members,
  open,
  saving,
  onClose,
  onSave,
}: ConcertDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const artworkRequest = useRef<AbortController | null>(null)
  const suggestionRequest = useRef<AbortController | null>(null)
  const [imageUrl, setImageUrl] = useState(concert?.image ?? '')
  const [artworkQuery, setArtworkQuery] = useState('')
  const [artworkResults, setArtworkResults] = useState<ArtworkOption[]>([])
  const [artworkLoading, setArtworkLoading] = useState(false)
  const [artworkError, setArtworkError] = useState('')
  const [suggestQuery, setSuggestQuery] = useState('')
  const [suggestMode, setSuggestMode] = useState<ConcertSuggestionMode>('upcoming')
  const [suggestions, setSuggestions] = useState<ConcertSuggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestMessage, setSuggestMessage] = useState('')
  const [appliedSuggestion, setAppliedSuggestion] = useState<string | null>(null)
  const [guests, setGuests] = useState<string[]>(() => parseGuests(concert?.companions))
  const [guestDraft, setGuestDraft] = useState('')
  const personalReview = useMemo(
    () => concert?.reviews.find((review) => review.reviewer_user_id === currentUserId) ?? null,
    [concert, currentUserId],
  )

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
      if (!response.results.length) setArtworkError('No artwork found. Try an album or tour name.')
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
    if (open) {
      setImageUrl(concert?.image ?? '')
      const initialQuery = concert
        ? [cleanArtistName(concert.artist), concert.tour].filter(Boolean).join(' ')
        : ''
      setArtworkQuery(initialQuery)
      setArtworkResults([])
      setArtworkError('')
      setSuggestQuery('')
      setSuggestMode('upcoming')
      setSuggestions([])
      setSuggestMessage('')
      setSuggestLoading(false)
      setAppliedSuggestion(null)
      setGuests(parseGuests(concert?.companions))
      setGuestDraft('')
      if (initialQuery) void loadArtwork(initialQuery)
    }
    return () => {
      artworkRequest.current?.abort()
      suggestionRequest.current?.abort()
    }
  }, [concert, loadArtwork, open])

  const loadSuggestions = useCallback(async (artistName: string, mode: ConcertSuggestionMode) => {
    const trimmed = artistName.trim()
    if (!trimmed) return
    suggestionRequest.current?.abort()
    const controller = new AbortController()
    suggestionRequest.current = controller
    setSuggestLoading(true)
    setSuggestMessage('')
    setSuggestions([])
    try {
      const response = await searchConcertSuggestions(trimmed, mode, controller.signal)
      if (controller.signal.aborted) return
      if (!response.configured) {
        setSuggestMessage(mode === 'past'
          ? 'Past-show lookup is not configured yet.'
          : 'Upcoming-show lookup is not configured yet.')
      } else if (!response.results.length) {
        setSuggestMessage(mode === 'past'
          ? `No past shows found for ${trimmed}.`
          : `No upcoming Toronto dates found for ${trimmed}.`)
      }
      setSuggestions(response.results)
    } catch (error) {
      if (controller.signal.aborted) return
      setSuggestMessage(error instanceof Error ? error.message : 'Show lookup failed.')
    } finally {
      if (!controller.signal.aborted) setSuggestLoading(false)
    }
  }, [])

  // The form is uncontrolled, so prefill writes straight to the inputs and
  // leaves anything the suggestion does not know about untouched.
  const applySuggestion = useCallback((suggestion: ConcertSuggestion) => {
    const form = formRef.current
    if (!form) return
    const setField = (name: string, value: string | null) => {
      if (!value) return
      const field = form.elements.namedItem(name)
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = value
    }
    setField('artist', suggestion.artist)
    setField('tour', suggestion.tour)
    setField('date', suggestion.date)
    setField('venue', suggestion.venue)
    setField('genre', suggestion.genre)
    setField('status', suggestMode === 'past' ? 'Attended' : 'Want to Go')
    if (suggestion.image) setImageUrl(suggestion.image)
    setAppliedSuggestion(`${suggestion.date}|${suggestion.venue}`)
    // setlist.fm carries no artwork, so fall back to the iTunes lookup.
    if (!artworkResults.length) void loadArtwork(cleanArtistName(suggestion.artist))
  }, [artworkResults.length, loadArtwork, suggestMode])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const reviewValues = {
      enjoyment_score: numberOrNull(form.get('enjoyment')),
      stage_score: numberOrNull(form.get('stage')),
      setlist_score: numberOrNull(form.get('setlist')),
      seat_score: numberOrNull(form.get('seatScore')),
    }
    const hasReview = Boolean(personalReview)
      || Object.values(reviewValues).some((value) => value !== null)
      || Boolean(String(form.get('reviewNotes') ?? '').trim())
    const review: ReviewWrite | null = hasReview ? {
      id: personalReview?.id ?? crypto.randomUUID(),
      expected_row_version: personalReview?.row_version ?? null,
      ...reviewValues,
      override_rating: personalReview?.override_rating ?? null,
      override_reason: personalReview?.override_reason ?? null,
      notes: String(form.get('reviewNotes') ?? '').trim() || null,
    } : null
    await onSave({
      fields: {
        artist: String(form.get('artist') ?? '').trim(),
        tour: String(form.get('tour') ?? '').trim() || null,
        date: String(form.get('date') ?? ''),
        venue: String(form.get('venue') ?? '').trim(),
        price: numberOrNull(form.get('price')),
        genre: String(form.get('genre') ?? '').trim() || null,
        projected: numberOrNull(form.get('projected')),
        seat: String(form.get('seat') ?? '').trim() || null,
        status: String(form.get('status') ?? 'Want to Go') as ConcertStatus,
        type: String(form.get('type') ?? '').trim() || 'Concert',
        spotify_url: String(form.get('spotify') ?? '').trim() || null,
        image: String(form.get('image') ?? '').trim() || null,
        notes: String(form.get('notes') ?? '').trim() || null,
        // Include a name still sitting in the input so it is not lost by
        // submitting without pressing Enter first.
        companions: serializeGuests(addGuests(guests, guestDraft)),
      },
      attendee_user_ids: members
        .filter((member) => form.get(`attendee-${member.user_id}`) === 'on')
        .map((member) => member.user_id),
      review,
    })
  }

  return (
    <dialog ref={dialogRef} className="concert-dialog" onClose={onClose} onCancel={onClose}>
      <m.form
        key={concert?.id ?? 'new-concert'}
        ref={formRef}
        className="dialog-shell"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="dialog-head">
          <div>
            <h2>{concert ? 'Edit concert' : 'Add concert'}</h2>
            <p>{concert ? 'Update the shared event and your own review.' : 'Add an event to the shared cloud library.'}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Close" aria-label="Close concert form">
            <X size={20} />
          </button>
        </div>

        <nav className="form-section-nav" aria-label="Concert form sections">
          <a href="#concert-form-event"><span>1</span>Event</a>
          <a href="#concert-form-attendance"><span>2</span>Attendance</a>
          <a href="#concert-form-review"><span>3</span>Your review</a>
          <a href="#concert-form-details"><span>4</span>Details</a>
        </nav>

        <fieldset className="form-section" id="concert-form-event">
          <legend>Event</legend>
          {concert ? null : <div className="suggest-box">
            <div className="suggest-head">
              <span className="suggest-title"><Sparkles size={14} aria-hidden="true" />Find a show to fill in</span>
              <div className="suggest-modes" role="group" aria-label="Show search mode">
                <button type="button" className={suggestMode === 'upcoming' ? 'active' : ''} aria-pressed={suggestMode === 'upcoming'} onClick={() => { setSuggestMode('upcoming'); setSuggestions([]); setSuggestMessage('') }}>Upcoming</button>
                <button type="button" className={suggestMode === 'past' ? 'active' : ''} aria-pressed={suggestMode === 'past'} onClick={() => { setSuggestMode('past'); setSuggestions([]); setSuggestMessage('') }}>Already played</button>
              </div>
            </div>
            <label className="field field-wide">
              <span className="sr-only">Artist</span>
              <span className="input-with-icon">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={suggestQuery}
                  placeholder={suggestMode === 'past' ? 'Artist you saw, e.g. Kendrick Lamar' : 'Artist coming to Toronto, e.g. Yeat'}
                  onChange={(event) => setSuggestQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    void loadSuggestions(suggestQuery, suggestMode)
                  }}
                />
              </span>
            </label>
            <button type="button" className="button button-secondary" disabled={suggestLoading || !suggestQuery.trim()} onClick={() => void loadSuggestions(suggestQuery, suggestMode)}>
              {suggestLoading ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
              {suggestLoading ? 'Searching…' : 'Search shows'}
            </button>
            {suggestMessage ? <p className="suggest-note">{suggestMessage}</p> : null}
            {suggestions.length ? <ul className="suggest-results">{suggestions.map((suggestion) => {
              const key = `${suggestion.date}|${suggestion.venue}`
              const applied = appliedSuggestion === key
              return <li key={key}>
                <button type="button" className={applied ? 'applied' : ''} aria-pressed={applied} onClick={() => applySuggestion(suggestion)}>
                  {suggestion.image
                    ? <img src={suggestion.image} alt="" loading="lazy" />
                    : <span className="suggest-art-fallback" aria-hidden="true" />}
                  <span className="suggest-meta">
                    <strong>{suggestion.tour ?? suggestion.artist}</strong>
                    <span>{suggestion.venue}{suggestion.city ? `, ${suggestion.city}` : ''}</span>
                  </span>
                  <span className="suggest-date">{suggestion.date}{applied ? <em><Check size={13} aria-hidden="true" />Filled in</em> : null}</span>
                </button>
              </li>
            })}</ul> : null}
          </div>}
          <div className="form-grid">
            <label className="field field-wide"><span>Artist</span><input name="artist" required defaultValue={concert?.artist} onBlur={(event) => {
              if (concert || artworkQuery.trim()) return
              const query = cleanArtistName(event.currentTarget.value)
              if (!query) return
              setArtworkQuery(query)
              void loadArtwork(query)
            }} /></label>
            <label className="field field-wide"><span>Tour name</span><input name="tour" defaultValue={concert?.tour ?? ''} /></label>
            <label className="field"><span>Date</span><input name="date" type="date" required defaultValue={concert?.date} /></label>
            <label className="field"><span>Status</span><select name="status" defaultValue={concert?.status ?? 'Want to Go'}><option>Want to Go</option><option>Attended</option><option>Cancelled</option></select></label>
            <label className="field field-wide"><span>Venue</span><input name="venue" required defaultValue={concert?.venue} /></label>
            <label className="field"><span>Price</span><input name="price" type="number" min="0" step="0.01" defaultValue={concert?.price ?? ''} /></label>
            <label className="field"><span>Projected rating</span><input name="projected" type="number" min="0" max="10" step="0.1" defaultValue={concert?.projected ?? ''} /></label>
            <label className="field"><span>Genre</span><input name="genre" defaultValue={concert?.genre ?? ''} /></label>
            <label className="field"><span>Type</span><input name="type" defaultValue={concert?.type ?? 'Concert'} /></label>
            <label className="field field-wide"><span>Seat</span><input name="seat" defaultValue={concert?.seat ?? ''} /></label>
          </div>
        </fieldset>

        <fieldset className="form-section" id="concert-form-attendance">
          <legend>Attendance</legend>
          <div className="attendance-options">
            {members.map((member) => {
              const checked = member.user_id === currentUserId || concert?.attendees.some(
                (attendee) => attendee.user_id === member.user_id && attendee.attendance_status !== 'Did Not Attend',
              )
              return <label className="check-field" key={member.user_id}><input name={`attendee-${member.user_id}`} type="checkbox" defaultChecked={checked} /><span>{member.display_name} attended</span></label>
            })}
          </div>
          <div className="field field-wide guest-field">
            <span className="guest-label" id="guest-label">Guests</span>
            <p className="guest-hint">Anyone who came along without an account here.</p>
            {guests.length ? <ul className="guest-chips">{guests.map((guest) => (
              <li key={guest}>
                <span>{guest}</span>
                <button type="button" aria-label={`Remove ${guest}`} onClick={() => setGuests((current) => current.filter((name) => name !== guest))}>
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            ))}</ul> : null}
            <input
              type="text"
              aria-labelledby="guest-label"
              placeholder="Add a name, then press Enter"
              value={guestDraft}
              onChange={(event) => {
                // Typing a comma commits the name, matching how the list reads.
                if (event.target.value.includes(',')) {
                  setGuests((current) => addGuests(current, event.target.value))
                  setGuestDraft('')
                  return
                }
                setGuestDraft(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  setGuests((current) => addGuests(current, guestDraft))
                  setGuestDraft('')
                  return
                }
                if (event.key === 'Backspace' && !guestDraft && guests.length) {
                  setGuests((current) => current.slice(0, -1))
                }
              }}
              onBlur={() => {
                if (!guestDraft.trim()) return
                setGuests((current) => addGuests(current, guestDraft))
                setGuestDraft('')
              }}
            />
          </div>
        </fieldset>

        <fieldset className="form-section" id="concert-form-review">
          <legend>Your review</legend>
          <div className="score-grid">
            <label className="field"><span>Enjoyment</span><input name="enjoyment" type="number" min="0" max="10" step="0.1" defaultValue={personalReview?.enjoyment_score ?? ''} /></label>
            <label className="field"><span>Stage</span><input name="stage" type="number" min="0" max="10" step="0.1" defaultValue={personalReview?.stage_score ?? ''} /></label>
            <label className="field"><span>Setlist</span><input name="setlist" type="number" min="0" max="10" step="0.1" defaultValue={personalReview?.setlist_score ?? ''} /></label>
            <label className="field"><span>Seat</span><input name="seatScore" type="number" min="0" max="10" step="0.1" defaultValue={personalReview?.seat_score ?? ''} /></label>
          </div>
          {personalReview?.is_overridden ? <p className="override-note">Historical override: {personalReview.override_rating}/10. Component edits remain visible, while the documented override stays authoritative.</p> : null}
          <label className="field"><span>Review notes</span><textarea name="reviewNotes" rows={3} defaultValue={personalReview?.notes ?? ''} /></label>
        </fieldset>

        <fieldset className="form-section" id="concert-form-details">
          <legend>Details</legend>
          <div className="form-grid">
            <div className="artwork-picker field-wide">
              <div className="artwork-picker-head">
                <div><strong>Choose artwork</strong><span>Options load automatically from Apple Music.</span></div>
                {imageUrl ? <button className="text-action" type="button" onClick={() => setImageUrl('')}>Remove artwork</button> : null}
              </div>
              <div className="artwork-search-row">
                <label className="field"><span>Search artwork</span><span className="input-with-icon"><Search size={16} /><input type="search" value={artworkQuery} placeholder="Artist, album, or tour" onChange={(event) => setArtworkQuery(event.target.value)} onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  void loadArtwork(artworkQuery)
                }} /></span></label>
                <button className="button button-secondary" type="button" disabled={artworkLoading} onClick={() => void loadArtwork(artworkQuery)}>{artworkLoading ? <LoaderCircle className="artwork-spinner" size={16} /> : <Search size={16} />}{artworkLoading ? 'Searching...' : 'Search'}</button>
              </div>
              {artworkError ? <p className="artwork-search-status" role="status">{artworkError}</p> : null}
              {artworkResults.length ? <div className="artwork-results" aria-label="Artwork options">{artworkResults.map((option) => <button key={option.url} type="button" className={imageUrl === option.url ? 'selected' : ''} aria-label={`Use ${option.title} artwork`} aria-pressed={imageUrl === option.url} title={`${option.title} by ${option.artist}`} onClick={() => setImageUrl(option.url)}><img src={option.url} alt="" loading="lazy" />{imageUrl === option.url ? <span><Check size={16} />Selected</span> : null}</button>)}</div> : null}
            </div>
            <label className="field field-wide"><span>Artwork URL</span><input name="image" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label>
            <div className="image-preview field-wide">
              <AnimatePresence mode="wait" initial={false}>{imageUrl ? <m.img key={imageUrl} src={imageUrl} alt="Artwork preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /> : <m.span key="empty-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Image size={18} />No artwork selected</m.span>}</AnimatePresence>
            </div>
            <label className="field field-wide"><span>Spotify setlist URL</span><input name="spotify" type="url" defaultValue={concert?.spotify_url ?? ''} /></label>
            <label className="field field-wide"><span>Event notes</span><textarea name="notes" rows={3} defaultValue={concert?.notes ?? ''} /></label>
          </div>
        </fieldset>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : concert ? 'Save changes' : 'Save concert'}</button>
        </div>
      </m.form>
    </dialog>
  )
}
