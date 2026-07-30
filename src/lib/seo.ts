/**
 * Meta description helpers.
 *
 * Search engines truncate the description snippet around 155-160 characters,
 * so we clip at a word boundary instead of letting the engine cut mid-word.
 */

const MAX_DESCRIPTION = 155

/** Joins the given fragments (skipping empty ones) into one clipped sentence. */
export function metaDescription(...parts: (string | null | undefined)[]): string {
  const text = parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')

  return clip(text, MAX_DESCRIPTION)
}

/** Truncates at the last whole word that fits, adding an ellipsis. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:—-]$/, '')}…`
}
