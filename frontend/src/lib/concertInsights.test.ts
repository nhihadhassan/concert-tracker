import { describe, expect, it } from 'vitest'
import type { Concert } from '../types'
import { buildConcertStory } from './concertInsights'

const row = (artist: string, date: string, venue = 'History'): Concert => ({
  id: `${artist}-${date}`,
  artist,
  tour: null,
  date,
  venue,
  price: null,
  genre: null,
  projected: null,
  seat: null,
  status: 'Attended',
  type: 'Concert',
  setlist_url: null,
  spotify_url: null,
  image: null,
  notes: null,
  companions: null,
  row_version: 1,
  attendees: [],
  reviews: [],
  personal_rating: null,
  combined_rating: null,
})

describe('concert stories', () => {
  it('finds yearly debuts, returning artists, streaks, and close runs', () => {
    const story = buildConcertStory([
      row('SZA', '2024-08-01'),
      row('SZA', '2025-01-10'),
      row('Doechii', '2025-02-03'),
      row('Doechii', '2025-02-05'),
      row('Kendrick Lamar', '2025-03-15', 'Scotiabank Arena'),
    ], 2025)

    expect(story.newArtists).toEqual(['Doechii', 'Kendrick Lamar'])
    expect(story.returningArtists).toEqual(['SZA'])
    expect(story.repeatArtists).toEqual([['Doechii', 2]])
    expect(story.longestMonthlyStreak).toBe(3)
    expect(story.closestRun?.days).toBe(2)
    expect(story.busiestMonth).toEqual({ label: 'February', count: 2 })
  })
})
