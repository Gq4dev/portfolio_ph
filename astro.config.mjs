// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sanity from '@sanity/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [
    // Embeds the Sanity Studio (from ./sanity.config.ts) at /admin.
    // React is only needed by the Studio; it stays code-split so public
    // pages never pull the Studio/React bundle.
    //
    // NOTE: @sanity/astro 3.5.0 has a Windows-only bug in its
    // `sanity:module-dedupe` plugin (a package.json path strip that only
    // handles forward slashes), which breaks the embedded Studio's dev-server
    // hydration on Windows. It is fixed via patch-package — see
    // patches/@sanity+astro+3.5.0.patch (applied on `npm install` postinstall).
    sanity({
      projectId: 'f24czf8c',
      dataset: 'production',
      useCdn: false,
      studioBasePath: '/admin',
    }),
    react(),
  ],
});
