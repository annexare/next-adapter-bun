#!/usr/bin/env bun
/**
 * Post-build CLI for next-adapter-bun.
 *
 * Run after `next build` to copy the standalone output into bun-dist/:
 *   next build && next-adapter-bun package
 *
 * The adapter's `onBuildComplete` hook fires before Next.js generates
 * the standalone directory. This CLI bridges that gap by reading the
 * deployment manifest (written during build) and copying the standalone
 * files into the adapter's output directory.
 */
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'

import type { BunDeploymentManifest } from './types.ts'

const DEFAULT_OUT_DIR = 'bun-dist'

async function packageStandalone(cwd: string, outDirArg?: string) {
  const outDirName = outDirArg ?? DEFAULT_OUT_DIR
  const outDir = path.resolve(cwd, outDirName)
  const manifestPath = path.join(outDir, 'deployment-manifest.json')

  if (!existsSync(manifestPath)) {
    console.error(
      `[adapter-bun] deployment-manifest.json not found in ${outDir}.\n` +
        'Did you run `next build` with the adapter configured?',
    )
    process.exit(1)
  }

  const manifest: BunDeploymentManifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  )

  const { projectDir, repoRoot, distDir } = manifest.build
  const absDistDir = path.isAbsolute(distDir)
    ? distDir
    : path.join(projectDir, distDir)
  const standaloneRoot = path.join(absDistDir, 'standalone')

  if (!existsSync(standaloneRoot)) {
    console.error(
      `[adapter-bun] standalone output not found at ${standaloneRoot}.\n` +
        'Ensure next.config has output: "standalone" (the adapter sets this automatically).',
    )
    process.exit(1)
  }

  // In monorepos, standalone mirrors the repo structure:
  //   standalone/apps/leasing/ (app files, .next/, local node_modules)
  //   standalone/node_modules/  (hoisted deps)
  // In single-app repos, everything is at standalone root.
  const appRelPath = path.relative(repoRoot, projectDir)
  const appDir = appRelPath
    ? path.join(standaloneRoot, appRelPath)
    : standaloneRoot

  // Copy app files (.next/, package.json, local node_modules)
  if (existsSync(appDir)) {
    await cp(appDir, outDir, { recursive: true, force: true })
    console.log(`[adapter-bun] copied standalone app files`)
  }

  // In monorepos, merge hoisted node_modules
  if (appRelPath) {
    const hoistedNodeModules = path.join(standaloneRoot, 'node_modules')
    if (existsSync(hoistedNodeModules)) {
      const destNodeModules = path.join(outDir, 'node_modules')
      await mkdir(destNodeModules, { recursive: true })
      await cp(hoistedNodeModules, destNodeModules, {
        recursive: true,
        force: false, // Don't overwrite local (app-level) modules
      })
      console.log(`[adapter-bun] merged hoisted node_modules`)
    }
  }

  // Remove standalone-generated server.js — the adapter writes its own
  const standaloneServerJs = path.join(outDir, 'server.js')
  if (existsSync(standaloneServerJs)) {
    // Only remove if the adapter already wrote one (check for adapter marker)
    const content = await readFile(standaloneServerJs, 'utf8')
    if (!content.includes('next-adapter-bun')) {
      await rm(standaloneServerJs, { force: true })
    }
  }

  // Remove build-time cache (not needed at runtime)
  await rm(path.join(outDir, '.next', 'cache'), {
    recursive: true,
    force: true,
  }).catch(() => {})
  // Standalone only traces the cache handler entry point into
  // .next/adapter-runtime/ but not its sibling imports. Copy all
  // runtime modules from bun-dist/runtime/ into adapter-runtime/.
  const adapterRuntimeDir = path.join(outDir, '.next', 'adapter-runtime')
  const runtimeDir = path.join(outDir, 'runtime')
  if (existsSync(runtimeDir) && existsSync(adapterRuntimeDir)) {
    await cp(runtimeDir, adapterRuntimeDir, { recursive: true, force: true })
    console.log(
      '[adapter-bun] synced runtime modules into .next/adapter-runtime/',
    )
  }

  // Copy preload modules from the project
  const preload = manifest.runtime?.preload
  if (preload?.length) {
    for (const entry of preload) {
      const parts = entry.split('/')
      const pkgName = entry.startsWith('@')
        ? parts.slice(0, 2).join('/')
        : (parts[0] as string)

      let pkgDir: string | null = null
      for (const searchRoot of [projectDir, repoRoot]) {
        const candidate = path.join(searchRoot, 'node_modules', pkgName)
        if (existsSync(candidate)) {
          pkgDir = candidate
          break
        }
      }

      if (!pkgDir) {
        console.warn(`[adapter-bun] preload module not found: ${pkgName}`)
        continue
      }

      const destDir = path.join(outDir, 'node_modules', pkgName)
      await mkdir(path.dirname(destDir), { recursive: true })
      await cp(pkgDir, destDir, { recursive: true, force: true })
      console.log(`[adapter-bun] copied preload module: ${pkgName}`)
    }
  }

  // Report final size
  const { stdout } = Bun.spawnSync(['du', '-sh', outDir])
  const size = stdout.toString().split('\t')[0]
  console.log(`[adapter-bun] package complete: ${outDirName} (${size})`)
}

// CLI entry point
const command = process.argv[2]

if (command === 'package') {
  const outDir = process.argv[3]
  await packageStandalone(process.cwd(), outDir)
} else {
  console.log(`Usage: next-adapter-bun package [outDir]

Commands:
  package [outDir]  Copy standalone output into bun-dist/ (default: bun-dist)
                    Run this after \`next build\` to create a self-contained deployment.`)
  process.exit(command ? 1 : 0)
}
