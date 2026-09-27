import { useEffect, useState, type ReactNode } from 'react'
import { Pause, Play } from 'lucide-react'
import {
  MotionContext,
  useCinematicMotion,
} from '../../hooks/useCinematicMotion'

export function CinematicMotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem('encore-motion-paused') === 'true'
    } catch {
      return false
    }
  })
  const [hidden, setHidden] = useState(document.hidden)
  useEffect(() => {
    const update = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  const toggle = () =>
    setPaused((value) => {
      try {
        localStorage.setItem('encore-motion-paused', String(!value))
      } catch {
        /* Storage is optional. */
      }
      return !value
    })
  return (
    <MotionContext.Provider value={{ paused, hidden, toggle }}>
      {children}
    </MotionContext.Provider>
  )
}

export function MotionToggle() {
  const { paused, reduced, toggle } = useCinematicMotion()
  if (reduced) return null
  return (
    <button
      className="cinema-motion-toggle"
      type="button"
      onClick={toggle}
      aria-pressed={paused}
      aria-label={paused ? 'Resume motion' : 'Pause motion'}
    >
      {paused ? (
        <Play size={14} aria-hidden="true" />
      ) : (
        <Pause size={14} aria-hidden="true" />
      )}
      <span>{paused ? 'Resume motion' : 'Pause motion'}</span>
    </button>
  )
}
