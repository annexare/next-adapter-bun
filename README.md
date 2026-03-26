# next-adapter-bun

Next.js deployment adapter for [Bun](https://bun.sh) with SQLite-based ISR caching.

Built on the official [Next.js Adapter API](https://nextjs.org/docs/app/api-reference/config/next-config-js/adapterPath) (stable in Next.js 16.2+). Based on the [reference Bun adapter](https://github.com/nextjs/adapter-bun) by the Next.js team.

> **Note:** This package exists because the official adapter is not yet published to npm. It will be deprecated once the official adapter is available as an npm package.

## Features

- **SQLite-based ISR cache** (`bun:sqlite`) — atomic writes, tag-based invalidation, revalidation locking. Replaces the default filesystem cache.
- **Image optimization cache** — optimized images stored in SQLite with proper expiry tracking.
- **Native Bun APIs** — uses `Bun.Transpiler`, `Bun.file()`, `Bun.write()`, `bun:sqlite` where possible.
- **Two cache modes** — `sqlite` (direct, single-instance) or `http` (internal endpoint, multi-process safe).
- **Standalone-compatible** — generates `bun-dist/` output alongside `.next/` build artifacts.
- **Full Next.js feature coverage** — App Router, Pages Router, ISR, middleware, `next/image`, Server Actions, draft mode.

## Install

```bash
bun add next-adapter-bun
```

## Configure

```ts
// next.config.ts
import { createRequire } from 'node:module'
import type { NextConfig } from 'next'

const require = createRequire(import.meta.url)

const nextConfig: NextConfig = {
  adapterPath: require.resolve('next-adapter-bun'),
}

export default nextConfig
```

### With options

Create a custom adapter entry:

```ts
// bun-adapter.ts
import { createBunAdapter } from 'next-adapter-bun'

export default createBunAdapter({
  port: 3000,
  hostname: '0.0.0.0',
  cacheHandlerMode: 'sqlite',
})
```

Then point `adapterPath` at it:

```ts
// next.config.ts
import { createRequire } from 'node:module'
import type { NextConfig } from 'next'

const require = createRequire(import.meta.url)

const nextConfig: NextConfig = {
  adapterPath: require.resolve('./bun-adapter'),
}

export default nextConfig
```

## Build & Run

```bash
bun --bun next build
bun bun-dist/server.js
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outDir` | `string` | `'bun-dist'` | Output directory for adapter build |
| `port` | `number` | `3000` | Default listen port |
| `hostname` | `string` | `'0.0.0.0'` | Default listen hostname |
| `deploymentHost` | `string` | — | Canonical host for Server Actions CSRF |
| `cacheHandlerMode` | `'sqlite' \| 'http'` | `'http'` | Cache transport mode |
| `cacheEndpointPath` | `string` | `'/_adapter/cache'` | Internal cache endpoint (HTTP mode) |
| `cacheAuthToken` | `string` | — | Cache endpoint auth token (HTTP mode) |

### Cache modes

- **`http`** (default) — cache handlers communicate via an internal HTTP endpoint. Works across process boundaries. Best for multi-worker setups.
- **`sqlite`** — direct SQLite access. Lower overhead for single-instance deployments (Docker containers, single-process servers).

## Runtime Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Override listen port |
| `NEXT_HOSTNAME` | Preferred hostname for internal origin |
| `NEXT_PROJECT_DIR` | Override project root (default: parent of `bun-dist/`) |
| `BUN_ADAPTER_CACHE_HTTP_TOKEN` | Override cache endpoint auth token |
| `BUN_ADAPTER_KEEP_ALIVE_TIMEOUT` | Override HTTP keep-alive timeout (ms) |

## Docker

The adapter generates `bun-dist/` which is **not fully self-contained** — it needs the `.next/` build output at runtime:

```dockerfile
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun --bun next build

FROM oven/bun:1.3-alpine
WORKDIR /app
COPY --from=build /app/bun-dist ./bun-dist
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
ENV NODE_ENV=production PORT=3000 NEXT_PROJECT_DIR=/app
EXPOSE 3000
CMD ["bun", "bun-dist/server.js"]
```

## How It Works

At build time (`next build`), the adapter:

1. Hooks into `modifyConfig` to set up cache handler paths
2. On `onBuildComplete`, processes all build outputs:
   - Transpiles runtime modules to `bun-dist/runtime/`
   - Stages static assets to `bun-dist/static/`
   - Seeds prerender cache into `bun-dist/cache.db`
   - Writes deployment manifest to `bun-dist/deployment-manifest.json`
   - Generates server entry at `bun-dist/server.js`

At runtime, `bun-dist/server.js`:

1. Boots Next.js via `createNext()` from the project directory
2. Creates an HTTP server with cache-control normalization
3. Handles Server Actions body buffering (Bun timing workaround)
4. Optionally serves an internal cache HTTP endpoint

## Adapter API

This package implements the [Next.js Adapter API](https://nextjs.org/docs/app/api-reference/config/next-config-js/adapterPath), which provides:

- **`modifyConfig`** — modify Next.js config at build time
- **`onBuildComplete`** — process build outputs (routes, prerenders, static assets)

For more details, see the [Deploying to Platforms](https://nextjs.org/docs/app/guides/deploying-to-platforms) guide.

## License

MIT
