import imageUrlBuilder from '@sanity/image-url'
import type { SanityImageSource } from '@sanity/image-url'
import { sanityClient } from './sanity'

const builder = imageUrlBuilder(sanityClient)

export function urlFor(source: SanityImageSource) {
  return builder.image(source)
}

/**
 * Natural width/height ratio. Structural type on purpose so this stays usable
 * from anywhere without dragging the query types in. Same 3/2 fallback
 * OptimizedImage uses when an asset has no resolved metadata.
 */
export function imageRatio(image: {
  metadata?: { dimensions?: { width: number; height: number } }
}): number {
  const d = image.metadata?.dimensions
  return d && d.height > 0 ? d.width / d.height : 3 / 2
}

// A justified row stretches to fill the container, so a photo ends up wider
// than its nominal basis. Ask for a little more than that or the browser picks
// a candidate it then has to upscale. Lives here, not in the grids: unlike the
// row heights it is paired with no CSS custom property, so a copy sitting in a
// component would be a magic number with nothing to keep it honest.
const ROW_STRETCH = 1.4

/**
 * `sizes` for a photo inside a justified row, given the row-height targets of
 * the grid it belongs to. Row height is a px target rather than a fraction of
 * the viewport, so these are px too — a vw-based sizes over-fetches badly at
 * four-up on a phone. The breakpoints match the grids' media queries.
 */
export function justifiedSizes(
  ratio: number,
  rowH: { sm: number; md: number; lg: number }
): string {
  const at = (h: number) => Math.round(ratio * h * ROW_STRETCH)
  return `(max-width: 639px) ${at(rowH.sm)}px, (max-width: 999px) ${at(rowH.md)}px, ${at(rowH.lg)}px`
}

// The viewer never renders wider than the screen, so a phone has no use for
// the 2000px file — it was the single heaviest thing in the experience.
const VIEWER_WIDTHS = [800, 1200, 1600, 2000]

/**
 * Sources for the full-screen viewer. `src` stays the 2000px URL so anything
 * that ignores srcset still gets a usable image.
 */
export function viewerSources(source: SanityImageSource) {
  const at = (w: number) =>
    urlFor(source).width(w).auto('format').quality(85).url()
  return {
    src: at(2000),
    srcset: VIEWER_WIDTHS.map((w) => `${at(w)} ${w}w`).join(', '),
    // Edge to edge on a phone, near enough on a desktop.
    sizes: '(max-width: 640px) 96vw, 88vw',
  }
}
