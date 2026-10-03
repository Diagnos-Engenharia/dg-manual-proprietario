const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { PDFDocument } = require('pdf-lib')

module.exports = async function runFinishingApiTests({ admin, reviewer, editor, anonymous, outsider, pool, dev, finishingId, directory, preview }) {
  const unitsUrl = '/api/finishing/units?' + new URLSearchParams({ developmentId: dev })
  async function catalog(context = admin) {
    const response = await context.get(unitsUrl)
    assert.equal(response.status(), 200, await response.text())
    return response.json()
  }
  async function unit(id, context = admin) {
    const response = await context.get('/api/finishing/tables?' + new URLSearchParams({ developmentId: dev, unitId: id }))
    assert.equal(response.status(), 200, await response.text())
    return (await response.json()).unit
  }
  async function create(values, context = editor) {
    const response = await context.post('/api/finishing/units', { data: { developmentId: dev, tower: 'Torre A', ...values } })
    assert.ok([200, 201].includes(response.status()), await response.text())
    return (await response.json()).unit
  }
  async function action(context, source, name, values = {}, expected = 200) {
    const response = await context.post('/api/finishing/tables', { data: { developmentId: dev, unitId: source.id, action: name, expectedFingerprint: source.fingerprint, ...values } })
    const result = await response.json()
    assert.equal(response.status(), expected, JSON.stringify(result))
    return result.unit
  }
  async function snapshot(id, context = admin, expected = 200) {
    const response = await context.post('/api/manuals/preview', { data: { developmentId: dev, manualType: 'acabamentos', unitId: id } })
    const result = await response.json()
    assert.equal(response.status(), expected, JSON.stringify(result))
    return result
  }
  async function emit(id, source, expected = 201) {
    const response = await admin.post('/api/manuals/compile', { data: { developmentId: dev, manualType: 'acabamentos', unitId: id, previewFingerprint: source.fingerprint } })
    const result = await response.json()
    assert.equal(response.status(), expected, JSON.stringify(result))
    return result
  }
  const text = document => document.layout.pages.flatMap(page => page.commands).filter(command => command.type === 'text').map(command => command.text).join(' ')
  const legacyIdentity = { floor: 'PAVIMENTO_LEGADO_OCULTO', typology: 'TIPOLOGIA_LEGADA_OCULTA_' + 'São João '.repeat(15).trim(), area: '70,40' }
  function assertLandscapeTable(source, selectedUnit) {
    assert.deepEqual(source.document.sections.map(section => ({ id: section.id, type: section.type, title: section.title })), [{ id: 'acabamentos', type: 'content', title: 'Tabela de acabamentos' }], 'A finishing PDF has one table section and no cover, summary or identification pages')
    assert.deepEqual(source.document.sections[0].children, [])
    assert.equal(source.document.metadata.pageOrientation, 'landscape')
    assert.equal(source.document.metadata.unitId, selectedUnit.id)
    assert.equal(source.document.metadata.unitLabel, selectedUnit.tower + ' · Unidade ' + selectedUnit.number)
    for (const page of source.layout.pages) {
      assert.deepEqual(page.sectionIds, ['acabamentos'])
      assert.ok(Math.abs(page.width - 297 * 72 / 25.4) < 0.001, 'Preview must use A4 landscape width')
      assert.ok(Math.abs(page.height - 210 * 72 / 25.4) < 0.001, 'Preview must use A4 landscape height')
      const header = page.commands.filter(command => command.type === 'text' && command.y < 100).map(command => command.text).join(' ')
      assert.ok(header.includes(source.document.metadata.developmentName), 'Every page identifies the development in its header')
      assert.ok(header.includes(selectedUnit.tower), 'Every page identifies the selected tower in its header')
      assert.ok(header.includes('Unidade ' + selectedUnit.number), 'Every page identifies the selected unit in its header')
    }
    for (const value of ['PAVIMENTO_LEGADO_OCULTO', 'TIPOLOGIA_LEGADA_OCULTA_', legacyIdentity.area]) {
      assert.ok(!text(source).includes(value), 'Hidden legacy identity must not appear in PDF drawing commands: ' + value)
      assert.ok(!source.document.metadata.title.includes(value), 'Hidden legacy identity must not appear in the document title')
    }
  }
  assert.equal((await anonymous.get(unitsUrl)).status(), 401)
  assert.equal((await outsider.get(unitsUrl)).status(), 404)
  assert.equal((await outsider.post('/api/finishing/units', { data: { developmentId: dev, tower: 'Torre A', number: '999' } })).status(), 404)
  const before = await catalog()
  assert.equal(before.units.length, 0, 'Legacy labels must never become real units')
  assert.ok(before.legacyTables.some(table => table.id === finishingId))
  let first = await create({ number: '101', ...legacyIdentity })
  let second = await create({ number: '102' }, admin)
  assert.deepEqual({ floor: second.floor, typology: second.typology, area: second.area }, { floor: '', typology: '', area: '' }, 'A unit can be created with only number and tower')
  const third = await create({ tower: 'Torre B', number: '101' })
  assert.equal((await catalog()).units.length, 3)
  assert.equal(third.table, null)
  assert.equal(third.emissionStatus, 'pendente')
  const duplicate = await editor.post('/api/finishing/units', { data: { developmentId: dev, tower: ' torre a ', number: ' 101 ' } })
  assert.equal(duplicate.status(), 409, await duplicate.text())
  await snapshot(first.id, outsider, 404)
  assert.equal((await admin.post('/api/manuals/preview', { data: { developmentId: dev, manualType: 'acabamentos' } })).status(), 400)
  const empty = await snapshot(first.id)
  assert.equal(empty.readiness.ok, false)
  await emit(first.id, empty, 400)
  first = await action(editor, first, 'copy', { sourceTableId: finishingId })
  assert.equal(first.table.status, 'rascunho', 'Copy never inherits approval')
  assert.equal((await catalog()).legacyTables.find(table => table.id === finishingId).unitId, null)
  assert.ok(JSON.stringify(first.table.data).includes('FABRICANTE_APROVADO'))
  await action(editor, first, 'approve', {}, 403)
  const content = { ambientes: [{ id: 'room', ambiente: 'Cozinha', pisoRodapeBancada: 'Porcelanato', parede: 'Cerâmica', teto: 'ACABAMENTO_UNIDADE_101_ÁRVORE' }], materiais: [], hidraulicas: [], esquadrias: [], eletricas: [] }
  first = await action(editor, first, 'save', { data: content })
  const same = await action(editor, first, 'save', { data: content })
  assert.equal(same.fingerprint, first.fingerprint)
  const sameSourceWrites = await Promise.all(['FIRST_WRITER', 'SECOND_WRITER'].map(marker => editor.post('/api/finishing/tables', { data: { developmentId: dev, unitId: first.id, action: 'save', expectedFingerprint: first.fingerprint, data: { ...content, ambientes: content.ambientes.map(row => ({ ...row, teto: marker })) } } })))
  assert.deepEqual(sameSourceWrites.map(result => result.status()).sort(), [200, 409])
  first = await unit(first.id)
  first = await action(editor, first, 'save', { data: content })
  await action(editor, { ...first, fingerprint: 'stale' }, 'save', { data: content }, 409)
  first = await action(editor, first, 'submit')
  await action(editor, first, 'save', { data: content }, 409)
  const waiting = await snapshot(first.id)
  assert.ok(waiting.layout.pages.flatMap(page => page.commands).some(command => command.type === 'text' && command.text.includes('ACABAMENTO_UNIDADE_101') && command.color === '#B77900'))
  await emit(first.id, waiting, 400)
  first = await action(reviewer, first, 'approve')
  const approved = await snapshot(first.id)
  assert.equal(approved.readiness.ok, true, JSON.stringify(approved.readiness))
  assertLandscapeTable(approved, first)
  assert.ok(text(approved).includes('101'))
  assert.ok(text(approved).includes('ACABAMENTO_UNIDADE_101'))
  assert.ok(!text(approved).includes('PRIVATIVO_'))
  assert.ok(!approved.layout.pages.flatMap(page => page.commands).some(command => command.reviewStatus === 'aguardando_validacao'))
  second = await action(admin, second, 'save', { data: { ...content, ambientes: content.ambientes.map(row => ({ ...row, teto: 'ACABAMENTO_UNIDADE_102_SÃO_JOÃO' })) } })
  second = await action(admin, second, 'submit')
  await action(admin, second, 'approve', {}, 403)
  second = await action(reviewer, second, 'approve')
  const secondPreview = await snapshot(second.id)
  assert.equal(secondPreview.readiness.ok, true, 'A minimal unit is ready to emit after its table is approved')
  assertLandscapeTable(secondPreview, second)
  assert.ok(!text(secondPreview).includes('ACABAMENTO_UNIDADE_101'))
  assert.ok(!text(approved).includes('ACABAMENTO_UNIDADE_102'))
  assert.ok(!(await preview('proprietario')).readiness.blocking.some(message => /acabamento/i.test(message)))
  assert.ok(!JSON.stringify((await preview('proprietario')).document).includes('ACABAMENTO_UNIDADE'))
  await emit(first.id, { fingerprint: 'stale' }, 409)
  const generated = await Promise.all([emit(first.id, approved), emit(second.id, secondPreview)])
  assert.deepEqual(generated.map(version => version.revision), [1, 1])
  await emit(first.id, approved, 409)
  for (let index = 0; index < generated.length; index++) {
    const version = generated[index]
    const fileUrl = '/api/manuals/file?id=' + encodeURIComponent(version.id)
    assert.equal((await outsider.get(fileUrl)).status(), 404)
    assert.equal((await anonymous.get(fileUrl)).status(), 401)
    const download = await admin.get(fileUrl)
    assert.equal(download.status(), 200)
    const bytes = await download.body()
    const pdf = await PDFDocument.load(bytes)
    const source = index ? secondPreview : approved
    assert.equal(pdf.getPageCount(), source.layout.pages.length)
    assert.equal(pdf.getTitle(), source.document.metadata.title + ' · ' + source.document.metadata.developmentName)
    for (const [pageIndex, page] of pdf.getPages().entries()) {
      assert.ok(page.getWidth() > page.getHeight(), 'Every exported PDF page must be landscape')
      assert.equal(page.getWidth(), source.layout.pages[pageIndex].width)
      assert.equal(page.getHeight(), source.layout.pages[pageIndex].height)
    }
    await fs.writeFile(path.join(directory, 'acabamentos-unidade-' + (101 + index) + '.pdf'), bytes)
    for (const status of ['validacao', 'aprovado', 'publicado']) {
      const response = await admin.post('/api/manuals/versions/status', { data: { id: version.id, status } })
      assert.equal(response.status(), 200, await response.text())
    }
  }
  let after = await catalog()
  assert.equal(after.units.filter(unit => unit.publishedVersion).length, 2)
  assert.equal(after.units.find(unit => unit.id === third.id).emissionStatus, 'pendente')
  for (const id of [first.id, second.id]) {
    const versions = await admin.get('/api/manuals/versions?' + new URLSearchParams({ developmentId: dev, manualType: 'acabamentos', unitId: id }))
    assert.equal(versions.status(), 200, await versions.text())
    const history = (await versions.json()).versions
    assert.equal(history.length, 1)
    assert.equal(history[0].status, 'publicado')
    assert.equal(history[0].unitId, id)
  }
  const stored = (await pool.query('SELECT * FROM manual_version WHERE id=$1', [generated[0].id])).rows[0]
  assert.ok(stored.sourceFingerprint)
  const historicalSource = JSON.stringify(stored.sourceSnapshot)
  assert.ok(historicalSource.includes('101'))
  assert.ok(historicalSource.includes('ACABAMENTO_UNIDADE_101'))
  first = await unit(first.id)
  const previousFingerprint = first.fingerprint
  const amended = await editor.post('/api/finishing/units', { data: { developmentId: dev, id: first.id, expectedRevision: first.revision, tower: 'Torre A revisada', number: first.number } })
  assert.equal(amended.status(), 200, await amended.text())
  first = (await amended.json()).unit
  assert.equal(first.tower, 'Torre A revisada')
  assert.deepEqual({ floor: first.floor, typology: first.typology, area: first.area }, legacyIdentity, 'Updating only number/tower must preserve the exact saved legacy fields')
  assert.notEqual(first.fingerprint, previousFingerprint)
  assert.equal(first.table.status, 'rascunho')
  assert.equal(first.emissionStatus, 'atualizacao_pendente')
  assert.ok(first.publishedVersion)
  assert.equal(JSON.stringify((await pool.query('SELECT "sourceSnapshot" FROM manual_version WHERE id=$1', [generated[0].id])).rows[0].sourceSnapshot), historicalSource)
  // The source may change again before publishing a new emitted revision.
  first = await action(editor, first, 'submit')
  first = await action(reviewer, first, 'approve')
  const updatedPreview = await snapshot(first.id)
  assertLandscapeTable(updatedPreview, first)
  const newVersion = await emit(first.id, updatedPreview)
  for (const status of ['validacao', 'aprovado']) assert.equal((await admin.post('/api/manuals/versions/status', { data: { id: newVersion.id, status } })).status(), 200)
  first = await action(editor, await unit(first.id), 'save', { data: { ...content, ambientes: content.ambientes.map(row => ({ ...row, teto: 'FONTE_ATUALIZADA_101' })) } })
  const stalePublication = await admin.post('/api/manuals/versions/status', { data: { id: newVersion.id, status: 'publicado' } })
  assert.equal(stalePublication.status(), 409, await stalePublication.text())
  assert.equal((await unit(second.id)).emissionStatus, 'emitida')
  const otherDev = dev + '-other-units'
  await pool.query('INSERT INTO development(id,"userId","organizationId",name,client,"deliveryDate") SELECT $1,"userId","organizationId",$2,client,"deliveryDate" FROM development WHERE id=$3', [otherDev, 'Outro cadastro', dev])
  const mismatched = await admin.post('/api/manuals/preview', { data: { developmentId: otherDev, manualType: 'acabamentos', unitId: second.id } })
  assert.equal(mismatched.status(), 404, await mismatched.text())
  return { first: await unit(first.id), second: await unit(second.id), third, generated }
}
