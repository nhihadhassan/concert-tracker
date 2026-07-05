export type ConcertStatus = 'Attended' | 'Want to Go' | 'Cancelled'
export type AttendanceStatus = 'Planned' | 'Attended' | 'Did Not Attend'

export interface MemberSummary {
  user_id: string
  email: string
  display_name: string
}

export interface Attendee {
  user_id: string
  display_name: string
  attendance_status: AttendanceStatus
  row_version: number
}

export interface Review {
  id: string
  reviewer_user_id: string
  reviewer_name: string
  enjoyment_score: number | null
  stage_score: number | null
  setlist_score: number | null
  seat_score: number | null
  override_rating: number | null
  override_reason: string | null
  notes: string | null
  calculated_rating: number | null
  final_rating: number | null
  is_overridden: boolean
  row_version: number
}

export interface Concert {
  id: string
  artist: string
  tour: string | null
  date: string
  venue: string
  price: number | null
  genre: string | null
  projected: number | null
  seat: string | null
  status: ConcertStatus
  type: string
  spotify_url: string | null
  image: string | null
  notes: string | null
  companions: string | null
  row_version: number
  attendees: Attendee[]
  reviews: Review[]
  personal_rating: number | null
  combined_rating: number | null
  pending?: boolean
}

export interface RankingRow {
  rank: number
  concert_id: string
  artist: string
  concert_date: string
  rating: number
}

export interface ArtworkOption {
  url: string
  title: string
  artist: string
  store_url: string | null
}

export interface ArtworkSearchResponse {
  results: ArtworkOption[]
}

export interface RatingSummary {
  scope: string
  rated_concerts: number
  average_rating: number | null
}

export interface ProjectionSummary {
  compared_concerts: number
  mean_absolute_error: number | null
  root_mean_square_error: number | null
  bias: number | null
  within_one_point_percent: number | null
}

export interface YearlyTrend {
  year: number
  concerts: number
  attended: number
  total_spent: number
  average_combined_rating: number | null
}

export interface MonthlyTrend {
  year: number
  month: number
  concerts: number
  attended: number
}

export interface GroupSummary {
  key: string
  concerts: number
  attended: number
  total_spent: number
  average_combined_rating: number | null
}

export interface WeekdaySummary {
  weekday: string
  count: number
}

export interface Analytics {
  total_concerts: number
  status_counts: Record<string, number>
  date_first: string | null
  date_last: string | null
  spending: {
    total_spent_excluding_cancelled: number
    attended_spent: number
    upcoming_committed: number
    priced_concerts: number
    average_attended_ticket: number | null
  }
  rating_summaries: RatingSummary[]
  projection: ProjectionSummary
  yearly_trends: YearlyTrend[]
  monthly_trends: MonthlyTrend[]
  most_attended_weekday: WeekdaySummary | null
  artist_summaries: GroupSummary[]
  genre_summaries: GroupSummary[]
  venue_summaries: GroupSummary[]
  repeat_artists: GroupSummary[]
  rankings: Record<string, RankingRow[]>
}

export interface LibraryResponse {
  members: MemberSummary[]
  concerts: Concert[]
  analytics: Analytics
  personal_analytics: Analytics
}

export interface ReviewWrite {
  id: string
  expected_row_version?: number | null
  enjoyment_score: number | null
  stage_score: number | null
  setlist_score: number | null
  seat_score: number | null
  override_rating: number | null
  override_reason: string | null
  notes: string | null
}

export interface ConcertFields {
  artist: string
  tour: string | null
  date: string
  venue: string
  price: number | null
  genre: string | null
  projected: number | null
  seat: string | null
  status: ConcertStatus
  type: string
  spotify_url: string | null
  image: string | null
  notes: string | null
  companions: string | null
}

export interface ConcertCreate extends ConcertFields {
  id: string
  attendee_user_ids: string[]
  review: ReviewWrite | null
}

export interface ConcertUpdate extends ConcertFields {
  expected_row_version: number
}

export interface AttendanceWrite {
  attendee_user_ids: string[]
  expected_versions: Record<string, number>
}

export interface ConcertFormSubmission {
  fields: ConcertFields
  attendee_user_ids: string[]
  review: ReviewWrite | null
}

export interface QueuedMutation {
  id: string
  idempotencyKey: string
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
  body: unknown
  label: string
  createdAt: string
}

export interface ConflictState {
  mutation: QueuedMutation
  current: Record<string, unknown> | null
  message: string
}

export type SyncState = 'loading' | 'synced' | 'syncing' | 'offline' | 'pending' | 'error' | 'conflict'
