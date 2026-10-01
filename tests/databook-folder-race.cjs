const assert = require('node:assert/strict')

/** Runs against the existing isolated API/database fixtures, without remote storage. */
module.exports = async function runDatabookFolderRace({ admin, pool, dev }) {
  const database = new URL(process.env.DATABASE_URL || '')
  if (!['localhost', '127.0.0.1', '::1'].includes(database.hostname)) throw new Error('The folder race test requires the isolated local database.')
  const foldersUrl = '/api/databook/folders'
  const name = 'Pasta concorrente ' + crypto.randomUUID()
  const renamed = name + ' renomeada'
  const created = await admin.post(foldersUrl, { data: { developmentId: dev, action: 'create', name } })
  assert.equal(created.status(), 200, await created.text())
  const folder = (await created.json()).folders.find(item => item.name === name)
  const files = []
  for (const filename of ['primeiro.pdf', 'segundo.pdf']) {
    const bytes = Buffer.from('%PDF-' + filename)
    const preparation = await admin.post('/api/databook/upload', { data: { action: 'prepare', developmentId: dev, folderId: folder.id, name: filename, contentType: 'application/pdf', size: bytes.length } })
    assert.equal(preparation.status(), 200, await preparation.text())
    const prepared = await preparation.json()
    assert.equal(prepared.transport, 'local')
    const sent = await admin.post('/api/databook/upload', { multipart: { ticket: prepared.ticket, file: { name: filename, mimeType: 'application/pdf', buffer: bytes } } })
    assert.equal(sent.status(), 200, await sent.text())
    files.push({ ...(await sent.json()).file, bytes })
  }

  const blocker = await pool.connect()
  let deleting
  try {
    await blocker.query('BEGIN')
    const [development] = (await blocker.query('SELECT data FROM development WHERE id=$1 FOR UPDATE', [dev])).rows
    // The delete reads the original catalog, then waits on this same development lock.
    deleting = admin.post(foldersUrl, { data: { developmentId: dev, action: 'delete', id: folder.id, expectedName: name } })
    const deadline = Date.now() + 10_000
    let waiting = false
    while (Date.now() < deadline) {
      // Observe outside the blocker transaction: pg_stat_activity snapshots are cached
      // inside a transaction, which can keep showing the state before the API waited.
      const result = await pool.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type=$1 AND query ILIKE $2 AND query ILIKE $3 AND pid<>pg_backend_pid()', ['Lock', '%from "development"%', '%for update%'])
      if (result.rows[0].count > 0) { waiting = true; break }
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert.ok(waiting, 'The API delete must be waiting after it captured the original folder name.')
    // Another editor's rename wins the lock and commits both metadata and file membership.
    const updatedFolders = development.data.databookFolders.map(item => item.id === folder.id ? { ...item, name: renamed } : item)
    await blocker.query('UPDATE development SET data=jsonb_set(data,\'{databookFolders}\',$2::jsonb,true) WHERE id=$1', [dev, JSON.stringify(updatedFolders)])
    await blocker.query('UPDATE databook_file SET folder=$3 WHERE "developmentId"=$1 AND folder=$2', [dev, name, renamed])
    await blocker.query('COMMIT')
    const response = await deleting
    assert.equal(response.status(), 409, await response.text())
    assert.match((await response.json()).error, /pasta foi alterada.*restantes foram preservados/i)
    const catalog = await admin.get(foldersUrl + '?' + new URLSearchParams({ developmentId: dev }))
    assert.equal(catalog.status(), 200, await catalog.text())
    const current = await catalog.json()
    assert.equal(current.folders.find(item => item.id === folder.id).name, renamed)
    for (const file of files) {
      const record = current.files.find(item => item.id === file.id)
      assert.ok(record, 'The concurrent rename must preserve every file record.')
      assert.equal(record.folder, renamed)
      const download = await admin.get('/api/databook/file?' + new URLSearchParams({ pathname: file.pathname }))
      assert.equal(download.status(), 200, await download.text())
      assert.deepEqual(await download.body(), file.bytes, 'The private object must remain intact after the rejected deletion.')
    }
    const cleanup = await admin.post(foldersUrl, { data: { developmentId: dev, action: 'delete', id: folder.id, expectedName: renamed } })
    assert.equal(cleanup.status(), 200, await cleanup.text())
  } finally {
    await blocker.query('ROLLBACK').catch(() => {})
    blocker.release()
    if (deleting) await deleting.catch(() => {})
  }
}
