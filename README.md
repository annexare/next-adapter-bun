[![Monthly Downloads](https://img.shields.io/npm/dm/next-adapter-bun.svg)](https://www.npmjs.com/package/next-adapter-bun)
[![NPM](https://img.shields.io/npm/v/next-adapter-bun.svg 'NPM package version')](https://www.npmjs.com/package/next-adapter-bun)
[![CI](https://github.com/annexare/next-adapter-bun/actions/workflows/ci.yml/badge.svg)](https://github.com/annexare/next-adapter-bun/actions/workflows/ci.yml)

# next-adapter-bun

Next.js deployment adapter for [Bun](https://bun.sh) with SQLite-based ISR caching.

Produces a self-contained `bun-dist/` directory — similar to Next.js `output: 'standalone'` — with optimal build size and SQLite-based caching. Only `bun-dist/` needs to be copied to your Docker image.

Built on the official [Next.js Adapter API](https://nextjs.org/docs/app/api-reference/config/next-config-js/adapterPath) (stable in Next.js 16.2+). Based on the [reference Bun adapter](https://github.com/nextjs/adapter-bun) by the Next.js team.

> **Note:** This package exists because the official adapter is not yet published to npm. It will be deprecated once the official adapter is available as an npm package.

## Features

- **Self-contained output** — `bun-dist/` includes everything needed to run: `.next/` build output, traced `node_modules/`, server entry, static assets, and SQLite cache
- **Standalone tracing** — leverages Next.js `output: 'standalone'` for reliable dependency tracing, works in both monorepos and single-app repos
- **SQLite-based ISR cache** (`bun:sqlite`) — atomic writes, tag-based invalidation, revalidation locking
- **Image optimization cache** — optimized images stored in SQLite with expiry tracking
- **Two cache modes** — `sqlite` (direct access, lower overhead) or `http` (default, multi-process safe)
- **Preload support** — bundle runtime preload modules (e.g. loggers) into the output
- **Full Next.js coverage** — App Router, Pages Router, ISR, middleware, `next/image`, Server Actions, draft mode

## Install

```bash
bun add next-adapter-bun
```

## Configure

The package provides two ready-to-use presets and a factory for custom configuration.

### SQLite cache mode (recommended)

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

### Custom configuration

For full control, create a custom adapter entry file:

```ts
// bun-adapter.ts
import { createBunAdapter } from 'next-adapter-bun'

export default createBunAdapter({
  cacheHandlerMode: 'sqlite',
  deploymentHost: 'app.example.com',
  preload: ['jsonl-logger/preload'],
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

The build is a two-step process:

```bash
# 1. Build with Next.js (adapter hooks fire during build)
bun --bun next build

# 2. Package standalone output into bun-dist/
next-adapter-bun package

# Run
bun bun-dist/server.js
```

**Why two steps?** The adapter's `onBuildComplete` hook fires before Next.js generates the standalone directory. The `package` CLI bridges this gap by copying the standalone output into `bun-dist/` after the build completes.

You can chain them in your build script:

```json
{
  "scripts": {
    "build": "next build && next-adapter-bun package"
  }
}
```

Or run the CLI in your Dockerfile after the build step.

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
| `preload` | `string[]` | — | Modules to bundle into output `node_modules/` |

## Runtime Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Override listen port |
| `NEXT_HOSTNAME` | Preferred hostname for internal origin |
| `NEXT_PROJECT_DIR` | Override project root (default: parent of `bun-dist/`) |
| `BUN_ADAPTER_CACHE_HTTP_TOKEN` | Override cache endpoint auth token |
| `BUN_ADAPTER_KEEP_ALIVE_TIMEOUT` | Override HTTP keep-alive timeout (ms) |

## Docker

The `bun-dist/` directory is fully self-contained. Copy its contents to your Docker image — no full `node_modules` required.

### Single-app repo

```dockerfile
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile \
    && bun --bun next build \
    && next-adapter-bun package

FROM oven/bun:1.3-alpine
WORKDIR /app
COPY --from=build /app/bun-dist/ ./
ENV NODE_ENV=production PORT=3000 NEXT_PROJECT_DIR=/app
EXPOSE 3000
CMD ["bun", "server.js"]
```

### Monorepo (workspace)

When the app lives in a subdirectory (e.g. `apps/web`):

```dockerfile
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile \
    && bun --bun next build --filter=web \
    && cd apps/web && next-adapter-bun package

FROM oven/bun:1.3-alpine
WORKDIR /app
COPY --from=build /app/apps/web/bun-dist/ ./
ENV NODE_ENV=production PORT=3000 NEXT_PROJECT_DIR=/app
EXPOSE 3000
CMD ["bun", "server.js"]
```

> **Tip:** If your app needs runtime modules not traced by Next.js (e.g. a logger preload), either use the `preload` adapter option or add a separate `COPY` in your Dockerfile.

## How It Works

### Build time

**Step 1 — `next build`** (adapter hooks):

1. `modifyConfig` sets `output: 'standalone'` and injects the SQLite cache handler
2. `onBuildComplete` processes build outputs:
   - Stages static assets to `bun-dist/static/`
   - Seeds prerender cache into `bun-dist/cache.db`
   - Writes deployment manifest, runtime config, and server entry
   - Copies runtime modules (cache handlers) to `bun-dist/runtime/`

**Step 2 — `next-adapter-bun package`** (CLI):

3. Copies `.next/standalone/` into `bun-dist/`:
   - App files (`.next/`, `package.json`, local `node_modules/`)
   - Hoisted `node_modules/` (merged in monorepos)
   - Preload modules (if configured)
4. Cleans up build-time caches and syncs runtime modules

### Runtime

`bun-dist/server.js`:

1. Reads deployment manifest for config (port, hostname, cache mode)
2. Boots Next.js via `createNext()` with runtime config overrides
3. Creates an HTTP server with:
   - Cache-control header normalization for deployed environments
   - Server Actions body buffering (Bun compatibility workaround)
   - Optional internal cache HTTP endpoint (HTTP mode)

### Output structure

```
bun-dist/
├── server.js                  # Server entry point
├── .next/                     # Next.js build output (from standalone)
│   ├── server/                # Server chunks, manifests
│   ├── BUILD_ID
│   └── ...
├── node_modules/              # Traced dependencies (from standalone)
│   ├── next/
│   ├── react/
│   ├── sharp/                 # (if used)
│   └── ...
├── runtime/                   # Adapter cache handlers
├── static/                    # Static assets for direct serving
├── cache.db                   # SQLite prerender cache (seeded)
├── deployment-manifest.json   # Build metadata
└── runtime-next-config.json   # Runtime config overrides
```

## Adapter API

This package implements the [Next.js Adapter API](https://nextjs.org/docs/app/api-reference/config/next-config-js/adapterPath):

- **`modifyConfig`** — sets `output: 'standalone'`, injects cache handler paths
- **`onBuildComplete`** — processes build outputs (routes, prerenders, static assets)

For more details, see the [Deploying to Platforms](https://nextjs.org/docs/app/guides/deploying-to-platforms) guide.

## License

MIT
