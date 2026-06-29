import { useMemo, useState } from 'react'
import { Eye, EyeOff, Trophy } from 'lucide-react'
import { rankings } from '../data/fixtures'
import type { RankingRow } from '../types'

type SortKey = keyof RankingRow

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)

export function RankedSummary() {
  const [hideProjected, setHideProjected] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: 'rating', direction: -1 })

  const rows = useMemo(() => [...rankings].sort((left, right) => {
    const a = left[sort.key]
    const b = right[sort.key]
    if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b) * sort.direction
    return ((Number(a ?? -1) - Number(b ?? -1)) * sort.direction)
  }), [sort])

  const changeSort = (key: SortKey) => {
    setSort((current) => ({ key, direction: current.key === key ? (current.direction * -1) as 1 | -1 : key === 'artist' ? 1 : -1 }))
  }

  const heading = (key: SortKey, label: string) => (
    <button type="button" onClick={() => changeSort(key)}>
      {label}{sort.key === key ? <span aria-hidden="true"> {sort.direction === -1 ? '▼' : '▲'}</span> : null}
    </button>
  )

  return (
    <aside className="ranking-panel" aria-label="Ranked summary">
      <div className="ranking-head">
        <h2><Trophy size={18} />Ranked Summary</h2>
        <button className="button button-secondary ranking-toggle" type="button" onClick={() => setHideProjected((value) => !value)}>
          {hideProjected ? <Eye size={16} /> : <EyeOff size={16} />}
          {hideProjected ? 'Show Ant' : 'Hide Ant'}
        </button>
      </div>
      <div className="ranking-scroll">
        <table>
          <thead>
            <tr>
              <th>{heading('artist', 'Artist')}</th>
              <th>{heading('rating', 'Rating')}</th>
              {!hideProjected ? <th>{heading('projected', 'Ant')}</th> : null}
              <th>{heading('year', 'Year')}</th>
              <th>{heading('price', 'Price')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.artist}-${row.year}`}>
                <td title={row.artist}>{row.artist}</td>
                <td><strong>{row.rating}</strong></td>
                {!hideProjected ? <td>{row.projected ?? 'N/A'}</td> : null}
                <td>{row.year}</td>
                <td>{formatMoney(row.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  )
}
