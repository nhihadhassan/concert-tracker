import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dropdown } from './Dropdown'

const OPTIONS = [
  { value: 'want', label: 'Want to Go' },
  { value: 'attended', label: 'Attended' },
  { value: 'cancelled', label: 'Cancelled' },
]

describe('Dropdown (controlled)', () => {
  it('opens on click and calls onChange when an option is clicked', () => {
    const onChange = vi.fn()
    render(<Dropdown label="Status" options={OPTIONS} value="want" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    fireEvent.click(screen.getByRole('option', { name: 'Attended' }))
    expect(onChange).toHaveBeenCalledWith('attended')
  })

  it('opens on Enter, navigates with arrow keys, and commits with Enter', () => {
    const onChange = vi.fn()
    render(<Dropdown label="Status" options={OPTIONS} value="want" onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: 'Status' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('cancelled')
  })

  it('closes on Escape without changing the value', () => {
    const onChange = vi.fn()
    render(<Dropdown label="Status" options={OPTIONS} value="want" onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: 'Status' })
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Dropdown (uncontrolled, form-backed)', () => {
  it('renders a hidden native select mirroring the chosen value under the given name', () => {
    const { container } = render(
      <form>
        <Dropdown label="Status" name="status" options={OPTIONS} defaultValue="want" />
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    fireEvent.click(screen.getByRole('option', { name: 'Cancelled' }))
    const select = container.querySelector('select[name="status"]') as HTMLSelectElement
    expect(select.value).toBe('cancelled')
  })

  it('syncs its displayed value when the hidden mirror is written to directly and an input event fires', () => {
    const { container } = render(
      <form>
        <Dropdown label="Status" name="status" options={OPTIONS} defaultValue="want" />
      </form>,
    )
    const select = container.querySelector('select[name="status"]') as HTMLSelectElement
    select.value = 'attended'
    fireEvent.input(select)
    expect(screen.getByRole('button', { name: 'Status' })).toHaveTextContent('Attended')
  })
})
