import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { AuthContext } from './AuthContext'
import type { AuthContextValue, AuthMember, AuthStatus } from './AuthContext'

const readableError = (message: string) => {
  if (message.toLowerCase().includes('invalid login credentials')) return 'Email or password is incorrect.'
  if (message.toLowerCase().includes('email not confirmed')) return 'Confirm this email before signing in.'
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [member, setMember] = useState<AuthMember | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setError('Staging authentication is not configured for this deployment.')
      setStatus('error')
      return
    }

    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setStatus(data.session ? 'validating' : 'signed-out')
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setMember(null)
      setError('')
      setStatus(nextSession ? 'validating' : 'signed-out')
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    setStatus('validating')
    void fetch('/api/v1/session', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: 'Session validation failed.' }))
        throw new Error(body.detail ?? 'Session validation failed.')
      }
      return response.json() as Promise<AuthMember>
    }).then((verifiedMember) => {
      setMember(verifiedMember)
      setError('')
      setStatus('signed-in')
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      setMember(null)
      setError(readableError(reason instanceof Error ? reason.message : 'Session validation failed.'))
      setStatus('error')
    })
    return () => controller.abort()
  }, [session])

  const value = useMemo<AuthContextValue>(() => ({
    error,
    member,
    status,
    signIn: async (email, password) => {
      if (!supabaseConfigured || !supabase) {
        setError('Staging authentication is not configured for this deployment.')
        setStatus('error')
        return
      }
      setError('')
      setStatus('signing-in')
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(readableError(signInError.message))
        setStatus('signed-out')
      }
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut()
      setSession(null)
      setMember(null)
      setError('')
      setStatus('signed-out')
    },
  }), [error, member, status])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
