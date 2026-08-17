import { describe, expect, it } from 'vitest'
import type { Concert } from '../types'
import { upcomingConcertCalendar } from './exports'

const concert = {
  id: 'show-1',
  artist: 'SZA, Live',
  tour: 'SOS Tour',
  date: '2030-06-12',
  venue: 'History; Toronto',
  price: null,
  genre: null,
  projected: null,
  seat: null,
  status: 'Want to Go',
  type: 'Concert',
  spotify_url: null,
  image: null,
  notes: null,
  companions: null,
  row_version: 1,
  attendees: [],
  reviews: [],
  personal_rating: null,
  combined_rating: null,
} satisfies Concert

describe('calendar export', () => {
  it('exports future concerts as all-day calendar events', () => {
    const result = upcomingConcertCalendar([concert], '2029-01-01')
    expect(result).toContain('DTSTART;VALUE=DATE:20300612')
    expect(result).toContain('DTEND;VALUE=DATE:20300613')
    expect(result).toContain('SUMMARY:SZA\\, Live')
    expect(result).toContain('LOCATION:History\\; Toronto')
  })
})
