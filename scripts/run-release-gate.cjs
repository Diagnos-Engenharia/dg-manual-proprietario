const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { Pool } = require('pg')
const { assertImplementationBranch, assertPathOutsideRoot, minimalProcessEnv, releaseTestEnv, isolatedConfig, materialFingerprint, materialManifest, validateAttestation } = require('./release-policy.cjs')
const root = path.resolve(__dirname, '..')
const directory = path.resolve(process.env.TEST_ARTIFACT_DIR || path.join(root, '..', 'release-test'))
const report = { schemaVersion: 1, status: 'running', startedAt: new Date().toISOString(), stages: [], matrices: [], limitations: ['OpenAI semantics use mocked responses; no live provider request', 'Private files use the isolated local adapter; live Vercel Blob transport is not certified', 'Chromium viewport/touch emulation; physical devices, Safari and Firefox not certified', 'Protected hosted preview still requires its separate review'] }
let active, timer, started = false, timedOut = false
function stop() {
  if (!active || active.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(active.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', env: minimalProcessEnv(process.env) })
  else { try { process.kill(-active.pid, 'SIGTERM') } catch { active.kill() } }
}
function git(args) { return spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, env: minimalProcessEnv(process.env) }).stdout?.trim() || 'unknown' }
function run(name, args, env) {
  console.log('RELEASE_STAGE:', name)
  const started = Date.now(), logPath = path.join(directory, name + '.log')
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(logPath)
    active = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    active.stdout.pipe(output); active.stderr.pipe(output)
    active.stdout.pipe(process.stdout); active.stderr.pipe(process.stderr)
    active.once('error', reject)
    active.once('close', code => {
      output.end()
      report.stages.push({ name, status: code === 0 && !timedOut ? 'passed' : 'failed', durationMs: Date.now() - started })
      active = undefined
      code === 0 && !timedOut ? resolve() : reject(new Error(name + ' failed (exit ' + code + ')'))
    })
  })
}
;(async () => {
  try {
    assertImplementationBranch(git(['branch', '--show-current']))
    const config = isolatedConfig(process.env)
    assertPathOutsideRoot(directory, root)
    assertPathOutsideRoot(config.files, root)
    fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(config.files, { recursive: true })
    assertPathOutsideRoot(directory, root)
    assertPathOutsideRoot(config.files, root)
    started = true
    report.observedHead = git(['rev-parse', 'HEAD']); report.workingTreeDirty = Boolean(git(['status', '--porcelain']))
    report.materialFiles = materialManifest(root)
    report.fingerprint = materialFingerprint(root)
    const env = releaseTestEnv(process.env, { database: config.database, files: config.files, directory })
    timer = setTimeout(() => { timedOut = true; stop() }, 20 * 60 * 1000)
    await run('security', [path.join(root, 'tests', 'security-static.cjs')], env)
    await run('security-runtime', [path.join(root, 'tests', 'security-runtime.cjs')], env)
    await run('route-audit-regressions', ['--test', path.join(root, 'tests', 'security-route-audit.test.cjs'), path.join(root, 'tests', 'release-policy.test.cjs')], env)
    const domain = fs.readdirSync(path.join(root, 'tests')).filter(name => /^(?:manual-|databook).*\.test\.ts$/.test(name)).sort().map(name => path.join(root, 'tests', name))
    assert.ok(domain.length > 0)
    await run('domain', ['--import', 'tsx', '--test', ...domain], env)
    await run('qa-contract', [path.join(root, 'tests', 'qa-contract.cjs')], env)
    await run('csp', [path.join(root, 'tests', 'databook-csp.cjs')], env)
    await run('migrations', [path.join(root, 'scripts', 'migrate.mjs')], env)
    const pool = new Pool({ connectionString: config.database, connectionTimeoutMillis: 5000, query_timeout: 5000 })
    try {
      assert.equal((await pool.query("SELECT current_setting('server_encoding') AS encoding")).rows[0].encoding, 'UTF8', 'Browser fixture database must use UTF8')
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM platform_integration')).rows[0].count, 0, 'Release fixtures require an isolated database without external AI integrations')
      report.stages.push({ name: 'database-preflight', status: 'passed' })
    } finally { await pool.end() }
    await run('clients-runtime', [path.join(root, 'tests', 'clients-runtime.cjs')], env)
    await run('organization-runtime', [path.join(root, 'tests', 'organization-runtime.cjs')], env)
    await run('audit-runtime', [path.join(root, 'tests', 'audit-runtime.cjs')], env)
    await run('bootstrap-policy', [path.join(root, 'scripts', 'verify-release.cjs')], env)
    await run('build', [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], env)
    await run('browser', [path.join(root, 'scripts', 'run-local-e2e.cjs')], env)
    for (const suite of ['internal', 'clients']) report.matrices.push(JSON.parse(fs.readFileSync(path.join(directory, 'matrix-' + suite + '.json'), 'utf8')))
    assert.equal(materialFingerprint(root), report.fingerprint, 'Sources changed while tests ran; rerun the isolated gate for the final snapshot')
    assert.deepEqual(materialManifest(root), report.materialFiles, 'Material files changed while tests ran; rerun the isolated gate for the final snapshot')
    report.status = 'passed'; report.completedAt = new Date().toISOString()
    validateAttestation(report, report.fingerprint)
    fs.mkdirSync(path.join(root, '.qa'), { recursive: true })
    fs.writeFileSync(path.join(root, '.qa', 'release-attestation.json'), JSON.stringify(report, null, 2) + '\n')
    console.log('ISOLATED_RELEASE_GATE_PASS:', report.fingerprint)
    console.log('The normal build now requires this matching attestation; hosted preview/external integrations remain separate checks.')
  } catch (error) { report.status = 'failed'; report.error = error.message; console.error(error); process.exitCode = 1 }
  finally {
    clearTimeout(timer); stop(); report.completedAt ||= new Date().toISOString()
    if (started && fs.existsSync(directory)) fs.writeFileSync(path.join(directory, 'release-report.json'), JSON.stringify(report, null, 2) + '\n')
    if (started && report.status === 'failed') {
      fs.mkdirSync(path.join(root, '.qa'), { recursive: true })
      fs.writeFileSync(path.join(root, '.qa', 'release-attestation.json'), JSON.stringify(report, null, 2) + '\n')
    }
  }
})()
