import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DatePicker } from './DatePicker'

describe('DatePicker', () => {
  it('emits a value matching YYYY-MM-DD when a day is selected', () => {
    const onDateChange = vi.fn()
    const { container } = render(<DatePicker name="date" defaultValue="2026-08-15" onDateChange={onDateChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Aug 15, 2026/ }))
    fireEvent.click(screen.getByRole('gridcell', { name: '20' }))
    expect(onDateChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    expect(onDateChange).toHaveBeenCalledWith('2026-08-20')
    const hiddenInput = container.querySelector('input[name="date"]') as HTMLInputElement
    expect(hiddenInput.value).toBe('2026-08-20')
  })

  it('the Today button lands on the actual current date', () => {
    const onDateChange = vi.fn()
    render(<DatePicker name="date" onDateChange={onDateChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select date' }))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    const today = new Date()
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(onDateChange).toHaveBeenCalledWith(expected)
  })

  it('month navigation changes the displayed grid without committing a value', () => {
    const onDateChange = vi.fn()
    render(<DatePicker name="date" defaultValue="2026-08-15" onDateChange={onDateChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Aug 15, 2026/ }))
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(onDateChange).not.toHaveBeenCalled()
  })
})
