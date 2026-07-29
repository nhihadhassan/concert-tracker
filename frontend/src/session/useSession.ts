import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

export interface SessionMember {
  user_id: string
  email: string
  display_name: string
  data_mode: 'staging'
}

export type SessionStatus = 'loading' | 'ready' | 'error'

interface SessionState {
  error: string
  member: SessionMember | null
  status: SessionStatus
}

/**
 * The app has no sign-in. `/v1/session` reports the single identity the API
 * runs every request as, which the UI needs to attribute reviews and stats.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ error: '', member: null, status: 'loading' })

  useEffect(() => {
    let active = true
    apiRequest<SessionMember>('/v1/session')
      .then((member) => {
        if (active) setState({ error: '', member, status: 'ready' })
      })
      .catch((reason: unknown) => {
        if (!active) return
        setState({
          error: reason instanceof Error ? reason.message : 'Could not load this profile.',
          member: null,
          status: 'error',
        })
      })
    return () => {
      active = false
    }
  }, [])

  return state
}
