import { useEffect, useMemo, useRef, useState } from 'react'
import { Image, X } from 'lucide-react'
import type {
  Concert,
  ConcertFormSubmission,
  ConcertStatus,
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
  const [imageUrl, setImageUrl] = useState(concert?.image ?? '')
  const personalReview = useMemo(
    () => concert?.reviews.find((review) => review.reviewer_user_id === currentUserId) ?? null,
    [concert, currentUserId],
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    if (open) setImageUrl(concert?.image ?? '')
  }, [concert, open])

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
        companions: String(form.get('companions') ?? '').trim() || null,
      },
      attendee_user_ids: members
        .filter((member) => form.get(`attendee-${member.user_id}`) === 'on')
        .map((member) => member.user_id),
      review,
    })
  }

  return (
    <dialog ref={dialogRef} className="concert-dialog" onClose={onClose} onCancel={onClose}>
      <form
        key={concert?.id ?? 'new-concert'}
        className="dialog-shell"
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

        <fieldset className="form-section">
          <legend>Event</legend>
          <div className="form-grid">
            <label className="field field-wide"><span>Artist</span><input name="artist" required defaultValue={concert?.artist} /></label>
            <label className="field field-wide"><span>Tour name</span><input name="tour" defaultValue={concert?.tour ?? ''} /></label>
            <label className="field"><span>Date</span><input name="date" type="date" required defaultValue={concert?.date} /></label>
            <label className="field"><span>Status</span><select name="status" defaultValue={concert?.status ?? 'Want to Go'}><option>Want to Go</option><option>Attended</option><option>Cancelled</option></select></label>
            <label className="field field-wide"><span>Venue</span><input name="venue" required defaultValue={concert?.venue} /></label>
            <label className="field"><span>Price</span><input name="price" type="number" min="0" step="0.01" defaultValue={concert?.price ?? ''} /></label>
            <label className="field"><span>Projected rating</span><input name="projected" type="number" min="0" step="0.1" defaultValue={concert?.projected ?? ''} /></label>
            <label className="field"><span>Genre</span><input name="genre" defaultValue={concert?.genre ?? ''} /></label>
            <label className="field"><span>Type</span><input name="type" defaultValue={concert?.type ?? 'Concert'} /></label>
            <label className="field field-wide"><span>Seat</span><input name="seat" defaultValue={concert?.seat ?? ''} /></label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Attendance</legend>
          <div className="attendance-options">
            {members.map((member) => {
              const checked = member.user_id === currentUserId || concert?.attendees.some(
                (attendee) => attendee.user_id === member.user_id && attendee.attendance_status !== 'Did Not Attend',
              )
              return <label className="check-field" key={member.user_id}><input name={`attendee-${member.user_id}`} type="checkbox" defaultChecked={checked} /><span>{member.display_name} attended</span></label>
            })}
          </div>
          <label className="field"><span>Other companions</span><input name="companions" defaultValue={concert?.companions ?? ''} /></label>
        </fieldset>

        <fieldset className="form-section">
          <legend>Your review</legend>
          <div className="score-grid">
            <label className="field"><span>Enjoyment</span><input name="enjoyment" type="number" min="0" step="0.1" defaultValue={personalReview?.enjoyment_score ?? ''} /></label>
            <label className="field"><span>Stage</span><input name="stage" type="number" min="0" step="0.1" defaultValue={personalReview?.stage_score ?? ''} /></label>
            <label className="field"><span>Setlist</span><input name="setlist" type="number" min="0" step="0.1" defaultValue={personalReview?.setlist_score ?? ''} /></label>
            <label className="field"><span>Seat</span><input name="seatScore" type="number" min="0" step="0.1" defaultValue={personalReview?.seat_score ?? ''} /></label>
          </div>
          {personalReview?.is_overridden ? <p className="override-note">Historical override: {personalReview.override_rating}/10. Component edits remain visible, while the documented override stays authoritative.</p> : null}
          <label className="field"><span>Review notes</span><textarea name="reviewNotes" rows={3} defaultValue={personalReview?.notes ?? ''} /></label>
        </fieldset>

        <fieldset className="form-section">
          <legend>Details</legend>
          <div className="form-grid">
            <label className="field field-wide"><span>Artwork URL</span><input name="image" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label>
            <div className="image-preview field-wide">
              {imageUrl ? <img src={imageUrl} alt="Artwork preview" /> : <span><Image size={18} />No artwork selected</span>}
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
      </form>
    </dialog>
  )
}
