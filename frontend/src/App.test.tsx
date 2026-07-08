import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Analytics, LibraryResponse } from './types'

vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return {
    ...actual,
    searchArtwork: vi.fn().mockResolvedValue({
      results: [{
        url: 'https://example.com/sincerely.jpg',
        title: 'Sincerely',
        artist: 'Kali Uchis',
        store_url: 'https://music.apple.com/ca/album/sincerely',
      }],
    }),
  }
})

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

const library: LibraryResponse = {
  members: [
    { user_id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com', display_name: 'Nhihad' },
    { user_id: '22222222-2222-4222-8222-222222222222', email: 'partner@example.com', display_name: 'Rachel' },
  ],
  concerts: [{
    id: '33333333-3333-4333-8333-333333333333',
    artist: 'Kali Uchis',
    tour: 'Sincerely,',
    date: '2025-09-17',
    venue: 'Scotiabank Arena (40 Bay St., Toronto, ON M5J 2X2)',
    price: 60,
    genre: 'Latin',
    projected: 8,
    seat: 'Section 319',
    status: 'Attended',
    type: 'Concert',
    spotify_url: null,
    image: null,
    notes: 'Shared event note',
    companions: 'Rachel',
    row_version: 1,
    attendees: [{ user_id: '11111111-1111-4111-8111-111111111111', display_name: 'Nhihad', attendance_status: 'Attended', row_version: 1 }],
    reviews: [{ id: '44444444-4444-4444-8444-444444444444', reviewer_user_id: '11111111-1111-4111-8111-111111111111', reviewer_name: 'Nhihad', enjoyment_score: 9, stage_score: 8, setlist_score: 8.5, seat_score: 7.5, override_rating: null, override_reason: null, notes: 'Personal memory', calculated_rating: 8.5, final_rating: 8.5, is_overridden: false, row_version: 1 }],
    personal_rating: 8.5,
    combined_rating: 8.5,
  }, {
    id: '55555555-5555-4555-8555-555555555555',
    artist: 'J. Cole',
    tour: 'Dreamville Forever',
    date: '2099-12-14',
    venue: 'Scotiabank Arena',
    price: 90,
    genre: 'Hip-Hop',
    projected: 9,
    seat: null,
    status: 'Want to Go',
    type: 'Concert',
    spotify_url: null,
    image: 'https://example.com/j-cole.jpg',
    notes: null,
    companions: null,
    row_version: 1,
    attendees: [{ user_id: '11111111-1111-4111-8111-111111111111', display_name: 'Nhihad', attendance_status: 'Planned', row_version: 1 }],
    reviews: [],
    personal_rating: null,
    combined_rating: null,
  }],
  analytics,
  personal_analytics: analytics,
}

vi.mock('./hooks/useConcertLibrary', () => ({
  useConcertLibrary: () => ({
    conflict: null,
    discardConflict: vi.fn(),
    error: '',
    executeMutation: vi.fn(),
    flushOutbox: vi.fn(),
    library,
    pendingCount: 0,
    refetch: vi.fn(),
    retryConflict: vi.fn(),
    syncState: 'synced',
  }),
}))

import App, { Dashboard } from './App'

const member = {
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.com',
  display_name: 'Nhihad',
  data_mode: 'staging' as const,
}

describe('Concert Tracker cloud shell', () => {
  beforeEach(() => window.history.replaceState({}, '', '/'))

  it('renders cloud totals and concert cards', () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    expect(screen.getByRole('heading', { name: "Nhihad's Concerts" })).toBeInTheDocument()
    expect(screen.getByText('Total concerts')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kali Uchis' })).toBeInTheDocument()
    expect(screen.getAllByText('Scotiabank Arena').length).toBeGreaterThan(0)
    expect(screen.queryByText(/40 Bay St/)).not.toBeInTheDocument()
    expect(screen.getByText('Proj 8')).toBeInTheDocument()
    expect(screen.queryByText(/combined 8\.5/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Past shows')).not.toBeInTheDocument()
    expect(screen.queryByText('Concert memory journal')).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Ranked summary' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ranked Summary' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Combined' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Artist' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Proj' })).not.toBeInTheDocument()
    expect(screen.getByText('Synced')).toBeInTheDocument()
  })

  it('filters the cloud list by artist', () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Kendrick, Scotiabank...'), { target: { value: 'No match' } })
    expect(screen.queryByRole('heading', { name: 'Kali Uchis' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No concerts match' })).toBeInTheDocument()
  })

  it('shows next concert timing without total spend on the main page', () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    expect(screen.getByText('Next concert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'J. Cole' })).toBeInTheDocument()
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.queryByText('Total spent')).not.toBeInTheDocument()
  })

  it('opens the functional add form', () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add concert' }))
    expect(screen.getByRole('heading', { name: 'Add concert' })).toBeInTheDocument()
    expect(screen.getByText('Your review', { selector: 'legend' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Concert form sections' })).toBeInTheDocument()
  })

  it('preloads and selects artwork while editing a concert', async () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'View Kali Uchis details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Kali Uchis' }))
    const artworkOption = await screen.findByRole('button', { name: 'Use Sincerely artwork' })
    fireEvent.click(artworkOption)
    expect(artworkOption).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Artwork preview' })).toHaveAttribute(
      'src',
      'https://example.com/sincerely.jpg',
    )
  })

  it('switches between concerts and stats with rankings inside stats', () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    const concertsButton = screen.getByRole('button', { name: 'Concerts' })
    const statsButton = screen.getByRole('button', { name: 'Stats' })
    expect(concertsButton).toHaveAttribute('aria-current', 'page')
    fireEvent.click(statsButton)
    expect(statsButton).toHaveAttribute('aria-current', 'page')
    expect(window.location.search).toBe('?view=stats&scope=personal')
    expect(screen.getByRole('heading', { name: "Nhihad's stats" })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rankings' })).toBeInTheDocument()
  })

  it('opens a concert detail and restores focus when returning to concerts', async () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'View Kali Uchis details' }))
    expect(window.location.search).toBe('?concert=33333333-3333-4333-8333-333333333333')
    expect(screen.getByRole('heading', { name: 'Kali Uchis', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Personal memory')).toBeInTheDocument()
    expect(screen.getByText('Shared event note')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to concerts' }))
    expect(window.location.search).toBe('')
    expect(screen.getByRole('region', { name: 'Concert totals' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'View Kali Uchis details' })).toHaveFocus())
  })

  it('honors a shared stats deep link and scope switching', () => {
    window.history.replaceState({}, '', '/?view=stats&scope=shared')
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'Shared stats' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shared' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Personal' }))
    expect(screen.getByRole('heading', { name: "Nhihad's stats" })).toBeInTheDocument()
  })

  it('responds to popstate deep links and handles deleted concert URLs', () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    window.history.pushState({}, '', '/?view=stats&scope=shared')
    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByRole('heading', { name: 'Shared stats' })).toBeInTheDocument()

    window.history.pushState({}, '', '/?concert=deleted-concert')
    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByRole('heading', { name: 'Concert not found' })).toBeInTheDocument()
  })

  it('shows intentional unrated, image-less, and no-notes detail states', () => {
    const row = library.concerts[0]
    const original = { personal_rating: row.personal_rating, combined_rating: row.combined_rating, reviews: row.reviews, notes: row.notes }
    Object.assign(row, { personal_rating: null, combined_rating: null, reviews: [], notes: null })
    window.history.replaceState({}, '', `/?concert=${row.id}`)

    const view = render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    expect(screen.queryByRole('img', { name: 'Kali Uchis concert artwork' })).not.toBeInTheDocument()
    expect(screen.getByText('Not rated yet')).toBeInTheDocument()
    expect(screen.getByText('No personal memory recorded yet.')).toBeInTheDocument()
    expect(screen.getByText('No shared event notes recorded.')).toBeInTheDocument()

    view.unmount()
    Object.assign(row, original)
  })

  it('expands secondary filters without hiding search', () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    const filterButton = screen.getByRole('button', { name: 'Filters' })
    expect(filterButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(filterButton)
    expect(filterButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByPlaceholderText('e.g. Kendrick, Scotiabank...')).toBeInTheDocument()
  })

  it('fails closed when staging auth is not configured', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Staging authentication is not configured for this deployment.')
  })
})
