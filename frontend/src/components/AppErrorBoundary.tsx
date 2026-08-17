import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  failed: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Encore view failed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="app auth-page theme-dark">
        <section className="auth-panel app-error-panel" role="alert">
          <TriangleAlert size={28} aria-hidden="true" />
          <h1>Encore hit a bad note</h1>
          <p>Your concert data has not been changed. Reload the app to try this view again.</p>
          <button className="button button-primary" type="button" onClick={() => window.location.reload()}><RefreshCw size={17} aria-hidden="true" />Reload Encore</button>
        </section>
      </main>
    )
  }
}
