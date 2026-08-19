import { describe, expect, it } from 'vitest'
import { formatPriceRange, formatShowTime, statusLabel, suggestionVenueValue } from './suggestions'
import type { ConcertSuggestion } from '../types'

const BASE_SUGGESTION: ConcertSuggestion = {
  artist: 'Yeat',
  tour: null,
  date: '2026-09-14',
  venue: 'Scotiabank Arena',
  city: 'Toronto',
  genre: null,
  image: null,
  ticket_url: null,
  setlist_url: null,
  start_time: null,
  price_min: null,
  price_max: null,
  price_currency: null,
  spotify_url: null,
  event_status: null,
  venue_label: null,
}

describe('formatShowTime', () => {
  it('formats a 24-hour time as a friendly wall clock string', () => {
    expect(formatShowTime('19:30')).toBe('7:30 p.m.')
  })

  it('returns an empty string for null or garbage input', () => {
    expect(formatShowTime(null)).toBe('')
    expect(formatShowTime('not a time')).toBe('')
  })
})

describe('formatPriceRange', () => {
  it('returns an empty string when min is missing', () => {
    expect(formatPriceRange(null, null, 'CAD')).toBe('')
  })

  it('formats a single price when min equals max', () => {
    expect(formatPriceRange(79, 79, 'CAD')).toBe('$79')
  })

  it('formats a single price when max is missing', () => {
    expect(formatPriceRange(79, null, 'CAD')).toBe('$79')
  })

  it('formats a range when min and max differ', () => {
    expect(formatPriceRange(79, 249, 'CAD')).toBe('$79–$249')
  })

  it('respects a non-CAD currency', () => {
    expect(formatPriceRange(79, 249, 'USD')).toContain('79')
  })
})

describe('statusLabel', () => {
  it('labels cancelled, rescheduled, and postponed shows', () => {
    expect(statusLabel('cancelled')).toBe('Cancelled')
    expect(statusLabel('rescheduled')).toBe('Rescheduled')
    expect(statusLabel('postponed')).toBe('Postponed')
  })

  it('renders no badge for ordinary sale statuses or null', () => {
    expect(statusLabel('onsale')).toBe('')
    expect(statusLabel('offsale')).toBe('')
    expect(statusLabel(null)).toBe('')
  })
})

describe('suggestionVenueValue', () => {
  it('prefers venue_label when present', () => {
    expect(
      suggestionVenueValue({ ...BASE_SUGGESTION, venue_label: 'FirstOntario Centre (Hamilton)' }),
    ).toBe('FirstOntario Centre (Hamilton)')
  })

  it('falls back to the bare venue when venue_label is absent', () => {
    expect(suggestionVenueValue(BASE_SUGGESTION)).toBe('Scotiabank Arena')
  })
})
