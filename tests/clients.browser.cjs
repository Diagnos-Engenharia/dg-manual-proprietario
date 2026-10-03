const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright')
const { Pool } = require('pg')
const { PDFDocument } = require('pdf-lib')
const { createHash, randomBytes } = require('node:crypto')
const origin = process.env.TEST_BASE_URL || 'http://localhost:3000'
const local = value => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)
assert.ok(local(origin), 'Client fixture mutations require a local application')
assert.ok(process.env.DATABASE_URL && local(process.env.DATABASE_URL), 'Client fixtures require an isolated local database')
assert.ok(process.env.DG_PREVIEW_FILES_DIR, 'Private PDF fixtures require explicit isolated preview storage')
assert.notEqual(process.env.VERCEL_ENV, 'production', 'Fixture storage must never target production')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const suffix = Date.now().toString(36)
const id = name => 'clients-' + name + '-' + suffix
const directory = process.env.TEST_ARTIFACT_DIR || path.join(process.cwd(), 'work', 'clients-test')
const password = 'ClientIsolated!2026-password'
const org = id('org'), otherOrg = id('other-org'), dev = id('dev'), emptyDev = id('empty-dev'), otherDev = id('other-dev')
const ownUnit = id('unit-101'), secondUnit = id('unit-102'), emptyUnit = id('unit-empty'), otherUnit = id('other-unit')
const accessId = id('access-main'), exclusiveAccess = id('access-exclusive'), emptyAccess = id('access-empty'), outsiderAccess = id('access-outside')
const mainManual = id('owner'), ownFinishing = id('finishing-own'), otherFinishing = id('finishing-other'), syndicManual = id('syndic'), draftManual = id('draft'), foreignManual = id('foreign')
const pendingInvitationToken = randomBytes(32).toString('base64url')
const passed = [], pageErrors = [], contexts = [], pages = []
let browser
async function check(name, task) { await task(); passed.push(name); console.log('PASS', name) }
async function poll(query, verify, description) {
  for (let attempt = 0; attempt < 60; attempt++) { const result = await pool.query(query.sql, query.args); if (verify(result.rows)) return result.rows; await new Promise(resolve => setTimeout(resolve, 150)) }
  throw new Error('Persistence readback timed out: ' + description)
}
async function loginApi(context, email, pwd = password, expected = 200) {
  const response = await context.request.post(origin + '/api/auth/sign-in/email', { data: { email, password: pwd }, headers: { Origin: origin } })
  assert.equal(response.status(), expected, await response.text())
}
async function makeContext(ip) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, extraHTTPHeaders: { 'X-Forwarded-For': ip } })
  contexts.push(context)
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  return context
}
async function makePage(context) {
  const page = await context.newPage(); pages.push(page); page.setDefaultTimeout(15000)
  page.on('pageerror', error => pageErrors.push(error.message))
  return page
}
async function assertFile(context, access, manual, expected, attachment = false) {
  const response = await context.request.get(origin + '/api/clients/manuals/file?' + new URLSearchParams({ accessId: access, id: manual, ...(attachment ? { download: '1' } : {}) }))
  assert.equal(response.status(), expected, expected === 200 ? 'Private PDF expected' : await response.text())
  assert.match(response.headers()['cache-control'], /no-store/)
  if (expected === 200) { assert.equal(response.headers()['content-type'], 'application/pdf'); assert.match(response.headers()['content-disposition'], attachment ? /^attachment/ : /^inline/); const bytes = await response.body(); assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1); await fs.writeFile(path.join(directory, manual + '.pdf'), bytes) }
  return response
}
async function chat(context, access, manual, expected) {
  const response = await context.request.post(origin + '/api/clients/manuals/chat', { data: { accessId: access, manualId: manual, question: 'Como limpar revestimentos?' }, headers: { Origin: origin } })
  assert.equal(response.status(), expected, await response.text()); assert.match(response.headers()['cache-control'], /no-store/)
  return response.json()
}
async function rowMenu(page, name, item) {
  await page.getByRole('button', { name: 'Ações de ' + name, exact: true }).click()
  await page.getByRole(item.includes('acesso') && !item.includes('Remover') ? 'menuitemcheckbox' : 'menuitem', { name: item, exact: true }).click()
}
async function search(page, value) { await page.getByRole('textbox', { name: 'Buscar usuários' }).fill(value) }
;(async () => {
  await fs.mkdir(directory, { recursive: true })
  const { hashPassword } = await import('better-auth/crypto')
  const hashed = await hashPassword(password)
  for (const [tenant, name] of [[org, 'Construtora Clientes'], [otherOrg, 'Outra Construtora Clientes']]) await pool.query('INSERT INTO organization(id,name,slug) VALUES($1,$2,$3)', [tenant, name, tenant])
  const users = { admin: { id: id('admin'), name: 'Administrador clientes', email: id('admin') + '@example.test' }, editor: { id: id('editor'), name: 'Editor clientes', email: id('editor') + '@example.test' }, client: { id: id('client'), name: 'Cliente Principal', email: id('client') + '@example.test' }, exclusive: { id: id('exclusive'), name: 'Cliente Exclusivo', email: id('exclusive') + '@example.test' }, empty: { id: id('empty'), name: 'Cliente Sem Publicacao', email: id('empty') + '@example.test' }, existing: { id: id('existing'), name: 'Cliente Convite Existente', email: id('existing') + '@example.test' }, outsider: { id: id('outsider'), name: 'Cliente Outro Tenant', email: id('outsider') + '@example.test' } }
  for (const [kind, user] of Object.entries(users)) {
    await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","activeOrganizationId") VALUES($1,$2,$3,true,$4)', [user.id, user.name, user.email, ['admin', 'editor'].includes(kind) ? org : null])
    await pool.query('INSERT INTO account(id,"accountId","providerId","userId",password) VALUES($1,$2,$3,$4,$5)', [id('account-' + kind), user.id, 'credential', user.id, hashed])
  }
  for (const [kind, role] of [['admin', 'admin'], ['editor', 'editor']]) await pool.query('INSERT INTO member(id,"organizationId","userId",role,status) VALUES($1,$2,$3,$4,$5)', [id('member-' + kind), org, users[kind].id, role, 'active'])
  await pool.query('INSERT INTO member(id,"organizationId","userId",role,status) VALUES($1,$2,$3,$4,$5)', [id('member-outsider'), otherOrg, users.outsider.id, 'admin', 'active'])
  for (const [development, tenant, name] of [[dev, org, 'Residencial Clientes'], [emptyDev, org, 'Residencial Sem Publicacao'], [otherDev, otherOrg, 'Residencial Outro Tenant']]) await pool.query('INSERT INTO development(id,"userId","organizationId",name,client,"deliveryDate",data) VALUES($1,$2,$3,$4,$5,$6,$7)', [development, users.admin.id, tenant, name, 'Construtora Clientes', '2027-01-01', { privateDraft: 'CLIENT_SECRET_LIVE_DRAFT' }])
  for (const [unit, development, tenant, number] of [[ownUnit, dev, org, '101'], [secondUnit, dev, org, '102'], [emptyUnit, emptyDev, org, '201'], [otherUnit, otherDev, otherOrg, '999']]) await pool.query('INSERT INTO development_unit(id,"developmentId","organizationId",tower,number,typology,"lastEditorId") VALUES($1,$2,$3,$4,$5,$6,$7)', [unit, development, tenant, 'Torre A', number, '', users.admin.id])
  const accessRows = [[accessId, users.client, ownUnit, dev, org], [exclusiveAccess, users.exclusive, secondUnit, dev, org], [emptyAccess, users.empty, emptyUnit, emptyDev, org], [outsiderAccess, users.outsider, otherUnit, otherDev, otherOrg]]
  for (const [access, user, unit, development, tenant] of accessRows) await pool.query('INSERT INTO client_access(id,"organizationId","developmentId","unitId","userId",name,email,status,"createdBy") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [access, tenant, development, unit, user.id, user.name, user.email, 'active', users.admin.id])
  for (let index = 0; index < 12; index++) await pool.query('INSERT INTO client_access(id,"organizationId","developmentId","unitId",name,email,status,"createdBy") VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id('pending-' + index), org, dev, ownUnit, 'Cliente Pendente ' + String(index).padStart(2, '0'), id('pending-' + index) + '@example.test', 'pending', users.admin.id])
  await pool.query('INSERT INTO organization_invitation(id,"organizationId",name,email,role,"tokenHash","developmentIds","unitId","clientAccessId","expiresAt","invitedBy") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id('pending-invite'), org, 'Cliente Pendente 00', id('pending-0') + '@example.test', 'client', createHash('sha256').update(pendingInvitationToken).digest('hex'), JSON.stringify([dev]), ownUnit, id('pending-0'), new Date(Date.now() + 3600000), users.admin.id])
  async function manual(manualId, type, status, unit, development = dev, tenant = org) {
    const marker = manualId === mainManual ? 'Limpe os revestimentos com pano macio e detergente neutro.' : 'PRIVATE_' + type + '_' + manualId
    const pdf = await PDFDocument.create(); pdf.addPage().drawText(marker, { x: 20, y: 760, size: 10 }); const bytes = await pdf.save()
    const pathname = 'manuals/' + tenant + '/' + development + '/' + manualId + '/document.pdf'
    const target = path.resolve(process.env.DG_PREVIEW_FILES_DIR, pathname), root = path.resolve(process.env.DG_PREVIEW_FILES_DIR)
    assert.ok(target.startsWith(root + path.sep)); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes)
    const revision = status === 'rascunho' ? 2 : 1
    const snapshot = { document: { schemaVersion: 1, metadata: { manualType: type, purpose: 'publication', developmentId: development, revision }, sections: [{ id: 'limpeza', type: 'content', title: 'Revestimentos e limpeza', validationStatus: 'aprovado', renderPolicy: 'approved', blocks: [{ type: 'paragraph', text: marker }], children: [] }] }, rawDraft: 'CLIENT_SECRET_SNAPSHOT_DRAFT' }
    await pool.query('INSERT INTO manual_version(id,"developmentId","organizationId","manualType",revision,status,filename,pathname,pages,"unitId","sourceSnapshot","createdBy","publishedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [manualId, development, tenant, type, revision, status, 'Documento-' + manualId + '.pdf', pathname, 1, unit, snapshot, users.admin.id, status === 'publicado' ? new Date('2026-06-01T12:00:00Z') : null])
  }
  await manual(mainManual, 'proprietario', 'publicado', null); await manual(ownFinishing, 'acabamentos', 'publicado', ownUnit); await manual(otherFinishing, 'acabamentos', 'publicado', secondUnit); await manual(syndicManual, 'sindico', 'publicado', null); await manual(draftManual, 'proprietario', 'rascunho', null); await manual(foreignManual, 'proprietario', 'publicado', null, otherDev, otherOrg)
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM platform_integration')).rows[0].n, 0, 'No configured AI provider: this suite must never call external AI')
  browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.TEST_BROWSER_EXECUTABLE } : {}) })
  const adminContext = await makeContext('127.0.0.31'), clientContext = await makeContext('127.0.0.32'), outsiderContext = await makeContext('127.0.0.33'), editorContext = await makeContext('127.0.0.34'), guestContext = await makeContext('127.0.0.35'), inviteContext = await makeContext('127.0.0.36'), emptyContext = await makeContext('127.0.0.37'), exclusiveContext = await makeContext('127.0.0.38')
  await loginApi(adminContext, users.admin.email); await loginApi(outsiderContext, users.outsider.email); await loginApi(editorContext, users.editor.email); await loginApi(inviteContext, users.existing.email); await loginApi(emptyContext, users.empty.email); await loginApi(exclusiveContext, users.exclusive.email)
  const admin = await makePage(adminContext), client = await makePage(clientContext), invitee = await makePage(inviteContext), empty = await makePage(emptyContext)
  await check('real client login redirects to isolated read-only published portal', async () => {
    await client.goto(origin + '/sign-in'); await client.getByRole('textbox', { name: 'Usuário ou E-mail' }).fill(users.client.email); await client.locator('input[name="password"]').fill(password); await client.getByRole('button', { name: 'ENTRAR NA MINHA CONTA' }).click(); await client.waitForURL('**/meu-manual')
    await client.getByRole('heading', { name: 'Olá, Cliente Principal' }).waitFor()
    assert.equal(await client.getByRole('link', { name: 'Visualizar', exact: true }).count(), 2)
    const html = await client.content(); for (const forbidden of [otherFinishing, syndicManual, draftManual, foreignManual, 'CLIENT_SECRET', 'sourceSnapshot', 'pathname']) assert.ok(!html.includes(forbidden), forbidden + ' must not reach client HTML'); assert.ok(html.includes('01/06/2026'), 'Published date must come from publishedAt, not issuance time')
    assert.equal(await client.locator('aside').count(), 0)
    await client.screenshot({ path: path.join(directory, 'client-portal-desktop.png'), fullPage: true })
  })
  await check('private PDFs are real bytes; ownership, publication, tenant and anonymous guards reject access', async () => {
    await assertFile(clientContext, accessId, mainManual, 200); await assertFile(clientContext, accessId, ownFinishing, 200, true)
    for (const invalid of [otherFinishing, syndicManual, draftManual, foreignManual]) await assertFile(clientContext, accessId, invalid, 404)
    await assertFile(outsiderContext, accessId, mainManual, 404); await assertFile(guestContext, accessId, mainManual, 401)
    await chat(outsiderContext, accessId, mainManual, 404); await chat(guestContext, accessId, mainManual, 401); await chat(clientContext, accessId, ownFinishing, 400)
    const unavailable = await chat(clientContext, accessId, mainManual, 503); assert.match(unavailable.error, /indisponível/)
    assert.equal((await clientContext.request.get(origin + '/api/manuals/versions?developmentId=' + dev)).status(), 403)
  })
  await check('true unpublished empty state and mobile portal do not invent documents or internal controls', async () => {
    await empty.goto(origin + '/meu-manual'); await empty.getByText('Ainda não há documentos publicados', { exact: false }).waitFor(); assert.equal(await empty.getByRole('link', { name: 'Visualizar', exact: true }).count(), 0); assert.equal(await empty.getByRole('button', { name: 'Perguntar', exact: true }).count(), 0)
    await client.setViewportSize({ width: 390, height: 844 }); assert.ok(await client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)); await client.screenshot({ path: path.join(directory, 'client-portal-mobile.png'), fullPage: true }); await client.setViewportSize({ width: 1440, height: 950 })
  })
  await check('administrator users table filters, paginates10 and rejects staff/client access', async () => {
    await admin.goto(origin + '/usuarios'); await admin.getByRole('heading', { name: 'Usuários', exact: true }).waitFor(); assert.equal(await admin.locator('tbody tr').count(), 10); await admin.getByRole('button', { name: 'Próxima página' }).click(); assert.equal(await admin.locator('tbody tr').count(), 5)
    await search(admin, users.client.email); assert.equal(await admin.locator('tbody tr').count(), 1); await search(admin, ''); await admin.getByRole('combobox', { name: 'Filtrar por empreendimento' }).selectOption(emptyDev); assert.equal(await admin.locator('tbody tr').count(), 1); await admin.getByRole('combobox', { name: 'Filtrar por empreendimento' }).selectOption('')
    await admin.screenshot({ path: path.join(directory, 'client-users-desktop.png'), fullPage: true })
    for (const context of [editorContext, clientContext]) { const html = await (await context.request.get(origin + '/usuarios')).text(); assert.ok(html.includes('exclusiva do Administrador')); assert.ok(!html.includes(users.client.email)) }
    const foreign = await (await outsiderContext.request.get(origin + '/usuarios')).text(); assert.ok(!foreign.includes(users.client.email))
  })
  await check('mobile/tablet/desktop users, portal, PDF and manual-chat interactions remain usable', async () => {
    await require('./clients-platform-browser.cjs')({ admin, client, directory, email: users.client.email, name: users.client.name, developmentId: dev })
  })
  await check('individual disable persists and mixed bulk disable never re-enables the blocked client', async () => {
    await search(admin, users.client.email); await rowMenu(admin, users.client.name, 'Desabilitar acesso'); await admin.getByRole('dialog').getByRole('button', { name: 'Desabilitar', exact: true }).click()
    await poll({ sql: 'SELECT status FROM client_access WHERE id=$1', args: [accessId] }, rows => rows[0].status === 'disabled', 'individual disable'); await admin.reload(); await search(admin, users.client.email); await admin.getByText('Inativo', { exact: true }).waitFor()
    await assertFile(clientContext, accessId, mainManual, 404); await chat(clientContext, accessId, mainManual, 404); await client.reload(); await client.getByText('Seu acesso está desabilitado', { exact: false }).waitFor()
    await admin.getByRole('button', { name: 'Desabilitar todos', exact: true }).click(); await admin.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.equal((await pool.query('SELECT status FROM client_access WHERE id=$1', [accessId])).rows[0].status, 'disabled')
    await admin.getByRole('button', { name: 'Desabilitar todos', exact: true }).click(); await admin.getByRole('dialog').getByRole('button', { name: 'Desabilitar', exact: true }).click(); await poll({ sql: 'SELECT status FROM client_access WHERE "organizationId"=$1', args: [org] }, rows => rows.every(row => row.status === 'disabled'), 'bulk disable')
    assert.equal((await pool.query('SELECT status FROM client_access WHERE id=$1', [outsiderAccess])).rows[0].status, 'active'); assert.equal((await pool.query('SELECT "accessStatus" FROM "user" WHERE id=$1', [users.admin.id])).rows[0].accessStatus, 'active')
    await admin.getByRole('button', { name: 'Habilitar todos', exact: true }).click(); await poll({ sql: 'SELECT status FROM client_access WHERE id=$1', args: [accessId] }, rows => rows[0].status === 'active', 'bulk enable'); await assertFile(clientContext, accessId, mainManual, 200); await client.reload(); await client.getByRole('heading', { name: 'Olá, Cliente Principal' }).waitFor()
  })
  await check('invitation modal retains copyable link through revalidation; existing identity accepts without staff membership', async () => {
    await search(admin, ''); await admin.getByRole('button', { name: 'Convidar cliente' }).click(); const dialog = admin.getByRole('dialog'); await dialog.getByRole('textbox', { name: 'Nome', exact: true }).fill(users.existing.name); await dialog.getByRole('textbox', { name: 'E-mail', exact: true }).fill(users.existing.email); await dialog.getByRole('combobox', { name: 'Empreendimento', exact: true }).selectOption(dev); await dialog.getByRole('combobox', { name: 'Unidade', exact: true }).selectOption(ownUnit); await dialog.getByRole('button', { name: 'Criar convite', exact: true }).click()
    const input = admin.getByRole('textbox', { name: 'Link para o cliente' }); await input.waitFor(); const invitationUrl = await input.inputValue(); assert.ok(new URL(invitationUrl).pathname.startsWith('/convite/')); await admin.getByRole('dialog').getByRole('heading', { name: 'Convite criado' }).waitFor(); await admin.keyboard.press('Escape')
    await invitee.goto(invitationUrl); await invitee.getByRole('button', { name: 'Aceitar convite' }).click(); await invitee.waitForURL('**/meu-manual'); await invitee.getByRole('heading', { name: 'Olá, ' + users.existing.name }).waitFor()
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM member WHERE "userId"=$1', [users.existing.id])).rows[0].n, 0); assert.equal((await pool.query('SELECT status FROM client_access WHERE email=$1 AND "organizationId"=$2', [users.existing.email, org])).rows[0].status, 'active')
    await invitee.goto(invitationUrl); await invitee.getByRole('heading', { name: 'Convite indisponível' }).waitFor()
  })
  let resetUrl
  await check('reset link is hash-only,15min, one-use; real password changes revoke old sessions', async () => {
    await admin.reload(); await search(admin, users.client.email); await rowMenu(admin, users.client.name, 'Redefinir senha'); await admin.getByRole('textbox', { name: 'Link para o cliente' }).waitFor(); resetUrl = await admin.getByRole('textbox', { name: 'Link para o cliente' }).inputValue(); await admin.keyboard.press('Escape')
    const token = new URL(resetUrl).pathname.split('/').pop(), hash = createHash('sha256').update(token).digest('hex'); const stored = (await pool.query('SELECT "tokenHash","expiresAt","createdAt","usedAt" FROM client_password_reset WHERE "tokenHash"=$1', [hash])).rows[0]; assert.ok(stored); assert.notEqual(stored.tokenHash, token); assert.ok(stored.expiresAt - stored.createdAt <= 15 * 60 * 1000 + 1000); assert.equal(stored.usedAt, null)
    const resetPage = await makePage(guestContext); await resetPage.goto(resetUrl); await resetPage.getByLabel('Nova senha', { exact: true }).fill('ClientChanged!2026-password'); await resetPage.getByLabel('Confirmar nova senha', { exact: true }).fill('ClientChanged!2026-password'); await resetPage.getByRole('button', { name: 'Atualizar senha', exact: true }).click(); await resetPage.getByRole('status').filter({ hasText: 'Senha atualizada' }).waitFor()
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM session WHERE "userId"=$1', [users.client.id])).rows[0].n, 0); await assertFile(clientContext, accessId, mainManual, 401)
    await resetPage.goto(resetUrl); await resetPage.getByLabel('Nova senha', { exact: true }).fill('ClientAgain!2026-password'); await resetPage.getByLabel('Confirmar nova senha', { exact: true }).fill('ClientAgain!2026-password'); await resetPage.getByRole('button', { name: 'Atualizar senha', exact: true }).click(); await resetPage.getByRole('alert').filter({ hasText: 'inválido ou expirado' }).waitFor()
    await loginApi(clientContext, users.client.email, password, 401); await loginApi(clientContext, users.client.email, 'ClientChanged!2026-password'); await assertFile(clientContext, accessId, mainManual, 200)
  })
  await check('expired reset fails and independent global account revocation survives bulk enable', async () => {
    await rowMenu(admin, users.client.name, 'Redefinir senha'); await admin.getByRole('textbox', { name: 'Link para o cliente' }).waitFor(); const expiredUrl = await admin.getByRole('textbox', { name: 'Link para o cliente' }).inputValue(); await admin.keyboard.press('Escape'); const hash = createHash('sha256').update(new URL(expiredUrl).pathname.split('/').pop()).digest('hex'); await pool.query('UPDATE client_password_reset SET "expiresAt"=now()-interval\'1 minute\' WHERE "tokenHash"=$1', [hash])
    const expired = await makePage(guestContext); await expired.goto(expiredUrl); await expired.getByLabel('Nova senha', { exact: true }).fill('ClientExpired!2026-password'); await expired.getByLabel('Confirmar nova senha', { exact: true }).fill('ClientExpired!2026-password'); await expired.getByRole('button', { name: 'Atualizar senha', exact: true }).click(); await expired.getByRole('alert').filter({ hasText: 'inválido ou expirado' }).waitFor()
    await pool.query('UPDATE "user" SET "accessStatus"=$1 WHERE id=$2', ['disabled', users.client.id]); await assertFile(clientContext, accessId, mainManual, 403); await chat(clientContext, accessId, mainManual, 403); await client.goto(origin + '/meu-manual'); await client.getByText('Seu acesso está desabilitado', { exact: false }).waitFor(); await loginApi(clientContext, users.client.email, 'ClientChanged!2026-password', 403)
    await admin.getByRole('button', { name: 'Desabilitar todos', exact: true }).click(); await admin.getByRole('dialog').getByRole('button', { name: 'Desabilitar', exact: true }).click(); await poll({ sql: 'SELECT status FROM client_access WHERE id=$1', args: [accessId] }, rows => rows[0].status === 'disabled', 'global account independent from client disable'); await admin.getByRole('button', { name: 'Habilitar todos', exact: true }).click(); await poll({ sql: 'SELECT status FROM client_access WHERE id=$1', args: [accessId] }, rows => rows[0].status === 'active', 'bulk enable keeps global revocation'); await assertFile(clientContext, accessId, mainManual, 403)
    assert.equal((await pool.query('SELECT status FROM client_access WHERE id=$1', [accessId])).rows[0].status, 'active'); await pool.query('UPDATE "user" SET "accessStatus"=$1 WHERE id=$2', ['active', users.client.id])
  })
  await check('remove pending and exclusive access persists; preserves unrelated staff, identity and other clients', async () => {
    await search(admin, 'Cliente Pendente 00'); await rowMenu(admin, 'Cliente Pendente 00', 'Remover acesso'); await admin.getByRole('dialog').getByRole('button', { name: 'Remover acesso', exact: true }).click(); await poll({ sql: 'SELECT id FROM client_access WHERE id=$1', args: [id('pending-0')] }, rows => !rows.length, 'remove pending')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM organization_invitation WHERE id=$1', [id('pending-invite')])).rows[0].n, 0); const removedInvitation = await makePage(guestContext); await removedInvitation.goto(origin + '/convite/' + pendingInvitationToken); await removedInvitation.getByRole('heading', { name: 'Convite indisponível' }).waitFor()
    assert.ok((await pool.query('SELECT count(*)::int AS n FROM session WHERE "userId"=$1', [users.exclusive.id])).rows[0].n > 0)
    await search(admin, users.exclusive.email); await rowMenu(admin, users.exclusive.name, 'Remover acesso'); await admin.getByRole('dialog').getByRole('button', { name: 'Remover acesso', exact: true }).click(); await poll({ sql: 'SELECT id FROM client_access WHERE id=$1', args: [exclusiveAccess] }, rows => !rows.length, 'remove exclusive'); assert.equal((await pool.query('SELECT "accessStatus" FROM "user" WHERE id=$1', [users.exclusive.id])).rows[0].accessStatus, 'active'); assert.equal((await pool.query('SELECT count(*)::int AS n FROM session WHERE "userId"=$1', [users.exclusive.id])).rows[0].n, 0); await assertFile(exclusiveContext, exclusiveAccess, mainManual, 401)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM member WHERE "organizationId"=$1', [org])).rows[0].n, 2); assert.equal((await pool.query('SELECT status FROM client_access WHERE id=$1', [accessId])).rows[0].status, 'active'); assert.equal((await pool.query('SELECT status FROM client_access WHERE id=$1', [outsiderAccess])).rows[0].status, 'active')
    await admin.reload(); await search(admin, users.exclusive.email); await admin.getByText('Nenhum usuário corresponde à busca.').waitFor()
  })
  assert.deepEqual(pageErrors, [])
  await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify({ passed, fixture: { organizationId: org, developmentId: dev }, limitations: ['OpenAI network disabled by absent integration; model semantics tested with mocks in manual-chat.test.ts', 'Private PDFs use isolated local storage adapter, not live Vercel Blob transport'] }, null, 2))
  console.log('CLIENTS_E2E_PASS:', passed.length, 'flows with real Better Auth, PostgreSQL persistence and private PDF bytes')
})().catch(async error => { console.error(error); if (browser) for (let index = 0; index < pages.length; index++) await pages[index].screenshot({ path: path.join(directory, 'failure-' + index + '.png'), fullPage: true }).catch(() => {}); process.exitCode = 1 }).finally(async () => { if (browser) await browser.close(); await pool.end() })
