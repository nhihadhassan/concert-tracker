import { useState } from 'react'
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { Dropdown } from './Dropdown'
import type { ConcertStatus } from '../types'

interface FiltersBarProps {
  genres: string[]
  genre: string
  search: string
  sort: string
  status: string
  onGenreChange: (value: string) => void
  onSearchChange: (value: string) => void
  onSortChange: (value: string) => void
  onStatusChange: (value: string) => void
}

const statuses: Array<ConcertStatus | ''> = ['', 'Attended', 'Want to Go', 'Cancelled']

export function FiltersBar(props: FiltersBarProps) {
  const [expanded, setExpanded] = useState(false)
  const activeCount = Number(Boolean(props.status)) + Number(Boolean(props.genre)) + Number(props.sort !== 'date-desc')
  return (
    <section className="filters" aria-label="Concert filters">
      <label className="field search-field">
        <span>Search artist or venue</span>
        <span className="input-with-icon">
          <Search size={18} aria-hidden="true" />
          <input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="e.g. Kendrick, Scotiabank..." />
        </span>
      </label>

      <button className="button button-secondary mobile-filter-toggle" type="button" aria-expanded={expanded} aria-controls="secondary-filters" onClick={() => setExpanded((value) => !value)}>
        <SlidersHorizontal size={17} />
        <span>Filters{activeCount ? ` (${activeCount})` : ''}</span>
        <ChevronDown className={expanded ? 'chevron-open' : ''} size={16} />
      </button>

      <AnimatePresence initial={false}>
        <m.div id="secondary-filters" className={`secondary-filters${expanded ? ' secondary-filters-open' : ''}`} initial={false} animate={{ opacity: 1 }}>
          <label className="field">
            <span>Status</span>
            <Dropdown
              label="Status"
              value={props.status}
              onChange={props.onStatusChange}
              options={statuses.map((status) => ({ value: status, label: status || 'All statuses' }))}
            />
          </label>

          <label className="field">
            <span>Genre</span>
            <Dropdown
              label="Genre"
              value={props.genre}
              onChange={props.onGenreChange}
              options={[{ value: '', label: 'All genres' }, ...props.genres.map((genre) => ({ value: genre, label: genre }))]}
            />
          </label>

          <label className="field">
            <span>Sort by</span>
            <Dropdown
              label="Sort by"
              value={props.sort}
              onChange={props.onSortChange}
              options={[
                { value: 'date-desc', label: 'Date (newest first)' },
                { value: 'date-asc', label: 'Date (oldest first)' },
                { value: 'rating-desc', label: 'Rating (highest first)' },
                { value: 'price-desc', label: 'Price (highest first)' },
                { value: 'artist-asc', label: 'Artist (A-Z)' },
              ]}
            />
          </label>
        </m.div>
      </AnimatePresence>
    </section>
  )
}
