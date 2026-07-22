import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
// Shared single source of truth — ./schemaTypes re-exports the schemas
// defined at the Astro root (../src/sanity/schemaTypes).
import { schemaTypes } from './schemaTypes'

// Document types rendered as singletons in the structure (single editor, no create list).
const singletonTypes = new Set(['siteSettings', 'about'])

export default defineConfig({
  name: 'default',
  title: 'Portfolio Jesica Mariana',

  projectId: 'f24czf8c',
  dataset: 'production',

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Contenido')
          .items([
            S.listItem()
              .title('Ajustes del sitio')
              .id('siteSettings')
              .child(
                S.document().schemaType('siteSettings').documentId('siteSettings')
              ),
            S.listItem()
              .title('Sobre')
              .id('about')
              .child(S.document().schemaType('about').documentId('about')),
            S.divider(),
            S.documentTypeListItem('category').title('Categorías'),
          ]),
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
    // Prevent creating multiple documents for singleton types.
    templates: (templates) =>
      templates.filter(({ schemaType }) => !singletonTypes.has(schemaType)),
  },

  document: {
    // Hide "duplicate" and "delete" actions for singleton documents.
    actions: (input, context) =>
      singletonTypes.has(context.schemaType)
        ? input.filter(
            ({ action }) =>
              action && ['publish', 'discardChanges', 'restore'].includes(action)
          )
        : input,
  },
})
