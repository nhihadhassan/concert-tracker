import { useEffect } from 'react'
import type { Album, Concert } from '../types'

const SITE_URL = 'https://concert-tracker-sepia.vercel.app'

export type MetadataView = 'concerts' | 'stage' | 'albums' | 'album-detail' | 'stats' | 'wrapped' | 'detail' | 'not-found'

interface MetadataInput {
  album?: Album | null
  concert?: Concert | null
  missing?: boolean
  view: MetadataView
}

interface PageMetadata {
  canonical: string | null
  description: string
  noindex?: boolean
  title: string
}

const cleanVenue = (venue: string) => venue.replace(/\s*\([^)]*\)\s*$/, '').trim()
const absoluteUrl = (path: string) => `${SITE_URL}${path}`

export function buildPageMetadata({ album, concert, missing = false, view }: MetadataInput): PageMetadata {
  if (view === 'not-found') return {
    canonical: null,
    description: 'The requested Encore page could not be found.',
    noindex: true,
    title: 'Page Not Found | Encore',
  }
  if (view === 'detail') {
    if (missing) return {
      canonical: null,
      description: 'This concert is not available in the Encore archive.',
      noindex: true,
      title: 'Concert Not Found | Encore',
    }
    if (concert) {
      const venue = cleanVenue(concert.venue)
      return {
        canonical: absoluteUrl(`/?concert=${encodeURIComponent(concert.id)}`),
        description: `A concert memory for ${concert.artist} at ${venue} on ${concert.date}.`,
        title: `${concert.artist} at ${venue} | Encore`,
      }
    }
    return { canonical: absoluteUrl(`/?concert=${encodeURIComponent(new URLSearchParams(location.search).get('concert') ?? '')}`), description: 'Open a saved concert memory in Encore.', title: 'Concert Memory | Encore' }
  }
  if (view === 'album-detail') {
    if (missing) return {
      canonical: null,
      description: 'This album is not available in the Encore journal.',
      noindex: true,
      title: 'Album Not Found | Encore',
    }
    if (album) return {
      canonical: absoluteUrl(`/?album=${encodeURIComponent(album.id)}`),
      description: `Review, track notes, and rankings for ${album.title} by ${album.artist}.`,
      title: `${album.title} by ${album.artist} | Encore`,
    }
    return { canonical: absoluteUrl(`/?album=${encodeURIComponent(new URLSearchParams(location.search).get('album') ?? '')}`), description: 'Open a saved album review in Encore.', title: 'Album Review | Encore' }
  }
  if (view === 'stage') return { canonical: absoluteUrl('/?view=stage'), description: 'Explore your concert archive with an alternate cinematic stage view.', noindex: true, title: 'Concerts — Stage | Encore' }
  if (view === 'albums') return { canonical: absoluteUrl('/?view=albums'), description: 'Browse a shared album journal with personal reviews, scores, and track notes.', title: 'Album Journal | Encore' }
  if (view === 'stats') return { canonical: absoluteUrl('/?view=stats'), description: 'Explore concert attendance, ratings, venues, archive stories, and listening insights.', title: 'Concert Stats | Encore' }
  if (view === 'wrapped') return { canonical: absoluteUrl('/?view=wrapped'), description: 'Revisit attended concerts through a personal live-music recap.', title: 'Live Recap | Encore' }
  return { canonical: absoluteUrl('/'), description: 'Encore turns a personal concert archive into memories, insights, and yearly live recaps.', title: "Nhihad's Concerts | Encore" }
}

const setMeta = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.append(element)
  }
  element.content = content
}

export function usePageMetadata(metadata: PageMetadata) {
  useEffect(() => {
    document.title = metadata.title
    setMeta('meta[name="description"]', 'name', 'description', metadata.description)
    setMeta('meta[property="og:title"]', 'property', 'og:title', metadata.title)
    setMeta('meta[property="og:description"]', 'property', 'og:description', metadata.description)
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title)
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description)

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (metadata.canonical) {
      if (!canonical) {
        canonical = document.createElement('link')
        canonical.rel = 'canonical'
        document.head.append(canonical)
      }
      canonical.href = metadata.canonical
      setMeta('meta[property="og:url"]', 'property', 'og:url', metadata.canonical)
    } else {
      canonical?.remove()
      document.head.querySelector('meta[property="og:url"]')?.remove()
    }

    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (metadata.noindex) {
      setMeta('meta[name="robots"]', 'name', 'robots', 'noindex')
    } else if (robots?.content === 'noindex') {
      robots.remove()
    }
  }, [metadata.canonical, metadata.description, metadata.noindex, metadata.title])
}
