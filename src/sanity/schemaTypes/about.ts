import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'about',
  title: 'Sobre',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
    }),
    defineField({
      name: 'titleEn',
      title: 'Título (English)',
      type: 'string',
    }),
    defineField({
      name: 'portrait',
      title: 'Retrato',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          title: 'Texto alternativo',
          type: 'string',
          validation: (Rule) => Rule.required(),
        }),
      ],
    }),
    defineField({
      name: 'bio',
      title: 'Biografía',
      type: 'array',
      of: [{ type: 'block' }],
    }),
    defineField({
      name: 'bioEn',
      title: 'Biografía (English)',
      type: 'array',
      of: [{ type: 'block' }],
    }),
  ],
})
