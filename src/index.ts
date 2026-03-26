/**
 * Next.js deployment adapter for Bun with SQLite-based ISR caching.
 *
 * Based on the official reference adapter:
 * https://github.com/nextjs/adapter-bun (commit 76e3271, 2026-03-25)
 *
 * This package will be deprecated when the official adapter is published to npm.
 *
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/adapterPath
 */

import type { NextAdapter } from 'next'

import {
  ADAPTER_NAME,
  createBunAdapter,
  DEFAULT_BUN_ADAPTER_OUT_DIR,
} from './adapter.ts'
import {
  createSqliteCacheStores,
  SqliteImageCacheStore,
  SqlitePrerenderCacheStore,
} from './runtime/sqlite-cache.ts'

const bunAdapter: NextAdapter = createBunAdapter()

export default bunAdapter

export type { SqliteCacheOptions } from './runtime/sqlite-cache.ts'
export type {
  BunAdapterOptions,
  BunDeploymentManifest,
  BunStaticAsset,
} from './types.ts'
export {
  ADAPTER_NAME,
  bunAdapter,
  createBunAdapter,
  createSqliteCacheStores,
  DEFAULT_BUN_ADAPTER_OUT_DIR,
  SqliteImageCacheStore,
  SqlitePrerenderCacheStore,
}
