import { useMemo, useState, type CSSProperties } from 'react'
import { CalendarDays, ChevronDown, Clock3, Download, MapPin, Share2, Sparkles, Star, Ticket, Users } from 'lucide-react'
import { m, useReducedMotion } from 'motion/react'
import type { Analytics, Concert } from '../types'
import { buildConcertStory, type InsightPeriod } from '../lib/concertInsights'
import { downloadBlob } from '../lib/exports'
import { createRecapCard } from '../lib/recapCard'

interface LiveWrappedProps {
  concerts: Concert[]
  analytics: Analytics
  memberName: string
}

const formatDate = (value: string) => new Intl.DateTimeFormat('en-CA', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(new Date(`${value}T12:00:00`))

const formatMoney = (value: number) => new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
}).format(value)

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const countBy = (rows: Concert[], getKey: (row: Concert) => string | null) => {
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    const key = getKey(row)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

export function LiveWrapped({ concerts, analytics, memberName }: LiveWrappedProps) {
  const reduceMotion = useReducedMotion()
  const years = useMemo(() => [...new Set(concerts.map((concert) => concert.date.slice(0, 4)))].sort((a, b) => Number(b) - Number(a)), [concerts])
  const latestAttendedYear = useMemo(() => concerts
    .filter((concert) => concert.status === 'Attended')
    .map((concert) => Number(concert.date.slice(0, 4)))
    .sort((left, right) => right - left)[0] ?? 'all', [concerts])
  const [period, setPeriod] = useState<InsightPeriod>(latestAttendedYear)
  const [shareLabel, setShareLabel] = useState('Share recap')
  const [cardBusy, setCardBusy] = useState(false)
  const selectedConcerts = useMemo(() => period === 'all'
    ? concerts
    : concerts.filter((concert) => concert.date.startsWith(String(period))), [concerts, period])
  const story = useMemo(() => buildConcertStory(concerts, period), [concerts, period])
  const attended = story.attended
  const upcoming = selectedConcerts.filter((concert) => concert.status === 'Want to Go')
  const artistCounts = useMemo(() => countBy(attended, (concert) => concert.artist), [attended])
  const genreCounts = useMemo(() => countBy(attended, (concert) => concert.genre), [attended])
  const venueCounts = useMemo(() => countBy(attended, (concert) => concert.venue.split('(')[0].trim()), [attended])
  const topShow = useMemo(() => [...attended].sort((left, right) => (right.personal_rating ?? -1) - (left.personal_rating ?? -1) || right.date.localeCompare(left.date))[0], [attended])
  const topArtist = artistCounts[0]
  const topGenre = genreCounts[0]
  const topVenue = venueCounts[0]
  const firstShow = [...attended].sort((left, right) => left.date.localeCompare(right.date))[0]
  const lastShow = [...attended].sort((left, right) => right.date.localeCompare(left.date))[0]
  const averageRating = attended.filter((concert) => concert.personal_rating !== null).reduce((total, concert, _index, rows) => total + (concert.personal_rating ?? 0) / rows.length, 0)
  const monthlyCounts = monthLabels.map((_, index) => attended.filter((concert) => new Date(`${concert.date}T12:00:00`).getMonth() === index).length)
  const monthlyMax = Math.max(1, ...monthlyCounts)
  const artworkShows = attended.filter((concert) => concert.image).slice(0, 5)
  const rangeLabel = period === 'all'
    ? firstShow && lastShow ? `${formatDate(firstShow.date)} to ${formatDate(lastShow.date)}` : 'Your live-show archive'
    : `${period} season`

  const cardData = () => ({
    memberName: firstName(memberName),
    period,
    story,
    topArtist: topArtist?.[0] ?? '',
    topShow: topShow?.artist ?? '',
  })

  const shareSnapshot = async () => {
    const text = topShow
      ? `${firstName(memberName)}'s live-show rewind: ${attended.length} shows, ${topArtist?.[0] ?? 'many good artists'} on repeat, and ${topShow.artist} as the top-rated night.`
      : `${firstName(memberName)}'s live-show rewind is ready.`
    setCardBusy(true)
    try {
      const blob = await createRecapCard(cardData())
      const file = new File([blob], `encore-recap-${period}.png`, { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'My Encore live recap', text, files: [file] })
        setShareLabel('Shared')
      } else if (navigator.share) {
        await navigator.share({ title: 'My Encore live recap', text })
        setShareLabel('Shared')
      } else {
        await navigator.clipboard.writeText(text)
        downloadBlob(blob, file.name)
        setShareLabel('Card saved')
      }
    } catch {
      setShareLabel('Share recap')
    } finally {
      setCardBusy(false)
    }
    window.setTimeout(() => setShareLabel('Share recap'), 1800)
  }

  const saveCard = async () => {
    setCardBusy(true)
    try {
      downloadBlob(await createRecapCard(cardData()), `encore-recap-${period}.png`)
      setShareLabel('Card saved')
    } catch {
      setShareLabel('Could not save')
    } finally {
      setCardBusy(false)
      window.setTimeout(() => setShareLabel('Share recap'), 1800)
    }
  }

  return (
    <m.section
      className="wrapped-page"
      aria-labelledby="wrapped-title"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="wrapped-noise" aria-hidden="true" />
      <header className="wrapped-header">
        <div>
          <p className="wrapped-eyebrow"><Sparkles size={15} aria-hidden="true" /> Live-show rewind</p>
          <h2 id="wrapped-title" data-view-heading tabIndex={-1}>{firstName(memberName)}, your year in the crowd.</h2>
          <p className="wrapped-range">{rangeLabel}</p>
        </div>
        <div className="wrapped-controls">
          <label className="wrapped-period">
            <span>Show me</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
              <option value="all">All time</option>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
          <button className="button wrapped-share" type="button" disabled={cardBusy} onClick={() => void shareSnapshot()}><Share2 size={16} aria-hidden="true" />{cardBusy ? 'Making card…' : shareLabel}</button>
        </div>
      </header>

      {!attended.length ? (
        <section className="wrapped-empty" aria-live="polite">
          <Ticket size={24} aria-hidden="true" />
          <h3>Your rewind starts at the first encore.</h3>
          <p>Mark a concert as attended and this space will turn your archive into a story.</p>
        </section>
      ) : <>
        <section className="wrapped-hero" aria-label="Live-show headline">
          <div className="wrapped-hero-copy">
            <span className="wrapped-kicker">The headline</span>
            <strong>{attended.length}</strong>
            <p>{attended.length === 1 ? 'night spent singing along' : 'nights spent singing along'}</p>
            <span className="wrapped-caption">{upcoming.length ? `${upcoming.length} more on the horizon.` : 'Every one made the archive.'}</span>
          </div>
          <div className="wrapped-orbit" aria-hidden="true">
            <span className="orbit-ring orbit-ring-one" />
            <span className="orbit-ring orbit-ring-two" />
            <span className="orbit-dot orbit-dot-one" />
            <span className="orbit-dot orbit-dot-two" />
            <span className="orbit-dot orbit-dot-three" />
            <span className="orbit-centre">LIVE</span>
          </div>
          <div className="wrapped-hero-footer"><span><CalendarDays size={15} /> {analytics.total_concerts} records in the archive</span><span><Clock3 size={15} /> {topGenre?.[0] ?? 'A little bit of everything'}</span></div>
        </section>

        <div className="wrapped-story-grid">
          <section className="wrapped-panel wrapped-top-show" aria-labelledby="top-show-title">
            <div className="wrapped-panel-head"><span className="wrapped-kicker">Your main character moment</span><Star size={18} aria-hidden="true" /></div>
            <div className="wrapped-show-art">
              {topShow?.image ? <img src={topShow.image} alt="" /> : <span className="show-art-placeholder" aria-hidden="true"><Sparkles size={32} /></span>}
              <span className="wrapped-rating">{topShow?.personal_rating ? `${topShow.personal_rating}/10` : 'Unrated'}</span>
            </div>
            <div className="wrapped-show-copy"><h3 id="top-show-title">{topShow?.artist}</h3><p>{topShow?.venue.split('(')[0].trim()} <span aria-hidden="true">·</span> {topShow ? formatDate(topShow.date) : ''}</p></div>
          </section>

          <section className="wrapped-panel wrapped-fingerprint" aria-labelledby="fingerprint-title">
            <div className="wrapped-panel-head"><span className="wrapped-kicker">Your live fingerprint</span><Users size={18} aria-hidden="true" /></div>
            <h3 id="fingerprint-title">You kept coming back to <em>{topArtist?.[0]}</em>.</h3>
            <div className="wrapped-fingerprint-meta"><strong>{topArtist?.[1]}</strong><span>{topArtist?.[1] === 1 ? 'show' : 'shows'} by your most-seen artist</span></div>
            <div className="wrapped-bars">{artistCounts.slice(0, 4).map(([artist, count], index) => <div className="wrapped-bar-row" key={artist}><span>{artist}</span><div><i style={{ width: `${Math.max(12, count / (topArtist?.[1] ?? 1) * 100)}%` }} /></div><strong>{count}</strong><small>{index === 0 ? 'on repeat' : ''}</small></div>)}</div>
          </section>

          <section className="wrapped-panel wrapped-months" aria-labelledby="months-title">
            <div className="wrapped-panel-head"><span className="wrapped-kicker">Crowd calendar</span><MapPin size={18} aria-hidden="true" /></div>
            <h3 id="months-title">Your loudest stretch was <em>{monthLabels[monthlyCounts.indexOf(Math.max(...monthlyCounts))]}</em>.</h3>
            <div className="wrapped-month-bars" aria-label="Shows by month">{monthlyCounts.map((count, index) => <div className="wrapped-month" key={monthLabels[index]}><span style={{ height: `${count ? Math.max(12, count / monthlyMax * 100) : 4}%` }} title={`${count} shows in ${monthLabels[index]}`} /><small>{monthLabels[index]}</small></div>)}</div>
          </section>

          <section className="wrapped-panel wrapped-facts" aria-label="Live-show facts">
            <div className="wrapped-fact"><span>Favourite room</span><strong>{topVenue?.[0] ?? 'Still exploring'}</strong><small>{topVenue ? `${topVenue[1]} ${topVenue[1] === 1 ? 'visit' : 'visits'}` : 'Add a venue to see this'}</small></div>
            <div className="wrapped-fact"><span>Average rating</span><strong>{averageRating ? `${averageRating.toFixed(1)}/10` : 'Not rated'}</strong><small>{averageRating ? 'across rated nights' : 'Rate a show to unlock this'}</small></div>
            <div className="wrapped-fact"><span>Ticket story</span><strong>{attended.some((concert) => concert.price !== null) ? formatMoney(attended.reduce((total, concert) => total + (concert.price ?? 0), 0)) : 'Unpriced'}</strong><small>spent on attended shows</small></div>
          </section>

          <section className="wrapped-panel wrapped-insights" aria-labelledby="wrapped-insights-title">
            <div className="wrapped-panel-head"><span className="wrapped-kicker">The story behind the numbers</span><Sparkles size={18} aria-hidden="true" /></div>
            <h3 id="wrapped-insights-title">This was your live music pattern.</h3>
            <ul>
              <li><strong>{story.newArtists.length}</strong><span>{period === 'all' ? 'artists entered the archive' : `first-time ${story.newArtists.length === 1 ? 'artist' : 'artists'} this year`}{story.newArtists.length ? `, including ${story.newArtists.slice(0, 2).join(' and ')}` : ''}.</span></li>
              <li><strong>{story.longestMonthlyStreak}</strong><span>{story.longestMonthlyStreak === 1 ? 'active month' : 'months in your longest live streak'}.</span></li>
              <li><strong>{story.closestRun ? `${story.closestRun.days}d` : '—'}</strong><span>{story.closestRun ? `between ${story.closestRun.first.artist} and ${story.closestRun.second.artist}, your tightest two-show run.` : 'Add another show to find your tightest run.'}</span></li>
              <li><strong>{story.weekendShare}%</strong><span>of these nights landed Friday through Sunday.</span></li>
            </ul>
          </section>

          <section className="wrapped-share-card" aria-label="Shareable recap card preview">
            <span>Encore · {period === 'all' ? 'All time' : period}</span>
            <strong>{attended.length}</strong>
            <p>{attended.length === 1 ? 'night in the crowd' : 'nights in the crowd'}</p>
            <div><small>Most seen</small><b>{topArtist?.[0] ?? 'Still exploring'}</b></div>
            <button type="button" disabled={cardBusy} onClick={() => void saveCard()}><Download size={16} aria-hidden="true" />Save recap card</button>
          </section>
        </div>

        {artworkShows.length ? <section className="wrapped-artwork-strip" aria-label="Recent live-show memories"><div><span className="wrapped-kicker">The visual evidence</span><h3>Proof you were there.</h3></div><div className="wrapped-artwork-stack">{artworkShows.map((concert, index) => <img key={concert.id} src={concert.image ?? ''} alt={`${concert.artist} show memory`} style={{ '--stack-index': index } as CSSProperties} loading="lazy" decoding="async" />)}</div><button className="wrapped-copy-button" type="button" onClick={() => void shareSnapshot()}><Share2 size={15} aria-hidden="true" /> Share this recap</button></section> : null}
      </>}
    </m.section>
  )
}
