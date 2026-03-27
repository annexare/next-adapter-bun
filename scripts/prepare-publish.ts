/**
 * Assembles a publishable dist/ directory with package.json, LICENSE, README.
 * Run after `bun run build` to prepare for `npm publish dist/`.
 */
const pkg = await Bun.file('package.json').json()

const publishPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  author: pkg.author,
  license: pkg.license,
  type: pkg.type,
  bin: {
    'next-adapter-bun': './cli.js',
  },
  exports: {
    '.': {
      types: './index.d.ts',
      import: './index.js',
      default: './index.js',
    },
    './sqlite': {
      types: './sqlite.d.ts',
      import: './sqlite.js',
      default: './sqlite.js',
    },
  },
  peerDependencies: pkg.peerDependencies,
  dependencies: pkg.dependencies,
  keywords: pkg.keywords,
  repository: pkg.repository,
  engines: pkg.engines,
}

await Bun.write('dist/package.json', `${JSON.stringify(publishPkg, null, 2)}\n`)
await Bun.write('dist/LICENSE', Bun.file('LICENSE'))
await Bun.write('dist/README.md', Bun.file('README.md'))

console.log(`Prepared dist/ for publishing ${pkg.name}@${pkg.version}`)

export {}
