/**
 * Studio tool: build or extend a full event catalog without touching a terminal.
 *
 * Photos are picked locally, processed in the browser and only then uploaded —
 * the original never leaves the machine. Authentication is the Studio's own, so
 * there is no second login and no public upload endpoint.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Grid,
  Heading,
  Inline,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import { useClient } from 'sanity'
import { buildCode, highestCodeNumber, prepareFile, slugify } from './watermark'

const API_VERSION = '2025-01-01'
const DEFAULT_HANDLE = '@jesicamariana.ph'
const PREFIX_PATTERN = /^[A-Z0-9]{2,6}$/
const PREVIEW_LIMIT = 3

/**
 * Ordered newest first. `coalesce` keeps undated events in the list instead of
 * dropping them, and `codes` is what the append mode continues counting from.
 */
const EVENTS_QUERY = `*[_type == "event"] | order(coalesce(date, "0000-00-00") desc) {
  _id,
  title,
  "slug": slug.current,
  codePrefix,
  published,
  "hasCover": defined(coverImage.asset),
  "codes": photos[].code
}`

interface ExistingEvent {
  _id: string
  title: string
  slug: string | null
  codePrefix: string | null
  published: boolean | null
  hasCover: boolean
  codes: string[] | null
}

interface Preview {
  code: string
  url: string
  name: string
}

interface Result {
  title: string
  slug: string | null
  count: number
  firstCode: string
  lastCode: string
  visible: boolean
  appended: boolean
}

type Mode = 'new' | 'append'
type Phase = 'form' | 'previewing' | 'uploading' | 'done'

