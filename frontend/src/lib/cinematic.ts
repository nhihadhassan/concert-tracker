import type { Concert } from '../types'

export function selectFeaturedConcert(concerts: Concert[], today: string) {
  const upcoming = concerts
    .filter(
      (concert) => concert.status === 'Want to Go' && concert.date >= today,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
  return (
    upcoming[0] ??
    concerts
      .filter((concert) => concert.status === 'Attended')
      .sort((a, b) => b.date.localeCompare(a.date))[0]
  )
}
