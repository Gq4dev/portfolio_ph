/**
 * Studio tool: build a full event catalog without touching a terminal.
 *
 * Photos are picked locally, watermarked in the browser and only then
 * uploaded — the original never leaves the machine. Authentication is the
 * Studio's own, so there is no second login and no public upload endpoint.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Grid,
  Heading,
  Inline,
  Spinner,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import { useClient } from 'sanity'
import { buildCode, slugify, watermarkFile } from './watermark'

const API_VERSION = '2025-01-01'
const DEFAULT_HANDLE = '@jesicamariana.ph'
const PREFIX_PATTERN = /^[A-Z0-9]{2,6}$/

interface Preview {
  code: string
  url: string
  name: string
}

type Phase = 'form' | 'previewing' | 'uploading' | 'done'

export default function EventUploader() {
  const client = useClient({ apiVersion: API_VERSION })

  const [title, setTitle] = useState('')
  const [prefix, setPrefix] = useState('')
  const [date, setDate] = useState('')
  const [slug, setSlug] = useState('')
  const [publish, setPublish] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  const [phase, setPhase] = useState<Phase>('form')
  const [previews, setPreviews] = useState<Preview[]>([])
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ slug: string; count: number } | null>(null)

  // Typing a slug by hand is optional; until then it tracks the title.
  const effectiveSlug = slug.trim() || slugify(title)

  const problems = useMemo(() => {
    const list: string[] = []
    if (!title.trim()) list.push('Falta el nombre del evento.')
    if (!PREFIX_PATTERN.test(prefix.trim().toUpperCase()))
      list.push('El prefijo debe tener entre 2 y 6 letras o números — ej. MOS.')
    if (!files.length) list.push('No elegiste ninguna foto.')
    if (!effectiveSlug) list.push('No se pudo generar el slug desde el título.')
    return list
  }, [title, prefix, files, effectiveSlug])

  const handleFiles = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    // Sorted by name so codes are stable across re-picks, matching the CLI.
    const picked = Array.from(event.target.files ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, 'es')
    )
    setFiles(picked)
    setPreviews([])
    setResult(null)
    setError(null)
    setPhase('form')
  }, [])

  /** Marks the first few photos only — enough to judge, fast to produce. */
  const handlePreview = useCallback(async () => {
    setError(null)
    setPhase('previewing')
    try {
      const upTo = files.slice(0, 3)
      const made: Preview[] = []
      for (const [i, file] of upTo.entries()) {
        const code = buildCode(prefix, i + 1)
        const { blob } = await watermarkFile(file, { code, handle: DEFAULT_HANDLE })
        made.push({ code, url: URL.createObjectURL(blob), name: file.name })
      }
      previews.forEach((p) => URL.revokeObjectURL(p.url))
      setPreviews(made)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPhase('form')
    }
  }, [files, prefix, previews])

  const handleUpload = useCallback(async () => {
    setError(null)
    setProgress(0)
    setPhase('uploading')

    try {
      const docId = `event-${effectiveSlug}`
      const existing = await client.fetch<{ title: string } | null>(
        '*[_type == "event" && (_id == $id || slug.current == $slug)][0]{title}',
        { id: docId, slug: effectiveSlug }
      )
      if (existing) {
        throw new Error(
          `Ya existe un evento con el slug "${effectiveSlug}" (${existing.title}). Elegí otro slug o borralo primero.`
        )
      }

      const photos = []
      for (const [i, file] of files.entries()) {
        const code = buildCode(prefix, i + 1)
        const { blob } = await watermarkFile(file, { code, handle: DEFAULT_HANDLE })
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

      await client.createOrReplace({
        _id: docId,
        _type: 'event',
        title: title.trim(),
        slug: { _type: 'slug', current: effectiveSlug },
        codePrefix: prefix.trim().toUpperCase(),
        published: publish,
        ...(date ? { date } : {}),
        coverImage: {
          _type: 'image',
          asset: { _type: 'reference', _ref: photos[0].asset._ref },
        },
        photos,
      })

      setResult({ slug: effectiveSlug, count: photos.length })
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('form')
    }
  }, [client, date, effectiveSlug, files, prefix, publish, title])

  const busy = phase === 'previewing' || phase === 'uploading'

  if (phase === 'done' && result) {
    return (
      <Card padding={4}>
        <Stack space={4}>
          <Heading size={2}>Evento subido</Heading>
          <Text>
            {result.count} fotos cargadas en “{title.trim()}”.
          </Text>
          <Text size={1} muted>
            {publish
              ? `Ya está visible en /eventos/${result.slug}.`
              : 'Quedó oculto. Abrilo en Eventos y activá “Visible en el sitio” cuando quieras publicarlo.'}
          </Text>
          <Box>
            <Button
              text="Cargar otro evento"
              tone="primary"
              onClick={() => {
                previews.forEach((p) => URL.revokeObjectURL(p.url))
                setTitle('')
                setPrefix('')
                setDate('')
                setSlug('')
                setPublish(false)
                setFiles([])
                setPreviews([])
                setResult(null)
                setPhase('form')
              }}
            />
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
            Las fotos se marcan acá, en tu computadora, y se sube solo la copia
            con marca de agua. El original nunca sale de tu máquina.
          </Text>
        </Stack>

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
          {files.length > 0 && (
            <Text size={1} muted>
              {files.length} {files.length === 1 ? 'foto elegida' : 'fotos elegidas'} — se
              van a numerar {buildCode(prefix || 'XXX', 1)} a{' '}
              {buildCode(prefix || 'XXX', files.length)}.
            </Text>
          )}
        </Stack>

        <Flex align="center" gap={3}>
          <Checkbox
            id="publish"
            checked={publish}
            onChange={(e) => setPublish(e.currentTarget.checked)}
            disabled={busy}
          />
          <Text size={1}>
            <label htmlFor="publish">Publicar en el sitio al terminar</label>
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
                : `Marcar y subir ${files.length || ''}`.trim()
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
