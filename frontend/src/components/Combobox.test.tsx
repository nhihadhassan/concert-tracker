import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Combobox } from './Combobox'

const SUGGESTIONS = ['Kendrick Lamar', 'Kali Uchis', 'Doja Cat']

describe('Combobox', () => {
  it('filters suggestions case-insensitively as the user types', () => {
    render(<Combobox name="artist" suggestions={SUGGESTIONS} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'kali' } })
    expect(screen.getByRole('option', { name: 'Kali Uchis' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Doja Cat' })).not.toBeInTheDocument()
  })

  it('commits a clicked suggestion into the input', () => {
    render(<Combobox name="artist" suggestions={SUGGESTIONS} />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'doja' } })
    fireEvent.click(screen.getByRole('option', { name: 'Doja Cat' }))
    expect(input.value).toBe('Doja Cat')
  })

  it('preserves an arbitrary value that is not in suggestions -- the core free-text requirement', () => {
    render(<Combobox name="genre" suggestions={SUGGESTIONS} />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Bedroom Pop' } })
    fireEvent.blur(input)
    expect(input.value).toBe('Bedroom Pop')
  })

  it('Escape closes the popover without altering the typed value', () => {
    render(<Combobox name="artist" suggestions={SUGGESTIONS} />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'kali' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input.value).toBe('kali')
  })
})
