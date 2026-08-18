import type { Concert } from '../types'

export type RatingScope = 'personal' | 'shared'

const artistKey = (value: string) => value.replace(/\s+20\d{2}$/i, '').toLocaleLowerCase('en-CA').replace(/\$/g, 's').replace(/[^a-z0-9]+/g, ' ').trim()
const venueKey = (value: string) => value.replace(/\s*\([^)]*\)\s*$/, '').trim().toLocaleLowerCase('en-CA')
const dayOfYear = (value: string) => value.slice(5)
const weekKey = (value: string) => {
  const date = new Date(`${value}T12:00:00Z`)
  const thursday = new Date(date)
  thursday.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${thursday.getUTCFullYear()}-${week}`
}

const attended = (concerts: Concert[]) => concerts.filter((concert) => concert.status === 'Attended').sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
const ratingFor = (concert: Concert, scope: RatingScope) => scope === 'personal' ? concert.personal_rating : concert.combined_rating

export interface ArchiveMemory {
  concert: Concert
  kind: 'on_this_day' | 'this_week' | 'highly_rated' | 'repeat_artist'
  label: string
}

export function buildMemoryLane(concerts: Concert[], now = new Date()): ArchiveMemory | null {
  const rows = attended(concerts)
  if (!rows.length) return null
  const today = now.toISOString().slice(0, 10)
  const todayYear = Number(today.slice(0, 4))
  const exact = rows.filter((row) => row.date < today && dayOfYear(row.date) === dayOfYear(today))
  if (exact.length) {
    const concert = exact[exact.length - 1]
    return { concert, kind: 'on_this_day', label: `On this day ${todayYear - Number(concert.date.slice(0, 4))} years ago` }
  }
  const currentWeek = weekKey(today).split('-')[1]
  const sameWeek = rows.filter((row) => row.date < today && weekKey(row.date).split('-')[1] === currentWeek)
  if (sameWeek.length) {
    const concert = sameWeek[sameWeek.length - 1]
    return { concert, kind: 'this_week', label: `${todayYear - Number(concert.date.slice(0, 4))} years ago this week` }
  }
  const highlyRated = rows.filter((row) => (row.personal_rating ?? row.combined_rating ?? 0) >= 8.5)
  if (highlyRated.length) {
    const concert = highlyRated.sort((left, right) => (right.personal_rating ?? right.combined_rating ?? 0) - (left.personal_rating ?? left.combined_rating ?? 0) || right.date.localeCompare(left.date))[0]
    return { concert, kind: 'highly_rated', label: 'A highly rated night' }
  }
  const counts = new Map<string, number>()
  rows.forEach((row) => counts.set(artistKey(row.artist), (counts.get(artistKey(row.artist)) ?? 0) + 1))
  const repeat = [...rows].reverse().find((row) => (counts.get(artistKey(row.artist)) ?? 0) > 1) ?? rows[rows.length - 1]
  return { concert: repeat, kind: 'repeat_artist', label: 'A repeat-artist memory' }
}

export interface ArchiveHealthItem { concert: Concert; issues: string[] }

export function archiveHealth(concerts: Concert[], scope: RatingScope, now = new Date()): ArchiveHealthItem[] {
  const cutoff = new Date(now)
  cutoff.setUTCDate(cutoff.getUTCDate() - 30)
  const cutoffDate = cutoff.toISOString().slice(0, 10)
  return attended(concerts).filter((concert) => concert.date <= cutoffDate).map((concert) => {
    const issues = [
      !concert.image ? 'Artwork' : null,
      ratingFor(concert, scope) === null ? 'Rating' : null,
      !concert.tour ? 'Tour' : null,
      concert.price === null ? 'Ticket price' : null,
      !concert.setlist_url ? 'Setlist' : null,
    ].filter((value): value is string => Boolean(value))
    return { concert, issues }
  }).filter((row) => row.issues.length).sort((left, right) => right.issues.length - left.issues.length || left.concert.date.localeCompare(right.concert.date))
}

export interface Milestone { label: string }

export function buildMilestones(concerts: Concert[]): Map<string, Milestone[]> {
  const result = new Map<string, Milestone[]>()
  const artistCounts = new Map<string, number>()
  const venueCounts = new Map<string, number>()
  const uniqueArtists = new Set<string>()
  const uniqueVenues = new Set<string>()
  const yearly = new Map<string, number>()
  attended(concerts).forEach((concert, index) => {
    const labels: string[] = []
    const overall = index + 1
    if (overall >= 25 && overall % 25 === 0) labels.push(`${overall}th concert in your archive`)
    const artist = artistKey(concert.artist)
    const seenArtist = (artistCounts.get(artist) ?? 0) + 1
    artistCounts.set(artist, seenArtist)
    if (seenArtist >= 5 && seenArtist % 5 === 0) labels.push(`Your ${seenArtist}th time seeing ${concert.artist.replace(/\s+20\d{2}$/i, '')}`)
    const venue = venueKey(concert.venue)
    const seenVenue = (venueCounts.get(venue) ?? 0) + 1
    venueCounts.set(venue, seenVenue)
    if (seenVenue === 1) labels.push(`Your first concert at ${concert.venue.replace(/\s*\([^)]*\)\s*$/, '')}`)
    if (!uniqueArtists.has(artist)) {
      uniqueArtists.add(artist)
      if ([25, 50, 100].includes(uniqueArtists.size)) labels.push(`${uniqueArtists.size} unique artists reached`)
    }
    if (!uniqueVenues.has(venue)) {
      uniqueVenues.add(venue)
      if ([10, 25, 50].includes(uniqueVenues.size)) labels.push(`${uniqueVenues.size} unique venues reached`)
    }
    const year = concert.date.slice(0, 4)
    const yearCount = (yearly.get(year) ?? 0) + 1
    yearly.set(year, yearCount)
    if (yearCount >= 10 && yearCount % 10 === 0) labels.push(`${yearCount} concerts attended in ${year}`)
    if (labels.length) result.set(concert.id, labels.map((label) => ({ label })))
  })
  return result
}

export interface YearComparison {
  year: number
  attended: number
  artists: number
  venues: number
  spend: number
  averageRating: number | null
  newArtists: number
  busiestMonth: string | null
  mostSeenArtist: string | null
}

const monthName = (month: number) => new Intl.DateTimeFormat('en-CA', { month: 'long' }).format(new Date(Date.UTC(2026, month - 1, 1)))

export function compareYear(concerts: Concert[], year: number, scope: RatingScope): YearComparison {
  const rows = attended(concerts)
  const inYear = rows.filter((concert) => concert.date.startsWith(`${year}-`))
  const before = new Set(rows.filter((concert) => concert.date < `${year}-01-01`).map((concert) => artistKey(concert.artist)))
  const artists = new Set(inYear.map((concert) => artistKey(concert.artist)))
  const venues = new Set(inYear.map((concert) => venueKey(concert.venue)))
  const ratings = inYear.map((concert) => ratingFor(concert, scope)).filter((rating): rating is number => rating !== null)
  const months = new Map<number, number>()
  const artistCounts = new Map<string, { name: string; count: number }>()
  inYear.forEach((concert) => {
    const month = Number(concert.date.slice(5, 7))
    months.set(month, (months.get(month) ?? 0) + 1)
    const key = artistKey(concert.artist)
    const current = artistCounts.get(key) ?? { name: concert.artist.replace(/\s+20\d{2}$/i, ''), count: 0 }
    current.count += 1
    artistCounts.set(key, current)
  })
  const busy = [...months.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]
  const favourite = [...artistCounts.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))[0]
  return {
    year, attended: inYear.length, artists: artists.size, venues: venues.size,
    spend: inYear.reduce((total, concert) => total + (concert.price ?? 0), 0),
    averageRating: ratings.length ? Number((ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(1)) : null,
    newArtists: [...artists].filter((artist) => !before.has(artist)).length,
    busiestMonth: busy ? monthName(busy[0]) : null,
    mostSeenArtist: favourite?.name ?? null,
  }
}

export function comparisonObservations(left: YearComparison, right: YearComparison): string[] {
  const observations = []
  if (left.attended !== right.attended) observations.push(`${left.attended > right.attended ? left.year : right.year} had ${Math.abs(left.attended - right.attended)} more attended ${Math.abs(left.attended - right.attended) === 1 ? 'show' : 'shows'}.`)
  if (left.artists !== right.artists) observations.push(`${left.artists > right.artists ? left.year : right.year} introduced ${Math.abs(left.artists - right.artists)} more artists to the archive.`)
  if (left.averageRating !== null && right.averageRating !== null && left.averageRating !== right.averageRating) observations.push(`${left.averageRating > right.averageRating ? left.year : right.year} had the stronger average rating.`)
  return observations.slice(0, 3)
}
