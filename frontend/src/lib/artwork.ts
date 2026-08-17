const APPLE_ARTWORK_SIZE = /\/(\d+)x(\d+)bb\.(?:jpe?g|png|webp)$/i

const isAppleArtworkHost = (hostname: string) => hostname === 'mzstatic.com' || hostname.endsWith('.mzstatic.com')

export const resizeArtwork = (source: string, size: number) => {
  if (!source) return source
  try {
    const url = new URL(source)
    if (!isAppleArtworkHost(url.hostname) || !APPLE_ARTWORK_SIZE.test(url.pathname)) return source
    url.pathname = url.pathname.replace(APPLE_ARTWORK_SIZE, `/${size}x${size}bb.webp`)
    return url.toString()
  } catch {
    return source
  }
}

export const artworkSrcSet = (source: string, sizes: number[]) => {
  const candidates = sizes.map((size) => {
    const resized = resizeArtwork(source, size)
    return resized === source ? null : `${resized} ${size}w`
  }).filter((candidate): candidate is string => Boolean(candidate))
  return candidates.length ? candidates.join(', ') : undefined
}
