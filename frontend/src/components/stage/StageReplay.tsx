import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { Concert } from '../../types'
import { resizeArtwork } from '../../lib/artwork'
import { useCinematicMotion } from '../../hooks/useCinematicMotion'
import { stageDate } from './stageDate'

export function StageReplay({
  concerts,
  period,
  onClose,
}: {
  concerts: Concert[]
  period: string
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const audio = useRef<AudioContext | null>(null)
  const soundedIndex = useRef(0)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [sound, setSound] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const { disabled } = useCinematicMotion()
  const running = playing && !disabled
  const current = concerts[Math.min(index, concerts.length - 1)]
  useEffect(() => {
    dialog.current?.showModal()
    return () => {
      if (audio.current) void audio.current.close().catch(() => {})
    }
  }, [])
  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(() => {
      if (index >= concerts.length - 1) setPlaying(false)
      else setIndex((value) => value + 1)
    }, 4400)
    return () => window.clearTimeout(timer)
  }, [running, index, concerts.length])
  useEffect(() => {
    if (
      !sound ||
      disabled ||
      !audio.current ||
      audio.current.state !== 'running'
    )
      return
    const context = audio.current,
      oscillator = context.createOscillator(),
      gain = context.createGain()
    const beat =
      context.currentTime + (soundedIndex.current === index ? 0 : 0.9)
    soundedIndex.current = index
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(140, beat)
    oscillator.frequency.exponentialRampToValueAtTime(55, beat + 0.22)
    gain.gain.setValueAtTime(0, beat)
    gain.gain.linearRampToValueAtTime(0.12, beat + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, beat + 0.3)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(beat)
    oscillator.stop(beat + 0.32)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
    return () => {
      oscillator.stop()
      oscillator.disconnect()
      gain.disconnect()
    }
  }, [index, sound, disabled])
  const toggleSound = async () => {
    if (sound) {
      setSound(false)
      return
    }
    try {
      audio.current ??= new AudioContext()
      await audio.current.resume()
      setSound(true)
      setAudioError(false)
    } catch {
      setAudioError(true)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="stage-replay"
      aria-label="Concert Replay"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      data-motion={disabled ? 'off' : 'on'}
    >
      <div className="stage-replay-top">
        <span>REPLAY / {period === 'all' ? 'ALL YEARS' : period}</span>
        <button
          autoFocus
          type="button"
          onClick={onClose}
          aria-label="Close Replay"
        >
          <X size={20} />
        </button>
      </div>
      {current ? (
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={current.id}
            className="stage-replay-frame"
            initial={disabled ? false : { opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: disabled ? 0 : 0.45 }}
          >
            {current.image ? (
              <>
                <img
                  className="stage-replay-bg"
                  src={resizeArtwork(current.image, 960)}
                  alt=""
                />
                <img
                  className="stage-replay-art"
                  src={resizeArtwork(current.image, 960)}
                  alt={`${current.artist} artwork`}
                />
              </>
            ) : null}
            <div className="stage-replay-copy" aria-live="polite">
              <span className="stage-eyebrow">{stageDate(current.date)}</span>
              <h2>{current.artist}</h2>
              <p>{current.venue.replace(/\s*\([^)]*\)\s*$/, '')}</p>
              {current.personal_rating != null ? (
                <m.div
                  className="stage-replay-score"
                  initial={disabled ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: disabled ? 0 : 0.45 }}
                >
                  <strong>{current.personal_rating}</strong>
                  <span>/ 10 · Your rating</span>
                </m.div>
              ) : null}
            </div>
          </m.div>
        </AnimatePresence>
      ) : (
        <p className="stage-empty">No attended shows for this year.</p>
      )}
      <div className="stage-replay-controls">
        <button
          type="button"
          aria-label="Previous show"
          disabled={index === 0}
          onClick={() => {
            setPlaying(false)
            setIndex((i) => i - 1)
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <span>
          {current ? index + 1 : 0} / {concerts.length}
        </span>
        {!disabled && current ? (
          <button
            type="button"
            aria-label={running ? 'Pause Replay' : 'Play Replay'}
            onClick={() => {
              if (!playing && index === concerts.length - 1) setIndex(0)
              setPlaying((v) => !v)
            }}
          >
            {running ? <Pause size={20} /> : <Play size={20} />}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Next show"
          disabled={index >= concerts.length - 1}
          onClick={() => {
            setPlaying(false)
            setIndex((i) => i + 1)
          }}
        >
          <ArrowRight size={20} />
        </button>
        <button
          type="button"
          aria-pressed={sound}
          aria-label={sound ? 'Turn sound off' : 'Turn sound on'}
          onClick={() => void toggleSound()}
        >
          {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          <span>Sound {sound ? 'on' : 'off'}</span>
        </button>
      </div>
      {audioError ? (
        <p className="stage-audio-error" role="status">
          Sound is unavailable in this browser.
        </p>
      ) : null}
    </dialog>
  )
}
