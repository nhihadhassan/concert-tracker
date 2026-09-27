import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

export const MotionContext = createContext({
  paused: false,
  hidden: false,
  toggle: () => {},
})

export function useCinematicMotion() {
  const preference = useContext(MotionContext)
  const reduced = useReducedMotion()
  return {
    ...preference,
    reduced: Boolean(reduced),
    disabled: Boolean(reduced) || preference.paused || preference.hidden,
  }
}

export function useCinematicScene() {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(true)
  const motion = useCinematicMotion()
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return { ref, playing: visible && !motion.disabled }
}
