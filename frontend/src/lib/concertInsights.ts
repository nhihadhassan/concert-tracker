import type { Concert } from '../types'

export type InsightPeriod = 'all' | number

export interface ConcertStory {
  attended: Concert[]
  uniqueArtists: number
  uniqueVenues: number
  newArtists: string[]
  returningArtists: string[]
  repeatArtists: Array<[string, number]>
  busiestMonth: { label: string; count: number } | null
  longestMonthlyStreak: number
  closestRun: { days: number; first: Concert; second: Concert } | null
  weekendShare: number
  topVenue: [string, number] | null
}

const monthFormatter = new Intl.DateTimeFormat('en-CA', { month: 'long' })

const artistKey = (value: string) => value.trim().toLocaleLowerCase('en-CA')
const venueName = (value: string) => value.split('(')[0].trim()
const dayNumber = (value: string) => Date.parse(`${value}T12:00:00Z`) / 86_400_000

const countNamedValues = (values: string[]) => {
  const display = new Map<string, string>()
  const counts = new Map<string, number>()
  values.forEach((value) => {
    const key = value.trim().toLocaleLowerCase('en-CA')
    if (!key) return
    display.set(key, display.get(key) ?? value.trim())
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return [...counts.entries()]
    .map(([key, count]) => [display.get(key) ?? key, count] as [string, number])
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
}

const longestStreak = (rows: Concert[]) => {
  const months = [...new Set(rows.map((concert) => {
    const [year, month] = concert.date.split('-').map(Number)
    return year * 12 + month
  }))].sort((left, right) => left - right)
  let longest = 0
  let current = 0
  let previous: number | null = null
  months.forEach((month) => {
    current = previous !== null && month === previous + 1 ? current + 1 : 1
    longest = Math.max(longest, current)
    previous = month
  })
  return longest
}

export function buildConcertStory(concerts: Concert[], period: InsightPeriod): ConcertStory {
  const allAttended = concerts
    .filter((concert) => concert.status === 'Attended')
    .sort((left, right) => left.date.localeCompare(right.date))
  const attended = period === 'all'
    ? allAttended
    : allAttended.filter((concert) => concert.date.startsWith(String(period)))
  const periodStart = period === 'all' ? null : `${period}-01-01`
  const priorArtists = new Set(allAttended
    .filter((concert) => periodStart && concert.date < periodStart)
    .map((concert) => artistKey(concert.artist)))
  const artistCounts = countNamedValues(attended.map((concert) => concert.artist))
  const selectedArtistNames = new Map(attended.map((concert) => [artistKey(concert.artist), concert.artist]))
  const newArtists = [...selectedArtistNames]
    .filter(([key]) => !priorArtists.has(key))
    .map(([, name]) => name)
    .sort((left, right) => left.localeCompare(right))
  const returningArtists = [...selectedArtistNames]
    .filter(([key]) => priorArtists.has(key))
    .map(([, name]) => name)
    .sort((left, right) => left.localeCompare(right))
  const monthCounts = new Map<number, number>()
  attended.forEach((concert) => {
    const month = Number(concert.date.slice(5, 7)) - 1
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1)
  })
  const busiestMonthEntry = [...monthCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]
  let closestRun: ConcertStory['closestRun'] = null
  attended.forEach((concert, index) => {
    if (!index) return
    const first = attended[index - 1]
    const days = Math.round(dayNumber(concert.date) - dayNumber(first.date))
    if (!closestRun || days < closestRun.days) closestRun = { days, first, second: concert }
  })
  const weekendShows = attended.filter((concert) => {
    const day = new Date(`${concert.date}T12:00:00`).getDay()
    return day === 5 || day === 6 || day === 0
  }).length
  const venues = countNamedValues(attended.map((concert) => venueName(concert.venue)))

  return {
    attended,
    uniqueArtists: artistCounts.length,
    uniqueVenues: venues.length,
    newArtists,
    returningArtists,
    repeatArtists: artistCounts.filter(([, count]) => count > 1),
    busiestMonth: busiestMonthEntry
      ? { label: monthFormatter.format(new Date(2020, busiestMonthEntry[0], 1)), count: busiestMonthEntry[1] }
      : null,
    longestMonthlyStreak: longestStreak(attended),
    closestRun,
    weekendShare: attended.length ? Math.round(weekendShows / attended.length * 100) : 0,
    topVenue: venues[0] ?? null,
  }
}
