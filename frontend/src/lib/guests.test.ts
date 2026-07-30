import { describe, expect, it } from 'vitest'
import { addGuests, parseGuests, serializeGuests } from './guests'

describe('parseGuests', () => {
  it('splits a comma-separated list and trims each name', () => {
    expect(parseGuests('Sarah, Mike,  Dad ')).toEqual(['Sarah', 'Mike', 'Dad'])
  })

  it('treats empty, null, and blank-only values as no guests', () => {
    expect(parseGuests('')).toEqual([])
    expect(parseGuests(null)).toEqual([])
    expect(parseGuests(undefined)).toEqual([])
    expect(parseGuests(' , , ')).toEqual([])
  })

  it('keeps a single name with no commas', () => {
    expect(parseGuests('Sarah')).toEqual(['Sarah'])
  })
})

describe('addGuests', () => {
  it('appends a new name', () => {
    expect(addGuests(['Sarah'], 'Mike')).toEqual(['Sarah', 'Mike'])
  })

  it('ignores duplicates regardless of case or padding', () => {
    expect(addGuests(['Sarah'], 'sarah')).toEqual(['Sarah'])
    expect(addGuests(['Sarah'], '  SARAH  ')).toEqual(['Sarah'])
  })

  it('accepts several names pasted at once', () => {
    expect(addGuests([], 'Sarah, Mike')).toEqual(['Sarah', 'Mike'])
  })

  it('ignores blank input', () => {
    expect(addGuests(['Sarah'], '   ')).toEqual(['Sarah'])
    expect(addGuests(['Sarah'], ',')).toEqual(['Sarah'])
  })
})

describe('serializeGuests', () => {
  it('round-trips through parseGuests', () => {
    const names = ['Sarah', 'Mike', 'Dad']
    expect(parseGuests(serializeGuests(names))).toEqual(names)
  })

  it('stores no guests as null rather than an empty string', () => {
    expect(serializeGuests([])).toBeNull()
  })
})
