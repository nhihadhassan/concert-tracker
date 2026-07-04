import { useMemo, useState } from 'react'
import { Trophy } from 'lucide-react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import type { Concert, RankingRow } from '../types'

interface RankedSummaryProps {
  combined: RankingRow[]
  concerts: Concert[]
  memberName: string
  personal: RankingRow[]
}

export function RankedSummary({ combined, concerts, memberName, personal }: RankedSummaryProps) {
  const [scope, setScope] = useState<'personal' | 'combined'>('personal')
  const reduceMotion = useReducedMotion()
  const rows = scope === 'personal' ? personal : combined
  const concertById = useMemo(() => new Map(concerts.map((concert) => [concert.id, concert])), [concerts])
  return (
    <aside className="ranking-panel" aria-label="Ranked summary">
      <div className="ranking-head"><h2><Trophy size={18} />Ranked Summary</h2><div className="segmented" role="group" aria-label="Ranking scope"><button type="button" className={scope === 'personal' ? 'active' : ''} aria-pressed={scope === 'personal'} onClick={() => setScope('personal')}>{memberName}</button><button type="button" className={scope === 'combined' ? 'active' : ''} aria-pressed={scope === 'combined'} onClick={() => setScope('combined')}>Combined</button></div></div>
      <div className="ranking-scroll">
        {rows.length ? <table><thead><tr><th>Artist</th><th>Rating</th><th>Proj</th><th>Year</th></tr></thead><tbody><AnimatePresence initial={false}>{rows.map((row, index) => { const concert = concertById.get(row.concert_id); return <m.tr layout="position" key={`${scope}-${row.concert_id}`} initial={reduceMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ delay: reduceMotion ? 0 : Math.min(index, 8) * 0.025 }}><td title={row.artist}>{row.artist}</td><td><strong>{row.rating}</strong></td><td>{concert?.projected ?? 'N/A'}</td><td>{row.concert_date.slice(0, 4)}</td></m.tr> })}</AnimatePresence></tbody></table> : <m.div className="ranking-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>No ratings yet</m.div>}
      </div>
    </aside>
  )
}
