import type { ConcertSuggestion } from '../types'

/** Formats a Ticketmaster show time such as "19:30" as a friendly wall-clock string. */
export const formatShowTime = (value: string | null): string => {
  if (!value) return ''
  const parsed = new Date(`1970-01-01T${value}:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(parsed)
}

/** Formats a price range, e.g. "$79" when min equals max, "$79–$249" otherwise. */
export const formatPriceRange = (
  min: number | null,
  max: number | null,
  currency: string | null,
): string => {
  if (min === null || min === undefined) return ''
  const format = new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency ?? 'CAD',
    maximumFractionDigits: 0,
  })
  if (max === null || max === undefined || max === min) return format.format(min)
  return `${format.format(min)}–${format.format(max)}`
}

const STATUS_LABELS: Record<string, string> = {
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
  postponed: 'Postponed',
}

/** A short status badge for a suggestion, blank for ordinary on-sale/off-sale shows. */
export const statusLabel = (code: string | null): string => (code ? STATUS_LABELS[code] ?? '' : '')

/** What the form's venue field should be set to when a suggestion is applied. */
export const suggestionVenueValue = (suggestion: ConcertSuggestion): string =>
  suggestion.venue_label ?? suggestion.venue
