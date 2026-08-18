import { useRef, useState } from 'react'
import { FileUp, ShieldCheck, TriangleAlert } from 'lucide-react'
import { previewBackup, restoreBackup } from '../lib/api'
import type { BackupPreview } from '../types'

interface BackupRestoreDialogProps {
  online: boolean
  pendingCount: number
  onClose: () => void
  onRestored: (message: string) => void
}

const isEncoreBackup = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object'
  && (value as Record<string, unknown>).format === 'encore-concert-backup'
  && (value as Record<string, unknown>).version === 1
  && Array.isArray((value as Record<string, unknown>).concerts))

export function BackupRestoreDialog({ online, pendingCount, onClose, onRestored }: BackupRestoreDialogProps) {
  const input = useRef<HTMLInputElement>(null)
  const [backup, setBackup] = useState<unknown>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resolutions, setResolutions] = useState<Record<string, 'keep_existing' | 'use_backup'>>({})
  const unavailable = !online || pendingCount > 0

  const chooseFile = async (file?: File) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('This backup is too large to restore.'); return }
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isEncoreBackup(parsed)) throw new Error('Choose an Encore JSON backup (version 1).')
      setBackup(parsed); setPreview(null); setResolutions({}); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'That file could not be read.') }
  }
  const runPreview = async () => {
    if (!backup || unavailable) return
    setBusy(true); setError('')
    try { setPreview(await previewBackup(backup)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'The backup could not be previewed.') } finally { setBusy(false) }
  }
  const commit = async () => {
    if (!backup || !preview || unavailable) return
    setBusy(true); setError('')
    try {
      const result = await restoreBackup(backup, preview, preview.items.filter((item) => item.status === 'conflict').map((item) => ({ key: item.key, action: resolutions[item.key] ?? 'keep_existing' })))
      onRestored(result.message)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The backup could not be restored.') } finally { setBusy(false) }
  }
  const conflicts = preview?.items.filter((item) => item.status === 'conflict') ?? []

  return <div className="conflict-backdrop" role="presentation">
    <section className="conflict-panel restore-panel" role="dialog" aria-modal="true" aria-labelledby="restore-backup-title">
      <div className="conflict-icon"><ShieldCheck aria-hidden="true" /></div>
      <h2 id="restore-backup-title">Restore backup</h2>
      <p>Preview an Encore backup before changing anything. Existing concerts are never deleted, and conflicts keep your current values unless you choose otherwise.</p>
      {unavailable ? <p className="restore-notice"><TriangleAlert size={16} />Reconnect and finish syncing before restoring. Restore changes are intentionally online-only.</p> : null}
      {!backup ? <div className="restore-file"><input ref={input} type="file" accept="application/json,.json" onChange={(event) => void chooseFile(event.target.files?.[0])} /><button className="button button-secondary" type="button" disabled={unavailable} onClick={() => input.current?.click()}><FileUp size={17} />Choose JSON backup</button></div> : null}
      {backup && !preview ? <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => { setBackup(null); setError('') }}>Choose another file</button><button className="button button-primary" type="button" disabled={busy || unavailable} onClick={() => void runPreview()}>{busy ? 'Checking…' : 'Preview restore'}</button></div> : null}
      {preview ? <div className="restore-preview"><div className="restore-summary"><span>{preview.summary.new ?? 0} new</span><span>{preview.summary.duplicate ?? 0} already here</span><span>{preview.summary.conflict ?? 0} conflicts</span><span>{preview.summary.invalid ?? 0} invalid</span></div>{conflicts.length ? <details><summary>Review {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}</summary>{conflicts.map((item) => <div className="restore-conflict" key={item.key}><strong>{item.artist} · {item.date}</strong><small>{item.differences.join(', ')}</small><div><button type="button" className={(resolutions[item.key] ?? 'keep_existing') === 'keep_existing' ? 'active' : ''} onClick={() => setResolutions((current) => ({ ...current, [item.key]: 'keep_existing' }))}>Keep existing</button><button type="button" className={resolutions[item.key] === 'use_backup' ? 'active' : ''} onClick={() => setResolutions((current) => ({ ...current, [item.key]: 'use_backup' }))}>Use backup values</button></div></div>)}</details> : null}<div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => setPreview(null)}>Back</button><button className="button button-primary" type="button" disabled={busy || unavailable} onClick={() => void commit()}>{busy ? 'Restoring…' : 'Restore selected changes'}</button></div></div> : null}
      {error ? <p className="dialog-error" role="alert">{error}</p> : null}
      <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
    </section>
  </div>
}
