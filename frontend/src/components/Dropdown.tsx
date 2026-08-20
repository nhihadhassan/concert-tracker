import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'

export interface DropdownOption {
  value: string
  label: string
}

interface DropdownProps {
  options: DropdownOption[]
  /** Controlled value (e.g. FiltersBar). Omit and use defaultValue for uncontrolled use (e.g. the
   * add-concert form, which reads everything via FormData and never tracks Status in React state). */
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  label: string
  /** When set, renders a visually-hidden native <select> mirror with this name so
   * uncontrolled forms (FormData) and direct-DOM writes (form.elements.namedItem)
   * keep working unchanged. */
  name?: string
  className?: string
}

export function Dropdown({ options, value, defaultValue, onChange, label, name, className }: DropdownProps) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.value ?? '')
  const current = isControlled ? value : internalValue
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (selectRef.current) selectRef.current.value = current
  }, [current])

  // applySuggestion writes to the hidden mirror's .value directly (bypassing React) when a
  // Ticketmaster/setlist.fm suggestion is applied; setField also dispatches an 'input' event so
  // this stays in sync with what's displayed, mirroring the same pattern in DatePicker.
  useEffect(() => {
    if (isControlled) return
    const field = selectRef.current
    if (!field) return
    const sync = () => setInternalValue(field.value)
    field.addEventListener('input', sync)
    return () => field.removeEventListener('input', sync)
  }, [isControlled])

  useEffect(() => {
    if (!open) return
    const index = options.findIndex((option) => option.value === current)
    setHighlight(index >= 0 ? index : 0)
  }, [open, options, current])

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

  const commit = (index: number) => {
    const option = options[index]
    if (!option) return
    if (!isControlled) setInternalValue(option.value)
    onChange?.(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((current) => Math.min(current + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setHighlight(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setHighlight(options.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      commit(highlight)
    }
  }

  const currentOption = options.find((option) => option.value === current)

  return (
    <div className={`dropdown${className ? ` ${className}` : ''}`} ref={rootRef}>
      {name ? (
        <select ref={selectRef} name={name} defaultValue={current} className="sr-only" tabIndex={-1} aria-hidden="true">
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : null}
      <button
        type="button"
        ref={triggerRef}
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        aria-activedescendant={open ? `${listId}-${highlight}` : undefined}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={handleKeyDown}
      >
        <span>{currentOption?.label ?? label}</span>
        <ChevronDown size={16} aria-hidden="true" className={open ? 'dropdown-chevron dropdown-chevron-open' : 'dropdown-chevron'} />
      </button>
      <AnimatePresence>
        {open ? (
          <m.ul
            className="dropdown-popover"
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === current}
                className={`dropdown-option${index === highlight ? ' dropdown-option-highlight' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => commit(index)}
              >
                <span>{option.label}</span>
                {option.value === current ? <Check size={15} aria-hidden="true" /> : null}
              </li>
            ))}
          </m.ul>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