export default function EventUploader() {
  const client = useClient({ apiVersion: API_VERSION })

  const [mode, setMode] = useState<Mode>('new')
  const [events, setEvents] = useState<ExistingEvent[]>([])
  const [targetId, setTargetId] = useState('')

  const [title, setTitle] = useState('')
  const [prefix, setPrefix] = useState('')
  const [date, setDate] = useState('')
  const [slug, setSlug] = useState('')
  const [publish, setPublish] = useState(false)
  const [watermark, setWatermark] = useState(true)
  const [files, setFiles] = useState<File[]>([])

  const [phase, setPhase] = useState<Phase>('form')
  const [previews, setPreviews] = useState<Preview[]>([])
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const loadEvents = useCallback(async () => {
    try {
      setEvents((await client.fetch<ExistingEvent[]>(EVENTS_QUERY)) ?? [])
    } catch (err) {
      setError(
        `No se pudo leer la lista de eventos: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }, [client])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const target = useMemo(
    () => events.find((event) => event._id === targetId) ?? null,
    [events, targetId]
  )

  // Typing a slug by hand is optional; until then it tracks the title.
  const effectiveSlug = slug.trim() || slugify(title)

  // Appending inherits the event's prefix — a second prefix inside one catalog
  // would break the codes clients quote back when ordering.
  const effectivePrefix =
    mode === 'append' ? (target?.codePrefix ?? '') : prefix.trim().toUpperCase()

  /** Where this batch starts numbering: 1 for a new event, after the last code otherwise. */
  const startIndex = mode === 'append' ? highestCodeNumber(target?.codes ?? []) + 1 : 1

  const problems = useMemo(() => {
    const list: string[] = []
    if (mode === 'new') {
      if (!title.trim()) list.push('Falta el nombre del evento.')
      if (!PREFIX_PATTERN.test(effectivePrefix))
        list.push('El prefijo debe tener entre 2 y 6 letras o números — ej. MOS.')
      if (!effectiveSlug) list.push('No se pudo generar el slug desde el título.')
    } else if (!target) {
      list.push('Elegí a qué evento querés agregarle fotos.')
    } else if (!PREFIX_PATTERN.test(effectivePrefix)) {
      list.push(
        `El evento "${target.title}" no tiene un prefijo de código válido. Corregilo en Eventos antes de agregar fotos.`
      )
    }
    if (!files.length) list.push('No elegiste ninguna foto.')
    return list
  }, [mode, title, effectivePrefix, effectiveSlug, files, target])

  const releasePreviews = useCallback((made: Preview[]) => {
    made.forEach((preview) => URL.revokeObjectURL(preview.url))
  }, [])

  const resetPreviews = useCallback(() => {
    setPreviews((current) => {
      releasePreviews(current)
      return []
    })
  }, [releasePreviews])

  // Blobs held by an object URL are never freed until the URL is revoked, so a
  // long session of previews would keep every one of them in memory.
  useEffect(() => () => releasePreviews(previews), [previews, releasePreviews])

  const handleFiles = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      // Sorted by name so codes are stable across re-picks, matching the CLI.
      const picked = Array.from(event.target.files ?? []).sort((a, b) =>
        a.name.localeCompare(b.name, 'es')
      )
      setFiles(picked)
      resetPreviews()
      setResult(null)
      setError(null)
      setPhase('form')
    },
    [resetPreviews]
  )

  const switchMode = useCallback(
    (next: Mode) => {
      setMode(next)
      resetPreviews()
      setResult(null)
      setError(null)
      setPhase('form')
    },
    [resetPreviews]
  )

  /** Marks the first few photos only — enough to judge, fast to produce. */
  const handlePreview = useCallback(async () => {
    setError(null)
    setPhase('previewing')
    try {
      const made: Preview[] = []
      for (const [i, file] of files.slice(0, PREVIEW_LIMIT).entries()) {
        const code = buildCode(effectivePrefix, startIndex + i)
        const { blob } = await prepareFile(file, { code, handle: DEFAULT_HANDLE, watermark })
        made.push({ code, url: URL.createObjectURL(blob), name: file.name })
      }
      resetPreviews()
      setPreviews(made)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPhase('form')
    }
  }, [files, effectivePrefix, startIndex, watermark, resetPreviews])

  /** Processes and uploads every picked file, returning the catalog entries. */
  const uploadPhotos = useCallback(async () => {
    const photos = []
    for (const [i, file] of files.entries()) {
      const code = buildCode(effectivePrefix, startIndex + i)
      const { blob } = await prepareFile(file, { code, handle: DEFAULT_HANDLE, watermark })
      const asset = await client.assets.upload('image', blob, {
        filename: `${code.toLowerCase()}.jpg`,
      })
      photos.push({
        _type: 'catalogPhoto',
        _key: code.toLowerCase().replace(/[^a-z0-9]/g, ''),
        asset: { _type: 'reference', _ref: asset._id },
        code,
      })
      setProgress(i + 1)
    }
    return photos
  }, [client, files, effectivePrefix, startIndex, watermark])

  const handleUpload = useCallback(async () => {
    setError(null)
    setProgress(0)
    setPhase('uploading')

    try {
      if (mode === 'append') {
        if (!target) throw new Error('Elegí a qué evento querés agregarle fotos.')

        // Patching the published document while a draft is open would lose the
        // new photos the moment that draft is published over it.
        const draft = await client.fetch<string | null>('*[_id == $id][0]._id', {
          id: `drafts.${target._id}`,
        })
        if (draft) {
          throw new Error(
            `"${target.title}" tiene cambios sin publicar en Eventos. Publicálos o descartálos y volvé a intentar.`
          )
        }

        const photos = await uploadPhotos()
        let patch = client.patch(target._id).setIfMissing({ photos: [] }).append('photos', photos)
        if (!target.hasCover) {
          patch = patch.set({
            coverImage: {
              _type: 'image',
              asset: { _type: 'reference', _ref: photos[0].asset._ref },
            },
          })
        }
        // Only ever turns visibility ON: an unticked box must not hide an event
        // that is already live.
        if (publish) patch = patch.set({ published: true })
        await patch.commit()

        setResult({
          title: target.title,
          slug: target.slug,
          count: photos.length,
          firstCode: photos[0].code,
          lastCode: photos[photos.length - 1].code,
          visible: publish || target.published === true,
          appended: true,
        })
      } else {
        const docId = `event-${effectiveSlug}`
        const existing = await client.fetch<{ title: string } | null>(
          '*[_type == "event" && (_id == $id || slug.current == $slug)][0]{title}',
          { id: docId, slug: effectiveSlug }
        )
        if (existing) {
          throw new Error(
            `Ya existe un evento con el slug "${effectiveSlug}" (${existing.title}). Elegí otro slug, o pasá a “Agregar fotos a un evento que ya existe”.`
          )
        }

        const photos = await uploadPhotos()
        await client.createOrReplace({
          _id: docId,
          _type: 'event',
          title: title.trim(),
          slug: { _type: 'slug', current: effectiveSlug },
          codePrefix: effectivePrefix,
          published: publish,
          ...(date ? { date } : {}),
          coverImage: {
            _type: 'image',
            asset: { _type: 'reference', _ref: photos[0].asset._ref },
          },
          photos,
        })

        setResult({
          title: title.trim(),
          slug: effectiveSlug,
          count: photos.length,
          firstCode: photos[0].code,
          lastCode: photos[photos.length - 1].code,
          visible: publish,
          appended: false,
        })
      }

      // The next batch has to see the codes this one just used.
      await loadEvents()
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('form')
    }
  }, [
    client,
    date,
    effectivePrefix,
    effectiveSlug,
    loadEvents,
    mode,
    publish,
    target,
    title,
    uploadPhotos,
  ])

  const startOver = useCallback(() => {
    resetPreviews()
    setTitle('')
    setPrefix('')
    setDate('')
    setSlug('')
    setPublish(false)
    setWatermark(true)
    setFiles([])
    setTargetId('')
    setResult(null)
    setProgress(0)
    setPhase('form')
  }, [resetPreviews])

  const busy = phase === 'previewing' || phase === 'uploading'

  if (phase === 'done' && result) {
    return (
      <Card padding={4}>
        <Stack space={4}>
          <Heading size={2}>{result.appended ? 'Fotos agregadas' : 'Evento subido'}</Heading>
          <Text>
            {result.count} {result.count === 1 ? 'foto cargada' : 'fotos cargadas'} en “
            {result.title}” — {result.firstCode} a {result.lastCode}.
          </Text>
          <Text size={1} muted>
            {result.visible
              ? `Ya está visible en /eventos/${result.slug}.`
              : 'Quedó oculto. Abrilo en Eventos y activá “Visible en el sitio” cuando quieras publicarlo.'}
          </Text>
          <Box>
            <Button text="Cargar más fotos" tone="primary" onClick={startOver} />
          </Box>
        </Stack>
      </Card>
    )
  }

  return (
    <Card padding={4}>
      <Stack space={5}>
        <Stack space={3}>
          <Heading size={2}>Subir evento</Heading>
          <Text size={1} muted>
            Las fotos se procesan acá, en tu computadora, y se sube solo la copia
            reducida. El original nunca sale de tu máquina.
          </Text>
        </Stack>

        <Stack space={3}>
          <Text size={1} weight="medium">
            ¿Qué querés hacer?
          </Text>
          <Select
            value={mode}
            onChange={(e) => switchMode(e.currentTarget.value as Mode)}
            disabled={busy}
          >
            <option value="new">Crear un evento nuevo</option>
            <option value="append">Agregar fotos a un evento que ya existe</option>
          </Select>
        </Stack>

        {mode === 'append' ? (
          <Stack space={3}>
            <Text size={1} weight="medium">
              Evento
            </Text>
            <Select
              value={targetId}
              onChange={(e) => setTargetId(e.currentTarget.value)}
              disabled={busy}
            >
              <option value="">Elegí un evento…</option>
              {events.map((event) => (
                <option key={event._id} value={event._id}>
                  {event.title} — {event.codes?.length ?? 0} fotos
                  {event.published ? '' : ' (oculto)'}
                </option>
              ))}
            </Select>
            {events.length === 0 && (
              <Text size={1} muted>
                Todavía no hay eventos cargados.
              </Text>
            )}
            {target && PREFIX_PATTERN.test(effectivePrefix) && (
              <Text size={1} muted>
                Las fotos nuevas siguen la numeración existente: arrancan en{' '}
                {buildCode(effectivePrefix, startIndex)}.
              </Text>
            )}
          </Stack>
        ) : (
          <>
            <Stack space={3}>
              <Text size={1} weight="medium">
                Nombre del evento
              </Text>
              <TextInput
                value={title}
                placeholder="Master Open Series — Parque Olímpico"
                onChange={(e) => setTitle(e.currentTarget.value)}
                disabled={busy}
              />
            </Stack>

            <Grid columns={[1, 1, 3]} gap={3}>
              <Stack space={3}>
                <Text size={1} weight="medium">
                  Prefijo de código
                </Text>
                <TextInput
                  value={prefix}
                  placeholder="MOS"
                  onChange={(e) => setPrefix(e.currentTarget.value.toUpperCase())}
                  disabled={busy}
                />
              </Stack>
              <Stack space={3}>
                <Text size={1} weight="medium">
                  Fecha
                </Text>
                <TextInput
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.currentTarget.value)}
                  disabled={busy}
                />
              </Stack>
              <Stack space={3}>
                <Text size={1} weight="medium">
                  Slug (URL)
                </Text>
                <TextInput
                  value={slug}
                  placeholder={slugify(title) || 'master-open-series'}
                  onChange={(e) => setSlug(e.currentTarget.value)}
                  disabled={busy}
                />
              </Stack>
            </Grid>
          </>
        )}

        <Stack space={3}>
          <Text size={1} weight="medium">
            Fotos originales
          </Text>
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={handleFiles}
            disabled={busy}
          />
          {files.length > 0 && PREFIX_PATTERN.test(effectivePrefix) && (
            <Text size={1} muted>
              {files.length} {files.length === 1 ? 'foto elegida' : 'fotos elegidas'} — se van a
              numerar {buildCode(effectivePrefix, startIndex)} a{' '}
              {buildCode(effectivePrefix, startIndex + files.length - 1)}.
            </Text>
          )}
        </Stack>

        <Stack space={3}>
          <Flex align="center" gap={3}>
            <Checkbox
              id="watermark"
              checked={watermark}
              onChange={(e) => setWatermark(e.currentTarget.checked)}
              disabled={busy}
            />
            <Text size={1}>
              <label htmlFor="watermark">Aplicar marca de agua</label>
            </Text>
          </Flex>
          {!watermark && (
            <Card padding={3} radius={2} tone="caution">
              <Text size={1}>
                Sin marca de agua las fotos se ven limpias en el sitio y cualquiera puede
                descargarlas. Se suben igual reducidas a 1600px y sin datos de cámara, pero el
                código deja de estar impreso sobre la foto. Usalo para eventos que mostrás, no
                para los que vendés.
              </Text>
            </Card>
          )}
        </Stack>

        <Flex align="center" gap={3}>
          <Checkbox
            id="publish"
            checked={publish}
            onChange={(e) => setPublish(e.currentTarget.checked)}
            disabled={busy || (mode === 'append' && target?.published === true)}
          />
          <Text size={1}>
            <label htmlFor="publish">
              {mode === 'append' && target?.published === true
                ? 'Este evento ya está visible en el sitio'
                : 'Publicar en el sitio al terminar'}
            </label>
          </Text>
        </Flex>

        {problems.length > 0 && files.length > 0 && (
          <Card padding={3} radius={2} tone="caution">
            <Stack space={2}>
              {problems.map((p) => (
                <Text key={p} size={1}>
                  {p}
                </Text>
              ))}
            </Stack>
          </Card>
        )}

        {error && (
          <Card padding={3} radius={2} tone="critical">
            <Text size={1}>{error}</Text>
          </Card>
        )}

        <Inline space={3}>
          <Button
            text="Ver cómo queda"
            mode="ghost"
            disabled={busy || problems.length > 0}
            onClick={handlePreview}
          />
          <Button
            text={
              phase === 'uploading'
                ? `Subiendo ${progress}/${files.length}...`
                : `${mode === 'append' ? 'Agregar' : 'Marcar y subir'} ${files.length || ''}`.trim()
            }
            tone="primary"
            disabled={busy || problems.length > 0}
            onClick={handleUpload}
          />
          {busy && <Spinner muted />}
        </Inline>

        {previews.length > 0 && (
          <Stack space={3}>
            <Text size={1} weight="medium">
              Vista previa {previews.length < files.length && `(primeras ${previews.length})`}
            </Text>
            <Grid columns={[1, 2, 3]} gap={3}>
              {previews.map((p) => (
                <Stack key={p.code} space={2}>
                  <img
                    src={p.url}
                    alt={p.code}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                  <Text size={1} muted>
                    {p.code}
                  </Text>
                </Stack>
              ))}
            </Grid>
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
