import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, fetchLibrary, sendQueuedMutation } from '../lib/api'
import {
  listOutbox,
  queueMutation as persistMutation,
  readSnapshot,
  removeMutation,
  replaceMutation,
  writeSnapshot,
} from '../lib/offline'
import type { ConflictState, LibraryResponse, QueuedMutation, SyncState } from '../types'

const LIBRARY_KEY = ['concert-library'] as const
// Realtime needed a signed-in Supabase client; without one the library polls instead.
const REFRESH_INTERVAL_MS = 60_000

const conflictFromError = (mutation: QueuedMutation, error: ApiError): ConflictState => {
  const detail = error.detail && typeof error.detail === 'object'
    ? error.detail as { current?: Record<string, unknown>; message?: string }
    : null
  return {
    mutation,
    current: detail?.current ?? null,
    message: detail?.message ?? error.message,
  }
}

export function useConcertLibrary() {
  const queryClient = useQueryClient()
  const [pendingCount, setPendingCount] = useState(0)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [flushing, setFlushing] = useState(false)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [syncError, setSyncError] = useState('')
  const flushRef = useRef<() => Promise<void>>(async () => undefined)

  const query = useQuery({
    queryKey: LIBRARY_KEY,
    queryFn: async () => {
      try {
        const library = await fetchLibrary()
        await writeSnapshot(library)
        return library
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) throw error
        const snapshot = await readSnapshot()
        if (snapshot) return snapshot
        throw error
      }
    },
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })

  const refreshPending = useCallback(async () => {
    setPendingCount((await listOutbox()).length)
  }, [])

  const flushOutbox = useCallback(async () => {
    if (!navigator.onLine || flushing || conflict) return
    setFlushing(true)
    setSyncError('')
    try {
      const queued = await listOutbox()
      for (const mutation of queued) {
        try {
          await sendQueuedMutation(mutation)
          await removeMutation(mutation.id)
          await refreshPending()
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            setConflict(conflictFromError(mutation, error))
            return
          }
          if (!(error instanceof ApiError)) setOnline(false)
          setSyncError(error instanceof Error ? error.message : 'Pending changes could not sync.')
          return
        }
      }
      if (queued.length) await queryClient.invalidateQueries({ queryKey: LIBRARY_KEY })
    } finally {
      setFlushing(false)
    }
  }, [conflict, flushing, queryClient, refreshPending])

  flushRef.current = flushOutbox

  useEffect(() => {
    void refreshPending().then(() => {
      if (navigator.onLine) void flushRef.current()
    })
    const handleOnline = () => {
      setOnline(true)
      void flushRef.current()
    }
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refreshPending])

  const executeMutation = useCallback(async (
    mutation: QueuedMutation,
    optimisticUpdate: (library: LibraryResponse) => LibraryResponse,
  ) => {
    await persistMutation(mutation)
    queryClient.setQueryData<LibraryResponse>(LIBRARY_KEY, (current) => {
      if (!current) return current
      const updated = optimisticUpdate(current)
      void writeSnapshot(updated)
      return updated
    })
    await refreshPending()
    if (navigator.onLine) await flushRef.current()
  }, [queryClient, refreshPending])

  const discardConflict = useCallback(async () => {
    if (!conflict) return
    await removeMutation(conflict.mutation.id)
    setConflict(null)
    await refreshPending()
    await queryClient.invalidateQueries({ queryKey: LIBRARY_KEY })
    void flushRef.current()
  }, [conflict, queryClient, refreshPending])

  const retryConflict = useCallback(async () => {
    if (!conflict?.current) return
    const rowVersion = Number(conflict.current.row_version)
    const body = conflict.mutation.body && typeof conflict.mutation.body === 'object'
      ? { ...conflict.mutation.body as Record<string, unknown> }
      : {}
    if (conflict.mutation.path.endsWith('/attendees')) {
      const userId = String(conflict.current.user_id ?? '')
      body.expected_versions = {
        ...(body.expected_versions as Record<string, number> ?? {}),
        [userId]: rowVersion,
      }
    } else {
      body.expected_row_version = rowVersion
    }
    const replacement: QueuedMutation = {
      ...conflict.mutation,
      id: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      body,
      createdAt: new Date().toISOString(),
    }
    await removeMutation(conflict.mutation.id)
    await replaceMutation(replacement)
    setConflict(null)
    await refreshPending()
    void flushRef.current()
  }, [conflict, refreshPending])

  const syncState = useMemo<SyncState>(() => {
    if (conflict) return 'conflict'
    if (!online) return 'offline'
    if (flushing) return 'syncing'
    if (syncError || query.isError) return 'error'
    if (pendingCount) return 'pending'
    if (query.isLoading) return 'loading'
    return 'synced'
  }, [conflict, flushing, online, pendingCount, query.isError, query.isLoading, syncError])

  return {
    conflict,
    discardConflict,
    error: syncError || (query.error instanceof Error ? query.error.message : ''),
    executeMutation,
    flushOutbox,
    library: query.data ?? null,
    pendingCount,
    refetch: query.refetch,
    retryConflict,
    syncState,
  }
}
