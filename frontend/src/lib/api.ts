import type {
  AlbumLibraryResponse,
  AlbumMutationResponse,
  AlbumReviewWrite,
  ArtworkSearchResponse,
  ConcertSuggestionMode,
  ConcertSuggestionResponse,
  DiscoveryStatus,
  LibraryResponse,
  LyricBreakdown,
  QueuedMutation,
  SpotifyAlbumOption,
  SpotifyInsights,
  SpotifyPulse,
  SpotifyRange,
  SpotifyStatus,
} from '../types'

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, message: string, detail: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

const detailMessage = (detail: unknown) => {
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: unknown }).message)
  }
  return 'Cloud request failed.'
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  idempotencyKey?: string,
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  const response = await fetch(`/api${path}`, { ...options, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Cloud request failed.' }))
    throw new ApiError(response.status, detailMessage(body.detail), body.detail)
  }
  return response.json() as Promise<T>
}

export const fetchLibrary = () =>
  apiRequest<LibraryResponse>('/v1/library')

export const fetchAlbums = () =>
  apiRequest<AlbumLibraryResponse>('/v1/albums')

export const searchSpotifyAlbums = (
  query: string,
  signal?: AbortSignal,
) =>
  apiRequest<{ results: SpotifyAlbumOption[] }>(`/v1/albums/search?q=${encodeURIComponent(query)}`,
    { signal },
  )

export const importSpotifyAlbum = (
  spotifyAlbumId: string,
  idempotencyKey = crypto.randomUUID(),
) =>
  apiRequest<AlbumMutationResponse>('/v1/albums/import',
    {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID(),
        spotify_album_id: spotifyAlbumId,
      }),
    },
    idempotencyKey,
  )

export const saveAlbumReview = (
  albumId: string,
  review: AlbumReviewWrite,
  idempotencyKey = crypto.randomUUID(),
) =>
  apiRequest<AlbumMutationResponse>(`/v1/albums/${albumId}/review`,
    { method: 'PUT', body: JSON.stringify(review) },
    idempotencyKey,
  )

export const searchArtwork = (query: string, signal?: AbortSignal) =>
  apiRequest<ArtworkSearchResponse>(`/v1/artwork/search?q=${encodeURIComponent(query)}`,
    { signal },
  )

export const fetchDiscoveryStatus = (signal?: AbortSignal) =>
  apiRequest<DiscoveryStatus>('/v1/discovery/status', { signal })

export const searchConcertSuggestions = (
  artist: string,
  mode: ConcertSuggestionMode,
  signal?: AbortSignal,
) =>
  apiRequest<ConcertSuggestionResponse>(
    `/v1/discovery/concerts?artist=${encodeURIComponent(artist)}&mode=${mode}`,
    { signal },
  )

export const fetchSpotifyStatus = () =>
  apiRequest<SpotifyStatus>('/v1/spotify/status')

export const startSpotifyLogin = () =>
  apiRequest<{ authorize_url: string }>('/v1/spotify/login')

export const connectSpotify = (refreshToken: string) =>
  apiRequest<SpotifyStatus>('/v1/spotify/connect', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

export const disconnectSpotify = () =>
  apiRequest<SpotifyStatus>('/v1/spotify/disconnect', { method: 'POST' })

export const fetchSpotifyPulse = (signal?: AbortSignal) =>
  apiRequest<SpotifyPulse>('/v1/spotify/pulse', { signal })

export const fetchSpotifyInsights = (range: SpotifyRange, signal?: AbortSignal) =>
  apiRequest<SpotifyInsights>(`/v1/spotify/insights?range=${range}`, { signal })

export const fetchLyricBreakdown = (artist: string, track?: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({ artist })
  if (track) params.set('track', track)
  return apiRequest<LyricBreakdown>(`/v1/lyrics/breakdown?${params.toString()}`, { signal })
}

export const sendQueuedMutation = (mutation: QueuedMutation) => {
  const query = mutation.method === 'DELETE' && mutation.body && typeof mutation.body === 'object'
    ? `?expected_row_version=${encodeURIComponent(String((mutation.body as { expected_row_version: number }).expected_row_version))}`
    : ''
  return apiRequest<{
    concert_id: string
    resource_row_version: number
    replayed: boolean
    message: string
  }>(`${mutation.path}${query}`,
    {
      method: mutation.method,
      body: mutation.method === 'DELETE' ? undefined : JSON.stringify(mutation.body),
    },
    mutation.idempotencyKey,
  )
}

export async function downloadCsv(): Promise<void> {
  const response = await fetch('/api/v1/concerts/export.csv')
  if (!response.ok) throw new ApiError(response.status, 'CSV export failed.', null)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'concert-tracker.csv'
  link.click()
  URL.revokeObjectURL(url)
}
