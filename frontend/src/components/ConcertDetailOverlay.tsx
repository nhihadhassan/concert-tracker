import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { m, useReducedMotion } from 'motion/react'

import { useCinematicMotion } from '../hooks/useCinematicMotion'

interface ConcertDetailOverlayProps {
  cinematic?: boolean
  children: ReactNode
  onClose: () => void
}

export function ConcertDetailOverlay({ children, onClose, cinematic = false }: ConcertDetailOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reduced = useReducedMotion()
  const { disabled } = useCinematicMotion()
  const reduceMotion = reduced || (cinematic && disabled)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>('[autofocus]')?.focus({ preventScroll: true })
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <m.dialog
      ref={dialogRef}
      className={`concert-detail-overlay${cinematic ? ' concert-detail-overlay-stage' : ''}`}
      data-motion={reduceMotion ? 'off' : 'on'}
      aria-modal="true"
      aria-labelledby="detail-title"
      initial={reduceMotion ? false : { opacity: 0, scale: cinematic ? 0.92 : 0.985, y: cinematic ? 35 : 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.99, y: 4 }}
      transition={{
        duration: reduceMotion ? 0 : cinematic ? 0.55 : 0.32,
        ease: [0.22, 1, 0.36, 1],
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={closeOnBackdrop}
    >
      {cinematic && !reduceMotion ? <span className="stage-entrance-flare" aria-hidden="true" /> : null}
      {children}
    </m.dialog>
  )
}
