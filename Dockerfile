# syntax=docker/dockerfile:1

# --- Build stage: run Astro's static build with Sanity content ---
FROM node:22-slim AS build
WORKDIR /app

# Sanity public config is inlined by Astro at build time (PUBLIC_* vars).
# These are public values, not secrets.
ARG PUBLIC_SANITY_PROJECT_ID
ARG PUBLIC_SANITY_DATASET
ARG PUBLIC_WEB3FORMS_KEY
ENV PUBLIC_SANITY_PROJECT_ID=$PUBLIC_SANITY_PROJECT_ID
ENV PUBLIC_SANITY_DATASET=$PUBLIC_SANITY_DATASET
ENV PUBLIC_WEB3FORMS_KEY=$PUBLIC_WEB3FORMS_KEY

# Install deps first for better layer caching. patches/ must be present
# before `npm ci` because the postinstall hook runs patch-package.
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci

# Build the static site (this also emits the embedded /admin Studio bundle).
# CACHEBUST forces `npm run build` to re-run on every CI build so it always
# picks up fresh Sanity content. Docker caches this layer by file contents,
# but the CMS data lives remotely and changes without any file changing —
# so without this, a rebuild would silently reuse stale content. Deps above
# (npm ci) stay cached; only the Astro build re-executes.
COPY . .
ARG CACHEBUST=unset
RUN npm run build

# --- Serve stage: tiny Nginx serving the static output ---
FROM nginx:1.27-alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
