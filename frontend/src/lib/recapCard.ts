import type { ConcertStory, InsightPeriod } from './concertInsights'

export interface RecapCardData {
  memberName: string
  period: InsightPeriod
  story: ConcertStory
  topArtist: string
  topShow: string
}

const splitLine = (context: CanvasRenderingContext2D, value: string, maxWidth: number) => {
  const words = value.split(/\s+/)
  const lines: string[] = []
  let line = ''
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  })
  if (line) lines.push(line)
  return lines
}

export async function createRecapCard(data: RecapCardData): Promise<Blob> {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot create recap cards.')

  const background = context.createLinearGradient(0, 0, 1080, 1350)
  background.addColorStop(0, '#251653')
  background.addColorStop(0.52, '#121b40')
  background.addColorStop(1, '#351331')
  context.fillStyle = background
  context.fillRect(0, 0, 1080, 1350)

  const glow = context.createRadialGradient(860, 130, 0, 860, 130, 520)
  glow.addColorStop(0, 'rgba(255, 105, 180, .48)')
  glow.addColorStop(1, 'rgba(255, 105, 180, 0)')
  context.fillStyle = glow
  context.fillRect(0, 0, 1080, 720)
  context.strokeStyle = 'rgba(255, 232, 125, .24)'
  context.lineWidth = 3
  context.beginPath()
  context.arc(875, 260, 230, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.ellipse(875, 260, 310, 145, Math.PI / 5, 0, Math.PI * 2)
  context.stroke()

  context.fillStyle = '#ffe77a'
  context.font = '700 30px "Hanken Grotesk", sans-serif'
  context.fillText('ENCORE · LIVE RECAP', 76, 98)

  context.fillStyle = '#ffffff'
  context.font = '800 84px Sora, sans-serif'
  const periodLabel = data.period === 'all' ? 'all time' : String(data.period)
  splitLine(context, `${data.memberName}'s ${periodLabel} in the crowd`, 870)
    .slice(0, 3)
    .forEach((line, index) => context.fillText(line, 76, 220 + index * 92))

  context.fillStyle = '#ffe77a'
  context.font = '800 230px Sora, sans-serif'
  context.fillText(String(data.story.attended.length), 70, 640)
  context.fillStyle = '#ffffff'
  context.font = '700 38px "Hanken Grotesk", sans-serif'
  context.fillText(data.story.attended.length === 1 ? 'night in the crowd' : 'nights in the crowd', 82, 697)

  const cards = [
    ['MOST SEEN', data.topArtist || 'Still exploring'],
    ['TOP NIGHT', data.topShow || 'Not rated yet'],
    ['NEW DISCOVERIES', `${data.story.newArtists.length} artists`],
    ['LIVE STREAK', `${data.story.longestMonthlyStreak} ${data.story.longestMonthlyStreak === 1 ? 'month' : 'months'}`],
  ]
  cards.forEach(([label, value], index) => {
    const x = 76 + index % 2 * 470
    const y = 790 + Math.floor(index / 2) * 215
    context.fillStyle = 'rgba(255, 255, 255, .08)'
    context.fillRect(x, y, 430, 172)
    context.fillStyle = '#71eadb'
    context.font = '700 22px "Hanken Grotesk", sans-serif'
    context.fillText(label, x + 26, y + 43)
    context.fillStyle = '#ffffff'
    context.font = '700 34px Sora, sans-serif'
    splitLine(context, value, 370).slice(0, 2).forEach((line, lineIndex) => {
      context.fillText(line, x + 26, y + 94 + lineIndex * 39)
    })
  })

  context.fillStyle = 'rgba(255,255,255,.72)'
  context.font = '500 24px "Hanken Grotesk", sans-serif'
  context.fillText('Made from my concert archive · Encore', 76, 1290)

  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob)
    else reject(new Error('The recap card could not be created.'))
  }, 'image/png', 0.94))
}
