import { openDB } from 'idb'
import type { LibraryResponse, QueuedMutation } from '../types'

const dbPromise = openDB('concert-tracker', 1, {
  upgrade(database) {
    database.createObjectStore('snapshots')
    database.createObjectStore('outbox', { keyPath: 'id' })
  },
})

export async function readSnapshot(): Promise<LibraryResponse | null> {
  return (await dbPromise).get('snapshots', 'library') ?? null
}

export async function writeSnapshot(library: LibraryResponse): Promise<void> {
  await (await dbPromise).put('snapshots', library, 'library')
}

export async function listOutbox(): Promise<QueuedMutation[]> {
  const rows = await (await dbPromise).getAll('outbox')
  return rows.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function queueMutation(mutation: QueuedMutation): Promise<void> {
  await (await dbPromise).put('outbox', mutation)
}

export async function removeMutation(id: string): Promise<void> {
  await (await dbPromise).delete('outbox', id)
}

export async function replaceMutation(mutation: QueuedMutation): Promise<void> {
  await (await dbPromise).put('outbox', mutation)
}
