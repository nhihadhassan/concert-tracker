import type { ArtworkSearchResponse, LibraryResponse, QueuedMutation } from '../types'

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
  accessToken: string,
  path: string,
  options: RequestInit = {},
  idempotencyKey?: string,
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  const response = await fetch(`/api${path}`, { ...options, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Cloud request failed.' }))
    throw new ApiError(response.status, detailMessage(body.detail), body.detail)
  }
  return response.json() as Promise<T>
}

export const fetchLibrary = (accessToken: string) =>
  apiRequest<LibraryResponse>(accessToken, '/v1/library')

export const searchArtwork = (accessToken: string, query: string, signal?: AbortSignal) =>
  apiRequest<ArtworkSearchResponse>(
    accessToken,
    `/v1/artwork/search?q=${encodeURIComponent(query)}`,
    { signal },
  )

export const sendQueuedMutation = (accessToken: string, mutation: QueuedMutation) => {
  const query = mutation.method === 'DELETE' && mutation.body && typeof mutation.body === 'object'
    ? `?expected_row_version=${encodeURIComponent(String((mutation.body as { expected_row_version: number }).expected_row_version))}`
    : ''
  return apiRequest<{
    concert_id: string
    resource_row_version: number
    replayed: boolean
    message: string
  }>(
    accessToken,
    `${mutation.path}${query}`,
    {
      method: mutation.method,
      body: mutation.method === 'DELETE' ? undefined : JSON.stringify(mutation.body),
    },
    mutation.idempotencyKey,
  )
}

export async function downloadCsv(accessToken: string): Promise<void> {
  const response = await fetch('/api/v1/concerts/export.csv', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new ApiError(response.status, 'CSV export failed.', null)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'concert-tracker.csv'
  link.click()
  URL.revokeObjectURL(url)
}
