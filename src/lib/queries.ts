import { sanityClient } from './sanity'

/* ------------------------------------------------------------------
   Shared types
------------------------------------------------------------------ */
export interface ImageDimensions {
  width: number
  height: number
  aspectRatio: number
}

export interface SanityImage {
  _key?: string
  _type?: string
  asset?: { _ref: string; _type?: string }
  alt?: string
  caption?: string | null
  captureInfo?: string | null
  metadata?: {
    lqip?: string
    dimensions?: ImageDimensions
  }
}

export interface CategorySummary {
  title: string
  titleEn: string
  slug: string
  order: number | null
  photoCount: number
  cover: SanityImage | null
}

export interface CategoryDetail {
  title: string
  titleEn: string
  slug: string
  photos: SanityImage[]
}

export interface SiteSettings {
  title: string
  tagline: string
  taglineEn: string
  shortBio: string
  shortBioEn: string
  email: string
  whatsapp: string
  instagram: string
  featured: SanityImage[]
}

export interface About {
  title: string
  titleEn: string
  portrait: SanityImage | null
  bio: unknown[] // Portable Text blocks
  bioEn: unknown[] // Portable Text blocks (English)
}

/* ------------------------------------------------------------------
   Reusable GROQ fragments
------------------------------------------------------------------ */
// Full image object + resolved metadata (lqip + dimensions) so we
// always have width/height and a blur placeholder for zero CLS.
const IMAGE_META = `{
  ...,
  "metadata": asset->metadata { lqip, dimensions }
}`

/* ------------------------------------------------------------------
   Queries
------------------------------------------------------------------ */

// Categories list. Resilience:
//  - cover falls back to photos[0] when coverImage is null
//  - order is nullable → coalesce(order, 999)
//  - alt falls back to the category title
const CATEGORIES_QUERY = `
*[_type == "category"] | order(coalesce(order, 999) asc, title asc) {
  title,
  titleEn,
  "slug": slug.current,
  order,
  "photoCount": count(photos),
  "cover": coalesce(coverImage, photos[0]) {
    ...,
    "alt": coalesce(alt, ^.coverImage.alt, ^.title),
    "metadata": asset->metadata { lqip, dimensions }
  }
}`

const CATEGORY_BY_SLUG_QUERY = `
*[_type == "category" && slug.current == $slug][0] {
  title,
  titleEn,
  "slug": slug.current,
  "photos": photos[] {
    ...,
    "alt": coalesce(alt, ^.title),
    "metadata": asset->metadata { lqip, dimensions }
  }
}`

const SITE_SETTINGS_QUERY = `
*[_type == "siteSettings"][0] {
  title, tagline, taglineEn, shortBio, shortBioEn, email, whatsapp, instagram,
  "featured": featured[] ${IMAGE_META}
}`

const ABOUT_QUERY = `
*[_type == "about"][0] {
  title,
  titleEn,
  "portrait": portrait ${IMAGE_META},
  bio,
  bioEn
}`

/* ------------------------------------------------------------------
   Fetchers (with fallbacks so the build never crashes)
------------------------------------------------------------------ */

export async function getCategories(): Promise<CategorySummary[]> {
  const data = await sanityClient.fetch<CategorySummary[]>(CATEGORIES_QUERY)
  return (data ?? [])
    .filter((c) => c && c.slug && c.title)
    // English falls back to Spanish until the EN title is authored.
    .map((c) => ({ ...c, titleEn: c.titleEn || c.title }))
}

export async function getCategory(slug: string): Promise<CategoryDetail | null> {
  const data = await sanityClient.fetch<CategoryDetail | null>(
    CATEGORY_BY_SLUG_QUERY,
    { slug }
  )
  if (!data) return null
  // A category may have an empty/absent photos array — normalize to [].
  return {
    ...data,
    titleEn: data.titleEn || data.title,
    photos: (data.photos ?? []).filter((p) => p?.asset),
  }
}

