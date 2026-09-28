import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album, Concert } from '../../types'
import { selectFeaturedConcert } from '../../lib/cinematic'
import { RecordRoom } from './RecordRoom'
import { AlbumLibrary } from '../AlbumLibrary'
import { CinematicMotionProvider } from './CinematicMotion'
import { WrappedFilm } from './WrappedFilm'

const motionPreference = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motionPreference.reduced,
}))

const album = (id: string): Album => ({
  id,
  title: `Album ${id}`,
  artist: 'Test artist',
  spotify_album_id: id,
  album_type: 'album',
  release_date: null,
  release_date_precision: null,
  image_url: null,
  spotify_url: null,
  label: null,
  genres: [],
  total_tracks: 0,
  duration_ms: 0,
  row_version: 1,
  tracks: [],
  reviews: [],
})
const show = (
  id: string,
  date: string,
  status: Concert['status'],
  rating: number | null = null,
): Concert => ({
  id,
  artist: id,
  date,
  status,
  personal_rating: rating,
  venue: 'Test venue',
  tour: null,
  price: null,
  genre: null,
  projected: null,
  seat: null,
  type: 'Concert',
  setlist_url: null,
  spotify_url: null,
  image: null,
  notes: null,
  companions: null,
  row_version: 1,
  attendees: [],
  reviews: [],
  combined_rating: null,
})

beforeEach(() => {
  motionPreference.reduced = false
  localStorage.clear()
  sessionStorage.clear()
})

describe('Cinematic library interactions', () => {
  it('features the nearest planned show without surfacing cancelled or stale plans', () => {
    const rows = [
      show('Cancelled', '2026-09-28', 'Cancelled'),
      show('Later', '2026-11-01', 'Want to Go'),
      show('Next', '2026-09-29', 'Want to Go'),
      show('Old plan', '2025-01-01', 'Want to Go'),
    ]
    expect(selectFeaturedConcert(rows, '2026-09-27')?.artist).toBe('Next')
    expect(
      selectFeaturedConcert(
        [...rows, show('Past', '2026-09-20', 'Attended')],
        '2027-01-01',
      )?.artist,
    ).toBe('Past')
    expect(selectFeaturedConcert(rows, '2027-01-01')).toBeUndefined()
  })

  it('selects a side sleeve before opening it and keeps the selection on return', () => {
    const onOpen = vi.fn()
    const albums = [album('A'), album('B'), album('C')]
    const view = render(<RecordRoom albums={albums} onOpen={onOpen} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Album B by Test artist' }),
    )
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Album B by Test artist' }),
    )
    expect(onOpen).toHaveBeenCalledWith(albums[1])
    view.unmount()
    render(<RecordRoom albums={albums} onOpen={onOpen} />)
    expect(
      screen.getByRole('button', { name: 'Open Album B by Test artist' }),
    ).toBeInTheDocument()
  })

  it('moves keyboard focus with the selected record as the visible window changes', () => {
    render(
      <RecordRoom
        albums={['A', 'B', 'C', 'D', 'E', 'F'].map(album)}
        onOpen={vi.fn()}
      />,
    )
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Open Album A by Test artist' }),
      { key: 'ArrowRight' },
    )
    expect(
      screen.getByRole('button', { name: 'Open Album B by Test artist' }),
    ).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(
      screen.getByRole('button', { name: 'Open Album D by Test artist' }),
    ).toHaveFocus()
  })

  it('recovers when a selected album is removed and keeps single-album navigation bounded', () => {
    sessionStorage.setItem('encore-selected-record', 'removed')
    render(<RecordRoom albums={[album('A')]} onOpen={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Open Album A by Test artist' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Previous album' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next album' })).toBeDisabled()
  })

  it('preserves the grid option and album-opening contract', () => {
    const onOpen = vi.fn()
    const albums = [album('A'), album('B')]
    render(
      <AlbumLibrary
        albums={albums}
        currentUserId="owner"
        loading={false}
        error=""
        onAdd={vi.fn()}
        onOpen={onOpen}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))
    expect(
      screen.queryByRole('region', { name: 'Record room' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Album B by Test artist' }),
    )
    expect(onOpen).toHaveBeenCalledWith(albums[1])
    expect(sessionStorage.getItem('encore-album-view')).toBe('grid')
  })

  it('persists the motion pause preference across surfaces', () => {
    const view = render(
      <CinematicMotionProvider>
        <RecordRoom albums={[album('A')]} onOpen={vi.fn()} />
      </CinematicMotionProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pause motion' }))
    expect(
      screen.getByRole('button', { name: 'Open Album A by Test artist' }),
    ).toHaveAttribute('data-motion', 'off')
    view.unmount()
    render(
      <CinematicMotionProvider>
        <WrappedFilm
          attended={[show('A', '2026-01-01', 'Attended')]}
          period={2026}
        />
      </CinematicMotionProvider>,
    )
    expect(
      screen.getByRole('button', { name: 'Resume motion' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('region', { name: 'Concert recap' }),
    ).toHaveAttribute('data-playing', 'false')
  })

  it('honours reduced motion without offering a conflicting resume control', () => {
    motionPreference.reduced = true
    render(
      <CinematicMotionProvider>
        <RecordRoom albums={[album('A')]} onOpen={vi.fn()} />
      </CinematicMotionProvider>,
    )
    expect(
      screen.queryByRole('button', { name: 'Pause motion' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Resume motion' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open Album A by Test artist' }),
    ).toHaveAttribute('data-motion', 'off')
  })

  it('uses actual ratings, including zero, and advances only on request', async () => {
    render(
      <WrappedFilm
        attended={[
          show('Unrated', '2026-01-01', 'Attended'),
          show('Rated', '2026-01-02', 'Attended', 0),
        ]}
        period={2026}
      />,
    )
    const film = screen.getByRole('region', { name: 'Concert recap' })
    expect(within(film).getByText('2 shows · 2 artists')).toBeInTheDocument()
    expect(
      within(film).getByRole('button', { name: 'Previous chapter' }),
    ).toBeDisabled()
    fireEvent.click(within(film).getByRole('button', { name: 'Start recap' }))
    expect(
      await within(film).findByRole('heading', { name: 'Rated' }),
    ).toBeInTheDocument()
    expect(within(film).getByLabelText('Rating: 0')).toBeInTheDocument()
    fireEvent.click(within(film).getByRole('button', { name: 'Next' }))
    expect(
      await within(film).findByRole('heading', { name: 'Unrated' }),
    ).toBeInTheDocument()
    fireEvent.click(within(film).getByRole('button', { name: 'Next' }))
    expect(await within(film).findByRole('heading', { name: 'Rated' })).toBeInTheDocument()
    fireEvent.click(within(film).getByRole('button', { name: 'Replay' }))
    expect(
      await within(film).findByRole('heading', { name: 'Your year live.' }),
    ).toBeInTheDocument()
  })
})
