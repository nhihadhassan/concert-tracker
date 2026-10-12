import { describe, expect, it } from 'vitest'
import { formatConcertRating100, toStoredConcertRating } from './concertRating'

describe('concert rating scale', () => {
  it('formats existing 10-point scores on a 100-point scale', () => {
    expect(formatConcertRating100(8.4)).toBe('84')
    expect(formatConcertRating100(8.45)).toBe('84.5')
    expect(formatConcertRating100(10)).toBe('100')
  })

  it('converts new 100-point values to the existing rating domain', () => {
    expect(toStoredConcertRating(84)).toBe(8.4)
    expect(toStoredConcertRating(84.5)).toBe(8.45)
    expect(toStoredConcertRating(null)).toBeNull()
  })
})
