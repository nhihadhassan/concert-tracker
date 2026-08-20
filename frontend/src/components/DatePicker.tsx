import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'

interface DatePickerProps {
  name: string
  defaultValue?: string
  required?: boolean
  /** Fires whenever a day is picked, with the exact YYYY-MM-DD committed. */
  onDateChange?: (value: string) => void
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_FORMAT = new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' })
const DISPLAY_FORMAT = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })

const pad2 = (value: number) => String(value).padStart(2, '0')
const toIso = (year: number, month: number, day: number) => `${year}-${pad2(month + 1)}-${pad2(day)}`

function parseIso(value: string | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function DatePicker({ name, defaultValue, required, onDateChange }: DatePickerProps) {
  const initial = parseIso(defaultValue)
  const today = new Date()
  const [selected, setSelected] = useState(initial)
  const [viewYear, setViewYear] = useState(initial?.year ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial?.month ?? today.getMonth())
  const [open, setOpen] = useState(false)
  const [focusDay, setFocusDay] = useState(initial?.day ?? today.getDate())
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // applySuggestion writes to the hidden mirror's .value directly (bypassing React) when a
  // Ticketmaster/setlist.fm suggestion is applied; setField also dispatches an 'input' event so
  // this stays in sync with what's displayed.
  useEffect(() => {
    const field = inputRef.current
    if (!field) return
    const sync = () => {
      const parsed = parseIso(field.value)
      if (!parsed) return
      setSelected(parsed)
      setViewYear(parsed.year)
      setViewMonth(parsed.month)
      setFocusDay(parsed.day)
    }
    field.addEventListener('input', sync)
    return () => field.removeEventListener('input', sync)
  }, [])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithKeyboard)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithKeyboard)
    }
  }, [open])

  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()
  }, [open, viewMonth, viewYear])

  const commit = (year: number, month: number, day: number) => {
    const iso = toIso(year, month, day)
    if (inputRef.current) inputRef.current.value = iso
    setSelected({ year, month, day })
    setOpen(false)
    triggerRef.current?.focus()
    onDateChange?.(iso)
  }

  const moveFocus = (deltaDays: number) => {
    const base = new Date(viewYear, viewMonth, focusDay + deltaDays)
    setViewYear(base.getFullYear())
    setViewMonth(base.getMonth())
    setFocusDay(base.getDate())
  }

  const changeMonth = (delta: number) => {
    const base = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(base.getFullYear())
    setViewMonth(base.getMonth())
    setFocusDay((day) => Math.min(day, daysInMonth(base.getFullYear(), base.getMonth())))
  }

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(1) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(-1) }
    else if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(7) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(-7) }
    else if (event.key === 'PageDown') { event.preventDefault(); changeMonth(1) }
    else if (event.key === 'PageUp') { event.preventDefault(); changeMonth(-1) }
    else if (event.key === 'Home') { event.preventDefault(); setFocusDay(1) }
    else if (event.key === 'End') { event.preventDefault(); setFocusDay(daysInMonth(viewYear, viewMonth)) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); commit(viewYear, viewMonth, focusDay) }
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const total = daysInMonth(viewYear, viewMonth)
  const cells: Array<number | null> = [...Array(firstWeekday).fill(null), ...Array.from({ length: total }, (_, index) => index + 1)]
  const isToday = (day: number) => viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate()
  const isSelected = (day: number) => selected?.year === viewYear && selected.month === viewMonth && selected.day === day

  return (
    <div className="date-picker" ref={rootRef}>
      <input ref={inputRef} type="date" name={name} defaultValue={defaultValue} required={required} className="sr-only" tabIndex={-1} aria-hidden="true" />
      <button
        type="button"
        ref={triggerRef}
        className="date-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Calendar size={16} aria-hidden="true" />
        <span>{selected ? DISPLAY_FORMAT.format(new Date(selected.year, selected.month, selected.day)) : 'Select date'}</span>
      </button>
      <AnimatePresence>
        {open ? (
          <m.div
            className="date-picker-popover"
            role="group"
            aria-label="Choose a date"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="date-picker-nav">
              <button type="button" className="icon-button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
              <AnimatePresence mode="wait">
                <m.strong
                  key={`${viewYear}-${viewMonth}`}
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 3 }}
                  transition={{ duration: 0.12 }}
                >
                  {MONTH_FORMAT.format(new Date(viewYear, viewMonth, 1))}
                </m.strong>
              </AnimatePresence>
              <button type="button" className="icon-button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
            </div>
            <div className="date-picker-weekdays" aria-hidden="true">
              {WEEKDAYS.map((day, index) => <span key={index}>{day}</span>)}
            </div>
            <div
              className="date-picker-grid"
              ref={gridRef}
              role="grid"
              aria-label={MONTH_FORMAT.format(new Date(viewYear, viewMonth, 1))}
              onKeyDown={handleGridKeyDown}
            >
              {cells.map((day, index) => day === null
                ? <span key={`blank-${index}`} aria-hidden="true" />
                : (
                  <button
                    type="button"
                    key={day}
                    role="gridcell"
                    tabIndex={day === focusDay ? 0 : -1}
                    aria-current={isToday(day) ? 'date' : undefined}
                    aria-selected={isSelected(day)}
                    className={`date-picker-day${isToday(day) ? ' date-picker-day-today' : ''}${isSelected(day) ? ' date-picker-day-selected' : ''}`}
                    onClick={() => commit(viewYear, viewMonth, day)}
                  >
                    {day}
                  </button>
                ))}
            </div>
            <button type="button" className="date-picker-today" onClick={() => commit(today.getFullYear(), today.getMonth(), today.getDate())}>Today</button>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
