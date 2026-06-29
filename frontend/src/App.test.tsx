import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Concert Tracker shell', () => {
  it('renders the baseline dashboard structure', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: "Nhihad's Concerts" })).toBeInTheDocument()
    expect(screen.getByText('Total concerts')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ranked Summary' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Don Toliver' })).toBeInTheDocument()
  })

  it('filters the fixture list by artist', () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Kendrick, Scotiabank...'), { target: { value: 'Kali' } })

    expect(screen.getByRole('heading', { name: 'Kali Uchis' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dave' })).not.toBeInTheDocument()
  })
})
