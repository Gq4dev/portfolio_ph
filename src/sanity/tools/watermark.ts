/**
 * Browser-side image preparation, the canvas counterpart of scripts/watermark.mjs.
 *
 * This runs INSIDE the Studio so the original never leaves the photographer's
 * machine: the file is read locally, processed here, and only the result is
 * uploaded. Any design that marks server-side would have to receive the
 * untouched original first, which defeats the purpose.
 *
 * Kept deliberately in step with the Node script — same 1600px cap, same
 * diagonal tiled label, same corner code — so photos marked either way look
 * like one catalog.
 *
 * The label can be switched off for events that are a gallery rather than a
 * catalog, but the downscale and the metadata strip are NOT optional: the
 * catalog page is public, so what leaves here is always a web-resolution file
 * with no camera, lens or GPS in it.
 */

/** Long-edge cap. Enough to judge the shot on screen, useless for printing. */
export const MAX_EDGE = 1600
const JPEG_QUALITY = 0.78

export interface PrepareOptions {
  /** Code burnt into the image, e.g. "MOS-001". */
  code: string
  /** Handle shown alongside the code, e.g. "@jesicamariana.ph". */
  handle: string
  /** When false the photo is only resized and stripped — no label, no badge. */
  watermark?: boolean
  maxEdge?: number
  quality?: number
}

export interface PrepareResult {
  blob: Blob
  width: number
  height: number
}

/**
 * Draws the tiled diagonal label across the whole canvas.
 *
 * A corner logo is worthless — it gets cropped in seconds. Covering the frame
 * is the point. White fill over a dark stroke (stroke painted first) keeps the
 * text readable over both blown highlights and black shadows.
 */
function drawTiledLabel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  label: string
): void {
  const fontSize = Math.max(16, Math.round(width * 0.028))
  ctx.save()
  ctx.font = `600 ${fontSize}px Arial, Helvetica, sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.34)'
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  ctx.lineWidth = Math.max(1, fontSize * 0.035)
  ctx.lineJoin = 'round'

  const labelWidth = ctx.measureText(label).width
  const tileW = Math.round(labelWidth + fontSize * 5)
  const tileH = Math.round(fontSize * 7)

  // Rotating the grid leaves the corners uncovered, so the loop runs over the
  // diagonal in both directions — never just width/height.
  const reach = Math.ceil(Math.hypot(width, height))
  ctx.translate(width / 2, height / 2)
  ctx.rotate((-30 * Math.PI) / 180)

  for (let y = -reach; y <= reach; y += tileH) {
    for (let x = -reach; x <= reach; x += tileW) {
      ctx.strokeText(label, x, y)
      ctx.fillText(label, x, y)
    }
  }
  ctx.restore()
}

/** The code the client quotes back when ordering — must stay legible. */
function drawCodeBadge(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  code: string
): void {
  const size = Math.max(20, Math.round(width * 0.034))
  ctx.save()
  ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.lineWidth = Math.max(1, size * 0.05)
  ctx.lineJoin = 'round'

  const x = width - Math.round(width * 0.03)
  const y = height - Math.round(height * 0.035)
  ctx.strokeText(code, x, y)
  ctx.fillText(code, x, y)
  ctx.restore()
}

/**
 * Reads a picked file, scales it down, optionally burns the watermark and
 * returns a JPEG.
 *
 * `imageOrientation: 'from-image'` applies the EXIF rotation before we lose it:
 * a canvas keeps no metadata, which conveniently also strips camera, lens and
 * GPS from the uploaded file.
 */
export async function prepareFile(
  file: File,
  { code, handle, watermark = true, maxEdge = MAX_EDGE, quality = JPEG_QUALITY }: PrepareOptions
): Promise<PrepareResult> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo crear el canvas para procesar la foto.')

    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)

    if (watermark) {
      drawTiledLabel(ctx, width, height, `${handle} · ${code}`)
      drawCodeBadge(ctx, width, height, code)
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob) throw new Error(`No se pudo generar el archivo de ${code}.`)

    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}

/** "MOS" + 3 -> "MOS-003". Same shape the schema validates. */
export const buildCode = (prefix: string, index: number): string =>
  `${prefix.toUpperCase()}-${String(index).padStart(3, '0')}`

/**
 * Highest number already used by a set of codes, so an append continues the
 * series instead of restarting it. Malformed codes are ignored rather than
 * throwing — one bad entry must not block adding photos.
 */
export const highestCodeNumber = (codes: readonly (string | null | undefined)[]): number =>
  codes.reduce<number>((highest, code) => {
    const parsed = Number(String(code ?? '').split('-').pop())
    return Number.isInteger(parsed) && parsed > highest ? parsed : highest
  }, 0)

/** Mirrors the slug rules used by the CLI upload script. */
export const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
