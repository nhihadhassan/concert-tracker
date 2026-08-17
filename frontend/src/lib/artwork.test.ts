import { describe, expect, it } from 'vitest'
import { artworkSrcSet, resizeArtwork } from './artwork'

describe('artwork helpers', () => {
  const appleArtwork = 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/example/600x600bb.jpg'

  it('requests a right-sized WebP image from Apple artwork hosts', () => {
    expect(resizeArtwork(appleArtwork, 480)).toBe('https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/example/480x480bb.webp')
  })

  it('builds a responsive source set for supported artwork', () => {
    expect(artworkSrcSet(appleArtwork, [320, 480])).toContain('320x320bb.webp 320w')
    expect(artworkSrcSet(appleArtwork, [320, 480])).toContain('480x480bb.webp 480w')
  })

  it('leaves unknown image providers unchanged', () => {
    const source = 'https://example.com/poster.jpg'
    expect(resizeArtwork(source, 480)).toBe(source)
    expect(artworkSrcSet(source, [320, 480])).toBeUndefined()
  })
})
