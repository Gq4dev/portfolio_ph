// Bilingual helpers for the static language toggle.
//
// The site is statically pre-rendered and English-first: every translatable
// string is emitted in BOTH languages and CSS shows the active one based on
// `<html data-lang>` (default "en"). These helpers precompute count-based
// labels in both languages at build time so the toggle stays pure-CSS.
export type Lang = 'en' | 'es'

export interface Bilingual {
  en: string
  es: string
}

// "3 photos" / "3 fotografías"
export const photoCount = (n: number): Bilingual => ({
  en: n === 1 ? '1 photo' : `${n} photos`,
  es: n === 1 ? '1 fotografía' : `${n} fotografías`,
})

// Short variant used on cards: "3 photos" / "3 fotos"
export const photoCountShort = (n: number): Bilingual => ({
  en: n === 1 ? '1 photo' : `${n} photos`,
  es: n === 1 ? '1 foto' : `${n} fotos`,
})

// "3 collections" / "3 colecciones"
export const collectionCount = (n: number): Bilingual => ({
  en: n === 1 ? '1 collection' : `${n} collections`,
  es: n === 1 ? '1 colección' : `${n} colecciones`,
})
