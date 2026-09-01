import { AppHeader } from '../components/AppHeader'

const savedThemeIsDark = () => localStorage.getItem('concert-theme') !== 'light'

const initialView = (): 'concerts' | 'albums' | 'stats' | 'wrapped' => {
  const params = new URLSearchParams(window.location.search)
  if (params.has('album') || params.get('view') === 'albums') return 'albums'
  if (params.get('view') === 'stats') return 'stats'
  if (params.get('view') === 'wrapped') return 'wrapped'
  return 'concerts'
}

export function EncoreLoading() {
  const darkMode = savedThemeIsDark()
  return (
    <div className={`app ${darkMode ? 'theme-dark' : 'theme-light'}`}>
      <a className="skip-link" href="#encore-main">Skip to content</a>
      <AppHeader activeView={initialView()} darkMode={darkMode} loading />
      <div id="encore-main">
        <main className="page-shell page-shell-feed encore-loading-shell" aria-label="Opening Encore" aria-busy="true">
          <h1 className="sr-only">Opening Encore</h1>
          <div className="dashboard-column" aria-hidden="true">
            <section className="loading-stats-row"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></section>
            <div className="skeleton loading-filter" />
            <section className="loading-card-grid"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></section>
          </div>
          <div className="ranking-column" aria-hidden="true"><div className="skeleton loading-ranking" /></div>
        </main>
      </div>
    </div>
  )
}

export function SessionError({ message }: { message: string }) {
  const darkMode = savedThemeIsDark()
  return (
    <div className={`app ${darkMode ? 'theme-dark' : 'theme-light'}`}>
      <AppHeader activeView={initialView()} darkMode={darkMode} loading />
      <main className="status-page">
        <section className="status-panel" aria-labelledby="session-error-title">
          <h1 id="session-error-title">Library unavailable</h1>
          <p>{message || 'The concert library could not be reached.'}</p>
          <button className="button button-primary" type="button" onClick={() => location.reload()}>Try again</button>
        </section>
      </main>
    </div>
  )
}
