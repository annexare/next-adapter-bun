# next-adapter-bun

Next.js deployment adapter for [Bun](https://bun.sh) with SQLite-based ISR caching.

Built on the official [Next.js Adapter API](https://nextjs.org/docs/app/api-reference/config/next-config-js/adapterPath) (stable in Next.js 16.2+). Based on the [reference Bun adapter](https://github.com/nextjs/adapter-bun) by the Next.js team.

> **Note:** This package exists because the official adapter is not yet published to npm. It will be deprecated once the official adapter is available as an npm package.

## Features

- **Standalone-like output** — produces a self-contained `bun-dist/` with only the traced dependencies needed to run, similar to Next.js `output: 'standalone'` but optimized for Bun
- **SQLite-based ISR cache** (`bun:sqlite`) — atomic writes, tag-based invalidation, revalidation locking
- **Image optimization cache** — optimized images stored in SQLite with expiry tracking
- **Two cache modes** — `http` (default, multi-process safe) or `sqlite` (direct access, lower overhead)
- **Full Next.js feature coverage** — App Router, Pages Router, ISR, middleware, `next/image`, Server Actions, draft mode

## Install

```bash
bun add next-adapter-bun
```

## Configure

The package provides two ready-to-use presets and a factory for custom configuration.

### Default (HTTP cache mode)

Uses an internal HTTP endpoint for cache operations. Best for multi-worker or multi-process setups.

```ts
// next.config.ts
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  adapterPath: fileURLToPath(import.meta.resolve('next-adapter-bun')),
}

export default nextConfig
```

### SQLite cache mode

Direct SQLite access with lower overhead. Best for single-instance deployments (Docker containers, single-process servers).

```ts
// next.config.ts
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  adapterPath: fileURLToPath(import.meta.resolve('next-adapter-bun/sqlite')),
}

export default nextConfig
```

### Custom configuration

For full control, create a custom adapter entry file:

```ts
// bun-adapter.ts
import { createBunAdapter } from 'next-adapter-bun'

export default createBunAdapter({
  cacheHandlerMode: 'sqlite',
  deploymentHost: 'app.example.com',
})
```

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  adapterPath: new URL('./bun-adapter.ts', import.meta.url).pathname,
}

export default nextConfig
```

## Build & Run

```bash
bun --bun next build
bun bun-dist/server.js
```

## Options

Options for `createBunAdapter()`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outDir` | `string` | `'bun-dist'` | Output directory for adapter build |
| `port` | `number` | `3000` | Default listen port (overridden by `PORT` env) |
| `hostname` | `string` | `'0.0.0.0'` | Default listen hostname |
| `deploymentHost` | `string` | — | Canonical host for Server Actions CSRF |
| `cacheHandlerMode` | `'sqlite' \| 'http'` | `'http'` | Cache transport mode |
| `cacheEndpointPath` | `string` | `'/_adapter/cache'` | Internal cache endpoint (HTTP mode) |
| `cacheAuthToken` | `string` | — | Cache endpoint auth token (HTTP mode) |
| `skipTracedAssets` | `boolean` | `false` | Skip copying traced node_modules into output |

## Runtime Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Override listen port |
| `NEXT_HOSTNAME` | Preferred hostname for internal origin |
| `NEXT_PROJECT_DIR` | Override project root (default: parent of `bun-dist/`) |
| `BUN_ADAPTER_CACHE_HTTP_TOKEN` | Override cache endpoint auth token |
| `BUN_ADAPTER_KEEP_ALIVE_TIMEOUT` | Override HTTP keep-alive timeout (ms) |

## Docker

Like Next.js `output: 'standalone'`, the adapter traces your app's dependencies at build time and copies only what's needed into `bun-dist/`. This keeps Docker images small — no full `node_modules` required.

The `bun-dist/` directory contains the server entry, traced node_modules, runtime modules, static assets, and prerender cache. You only need to copy `bun-dist/` and `.next/` into the release image.

### Single-app repo

```dockerfile
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun --bun next build

FROM oven/bun:1.3-alpine
WORKDIR /app
COPY --from=build /app/bun-dist ./bun-dist
COPY --from=build /app/.next ./.next
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["bun", "bun-dist/server.js"]
```

### Monorepo (workspace)

When the app lives in a subdirectory (e.g. `apps/web`), set `NEXT_PROJECT_DIR` so the server can find `.next/`:

```dockerfile
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun --bun next build --filter=web

FROM oven/bun:1.3-alpine
WORKDIR /app
COPY --from=build /app/apps/web/bun-dist ./apps/web/bun-dist
COPY --from=build /app/apps/web/.next ./apps/web/.next
ENV NODE_ENV=production PORT=3000 NEXT_PROJECT_DIR=/app/apps/web
EXPOSE 3000
CMD ["bun", "apps/web/bun-dist/server.js"]
```

> In a single-app repo, `NEXT_PROJECT_DIR` defaults to the parent of `bun-dist/` and doesn't need to be set.

## How It Works

At build time (`next build`), the adapter:

1. Hooks into `modifyConfig` to set up cache handler paths
2. On `onBuildComplete`, processes all build outputs:
   - Copies traced dependencies (node_modules, server manifests) to `bun-dist/`
   - Writes runtime modules to `bun-dist/runtime/`
   - Stages static assets to `bun-dist/static/`
   - Seeds prerender cache into `bun-dist/cache.db`
   - Writes deployment manifest and runtime config
   - Generates server entry at `bun-dist/server.js`

At runtime, `bun-dist/server.js`:

1. Boots Next.js via `createNext()` from the project directory
2. Creates an HTTP server with cache-control normalization
3. Handles Server Actions body buffering (Bun timing workaround)
4. Optionally serves an internal cache HTTP endpoint

## Adapter API

This package implements the [Next.js Adapter API](https://nextjs.org/docs/app/api-reference/config/next-config-js/adapterPath):

- **`modifyConfig`** — modify Next.js config at build time
- **`onBuildComplete`** — process build outputs (routes, prerenders, static assets)

For more details, see the [Deploying to Platforms](https://nextjs.org/docs/app/guides/deploying-to-platforms) guide.

## License

MIT
