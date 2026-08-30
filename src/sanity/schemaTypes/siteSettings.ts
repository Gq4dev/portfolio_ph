import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'siteSettings',
  title: 'Ajustes del sitio',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
    }),
    defineField({
      name: 'tagline',
      title: 'Lema',
      type: 'string',
    }),
    defineField({
      name: 'taglineEn',
      title: 'Lema (English)',
      type: 'string',
    }),
    defineField({
      name: 'shortBio',
      title: 'Biografía breve',
      type: 'text',
    }),
    defineField({
      name: 'shortBioEn',
      title: 'Biografía breve (English)',
      type: 'text',
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
    }),
    defineField({
      name: 'whatsapp',
      title: 'WhatsApp',
      description:
        'Número internacional: código de país + área SIN el 0 + número SIN el 15. Argentina: 549 + área + número — ej. 5491123456789. Sin este dato, los botones de pedido del catálogo caen al email.',
      type: 'string',
      validation: (Rule) =>
        Rule.regex(/^\+?[0-9][0-9\s-]{7,19}$/, {
          name: 'número internacional (ej. 5491123456789)',
        }).warning('Sin código de país el enlace de WhatsApp no abre.'),
    }),
    defineField({
      name: 'instagram',
      title: 'Instagram',
      type: 'string',
    }),
    defineField({
      name: 'featured',
      title: 'Destacadas',
      type: 'array',
      of: [
        defineField({
          name: 'featuredImage',
          title: 'Imagen',
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
      ],
    }),
  ],
})
