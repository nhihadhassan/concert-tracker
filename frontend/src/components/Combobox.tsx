import { useId, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'

interface ComboboxProps {
  /** FormData field name -- kept on the real, always-visible <input>. */
  name: string
  suggestions: string[]
  defaultValue?: string
  required?: boolean
  placeholder?: string
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
  className?: string
}

const MAX_SUGGESTIONS = 8

export function Combobox({ name, suggestions, defaultValue, required, placeholder, onBlur, className }: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(defaultValue ?? '')
  const [highlight, setHighlight] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const matches = (() => {
    const query = inputValue.trim().toLowerCase()
    const pool = query
      ? suggestions.filter((value) => value.toLowerCase().includes(query) && value.toLowerCase() !== query)
      : suggestions
    return pool.slice(0, MAX_SUGGESTIONS)
  })()

  const commit = (value: string) => {
    if (inputRef.current) inputRef.current.value = value
    setInputValue(value)
    setOpen(false)
    setHighlight(-1)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (!matches.length) return
      event.preventDefault()
      setOpen(true)
      setHighlight((current) => Math.min(current + 1, matches.length - 1))
    } else if (event.key === 'ArrowUp') {
      if (!matches.length) return
      event.preventDefault()
      setHighlight((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      if (open && highlight >= 0 && matches[highlight]) {
        event.preventDefault()
        commit(matches[highlight])
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
        setHighlight(-1)
      }
    }
  }

  return (
    <span className={`combobox${className ? ` ${className}` : ''}`}>
      <input
        ref={inputRef}
        name={name}
        className="combobox-input"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && highlight >= 0 ? `${listId}-${highlight}` : undefined}
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        onChange={(event) => {
          setInputValue(event.currentTarget.value)
          setOpen(true)
          setHighlight(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          setOpen(false)
          setHighlight(-1)
          onBlur?.(event)
        }}
        onKeyDown={handleKeyDown}
      />
      <AnimatePresence>
        {open && matches.length > 0 ? (
          <m.ul
            id={listId}
            className="combobox-popover"
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {matches.map((value, index) => (
              <li
                key={value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === highlight}
                className={`combobox-option${index === highlight ? ' combobox-option-highlight' : ''}`}
                // Selecting via pointer must not blur the input before the click registers.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => {
                  commit(value)
                  inputRef.current?.focus()
                }}
              >
                {value}
              </li>
            ))}
          </m.ul>
        ) : null}
      </AnimatePresence>
    </span>
  )
}
