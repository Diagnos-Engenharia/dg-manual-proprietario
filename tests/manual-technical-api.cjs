const assert = require('node:assert/strict')

/** Called by the isolated composer E2E after publication and before UI checks. */
async function runTechnicalApiTests({ admin, reviewer, editor, anonymous, outsider, pool, dev, preview }) {
  const connectionString = pool.options.connectionString || process.env.DATABASE_URL
  assert.ok(connectionString && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname), 'Technical fixtures require an isolated local database')
  const endpoint = '/api/manuals/technical'
  const query = manual => endpoint + '?' + new URLSearchParams({ developmentId: dev, manualType: manual })
  async function catalog(manual = 'proprietario', context = admin) {
    const response = await context.get(query(manual))
    assert.equal(response.status(), 200, await response.text())
    const result = await response.json()
    assert.ok(Array.isArray(result.systems))
    return result
  }
  const getSystem = (result, key) => {
    const system = result.systems.find(system => system.key === key)
    assert.ok(system, 'Expected eligible system ' + key)
    return system
  }
  async function post(context, system, section, action, values = {}, status = 200, manual = 'proprietario') {
    const expectedFingerprint = section === 'sistemas' ? system.descriptionFingerprint : system.maintenanceFingerprint
    const response = await context.post(endpoint, { data: { developmentId: dev, manualType: manual, contextKey: system.key, section, action, expectedFingerprint, ...values } })
    const result = await response.json()
    assert.equal(response.status(), status, JSON.stringify(result))
    if (status === 200) {
      assert.equal(result.system.key, system.key)
      return result.system
    }
    assert.ok(typeof result.error === 'string' && result.error.trim())
    return result
  }
  const before = (await pool.query('SELECT data FROM development WHERE id=$1', [dev])).rows[0].data
  const validations = (await pool.query('SELECT * FROM development_content_validation WHERE "developmentId"=$1 AND section IN ($2,$3)', [dev, 'sistemas', 'manutencao'])).rows
  const beforeUnit = await catalog()
  const beforeCommon = await catalog('sindico')
  const stored = async () => (await pool.query('SELECT data FROM development WHERE id=$1', [dev])).rows[0].data
  try {
    assert.equal((await anonymous.get(query('proprietario'))).status(), 401)
    assert.equal((await outsider.get(query('proprietario'))).status(), 404)
    assert.equal((await outsider.post(endpoint, { data: { developmentId: dev, manualType: 'proprietario', contextKey: 'approved::unidade', section: 'sistemas', action: 'save', expectedFingerprint: getSystem(beforeUnit, 'approved::unidade').descriptionFingerprint, html: '<p>OTHER_TENANT</p>' } })).status(), 404)
    assert.deepEqual(beforeUnit.systems.map(system => system.key), ['approved::unidade', 'draft::unidade', 'waiting::unidade', 'rejected::unidade', 'shared::unidade'])
    assert.deepEqual(beforeCommon.systems.map(system => system.key), ['shared::comum', 'common::comum'])
    assert.ok(beforeUnit.canEdit && beforeUnit.canValidate)
    const editorCatalog = await catalog('proprietario', editor)
    assert.ok(editorCatalog.canEdit)
    assert.equal(editorCatalog.canValidate, false)
    for (const system of [...beforeUnit.systems, ...beforeCommon.systems]) {
      assert.match(system.descriptionFingerprint, /^[a-f0-9]{64}$/)
      assert.match(system.maintenanceFingerprint, /^[a-f0-9]{64}$/)
    }
    await post(anonymous, getSystem(beforeUnit, 'approved::unidade'), 'sistemas', 'save', { html: '<p>ANONYMOUS</p>' }, 401)
    await post(editor, getSystem(beforeUnit, 'approved::unidade'), 'sistemas', 'save', { html: '<p>WRONG_SCOPE</p>' }, 400, 'sindico')
    await post(editor, { ...getSystem(beforeUnit, 'approved::unidade'), key: 'not-selected::unidade' }, 'sistemas', 'save', { html: '<p>NOT_SELECTED</p>' }, 400)
    await post(editor, getSystem(beforeUnit, 'approved::unidade'), 'sistemas', 'save', { html: '<p>MISSING_REVISION</p>', expectedFingerprint: undefined }, 400)

    // Send raw payloads directly, bypassing all client-side editor sanitization.
    for (const html of ['<p onpointerenter="alert(1)">UNSAFE</p>', '<a href="jav&#x61;script:alert(1)">UNSAFE</a>', '<iframe srcdoc="UNSAFE"></iframe>']) {
      await post(editor, getSystem(beforeUnit, 'approved::unidade'), 'sistemas', 'save', { html }, 400)
      const editorialResponse = await editor.post('/api/manuals/editorial', { data: { developmentId: dev, manualType: 'proprietario', action: 'save', sectionId: 'apresentacao', html } })
      assert.equal(editorialResponse.status(), 400, await editorialResponse.text())
    }
    assert.deepEqual(await stored(), before, 'rejected HTML cannot alter technical or editorial data')
    assert.deepEqual((await catalog()).systems, beforeUnit.systems, 'rejected content preserves approval and fingerprints')

    // Saving an unchanged approved source does not alter either approval or token.
    const approved = getSystem(beforeUnit, 'approved::unidade')
    assert.equal(approved.descriptionStatus, 'aprovado')
    const noOp = await post(editor, approved, 'sistemas', 'save', { html: approved.html })
    assert.equal(noOp.descriptionStatus, 'aprovado')
    assert.equal(noOp.descriptionFingerprint, approved.descriptionFingerprint)
    assert.equal(noOp.maintenanceFingerprint, approved.maintenanceFingerprint)
    const noOpMaintenance = await post(editor, noOp, 'manutencao', 'save', { maintenance: approved.maintenance })
    assert.equal(noOpMaintenance.maintenanceStatus, 'aprovado')
    assert.equal(noOpMaintenance.maintenanceFingerprint, approved.maintenanceFingerprint)

    // Different keys can be saved from the same snapshot without map replacement.
    const draft = getSystem(beforeUnit, 'draft::unidade'), rejected = getSystem(beforeUnit, 'rejected::unidade')
    const [first, second] = await Promise.all([
      post(editor, draft, 'sistemas', 'save', { html: '<p class="overlay" style="position:fixed">TECH_ATOMIC_DRAFT</p>' }),
      post(reviewer, rejected, 'sistemas', 'save', { html: '<p>TECH_ATOMIC_REJECTED</p>' }),
    ])
    let data = await stored()
    assert.equal(first.html, '<p>TECH_ATOMIC_DRAFT</p>', 'server persists normalized safe HTML, not the supplied attributes')
    assert.equal(data.manuals.proprietario.sistemas[draft.key], first.html)
    assert.equal(data.manuals.proprietario.sistemas[rejected.key], second.html)
    assert.equal(data.manuals.proprietario.sistemas[approved.key], approved.html)
    assert.deepEqual(data.manuals.sindico.sistemas, before.manuals.sindico.sistemas)
    assert.equal(first.descriptionStatus, 'rascunho')
    assert.equal(first.maintenanceStatus, draft.maintenanceStatus)
    assert.equal(first.maintenanceFingerprint, draft.maintenanceFingerprint)

    // Exactly one write using the same source revision wins.
    const saveResponses = await Promise.all([
      editor.post(endpoint, { data: { developmentId: dev, manualType: 'proprietario', contextKey: first.key, section: 'sistemas', action: 'save', expectedFingerprint: first.descriptionFingerprint, html: '<p>TECH_RACE_A</p>' } }),
      admin.post(endpoint, { data: { developmentId: dev, manualType: 'proprietario', contextKey: first.key, section: 'sistemas', action: 'save', expectedFingerprint: first.descriptionFingerprint, html: '<p>TECH_RACE_B</p>' } }),
    ])
    assert.deepEqual(saveResponses.map(response => response.status()).sort(), [200, 409])
    const winner = (await saveResponses.find(response => response.status() === 200).json()).system
    assert.equal((await stored()).manuals.proprietario.sistemas[first.key], winner.html)
    let pending = await post(editor, winner, 'sistemas', 'submit')
    assert.equal(pending.descriptionStatus, 'aguardando_validacao')
    assert.equal(pending.maintenanceFingerprint, draft.maintenanceFingerprint)
    await post(editor, pending, 'sistemas', 'save', { html: '<p>WAITING_EDIT</p>' }, 400)
    await post(editor, pending, 'sistemas', 'approve', {}, 403)
    const reviewResponses = await Promise.all([
      reviewer.post(endpoint, { data: { developmentId: dev, manualType: 'proprietario', contextKey: pending.key, section: 'sistemas', action: 'approve', expectedFingerprint: pending.descriptionFingerprint } }),
      admin.post(endpoint, { data: { developmentId: dev, manualType: 'proprietario', contextKey: pending.key, section: 'sistemas', action: 'reject', expectedFingerprint: pending.descriptionFingerprint, comment: 'TECH_CONCURRENT_REVIEW' } }),
    ])
    assert.deepEqual(reviewResponses.map(response => response.status()).sort(), [200, 409])
    const decided = (await reviewResponses.find(response => response.status() === 200).json()).system
    assert.ok(['aprovado', 'reprovado'].includes(decided.descriptionStatus))
    assert.equal(decided.descriptionComment, decided.descriptionStatus === 'reprovado' ? 'TECH_CONCURRENT_REVIEW' : null)

    // Administrators also cannot approve the source they submitted themselves.
    let own = await post(admin, decided, 'sistemas', 'save', { html: '<p>TECH_OWN_REVIEW</p>' })
    own = await post(admin, own, 'sistemas', 'submit')
    await post(admin, own, 'sistemas', 'approve', {}, 403)
    await post(editor, own, 'sistemas', 'approve', {}, 403)
    const yellow = await preview('proprietario')
    assert.ok(yellow.layout.pages.flatMap(page => page.commands).some(command => command.type === 'text' && command.text === 'TECH_OWN_REVIEW' && command.color === '#B77900'))
    assert.equal(yellow.readiness.ok, false)
    own = await post(reviewer, own, 'sistemas', 'approve')
    assert.equal(own.descriptionStatus, 'aprovado')
    assert.equal(own.maintenanceFingerprint, draft.maintenanceFingerprint)
    const restoredDesign = await preview('proprietario')
    assert.ok(restoredDesign.layout.pages.flatMap(page => page.commands).some(command => command.type === 'text' && command.text === 'TECH_OWN_REVIEW' && command.color === restoredDesign.document.identity.text && !command.reviewStatus))

    // Incomplete activities cannot be submitted. A saved empty decision can be.
    const originalWaiting = getSystem(beforeUnit, 'waiting::unidade')
    let maintenance = await post(editor, originalWaiting, 'manutencao', 'save', { maintenance: [{ task: 'TECH_INCOMPLETE', frequency: '', responsible: 'Proprietário' }] })
    assert.equal(maintenance.descriptionFingerprint, originalWaiting.descriptionFingerprint)
    assert.equal(maintenance.descriptionStatus, originalWaiting.descriptionStatus)
    await post(editor, maintenance, 'manutencao', 'submit', {}, 400)
    maintenance = await post(editor, maintenance, 'manutencao', 'save', { maintenance: [] })
    assert.deepEqual((await stored()).manuals.proprietario.manutencao[maintenance.key], [])
    maintenance = await post(editor, maintenance, 'manutencao', 'submit')
    assert.equal(maintenance.maintenanceStatus, 'aguardando_validacao')
    maintenance = await post(reviewer, maintenance, 'manutencao', 'approve')
    assert.equal(maintenance.maintenanceStatus, 'aprovado')
    assert.equal(maintenance.descriptionFingerprint, originalWaiting.descriptionFingerprint)
    const emptyDescription = await post(editor, second, 'sistemas', 'save', { html: '<p></p>' })
    await post(editor, emptyDescription, 'sistemas', 'submit', {}, 400)

    // One physical system keeps two independent sources and two review channels.
    const unitShared = getSystem(beforeUnit, 'shared::unidade'), commonShared = getSystem(beforeCommon, 'shared::comum')
    const [unitDescription, commonDescription] = await Promise.all([
      post(editor, unitShared, 'sistemas', 'save', { html: '<p>TECH_SCOPE_UNIT</p>' }),
      post(editor, commonShared, 'sistemas', 'save', { html: '<p>TECH_SCOPE_COMMON</p>' }, 200, 'sindico'),
    ])
    const [unitMaintenance, commonMaintenance] = await Promise.all([
      post(editor, unitDescription, 'manutencao', 'save', { maintenance: [{ task: 'TECH_TASK_UNIT', frequency: 'Anual', responsible: 'Proprietário' }] }),
      post(editor, commonDescription, 'manutencao', 'save', { maintenance: [{ task: 'TECH_TASK_COMMON', frequency: 'Mensal', responsible: 'Síndico' }] }, 200, 'sindico'),
    ])
    assert.equal(unitMaintenance.descriptionFingerprint, unitDescription.descriptionFingerprint)
    assert.equal(commonMaintenance.descriptionFingerprint, commonDescription.descriptionFingerprint)
    data = await stored()
    assert.equal(data.manuals.proprietario.sistemas[unitShared.key], '<p>TECH_SCOPE_UNIT</p>')
    assert.equal(data.manuals.sindico.sistemas[commonShared.key], '<p>TECH_SCOPE_COMMON</p>')
    assert.equal(data.manuals.proprietario.manutencao[unitShared.key][0].task, 'TECH_TASK_UNIT')
    assert.equal(data.manuals.sindico.manutencao[commonShared.key][0].task, 'TECH_TASK_COMMON')
    assert.equal(getSystem(await catalog(), unitShared.key).html, '<p>TECH_SCOPE_UNIT</p>')
    assert.equal(getSystem(await catalog('sindico'), commonShared.key).html, '<p>TECH_SCOPE_COMMON</p>')
    assert.ok(!(await catalog()).systems.some(system => system.key.endsWith('::comum')))
    assert.ok(!(await catalog('sindico')).systems.some(system => system.key.endsWith('::unidade')))
    const events = (await pool.query('SELECT action,metadata FROM audit_log WHERE "entityId"=$1 AND action IN ($2,$3,$4)', [dev, 'content.sent_for_validation', 'content.approved', 'content.rejected'])).rows
    assert.ok(events.some(row => row.action === 'content.sent_for_validation' && row.metadata.path?.includes('draft::unidade')))
    assert.ok(events.some(row => row.action === 'content.approved' && row.metadata.path?.includes('waiting::unidade')))
    assert.ok((await pool.query('SELECT id FROM organization_notification WHERE "developmentId"=$1 AND type=$2', [dev, 'validation_requested'])).rowCount > 0)
  } finally {
    // Restore only tested source maps and technical approvals; editorial content,
    // issued PDFs, history, checklist and all other development fields are kept.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT id FROM development WHERE id=$1 FOR UPDATE', [dev])
      await client.query('UPDATE development SET data=jsonb_set(jsonb_set(jsonb_set(jsonb_set(data,\'{manuals,proprietario,sistemas}\',$1::jsonb,true),\'{manuals,proprietario,manutencao}\',$2::jsonb,true),\'{manuals,sindico,sistemas}\',$3::jsonb,true),\'{manuals,sindico,manutencao}\',$4::jsonb,true) WHERE id=$5', [JSON.stringify(before.manuals.proprietario.sistemas), JSON.stringify(before.manuals.proprietario.manutencao), JSON.stringify(before.manuals.sindico.sistemas), JSON.stringify(before.manuals.sindico.manutencao), dev])
      await client.query('DELETE FROM development_content_validation WHERE "developmentId"=$1 AND section IN ($2,$3) AND NOT(id=ANY($4::text[]))', [dev, 'sistemas', 'manutencao', validations.map(row => row.id)])
      for (const row of validations) await client.query('UPDATE development_content_validation SET status=$1,"lastEditorId"=$2,"validatorId"=$3,comment=$4,"updatedAt"=$5 WHERE id=$6', [row.status, row.lastEditorId, row.validatorId, row.comment, row.updatedAt, row.id])
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }
  assert.deepEqual((await catalog()).systems, beforeUnit.systems)
  assert.deepEqual((await catalog('sindico')).systems, beforeCommon.systems)
  console.log('MANUAL_TECHNICAL_API_PASS: auth/tenant/scope, raw HTML rejection and normalization, atomic saves, stale conflicts, independent approvals, review locks, empty maintenance, preview colors, source restoration')
}

module.exports = { runTechnicalApiTests }
