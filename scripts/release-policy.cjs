const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const stages = ['security', 'security-runtime', 'route-audit-regressions', 'domain', 'qa-contract', 'csp', 'migrations', 'database-preflight', 'clients-runtime', 'organization-runtime', 'audit-runtime', 'bootstrap-policy', 'build', 'browser']
const local = value => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)
function isolatedConfig(env) {
  assert.ok(!env.VERCEL && !env.VERCEL_ENV, 'Release fixtures cannot run in a hosted environment')
  const database = env.DG_TEST_DATABASE_URL
  assert.ok(database && local(database), 'DG_TEST_DATABASE_URL must identify an isolated local PostgreSQL database')
  assert.match(new URL(database).pathname, /(?:test|review|qa|e2e)/i, 'Use a database explicitly named for tests/review')
  assert.ok(env.DG_PREVIEW_FILES_DIR && path.isAbsolute(env.DG_PREVIEW_FILES_DIR), 'Use an explicit absolute directory for isolated private files')
  if (env.TEST_BASE_URL) assert.ok(local(env.TEST_BASE_URL), 'Browser tests must target the local temporary application')
  return { database, origin: 'http://localhost:3000', files: path.resolve(env.DG_PREVIEW_FILES_DIR) }
}

function materialFingerprint(root) {
  const files = [], hash = createHash('sha256')
  function walk(directory) {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      assert.ok(!entry.isSymbolicLink(), 'Material source symlinks require explicit release fingerprint review: ' + filename)
      if (entry.isDirectory()) walk(filename)
      else if (entry.isFile() && (!entry.name.endsWith('.md') || path.relative(root, filename).split(path.sep)[0] === 'public')) files.push(filename)
    }
  }
  for (const directory of ['app', 'components', 'lib', 'migrations', 'scripts', 'tests', 'public']) walk(path.join(root, directory))
  for (const name of fs.readdirSync(root)) if ((/\.(?:[cm]?[jt]s|json|ya?ml)$/.test(name) || ['.npmrc', '.browserslistrc'].includes(name)) && name !== 'next-env.d.ts' && fs.statSync(path.join(root, name)).isFile()) files.push(path.join(root, name))
  const entries = files.map(filename => ({ filename, relative: path.relative(root, filename).split(path.sep).join('/') })).sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0)
  for (const { filename, relative } of entries) {
    hash.update(relative); hash.update('\0')
    const bytes = fs.readFileSync(filename)
    hash.update(/\.(?:tsx?|jsx?|mjs|cjs|json|ya?ml|css|html|svg|txt|sql|xml|md)$/.test(filename) || path.basename(filename).startsWith('.') ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes)
    hash.update('\0')
  }
  return hash.digest('hex')
}

function validateAttestation(attestation, fingerprint) {
  assert.equal(attestation.schemaVersion, 1, 'Unsupported release attestation')
  assert.equal(attestation.status, 'passed', 'The isolated release gate did not pass')
  assert.equal(attestation.fingerprint, fingerprint, 'Release tests are stale: material sources changed after the isolated gate')
  for (const name of stages) assert.ok(attestation.stages?.some(stage => stage.name === name && stage.status === 'passed'), 'Missing passed release stage: ' + name)
  for (const suite of ['internal', 'clients']) {
    const matrix = attestation.matrices?.find(item => item.suite === suite)
    assert.ok(matrix, 'Missing executed responsive matrix: ' + suite)
    for (const viewport of ['mobile', 'tablet', 'desktop']) assert.ok(matrix.results?.some(result => result.viewport === viewport && result.passed?.length >= 5), 'Missing executed ' + suite + '/' + viewport + ' interactions')
  }
  return true
}
module.exports = { stages, isolatedConfig, materialFingerprint, validateAttestation }
