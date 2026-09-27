import { useEffect, type ReactNode, type PointerEvent } from 'react'
import { m, useMotionValue, useSpring, useMotionTemplate } from 'motion/react'
import { useCinematicMotion } from '../../hooks/useCinematicMotion'

interface ArtworkTiltProps {
  children: ReactNode
  label: string
  onClick: () => void
  id?: string
  className?: string
  vinyl?: boolean
  glowImage?: string
  tabIndex?: number
}

export function ArtworkTilt({
  children,
  label,
  onClick,
  id,
  className = '',
  vinyl = false,
  glowImage,
  tabIndex,
}: ArtworkTiltProps) {
  const { disabled } = useCinematicMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const lightX = useMotionValue(50)
  const lightY = useMotionValue(40)
  const rotateX = useSpring(x, { stiffness: 180, damping: 24 })
  const rotateY = useSpring(y, { stiffness: 180, damping: 24 })
  const highlight = useMotionTemplate`radial-gradient(circle at ${lightX}% ${lightY}%, rgba(255,244,228,.28), transparent 65%)`
  const reset = () => {
    x.set(0)
    y.set(0)
    lightX.set(50)
    lightY.set(40)
  }
  useEffect(() => {
    if (disabled) {
      x.set(0)
      y.set(0)
      rotateX.jump(0)
      rotateY.jump(0)
    }
  }, [disabled, x, y, rotateX, rotateY])
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.pointerType === 'touch') return
    const rect = event.currentTarget.getBoundingClientRect()
    const px = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    )
    const py = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height),
    )
    x.set((0.5 - py) * 12)
    y.set((px - 0.5) * 16)
    lightX.set(px * 100)
    lightY.set(py * 100)
  }
  return (
    <button
      type="button"
      id={id}
      className={`cinema-artwork ${className}`}
      aria-label={label}
      tabIndex={tabIndex}
      data-motion={disabled ? 'off' : 'on'}
      onClick={onClick}
      onPointerMove={move}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onBlur={reset}
    >
      <span className="cinema-artwork-glow" aria-hidden="true">
        {glowImage ? (
          <img
            src={glowImage}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : null}
      </span>
      <span className="cinema-artwork-lift">
        <m.span className="cinema-artwork-face" style={{ rotateX, rotateY }}>
          {vinyl ? <span className="cinema-vinyl" aria-hidden="true" /> : null}
          {children}
          <m.span
            className="cinema-artwork-shine"
            style={{ background: highlight }}
            aria-hidden="true"
          />
        </m.span>
      </span>
    </button>
  )
}
