import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Analytics, Concert, RankingRow } from '../types'
import * as api from '../lib/api'
import { StatsDashboard } from './StatsDashboard'

vi.mock('../lib/api', async (original) => ({
  ...await original<typeof import('../lib/api')>(),
  fetchSpotifyStatus: vi.fn(), fetchSpotifyPulse: vi.fn(), fetchSpotifyInsights: vi.fn(), fetchLyricBreakdown: vi.fn(),
}))

const analytics: Analytics = {
  total_concerts: 1,
  status_counts: { Attended: 1 },
  date_first: '2025-09-17',
  date_last: '2025-09-17',
  spending: { total_spent_excluding_cancelled: 60, attended_spent: 60, upcoming_committed: 0, priced_concerts: 1, average_attended_ticket: 60, median_attended_ticket: 60 },
  rating_summaries: [{ scope: '11111111-1111-4111-8111-111111111111', rated_concerts: 1, average_rating: 8.5 }],
  projection: { compared_concerts: 1, mean_absolute_error: 0.5, root_mean_square_error: 0.5, bias: 0.5, within_one_point_percent: 100 },
  yearly_trends: [{ year: 2025, concerts: 1, attended: 1, total_spent: 60, average_combined_rating: 8.5 }],
  monthly_trends: [{ year: 2025, month: 9, concerts: 1, attended: 1 }],
  most_attended_weekday: { weekday: 'Wednesday', count: 1 },
  artist_summaries: [{ key: 'Kali Uchis', concerts: 1, attended: 1, total_spent: 60, average_combined_rating: 8.5 }],
  genre_summaries: [{ key: 'Latin', concerts: 1, attended: 1, total_spent: 60, average_combined_rating: 8.5 }],
  venue_summaries: [{ key: 'Scotiabank Arena', concerts: 1, attended: 1, total_spent: 60, average_combined_rating: 8.5 }],
  repeat_artists: [],
  rankings: {
    combined: [{ rank: 1, concert_id: '33333333-3333-4333-8333-333333333333', artist: 'Kali Uchis', concert_date: '2025-09-17', rating: 8.5 }],
    '11111111-1111-4111-8111-111111111111': [{ rank: 1, concert_id: '33333333-3333-4333-8333-333333333333', artist: 'Kali Uchis', concert_date: '2025-09-17', rating: 8.5 }],
  },
}


const concert: Concert = {
  id: 'show', artist: 'Test artist', date: '2025-09-17', venue: 'Test venue', status: 'Attended',
  personal_rating: 8.5, combined_rating: 8.5, row_version: 1, attendees: [], reviews: [],
  tour: null, price: null, genre: null, projected: null, seat: null, type: 'Concert',
  setlist_url: null, spotify_url: null, image: null, notes: null, companions: null,
}
const rankings: RankingRow[] = Array.from({ length: 16 }, (_, i) => ({
  rank: 16 - i, concert_id: `show-${i}`, artist: `Artist ${i}`, concert_date: '2025-09-17', rating: i / 2,
}))
const props = { analytics, concerts: [concert], memberName: 'Test member', rankings, scope: 'personal' as const, onEditConcert: vi.fn(), onScopeChange: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.fetchSpotifyStatus).mockResolvedValue({ connected: true })
  vi.mocked(api.fetchSpotifyPulse).mockResolvedValue({ connected: true, releases: [], checked_artists: 1 })
  vi.mocked(api.fetchSpotifyInsights).mockImplementation(async (range) => ({
    connected: true, range,
    top_artists: [{ name: 'Listening artist', rank: 1, url: null, image: null, seen_live: true }],
    top_tracks: [{ name: 'Listening track', artist: 'Listening artist', rank: 1, url: null, image: null }],
    recently_played: [{ name: 'Recent track', artist: 'Listening artist', played_at: '2026-01-01', url: null }],
    overlap: { seen_count: 1, top_count: 1, seen_names: ['Listening artist'] }, next_show: null,
  }))
  vi.mocked(api.fetchLyricBreakdown).mockResolvedValue({
    configured: true, found: true, song: 'Annotated song', artist: 'Listening artist', image: null,
    url: 'https://genius.com/example', fragment: 'Example lyric', annotation: 'Example explanation', annotation_url: null,
  })
})

it('keeps every ranking in descending order, including zero, and links each show', async () => {
  render(<StatsDashboard {...props} />)
  const table = screen.getByRole('table', { name: 'All concert rankings, highest rating first' })
  const rows = within(table).getAllByRole('row').slice(1)
  expect(rows).toHaveLength(16)
  expect(rows.map(row => Number(within(row).getAllByRole('cell')[2].textContent))).toEqual([...rankings].reverse().map(row => row.rating))
  expect(within(rows[15]).getByRole('link')).toHaveAttribute('href', '/?concert=show-0')
  fireEvent.click(screen.getByRole('button', { name: 'Shared' }))
  expect(props.onScopeChange).toHaveBeenCalledWith('shared')
  await screen.findByText('Listening track')
})

it('preserves Spotify listening, range switching, lyrics and archive information', async () => {
  render(<StatsDashboard {...props} />)
  expect(await screen.findByText('Listening track')).toBeInTheDocument()
  expect(screen.getByText('Recent track · Listening artist')).toBeInTheDocument()
  expect((await screen.findAllByText('Example explanation')).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '4 weeks' }))
  await waitFor(() => expect(api.fetchSpotifyInsights).toHaveBeenLastCalledWith('short_term', expect.any(AbortSignal)))
  for (const name of ['Top venues', 'Top genres', 'Monthly heatmap', 'Archive stories', "Today's lyric breakdowns", 'New from your artists']) {
    expect(screen.getByRole('heading', { name })).toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole('button', { name: 'Update record' }))
  expect(props.onEditConcert).toHaveBeenCalledWith(concert)
})

it('keeps the lyric section visible on failure and offers disconnected Spotify', async () => {
  vi.mocked(api.fetchSpotifyStatus).mockResolvedValue({ connected: false })
  vi.mocked(api.fetchLyricBreakdown).mockRejectedValue(new Error('Lyric service unavailable'))
  render(<StatsDashboard {...props} />)
  expect(await screen.findByRole('button', { name: 'Connect Spotify' })).toBeInTheDocument()
  expect((await screen.findAllByText('Lyric service unavailable')).length).toBeGreaterThan(0)
  expect(screen.getByRole('heading', { name: "Today's lyric breakdowns" })).toBeInTheDocument()
})
