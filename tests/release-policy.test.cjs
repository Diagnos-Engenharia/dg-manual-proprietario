const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { stages, isolatedConfig, materialFingerprint, validateAttestation } = require('../scripts/release-policy.cjs')
const env = { DG_TEST_DATABASE_URL: 'postgres://test:test@localhost:55439/dg_review_utf8', DG_PREVIEW_FILES_DIR: path.join(os.tmpdir(), 'dg-review-files') }
const passed = () => ({ schemaVersion: 1, status: 'passed', fingerprint: 'abc', stages: stages.map(name => ({ name, status: 'passed' })), matrices: ['internal', 'clients'].map(suite => ({ suite, results: ['mobile', 'tablet', 'desktop'].map(viewport => ({ viewport, passed: ['login', 'read', 'navigation', 'dialog', 'containment'] })) })) })

test('release fixture bootstrap rejects hosted or shared databases and remote browser URLs', () => {
  assert.equal(isolatedConfig(env).origin, 'http://localhost:3000')
  for (const extra of [{ VERCEL: '1' }, { VERCEL_ENV: 'preview' }, { DG_TEST_DATABASE_URL: 'postgres://test:test@remote.example/dg_review' }, { DG_TEST_DATABASE_URL: 'postgres://test:test@localhost/app' }, { TEST_BASE_URL: 'https://example.com' }, { DG_PREVIEW_FILES_DIR: 'relative' }]) assert.throws(() => isolatedConfig({ ...env, ...extra }))
})
test('release evidence fails closed when stale, failed, incomplete or missing a responsive viewport', () => {
  assert.equal(validateAttestation(passed(), 'abc'), true)
  assert.throws(() => validateAttestation(passed(), 'different'), /stale/)
  const failed = passed(); failed.status = 'failed'; assert.throws(() => validateAttestation(failed, 'abc'))
  const incomplete = passed(); incomplete.stages = incomplete.stages.filter(stage => stage.name !== 'audit-runtime'); assert.throws(() => validateAttestation(incomplete, 'abc'), /audit-runtime/)
  const missing = passed(); missing.matrices[0].results.pop(); assert.throws(() => validateAttestation(missing, 'abc'), /desktop/)
})
test('material fingerprint covers new source/test/config files and excludes documentation/attestation churn', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-release-policy-'))
  try {
    fs.mkdirSync(path.join(root, 'app')); fs.mkdirSync(path.join(root, 'tests')); fs.mkdirSync(path.join(root, 'scripts')); fs.mkdirSync(path.join(root, '.qa'))
    fs.writeFileSync(path.join(root, 'app', 'page.tsx'), 'source\r\nline\r\n'); fs.writeFileSync(path.join(root, 'scripts', 'migration-policy.d.mts'), 'declare const migration: string\r\n'); fs.writeFileSync(path.join(root, 'package.json'), '{}')
    const before = materialFingerprint(root)
    fs.writeFileSync(path.join(root, 'app', 'page.tsx'), 'source\nline\n'); assert.equal(materialFingerprint(root), before, 'Windows CRLF and Linux LF must attest the same material sources')
    fs.writeFileSync(path.join(root, 'scripts', 'migration-policy.d.mts'), 'declare const migration: string\n'); assert.equal(materialFingerprint(root), before, 'TypeScript .mts declaration files must normalize Windows CRLF and Linux LF')
    fs.writeFileSync(path.join(root, 'README.md'), 'doc'); fs.writeFileSync(path.join(root, '.qa', 'release-attestation.json'), '{}')
    fs.writeFileSync(path.join(root, 'scripts', 'RELEASE.md'), 'operational documentation')
    assert.equal(materialFingerprint(root), before)
    fs.writeFileSync(path.join(root, 'tests', 'future.test.ts'), 'new regression')
    assert.notEqual(materialFingerprint(root), before)
    const tests = materialFingerprint(root); fs.writeFileSync(path.join(root, 'package.json'), '{"changed":true}')
    assert.notEqual(materialFingerprint(root), tests)
  } finally {
    const target = fs.realpathSync(root)
    assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('dg-release-policy-'))
    fs.rmSync(target, { recursive: true, force: true })
  }
})
