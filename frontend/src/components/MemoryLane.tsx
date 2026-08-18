import { Dices, History, Sparkles } from 'lucide-react'
import type { Concert } from '../types'
import type { ArchiveMemory } from '../lib/archiveInsights'

interface MemoryLaneProps {
  memory: ArchiveMemory | null
  onOpen: (concert: Concert) => void
  onRandom: () => void
}

export function MemoryLane({ memory, onOpen, onRandom }: MemoryLaneProps) {
  if (!memory) return null
  return <section className="memory-lane" aria-labelledby="memory-lane-title">
    <div className="memory-lane-icon"><History aria-hidden="true" /></div>
    <div className="memory-lane-copy"><span id="memory-lane-title">Memory Lane</span><strong>{memory.label}: {memory.concert.artist}</strong><small>{memory.concert.venue.replace(/\s*\([^)]*\)\s*$/, '')} · {new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${memory.concert.date}T12:00:00`))}</small></div>
    <div className="memory-lane-actions"><button className="text-action" type="button" onClick={() => onOpen(memory.concert)}><Sparkles size={15} />Open memory</button><button className="text-action" type="button" onClick={onRandom}><Dices size={15} />Random concert</button></div>
  </section>
}
