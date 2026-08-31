import { defineType, defineField } from 'sanity'

/**
 * Sales catalog for a shot event.
 *
 * Every photo carries a human-readable code because that code is normally
 * burnt into the watermarked preview: the client quotes it back to order the
 * clean file. Uploads here MUST be downscaled exports — from
 * `scripts/watermark.mjs` or from the "Subir evento" tool — never originals.
 * The tool can skip the watermark for events that are a gallery rather than a
 * catalog, but never skips the downscale.
 */
export default defineType({
  name: 'event',
  title: 'Evento',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Nombre del evento',
      description: 'Ej. "Master Open Series — Parque Olímpico"',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'titleEn',
      title: 'Nombre del evento (English)',
      type: 'string',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'date',
      title: 'Fecha',
      type: 'date',
      options: { dateFormat: 'DD/MM/YYYY' },
    }),
    defineField({
      name: 'codePrefix',
      title: 'Prefijo de código',
      description:
        'Prefijo usado al generar las marcas de agua — ej. "MOS". Debe coincidir con el --prefix del script.',
      type: 'string',
      validation: (Rule) =>
        Rule.required()
          .uppercase()
          .regex(/^[A-Z0-9]{2,6}$/, { name: 'prefijo (2 a 6 letras o números)' }),
    }),
    defineField({
      name: 'published',
      title: 'Visible en el sitio',
      description: 'Desactivalo para preparar el catálogo sin publicarlo todavía.',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'coverImage',
      title: 'Imagen de portada',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          title: 'Texto alternativo',
          description:
            'Descripción de la foto para lectores de pantalla y buscadores. Si se deja vacío, se usa el nombre del evento.',
          type: 'string',
        }),
      ],
    }),
    defineField({
      name: 'photos',
      title: 'Fotos del catálogo',
      description:
        'Subí SOLO copias reducidas — las que genera “Subir evento” o scripts/watermark.mjs. El original nunca se sube.',
      type: 'array',
      of: [
        defineField({
          name: 'catalogPhoto',
          title: 'Foto',
          type: 'image',
          options: { hotspot: true },
          fields: [
            defineField({
              name: 'code',
              title: 'Código',
              description: 'El mismo código impreso sobre la foto — ej. "MOS-001".',
              type: 'string',
              validation: (Rule) =>
                Rule.required().regex(/^[A-Z0-9]{2,6}-\d{3,}$/, {
                  name: 'código con formato PREFIJO-000',
                }),
            }),
            defineField({
              name: 'alt',
              title: 'Texto alternativo',
              type: 'string',
            }),
          ],
          preview: {
            select: { title: 'code', subtitle: 'alt', media: 'asset' },
          },
        }),
      ],
      // Rule.unique() compares whole array items, so it never catches two
      // photos sharing a code. The code IS the ordering key — a duplicate
      // means an order nobody can fulfil, so it has to block publishing.
      validation: (Rule) =>
        Rule.custom((photos: { code?: string }[] | undefined) => {
          const codes = (photos ?? []).map((p) => p?.code).filter(Boolean)
          const duplicated = [
            ...new Set(codes.filter((c, i) => codes.indexOf(c) !== i)),
          ]
          return duplicated.length
            ? `Códigos repetidos: ${duplicated.join(', ')}. Cada foto necesita un código único.`
            : true
        }),
    }),
  ],
  orderings: [
    {
      title: 'Fecha (más reciente primero)',
      name: 'dateDesc',
      by: [{ field: 'date', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', date: 'date', media: 'coverImage' },
    prepare: ({ title, date, media }) => ({
      title,
      subtitle: date ? new Date(date).toLocaleDateString('es-AR') : 'Sin fecha',
      media,
    }),
  },
})
