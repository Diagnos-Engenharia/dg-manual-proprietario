const fs = require('node:fs')
const path = require('node:path')
const { isolatedConfig, materialSnapshot, validateAttestation } = require('./release-policy.cjs')
const root = path.resolve(__dirname, '..')
try {
  if (process.env.DG_RELEASE_BOOTSTRAP === 'isolated-local-tests') {
    isolatedConfig(process.env)
    console.log('Local isolated release bootstrap: final API/browser attestation is still required.')
  } else {
    const filename = path.join(root, '.qa', 'release-attestation.json')
    if (!fs.existsSync(filename)) throw new Error('Release attestation is missing. Run pnpm test:release with an isolated local database before building/releasing.')
    const attestation = JSON.parse(fs.readFileSync(filename, 'utf8'))
    const snapshot = materialSnapshot(root, attestation.materialFiles, process.env)
    if (snapshot.excludedPaths.length) console.log('Ignoring Vercel-provided vercel.json absent from the isolated source snapshot.')
    validateAttestation(attestation, snapshot.fingerprint, snapshot.materialFiles)
    console.log('Release attestation matches material sources; API/database/browser and responsive matrices passed locally.')
    console.log('This gate does not certify live Vercel Blob/OpenAI or the protected hosted preview.')
  }
} catch (error) { console.error('Release build blocked:', error.message); process.exitCode = 1 }
