import { useState } from 'react'
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
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
            <select value={props.status} onChange={(event) => props.onStatusChange(event.target.value)}>
              {statuses.map((status) => <option key={status || 'all'} value={status}>{status || 'All statuses'}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Genre</span>
            <select value={props.genre} onChange={(event) => props.onGenreChange(event.target.value)}>
              <option value="">All genres</option>
              {props.genres.map((genre) => <option key={genre}>{genre}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Sort by</span>
            <select value={props.sort} onChange={(event) => props.onSortChange(event.target.value)}>
              <option value="date-desc">Date (newest first)</option>
              <option value="date-asc">Date (oldest first)</option>
              <option value="rating-desc">Rating (highest first)</option>
              <option value="price-desc">Price (highest first)</option>
              <option value="artist-asc">Artist (A-Z)</option>
            </select>
          </label>
        </m.div>
      </AnimatePresence>
    </section>
  )
}
