import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { Concert, ConcertStatus } from '../types'

interface AddConcertDialogProps {
  open: boolean
  onClose: () => void
  onSave: (concert: Concert) => void
}

export function AddConcertDialog({ open, onClose, onSave }: AddConcertDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const artist = String(form.get('artist') ?? '').trim()
    const date = String(form.get('date') ?? '')
    const venue = String(form.get('venue') ?? '').trim()
    if (!artist || !date || !venue) return

    onSave({
      id: `preview-${Date.now()}`,
      artist,
      tour: String(form.get('tour') ?? '').trim() || 'Tour details pending',
      date,
      venue,
      price: Number(form.get('price') ?? 0),
      genre: String(form.get('genre') ?? 'Other'),
      projected: null,
      realized: null,
      seat: String(form.get('seat') ?? '').trim() || 'TBD',
      status: String(form.get('status') ?? 'Want to Go') as ConcertStatus,
      companions: String(form.get('companions') ?? '').trim() || 'TBD',
      rachelAttended: form.get('rachelAttended') === 'on',
      image: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/6f/6e/5f/6f6e5f75-7a2c-91c0-6ecc-5ed0c93e89e1/842812133862.jpg/400x400bb.jpg',
      type: 'Concert',
    })
    event.currentTarget.reset()
  }

  return (
    <dialog ref={dialogRef} className="concert-dialog" onClose={onClose} onCancel={onClose}>
      <form method="dialog" className="dialog-shell" onSubmit={handleSubmit}>
        <div className="dialog-head">
          <div>
            <h2>Add concert</h2>
            <p>New entries stay in this preview until the cloud stages are approved.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Close" aria-label="Close add concert form">
            <X size={20} />
          </button>
        </div>

        <div className="form-grid">
          <label className="field field-wide"><span>Artist</span><input name="artist" required /></label>
          <label className="field field-wide"><span>Tour name</span><input name="tour" /></label>
          <label className="field"><span>Date</span><input name="date" type="date" required /></label>
          <label className="field"><span>Price</span><input name="price" type="number" min="0" step="0.01" /></label>
          <label className="field field-wide"><span>Venue</span><input name="venue" required /></label>
          <label className="field"><span>Genre</span><select name="genre"><option>Hip-Hop</option><option>Pop</option><option>Latin</option><option>Rock</option><option>Other</option></select></label>
          <label className="field"><span>Status</span><select name="status"><option>Want to Go</option><option>Attended</option><option>Cancelled</option></select></label>
          <label className="field field-wide"><span>Seat</span><input name="seat" /></label>
          <label className="field field-wide"><span>Who are you going with?</span><input name="companions" /></label>
          <label className="check-field field-wide"><input name="rachelAttended" type="checkbox" /><span>Rachel attended</span></label>
        </div>

        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit">Save concert</button>
        </div>
      </form>
    </dialog>
  )
}
