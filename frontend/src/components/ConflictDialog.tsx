import { TriangleAlert } from 'lucide-react'
import type { ConflictState } from '../types'

interface ConflictDialogProps {
  conflict: ConflictState | null
  onDiscard: () => void
  onRetry: () => void
}

export function ConflictDialog({ conflict, onDiscard, onRetry }: ConflictDialogProps) {
  if (!conflict) return null
  const artist = typeof conflict.current?.artist === 'string' ? conflict.current.artist : 'This record'
  return (
    <div className="conflict-backdrop" role="presentation">
      <section className="conflict-panel" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title">
        <span className="conflict-icon" aria-hidden="true"><TriangleAlert size={22} /></span>
        <div><h2 id="conflict-title">Review a newer cloud change</h2><p>{artist} changed after this edit began. Choose which version should continue.</p><p className="conflict-detail">{conflict.message}</p></div>
        <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onDiscard}>Use cloud version</button><button className="button button-primary" type="button" onClick={onRetry}>Keep my changes</button></div>
      </section>
    </div>
  )
}
