export type ConcertStatus = 'Attended' | 'Want to Go' | 'Cancelled'

export interface Concert {
  id: string
  artist: string
  tour: string
  date: string
  venue: string
  price: number
  genre: string
  projected: number | null
  realized: number | null
  seat: string
  status: ConcertStatus
  companions: string
  rachelAttended: boolean
  image: string
  type: string
  notes?: string
}

export interface RankingRow {
  artist: string
  rating: number
  projected: number | null
  year: string
  price: number
}
