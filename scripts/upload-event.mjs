/**
 * Bulk-upload a watermarked event folder to Sanity.
 *
 * Reads the manifest.json produced by scripts/watermark.mjs, uploads each
 * image as an asset and writes one `event` document with every photo already
 * carrying its code. Typing a few hundred codes by hand is not an option.
 *
 * Requires a write token — read tokens cannot create assets:
 *   sanity.io/manage/project/f24czf8c/api -> Tokens -> add "Editor"
 * Store it in .env as SANITY_WRITE_TOKEN (never commit it).
 *
 * Usage:
 *   node scripts/upload-event.mjs --dir FOTOS-marcadas/natacion \
 *     --title "Master Open Series — Parque Olímpico" \
 *     --slug master-open-series --date 2026-08-30 --publish
 *
 * Re-running with the same slug refuses to touch the existing document unless
 * --replace is passed, so a second run never silently wipes manual edits.
 */
import { readFile, readdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { createClient } from '@sanity/client'

const PROJECT_ID = 'f24czf8c'
const DATASET = 'production'
const API_VERSION = '2025-01-01'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    args[key] = next && !next.startsWith('--') ? next : true
  }
  return args
}

/** Loads .env by hand — this runs outside Astro, so import.meta.env is absent. */
async function loadEnv() {
  try {
    const raw = await readFile('.env', 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const value = match[2].replace(/^["']|["']$/g, '')
      if (!process.env[match[1]]) process.env[match[1]] = value
    }
  } catch {
    // No .env: fall back to the ambient environment.
  }
}

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dir = args.dir
  const title = typeof args.title === 'string' ? args.title.trim() : ''

  if (!dir || !title) {
    console.error(
      'Usage: node scripts/upload-event.mjs --dir <folder> --title "<event name>" [--slug x] [--date YYYY-MM-DD] [--publish] [--replace]'
    )
    process.exit(1)
  }

  await loadEnv()
  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) {
    console.error(
      'Missing SANITY_WRITE_TOKEN.\n' +
        `Create an Editor token at https://sanity.io/manage/project/${PROJECT_ID}/api\n` +
        'then add it to .env as SANITY_WRITE_TOKEN=...'
    )
    process.exit(1)
  }

  const manifestPath = path.join(dir, 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch {
    console.error(
      `No manifest.json in ${dir}. Run scripts/watermark.mjs on the folder first.`
    )
    process.exit(1)
  }

  const slug = typeof args.slug === 'string' ? args.slug : slugify(title)
  const date = typeof args.date === 'string' ? args.date : undefined
  const prefix = manifest.prefix

  // Guard against uploading originals: every file must be listed in the
  // manifest, which only ever describes watermarked exports.
  const onDisk = (await readdir(dir)).filter((f) => /\.jpe?g$/i.test(f))
  const listed = new Set(manifest.photos.map((p) => p.file))
  const strays = onDisk.filter((f) => !listed.has(f))
  if (strays.length) {
    console.error(
      `These files are not in the manifest and would upload unwatermarked:\n  ${strays.join('\n  ')}`
    )
    process.exit(1)
  }

  const client = createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    apiVersion: API_VERSION,
    token,
    useCdn: false,
  })

  const docId = `event-${slug}`
  const existing = await client.fetch(
    '*[_type == "event" && (_id == $id || slug.current == $slug)][0]{_id, title}',
    { id: docId, slug }
  )
  if (existing && !args.replace) {
    console.error(
      `An event already exists for slug "${slug}" (${existing.title}).\n` +
        'Re-run with --replace to overwrite it, or pick another --slug.'
    )
    process.exit(1)
  }

  console.log(`Uploading ${manifest.photos.length} photos to ${DATASET}...`)

  const photos = []
  for (const photo of manifest.photos) {
    const filePath = path.join(dir, photo.file)
    // Sanity dedupes assets by content hash, so re-running does not pile up
    // copies of the same file.
    const asset = await client.assets.upload('image', createReadStream(filePath), {
      filename: photo.file,
    })
    photos.push({
      _type: 'catalogPhoto',
      _key: photo.code.toLowerCase().replace(/[^a-z0-9]/g, ''),
      asset: { _type: 'reference', _ref: asset._id },
      code: photo.code,
    })
    console.log(`  ${photo.code}  ${photo.file}`)
  }

  const doc = {
    _id: docId,
    _type: 'event',
    title,
    slug: { _type: 'slug', current: slug },
    codePrefix: prefix,
    // Stays hidden unless --publish is explicit: an accidental run must never
    // put a half-built catalog on the live site.
    published: args.publish === true,
    ...(date ? { date } : {}),
    coverImage: photos[0]
      ? { _type: 'image', asset: { _type: 'reference', _ref: photos[0].asset._ref } }
      : undefined,
    photos,
  }

  await client.createOrReplace(doc)

  console.log(
    `\nDone. Event "${title}" saved as ${docId} (${photos.length} photos, ` +
      `${doc.published ? 'VISIBLE' : 'hidden'}).\n` +
      `  Studio:  /admin/structure/event;${docId}\n` +
      `  Site:    /eventos/${slug}`
  )
  if (!doc.published) {
    console.log('  Not visible yet — turn on "Visible en el sitio", or re-run with --publish.')
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
