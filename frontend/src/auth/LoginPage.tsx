import { useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, LockKeyhole, Mic2 } from 'lucide-react'
import { useAuth } from './useAuth'

export function LoginPage() {
  const { error, signIn, status } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const busy = status === 'signing-in' || status === 'validating'

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void signIn(String(data.get('email') ?? '').trim(), String(data.get('password') ?? ''))
  }

  return (
    <main className="app auth-page theme-dark">
      <section className="auth-panel" aria-labelledby="sign-in-title">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true"><Mic2 size={23} strokeWidth={2.3} /></span>
          <div>
            <h1>Nhihad's Concerts</h1>
            <p>Shared concert library</p>
          </div>
        </div>

        <div className="auth-heading">
          <span className="auth-heading-icon" aria-hidden="true"><LockKeyhole size={18} /></span>
          <div>
            <h2 id="sign-in-title">Sign in</h2>
            <p>Use the password assigned to your account.</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" autoComplete="email" required placeholder="name@example.com" />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <span className="password-field">
              <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required minLength={12} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} title={showPassword ? 'Hide password' : 'Show password'} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </div>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Checking account...' : 'Sign in'}
          </button>
        </form>
        <p className="auth-access-note">Access is limited to Nhihad and Rachel.</p>
      </section>
    </main>
  )
}

export function AuthLoading() {
  return (
    <main className="app auth-page theme-dark" aria-label="Loading account">
      <section className="auth-panel auth-skeleton" aria-hidden="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-copy" />
        <div className="skeleton skeleton-field" />
        <div className="skeleton skeleton-field" />
        <div className="skeleton skeleton-button" />
      </section>
    </main>
  )
}
