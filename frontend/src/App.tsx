import { useEffect, useMemo, useRef, useState } from 'react'
import { AuthProvider } from './auth/AuthProvider'
import type { AuthMember } from './auth/AuthContext'
import { AuthLoading, LoginPage } from './auth/LoginPage'
import { useAuth } from './auth/useAuth'
import { AddConcertDialog } from './components/AddConcertDialog'
import { AppHeader } from './components/AppHeader'
import { ConcertCard } from './components/ConcertCard'
import { FiltersBar } from './components/FiltersBar'
import { RankedSummary } from './components/RankedSummary'
import { StatsStrip } from './components/StatsStrip'
import { concerts as concertFixtures } from './data/fixtures'
import type { Concert } from './types'
import './App.css'

const sortConcerts = (rows: Concert[], sort: string) => [...rows].sort((left, right) => {
  if (sort === 'date-asc') return left.date.localeCompare(right.date)
  if (sort === 'price-desc') return right.price - left.price
  if (sort === 'rating-desc') return (right.realized ?? -1) - (left.realized ?? -1)
  if (sort === 'artist-asc') return left.artist.localeCompare(right.artist)
  return right.date.localeCompare(left.date)
})

interface DashboardProps {
  member: AuthMember
  onSignOut: () => void
}

export function Dashboard({ member, onSignOut }: DashboardProps) {
  const [concerts, setConcerts] = useState(concertFixtures)
  const [darkMode, setDarkMode] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [genre, setGenre] = useState('')
  const [sort, setSort] = useState('date-desc')
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
  }, [])

  const filteredConcerts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return sortConcerts(concerts.filter((concert) => {
      if (status && concert.status !== status) return false
      if (genre && concert.genre !== genre) return false
      if (query && !`${concert.artist} ${concert.venue}`.toLowerCase().includes(query)) return false
      return true
    }), sort)
  }, [concerts, genre, search, sort, status])

  const flashNotice = (message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    setNotice(message)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2400)
  }

  const addConcert = (concert: Concert) => {
    setConcerts((current) => [concert, ...current])
    setDialogOpen(false)
    flashNotice(`${concert.artist} added to this preview`)
  }

  const deleteConcert = (id: string) => {
    const concert = concerts.find((item) => item.id === id)
    setConcerts((current) => current.filter((item) => item.id !== id))
    if (concert) flashNotice(`${concert.artist} removed from this preview`)
  }

  const exportCsv = () => {
    const header = ['Artist', 'Tour', 'Date', 'Venue', 'Price', 'Genre', 'Status', 'Rating']
    const lines = concerts.map((concert) => [
      concert.artist,
      concert.tour,
      concert.date,
      concert.venue,
      concert.price,
      concert.genre,
      concert.status,
      concert.realized ?? '',
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'concert-tracker-stage-1-preview.csv'
    link.click()
    URL.revokeObjectURL(url)
    flashNotice('Preview CSV exported')
  }

  return (
    <div className={darkMode ? 'app theme-dark' : 'app theme-light'}>
      <AppHeader
        darkMode={darkMode}
        memberName={member.display_name}
        onAdd={() => setDialogOpen(true)}
        onExport={exportCsv}
        onSignOut={onSignOut}
        onThemeToggle={() => setDarkMode((value) => !value)}
      />

      <main className="page-shell">
        <div className="dashboard-column">
          <StatsStrip />
          <FiltersBar
            genre={genre}
            search={search}
            sort={sort}
            status={status}
            onGenreChange={setGenre}
            onSearchChange={setSearch}
            onSortChange={setSort}
            onStatusChange={setStatus}
          />
          <p className="list-meta">Showing {filteredConcerts.length} fixture concerts from the {45}-concert baseline</p>
          {filteredConcerts.length ? (
            <section className="concert-grid" aria-label="Concerts">
              {filteredConcerts.map((concert) => <ConcertCard key={concert.id} concert={concert} onDelete={deleteConcert} />)}
            </section>
          ) : (
            <section className="empty-state">
              <h2>No concerts match</h2>
              <p>Clear a filter or try another artist or venue.</p>
            </section>
          )}
        </div>
        <RankedSummary />
      </main>

      <AddConcertDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSave={addConcert} />
      {notice ? <div className="toast" role="status">{notice}</div> : null}
    </div>
  )
}

function AuthenticatedApp() {
  const { member, signOut, status } = useAuth()

  if (status === 'loading' || status === 'validating') return <AuthLoading />
  if (status === 'signed-in' && member) {
    return <Dashboard member={member} onSignOut={() => void signOut()} />
  }
  return <LoginPage />
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}

export default App
