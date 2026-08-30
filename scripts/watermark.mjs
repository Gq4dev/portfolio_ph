/**
 * Watermark a folder of photos for the sales catalog.
 *
 * Burns the watermark INTO the file: the original never leaves the machine.
 * A CSS/SVG overlay in the browser is decoration, not protection — the
 * untouched asset stays one devtools click away.
 *
 * Usage:
 *   node scripts/watermark.mjs --in FOTOS/Deporte --out public/catalog/natacion \
 *     --prefix NAT --handle "@jesicamariana.ph" --limit 6
 *
 * Writes the processed JPEGs plus a manifest.json mapping code -> file,
 * ready to drive the Sanity upload.
 */
import { readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const JPEG_QUALITY = 78
// Long edge cap. Enough to judge the shot on screen, useless for printing.
const MAX_EDGE = 1600

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    args[key] = next && !next.startsWith('--') ? next : 'true'
  }
  return args
}

const escapeXml = (s) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]
  )

/**
 * Diagonal tiled watermark sized to the image.
 *
 * White fill over a dark stroke so the text survives both blown-out
 * highlights and black shadows without a heavy opaque bar.
 */
function watermarkSvg({ width, height, handle, code }) {
  const label = escapeXml(`${handle} · ${code}`)
  // Type scales with the image so the mark reads the same at any size.
  const fontSize = Math.max(16, Math.round(width * 0.028))
  const tileW = Math.round(fontSize * label.length * 0.62 + fontSize * 5)
  const tileH = Math.round(fontSize * 7)
  const badge = Math.max(20, Math.round(width * 0.034))

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="wm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse"
             patternTransform="rotate(-30)">
      <text x="0" y="${Math.round(tileH * 0.6)}"
            font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}"
            font-weight="600" letter-spacing="${(fontSize * 0.06).toFixed(2)}"
            fill="rgba(255,255,255,0.34)"
            stroke="rgba(0,0,0,0.22)" stroke-width="${(fontSize * 0.035).toFixed(2)}"
            paint-order="stroke">${label}</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)"/>
  <!-- Legible code the client quotes back when ordering. -->
  <text x="${width - Math.round(width * 0.03)}" y="${height - Math.round(height * 0.035)}"
        text-anchor="end"
        font-family="Arial, Helvetica, sans-serif" font-size="${badge}"
        font-weight="700" letter-spacing="${(badge * 0.08).toFixed(2)}"
        fill="rgba(255,255,255,0.92)"
        stroke="rgba(0,0,0,0.45)" stroke-width="${(badge * 0.05).toFixed(2)}"
        paint-order="stroke">${escapeXml(code)}</text>
</svg>`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const inDir = args.in
  const outDir = args.out
  const prefix = (args.prefix ?? 'PH').toUpperCase()
  const handle = args.handle ?? '@jesicamariana.ph'
  const limit = args.limit ? Number(args.limit) : Infinity

  if (!inDir || !outDir) {
    console.error('Usage: node scripts/watermark.mjs --in <dir> --out <dir> [--prefix NAT] [--limit 6]')
    process.exit(1)
  }

  const entries = await readdir(inDir, { withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile() && /\.(jpe?g|png|webp|tiff?)$/i.test(e.name))
    // Stable order → stable codes across re-runs.
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .slice(0, limit)

  if (files.length === 0) {
    console.error(`No images found in ${inDir}`)
    process.exit(1)
  }

  await mkdir(outDir, { recursive: true })

  const manifest = []
  for (const [i, name] of files.entries()) {
    const code = `${prefix}-${String(i + 1).padStart(3, '0')}`
    const outName = `${code.toLowerCase()}.jpg`
    const outPath = path.join(outDir, outName)

    // Resize first so the watermark is composited at final dimensions.
    const resized = sharp(path.join(inDir, name))
      .rotate() // honor EXIF orientation before metadata is dropped
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })

    const { width, height } = await resized.toBuffer({ resolveWithObject: true })
      .then(({ info }) => info)

    await resized
      .composite([{ input: watermarkSvg({ width, height, handle, code }), top: 0, left: 0 }])
      // No .withMetadata() → sharp drops EXIF (camera, lens, GPS) by default.
      .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
      .toFile(outPath)

    manifest.push({ code, source: name, file: outName, width, height })
    console.log(`${code}  ${name}  ->  ${outName}  (${width}x${height})`)
  }

  await writeFile(
    path.join(outDir, 'manifest.json'),
    JSON.stringify({ prefix, handle, generatedAt: new Date().toISOString(), photos: manifest }, null, 2)
  )
  console.log(`\n${manifest.length} photos written to ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