// Sane defaults for the photographer when the singleton is empty/absent.
const DEFAULT_SETTINGS: SiteSettings = {
  title: 'Jesica Mariana',
  tagline: 'Fotografía',
  taglineEn: 'Photography',
  shortBio: '',
  shortBioEn: '',
  email: 'jesicacomas90@gmail.com',
  whatsapp: '',
  instagram: '@jesicamariana.ph',
  featured: [],
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const raw = await sanityClient.fetch<Partial<SiteSettings> | null>(
    SITE_SETTINGS_QUERY
  )
  if (!raw) return DEFAULT_SETTINGS
  // Merge, ignoring null/empty fields so defaults win over blanks.
  // English fields fall back to their Spanish counterpart until authored.
  const tagline = raw.tagline || DEFAULT_SETTINGS.tagline
  const shortBio = raw.shortBio || DEFAULT_SETTINGS.shortBio
  return {
    title: raw.title || DEFAULT_SETTINGS.title,
    tagline,
    taglineEn: raw.taglineEn || tagline,
    shortBio,
    shortBioEn: raw.shortBioEn || shortBio,
    email: raw.email || DEFAULT_SETTINGS.email,
    whatsapp: raw.whatsapp || DEFAULT_SETTINGS.whatsapp,
    instagram: raw.instagram || DEFAULT_SETTINGS.instagram,
    featured: (raw.featured ?? []).filter((f) => f?.asset),
  }
}

export async function getAbout(): Promise<About | null> {
  const data = await sanityClient.fetch<About | null>(ABOUT_QUERY)
  if (!data) return null
  // English falls back to Spanish until the EN version is authored.
  const bio = Array.isArray(data.bio) ? data.bio : []
  const bioEn = Array.isArray(data.bioEn) && data.bioEn.length ? data.bioEn : bio
  return {
    ...data,
    titleEn: data.titleEn || data.title,
    bio,
    bioEn,
  }
}

/* ------------------------------------------------------------------
   Sales catalog (events)

   Photos here are the WATERMARKED exports produced by
   scripts/watermark.mjs — the originals are never uploaded to the CMS.
   Each one carries the code burnt into the image so the client can quote
   it back when ordering.
------------------------------------------------------------------ */

export interface CatalogPhoto extends SanityImage {
  code: string
}

export interface CatalogEventSummary {
  title: string
  titleEn: string
  slug: string
  date: string | null
  photoCount: number
  cover: SanityImage | null
}

export interface CatalogEventDetail {
  title: string
  titleEn: string
  slug: string
  date: string | null
  photos: CatalogPhoto[]
}

// Only published events reach the site — `published` defaults to false so a
// catalog can be assembled over several sessions without leaking half of it.
const EVENTS_QUERY = `
*[_type == "event" && published == true] | order(coalesce(date, "1900-01-01") desc, title asc) {
  title,
  titleEn,
  "slug": slug.current,
  date,
  "photoCount": count(photos),
  "cover": coalesce(coverImage, photos[0]) {
    ...,
    "alt": coalesce(alt, ^.coverImage.alt, ^.title),
    "metadata": asset->metadata { lqip, dimensions }
  }
}`

const EVENT_BY_SLUG_QUERY = `
*[_type == "event" && slug.current == $slug && published == true][0] {
  title,
  titleEn,
  "slug": slug.current,
  date,
  "photos": photos[] {
    ...,
    "alt": coalesce(alt, ^.title),
    "metadata": asset->metadata { lqip, dimensions }
  }
}`

export async function getCatalogEvents(): Promise<CatalogEventSummary[]> {
  const data = await sanityClient.fetch<CatalogEventSummary[]>(EVENTS_QUERY)
  return (data ?? [])
    .filter((e) => e && e.slug && e.title)
    .map((e) => ({ ...e, titleEn: e.titleEn || e.title }))
}

export async function getCatalogEvent(
  slug: string
): Promise<CatalogEventDetail | null> {
  const data = await sanityClient.fetch<CatalogEventDetail | null>(
    EVENT_BY_SLUG_QUERY,
    { slug }
  )
  if (!data) return null
  return {
    ...data,
    titleEn: data.titleEn || data.title,
    // A photo without an asset or without its code is unusable in a catalog:
    // the code IS the ordering key, so drop it rather than render a dead card.
    photos: (data.photos ?? []).filter((p) => p?.asset && p?.code),
  }
}
