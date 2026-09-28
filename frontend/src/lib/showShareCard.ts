export interface ShowShareCardData {
  artist: string
  date: string
  rating: number
  image: string | null
  scope: 'personal' | 'shared'
}

const width = 1080
const height = 1920

const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

const loadArtwork = async (source: string | null) => {
  if (!source) return null
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = source
  try {
    await image.decode()
    return image
  } catch {
    return null
  }
}

const drawArtwork = async (context: CanvasRenderingContext2D, source: string | null) => {
  const image = await loadArtwork(source)
  const x = 170
  const y = 320
  const size = 740
  if (image) {
    const crop = Math.min(image.naturalWidth, image.naturalHeight)
    const sx = (image.naturalWidth - crop) / 2
    const sy = (image.naturalHeight - crop) / 2
    context.drawImage(image, sx, sy, crop, crop, x, y, size, size)
  } else {
    const glow = context.createRadialGradient(540, 690, 20, 540, 690, 480)
    glow.addColorStop(0, '#ffb58f44')
    glow.addColorStop(1, '#ffb58f00')
    context.fillStyle = glow
    context.fillRect(x, y, size, size)
    context.strokeStyle = '#ffcfac66'
    context.lineWidth = 3
    for (const radius of [175, 220, 265]) {
      context.beginPath()
      context.arc(540, 690, radius, 0, Math.PI * 2)
      context.stroke()
    }
    context.fillStyle = '#f5eee7'
    context.textAlign = 'center'
    context.font = '900 210px "Stage Condensed", "Arial Narrow", sans-serif'
    context.fillText('E', 540, 765)
    context.textAlign = 'left'
  }
  context.strokeStyle = '#ffffff38'
  context.lineWidth = 2
  context.strokeRect(x, y, size, size)
}

export async function createShowShareCard(data: ShowShareCardData): Promise<Blob> {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot create share images.')

  const background = context.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#100c10')
  background.addColorStop(0.55, '#0b0a0e')
  background.addColorStop(1, '#1c1215')
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  const glow = context.createRadialGradient(840, 300, 0, 840, 300, 680)
  glow.addColorStop(0, '#9b503522')
  glow.addColorStop(1, '#9b503500')
  context.fillStyle = glow
  context.fillRect(0, 0, width, 1080)

  context.strokeStyle = '#ffffff29'
  context.lineWidth = 2
  context.strokeRect(48, 48, width - 96, height - 96)

  context.fillStyle = '#f5eee7'
  context.font = '900 48px "Stage Condensed", "Arial Narrow", sans-serif'
  context.fillText('ENCORE.', 88, 138)
  context.fillStyle = '#ffb58f'
  context.font = '600 21px "DM Mono", monospace'
  context.textAlign = 'right'
  context.fillText(data.scope === 'personal' ? 'MY LIVE RATING' : 'LIVE RATING', width - 88, 132)
  context.textAlign = 'left'

  context.strokeStyle = '#ffffff29'
  context.beginPath()
  context.moveTo(88, 184)
  context.lineTo(width - 88, 184)
  context.stroke()

  await drawArtwork(context, data.image)

  context.strokeStyle = '#ffffff29'
  context.beginPath()
  context.moveTo(88, 1150)
  context.lineTo(width - 88, 1150)
  context.stroke()

  const artist = data.artist.toLocaleUpperCase()
  let artistFontSize = 112
  let artistLines: string[] = []
  do {
    context.font = `900 ${artistFontSize}px "Stage Condensed", "Arial Narrow", sans-serif`
    artistLines = wrapText(context, artist, width - 176)
    if (artistLines.length > 2) artistFontSize -= 8
  } while (artistLines.length > 2 && artistFontSize > 64)
  context.fillStyle = '#f5eee7'
  artistLines.slice(0, 3).forEach((line, index) => context.fillText(line, 88, 1290 + index * (artistFontSize + 8)))

  const date = new Intl.DateTimeFormat('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${data.date}T12:00:00`))
  const detailsY = artistLines.length > 2 ? 1550 : artistLines.length > 1 ? 1480 : 1400
  context.fillStyle = '#b2a3b1'
  context.font = '600 28px "DM Mono", monospace'
  context.fillText(date.toUpperCase(), 88, detailsY)

  context.fillStyle = '#ffcfac'
  context.font = '900 310px "Stage Condensed", "Arial Narrow", sans-serif'
  context.fillText(String(data.rating), 76, 1740)
  const scoreWidth = context.measureText(String(data.rating)).width
  context.fillStyle = '#f5eee7'
  context.font = '700 44px "DM Mono", monospace'
  context.fillText('/10', 95 + scoreWidth, 1730)

  context.strokeStyle = '#ffffff29'
  context.beginPath()
  context.moveTo(88, 1800)
  context.lineTo(width - 88, 1800)
  context.stroke()
  context.fillStyle = '#b2a3b1'
  context.font = '500 20px "DM Mono", monospace'
  context.fillText('A NIGHT FROM YOUR LIVE ARCHIVE', 88, 1850)

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The share image could not be created.')), 'image/png')
    } catch {
      reject(new Error('The share image could not be created.'))
    }
  })
}
