import { createContext } from 'react'

export interface AuthMember {
  user_id: string
  email: string
  display_name: string
  data_mode: 'staging'
}

export type AuthStatus = 'loading' | 'signed-out' | 'signing-in' | 'validating' | 'signed-in' | 'error'

export interface AuthContextValue {
  error: string
  member: AuthMember | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  status: AuthStatus
}

export const AuthContext = createContext<AuthContextValue | null>(null)
