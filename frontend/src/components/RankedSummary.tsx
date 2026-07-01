import { useMemo, useState } from 'react'
import { Trophy } from 'lucide-react'
import type { Concert, RankingRow } from '../types'

interface RankedSummaryProps {
  combined: RankingRow[]
  concerts: Concert[]
  memberName: string
  personal: RankingRow[]
}

export function RankedSummary({ combined, concerts, memberName, personal }: RankedSummaryProps) {
  const [scope, setScope] = useState<'personal' | 'combined'>('personal')
  const rows = scope === 'personal' ? personal : combined
  const concertById = useMemo(() => new Map(concerts.map((concert) => [concert.id, concert])), [concerts])
  return (
    <aside className="ranking-panel" aria-label="Ranked summary">
      <div className="ranking-head"><h2><Trophy size={18} />Ranked Summary</h2><div className="segmented" aria-label="Ranking scope"><button type="button" className={scope === 'personal' ? 'active' : ''} onClick={() => setScope('personal')}>{memberName}</button><button type="button" className={scope === 'combined' ? 'active' : ''} onClick={() => setScope('combined')}>Combined</button></div></div>
      <div className="ranking-scroll">
        {rows.length ? <table><thead><tr><th>Artist</th><th>Rating</th><th>Proj</th><th>Year</th></tr></thead><tbody>{rows.map((row) => { const concert = concertById.get(row.concert_id); return <tr key={`${scope}-${row.concert_id}`}><td title={row.artist}>{row.artist}</td><td><strong>{row.rating}</strong></td><td>{concert?.projected ?? 'N/A'}</td><td>{row.concert_date.slice(0, 4)}</td></tr> })}</tbody></table> : <div className="ranking-empty">No ratings yet</div>}
      </div>
    </aside>
  )
}
