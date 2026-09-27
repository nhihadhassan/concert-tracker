import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Concert } from '../../types'
import { MotionContext } from '../../hooks/useCinematicMotion'
import { StageReplay } from './StageReplay'

const shows = ['First', 'Second'].map(
  (artist, index) =>
    ({
      id: artist,
      artist,
      date: `2025-06-0${index + 1}`,
      venue: 'Test venue',
      image: null,
      personal_rating: index === 0 ? 0 : 9,
    }) as Concert,
)
afterEach(() => vi.unstubAllGlobals())

it('keeps Replay silent until explicitly enabled and handles unsupported audio', async () => {
  const audio = vi.fn(function () {
    throw new Error('Unavailable')
  })
  vi.stubGlobal('AudioContext', audio)
  render(<StageReplay concerts={shows} period="2025" onClose={() => {}} />)
  expect(audio).not.toHaveBeenCalled()
  expect(screen.getByText('0')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next show' }))
  await screen.findByRole('heading', { name: 'Second' })
  expect(audio).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Turn sound on' }))
  await screen.findByRole('status')
  expect(screen.getByRole('button', { name: 'Turn sound on' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

it('keeps manual Replay navigation available when motion is paused', async () => {
  render(
    <MotionContext.Provider
      value={{ paused: true, hidden: false, toggle: () => {} }}
    >
      <StageReplay concerts={shows} period="2025" onClose={() => {}} />
    </MotionContext.Provider>,
  )
  expect(
    screen.queryByRole('button', { name: 'Play Replay' }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next show' }))
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument(),
  )
  expect(screen.getByRole('button', { name: 'Next show' })).toBeDisabled()
})
