import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App, { Dashboard } from './App'

const member = {
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.com',
  display_name: 'Nhihad',
  data_mode: 'staging' as const,
}

describe('Concert Tracker shell', () => {
  it('renders the baseline dashboard structure', () => {
    render(<Dashboard member={member} onSignOut={() => undefined} />)

    expect(screen.getByRole('heading', { name: "Nhihad's Concerts" })).toBeInTheDocument()
    expect(screen.getByText('Total concerts')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ranked Summary' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Don Toliver' })).toBeInTheDocument()
  })

  it('filters the fixture list by artist', () => {
    render(<Dashboard member={member} onSignOut={() => undefined} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Kendrick, Scotiabank...'), { target: { value: 'Kali' } })

    expect(screen.getByRole('heading', { name: 'Kali Uchis' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dave' })).not.toBeInTheDocument()
  })

  it('fails closed when staging auth is not configured', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Staging authentication is not configured for this deployment.',
    )
  })
})
