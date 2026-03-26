/**
 * Transpile all .ts source files to .js individually (no bundling).
 * Runtime modules must remain as separate files — the adapter copies
 * them into the project's bun-dist/ at Next.js build time.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const transpiler = new Bun.Transpiler({ loader: 'ts' })
const glob = new Bun.Glob('**/*.ts')
const srcDir = 'src'
const outDir = 'dist'

for await (const file of glob.scan(srcDir)) {
  const source = await Bun.file(path.join(srcDir, file)).text()
  let js = transpiler.transformSync(source)
  js = js.replace(/from ['"](\.[^'"]*?)\.ts['"]/g, "from '$1.js'")

  const outPath = path.join(outDir, file.replace(/\.ts$/, '.js'))
  await mkdir(path.dirname(outPath), { recursive: true })
  await Bun.write(outPath, js)
}

console.log('Transpiled src/ → dist/')
