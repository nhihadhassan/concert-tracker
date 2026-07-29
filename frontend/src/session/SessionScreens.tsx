export function SessionLoading() {
  return (
    <main className="app auth-page theme-dark" aria-label="Loading library">
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

export function SessionError({ message }: { message: string }) {
  return (
    <main className="app auth-page theme-dark">
      <section className="auth-panel" aria-labelledby="session-error-title">
        <div className="auth-heading">
          <div>
            <h2 id="session-error-title">Library unavailable</h2>
            <p>{message || 'The concert library could not be reached.'}</p>
          </div>
        </div>
        <button className="button button-primary" type="button" onClick={() => location.reload()}>
          Try again
        </button>
      </section>
    </main>
  )
}
