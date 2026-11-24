// Writes latest-mac.yml, the feed Junior.app's updater (src/updater.ts) reads
// off the newest GitHub release: one entry per zip, with its sha512 and size.
// electron-updater picks the arm64 zip on Apple silicon and the other on Intel.
//
//   node scripts/update-feed.mjs <version> <zip>... [--out latest-mac.yml]
import { createHash } from 'node:crypto'
import { createReadStream, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const outAt = argv.indexOf('--out')
const out = outAt >= 0 ? argv.splice(outAt, 2)[1] : 'latest-mac.yml'
const [version, ...zips] = argv
if (!version || !zips.length) {
  console.error('usage: update-feed.mjs <version> <zip>... [--out latest-mac.yml]')
  process.exit(1)
}

const sha512 = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    createReadStream(file)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('base64')))
      .on('error', reject)
  })

const files = []
for (const zip of zips) {
  const name = path.basename(zip)
  if (!name.includes(version)) throw new Error(`${name} is not a ${version} zip`)
  files.push({ url: name, sha512: await sha512(zip), size: statSync(zip).size })
}
// The top-level path/sha512 are the legacy single-file fields: the arm64 zip.
const main = files.find((f) => f.url.includes('arm64')) ?? files[0]

const yml = [
  `version: ${version}`,
  'files:',
  ...files.flatMap((f) => [`  - url: ${f.url}`, `    sha512: ${f.sha512}`, `    size: ${f.size}`]),
  `path: ${main.url}`,
  `sha512: ${main.sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n')
writeFileSync(out, yml)
console.log(`${out}: ${files.map((f) => f.url).join(', ')}`)
