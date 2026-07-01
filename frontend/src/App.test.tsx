import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LibraryResponse } from './types'

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
    venue: 'Scotiabank Arena',
    price: 60,
    genre: 'Latin',
    projected: 8,
    seat: 'Section 319',
    status: 'Attended',
    type: 'Concert',
    spotify_url: null,
    image: null,
    notes: null,
    companions: 'Rachel',
    row_version: 1,
    attendees: [{ user_id: '11111111-1111-4111-8111-111111111111', display_name: 'Nhihad', attendance_status: 'Attended', row_version: 1 }],
    reviews: [],
    personal_rating: 8.5,
    combined_rating: 8.5,
  }],
  analytics: {
    total_concerts: 1,
    status_counts: { Attended: 1 },
    date_first: '2025-09-17',
    date_last: '2025-09-17',
    spending: {
      total_spent_excluding_cancelled: 60,
      attended_spent: 60,
      upcoming_committed: 0,
      priced_concerts: 1,
      average_attended_ticket: 60,
    },
    rankings: {
      combined: [{ rank: 1, concert_id: '33333333-3333-4333-8333-333333333333', artist: 'Kali Uchis', concert_date: '2025-09-17', rating: 8.5 }],
      '11111111-1111-4111-8111-111111111111': [{ rank: 1, concert_id: '33333333-3333-4333-8333-333333333333', artist: 'Kali Uchis', concert_date: '2025-09-17', rating: 8.5 }],
    },
  },
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
  it('renders cloud totals and rankings', () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    expect(screen.getByRole('heading', { name: "Nhihad's Concerts" })).toBeInTheDocument()
    expect(screen.getByText('Total concerts')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ranked Summary' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kali Uchis' })).toBeInTheDocument()
    expect(screen.getByText('Synced')).toBeInTheDocument()
  })

  it('filters the cloud list by artist', () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Kendrick, Scotiabank...'), { target: { value: 'No match' } })
    expect(screen.queryByRole('heading', { name: 'Kali Uchis' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No concerts match' })).toBeInTheDocument()
  })

  it('opens the functional add form', () => {
    render(<Dashboard accessToken="token" member={member} onSignOut={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add concert' }))
    expect(screen.getByRole('heading', { name: 'Add concert' })).toBeInTheDocument()
    expect(screen.getByText('Your review')).toBeInTheDocument()
  })

  it('fails closed when staging auth is not configured', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Staging authentication is not configured for this deployment.')
  })
})
