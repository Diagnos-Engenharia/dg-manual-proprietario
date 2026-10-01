const assert = require('node:assert/strict')
const { createHash, randomUUID } = require('node:crypto')

/** Reuses actual issued fixture PDFs to verify the existing v1 contract over HTTP. */
module.exports = async function runPublicManualContractTests({ admin, pool, dev }) {
  const versionRows = (await pool.query('SELECT id,"manualType" FROM manual_version WHERE "developmentId"=$1 ORDER BY "createdAt" DESC', [dev])).rows
  const manual = versionRows.find(row => ['proprietario', 'sindico'].includes(row.manualType))
  const finishing = versionRows.find(row => row.manualType === 'acabamentos')
  assert.ok(manual && finishing, 'The contract test requires both a real manual and a unit PDF')
  const token = 'dg_live_' + randomUUID()
  const keyId = randomUUID()
  await pool.query('INSERT INTO organization_api_key(id,"organizationId",name,"keyPrefix","keyHash",scopes,"createdBy") SELECT $1,"organizationId",$2,$3,$4,$5::jsonb,"userId" FROM development WHERE id=$6', [keyId, 'Isolated v1 contract test', token.slice(0, 16), createHash('sha256').update(token).digest('hex'), JSON.stringify(['manuals:read']), dev])
  const headers = { Authorization: 'Bearer ' + token }
  try {
    const list = await admin.get('/api/v1/manuals?' + new URLSearchParams({ development_id: dev, limit: '100' }), { headers })
    assert.equal(list.status(), 200, await list.text())
    const data = (await list.json()).data
    assert.ok(data.some(row => row.id === manual.id), 'Existing manuals must remain listed')
    assert.ok(data.every(row => ['proprietario', 'sindico'].includes(row.manual_type)), 'Every v1 result must use the supported manual type enum')
    assert.ok(!data.some(row => row.id === finishing.id), 'Unit PDFs must not silently enter the v1 manual catalog')
    const unsupported = await admin.get('/api/v1/manuals?manual_type=acabamentos', { headers })
    assert.equal(unsupported.status(), 400)
    assert.equal((await unsupported.json()).error.code, 'invalid_manual_type')
    const detail = await admin.get('/api/v1/manuals/' + manual.id, { headers })
    assert.equal(detail.status(), 200, await detail.text())
    assert.equal((await detail.json()).data.id, manual.id)
    const file = await admin.get('/api/v1/manuals/' + manual.id + '/file', { headers })
    assert.equal(file.status(), 200, await file.text())
    assert.equal((await file.body()).subarray(0, 5).toString(), '%PDF-', 'The existing API must still deliver the actual manual PDF')
    for (const suffix of ['', '/file']) {
      const response = await admin.get('/api/v1/manuals/' + finishing.id + suffix, { headers })
      assert.equal(response.status(), 404, await response.text())
      assert.equal((await response.json()).error.code, 'not_found')
    }
    console.log('PUBLIC_MANUAL_V1_CONTRACT_PASS: supported catalog/detail/download retained, unit documents excluded')
  } finally { await pool.query('DELETE FROM organization_api_key WHERE id=$1', [keyId]) }
}
