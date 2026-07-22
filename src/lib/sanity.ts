import { createClient } from '@sanity/client'

export const sanityClient = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID,
  dataset: import.meta.env.PUBLIC_SANITY_DATASET,
  apiVersion: '2025-01-01',
  // false: this client runs at BUILD time (SSG). Builds are triggered by a
  // Sanity webhook seconds after publishing, when the CDN may still serve
  // stale content. Reading direct (no CDN) guarantees the build always bakes
  // the freshest data.
  useCdn: false,
})
