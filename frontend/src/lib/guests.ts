// Guests are people who came to a show but are not app members, so they have
// no account to attend under. They live in the concert's free-text
// `companions` field as a comma-separated list, which keeps existing rows
// valid while still letting the UI treat each name as its own tag.

export const parseGuests = (value: string | null | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

export const serializeGuests = (names: string[]): string | null =>
  names.join(', ').trim() || null

/** Add names, ignoring blanks and case-insensitive duplicates. */
export const addGuests = (existing: string[], raw: string): string[] => {
  const next = [...existing]
  for (const name of parseGuests(raw)) {
    if (!next.some((guest) => guest.toLowerCase() === name.toLowerCase())) next.push(name)
  }
  return next
}
