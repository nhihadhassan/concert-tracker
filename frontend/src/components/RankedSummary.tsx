import { Trophy } from 'lucide-react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import type { RankingRow } from '../types'

interface RankedSummaryProps {
  personal: RankingRow[]
}

export function RankedSummary({ personal }: RankedSummaryProps) {
  const reduceMotion = useReducedMotion()
  return (
    <aside className="ranking-panel" aria-label="Ranked summary">
      <div className="ranking-head"><h2><Trophy size={18} />Ranked Summary</h2></div>
      <div className="ranking-scroll">
        {personal.length ? <table><thead><tr><th>Artist</th><th>Rating</th><th>Year</th></tr></thead><tbody><AnimatePresence initial={false}>{personal.map((row, index) => <m.tr layout="position" key={row.concert_id} initial={reduceMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ delay: reduceMotion ? 0 : Math.min(index, 8) * 0.025 }}><td title={row.artist}>{row.artist}</td><td><strong>{row.rating}</strong></td><td>{row.concert_date.slice(0, 4)}</td></m.tr>)}</AnimatePresence></tbody></table> : <m.div className="ranking-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>No ratings yet</m.div>}
      </div>
    </aside>
  )
}
