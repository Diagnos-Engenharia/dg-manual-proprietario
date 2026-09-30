const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright')
const { Pool } = require('pg')
const { execFileSync } = require('node:child_process')

const origin = process.env.TEST_BASE_URL || 'http://localhost:3000'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const suffix = Date.now()
const id = `scope-test-${suffix}`
const output = process.env.TEST_OUTPUT_DIR || '/tmp/dg-scope-evidence'
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check, label) {
  for (let i = 0; i < 60; i++) { if (await check()) return; await delay(250) }
  throw new Error(`Timeout: ${label}`)
}

;(async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(`${origin}/sign-up`)
    await page.getByPlaceholder('Nome completo').fill('Auditoria da revisão 01')
    await page.getByPlaceholder('E-mail', { exact: true }).fill(`scope-${suffix}@example.test`)
    await page.getByPlaceholder('Senha (mínimo 8 caracteres)').fill(`IsolatedScope!${suffix}`)
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click()
    await page.waitForURL('**/onboarding')
    await page.getByPlaceholder('Nome oficial da empresa').fill('Construtora de validação isolada')
    await page.getByRole('button', { name: 'Salvar e acessar o Dashboard' }).click()
    await page.waitForURL(`${origin}/`)
    console.log('PASS signup, onboarding and dashboard')
    const rows = await pool.query('SELECT u.id, m."organizationId" FROM "user" u JOIN member m ON m."userId"=u.id WHERE u.email=$1', [`scope-${suffix}@example.test`])
    const { id: userId, organizationId } = rows.rows[0]
    // Fixtures exist only in the isolated test database, never in application routes.
    const item = (id, name, scope) => ({ id, item: name, category: 'Sistemas de validação', scope, status: 'possui', obsProprietario: 'Diretriz privativa', obsSindico: 'Diretriz comum', norms: [], maintenance: [] })
    const data = { ficha: { name: 'Empreendimento de validação', client: 'Construtora de validação isolada', completionDate: '2027-01-01', towers: '1', apartments: '8', typologies: '1', areas: '70' }, schedule: ['Ficha Técnica do Empreendimento','Checklist Inicial','Manual do Proprietário','Manual do Síndico'].map((name,index)=>({id:'stage-'+(index+1),name,weight:25,originalDate:'2027-01-01',scheduledDate:'2027-01-01',status:'no_prazo',revisions:[]})), manuals:{proprietario:{sistemas:{'unit::unidade':'<p>PISO_PRIVATIVO_VALIDADO</p>'}},sindico:{sistemas:{'common::comum':'<p>ELEVADOR_COMUM_VALIDADO</p>'}}}, checklist: [item('unit', 'Piso privativo', 'unidade'), item('common', 'Elevador comum', 'comum'), item('shared', 'Esquadrias compartilhadas', 'unidade')] }
    await pool.query('INSERT INTO development (id,"userId","organizationId",name,client,"deliveryDate",data) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, userId, organizationId, 'Empreendimento de validação', 'Construtora de validação isolada', '2027-01-01', data])
    const route = `${origin}/empreendimentos/${id}?modulo=elaboracao`
    await page.goto(route)
    await page.getByText('Piso privativo', { exact: true }).waitFor()
    assert.equal(await page.getByText('Elevador comum', { exact: true }).count(), 0)
    const sharedRow = page.getByRole('row').filter({ hasText: 'Esquadrias compartilhadas' })
    await sharedRow.getByRole('button', { name: '+ Área comum', exact: true }).click()
    await until(async () => (await pool.query('SELECT data FROM development WHERE id=$1', [id])).rows[0].data.checklist[2].scopes?.length === 2, 'shared classification saved')
    await page.getByRole('tab', { name: /Manual do Síndico/ }).click()
    await page.getByText('Elevador comum', { exact: true }).waitFor()
    assert.equal(await page.getByText('Piso privativo', { exact: true }).count(), 0)
    await page.getByText('Esquadrias compartilhadas', { exact: true }).waitFor()
    console.log('PASS unit/common filters and shared checklist classification')

    async function editSystem(manual, text, maintenance) {
      await page.getByRole('tab', { name: manual === 'proprietario' ? /Manual do Proprietário/ : /Manual do Síndico/ }).click()
      await page.getByRole('button', { name: /^Sistemas Construtivos/ }).click()
      await page.getByRole('button', { name: 'Esquadrias compartilhadas', exact: true }).click()
      await page.locator('.tiptap').fill(text)
      await page.getByRole('button', { name: 'Linha', exact: true }).click()
      await page.getByPlaceholder('Descrição da atividade').fill(maintenance)
      await page.getByPlaceholder('Ex.: Anual').fill('Anual')
    }
    await editSystem('proprietario', 'VIDRO_PRIVATIVO_ALUMINIO', 'LIMPEZA_PRIVATIVA')
    // Switch immediately to exercise the pending autosave flush.
    await page.getByRole('tab', { name: /Manual do Síndico/ }).click()
    await editSystem('sindico', 'PORTA_COMUM_CORTA_FOGO', 'INSPECAO_COMUM')
    const saved = async () => (await pool.query('SELECT data FROM development WHERE id=$1', [id])).rows[0].data
    await until(async () => {
      const d = await saved()
      return d.manuals?.proprietario?.sistemas?.['shared::unidade']?.includes('VIDRO_PRIVATIVO_ALUMINIO') && d.manuals?.sindico?.sistemas?.['shared::comum']?.includes('PORTA_COMUM_CORTA_FOGO') && d.manuals?.proprietario?.manutencao?.['shared::unidade']?.[0]?.task === 'LIMPEZA_PRIVATIVA' && d.manuals?.sindico?.manutencao?.['shared::comum']?.[0]?.task === 'INSPECAO_COMUM'
    }, 'independent systems and maintenance saved')
    await page.reload()
    await page.getByRole('tab', { name: /Manual do Síndico/ }).click()
    await page.getByRole('button', { name: /^Sistemas Construtivos/ }).click()
    await page.getByRole('button', { name: 'Esquadrias compartilhadas', exact: true }).click()
    await until(async () => (await page.locator('.tiptap').textContent()).includes('PORTA_COMUM_CORTA_FOGO'), 'common content after reload')
    assert.equal(await page.getByPlaceholder('Descrição da atividade').inputValue(), 'INSPECAO_COMUM')
    await page.getByRole('tab', { name: /Manual do Proprietário/ }).click()
    await page.getByRole('button', { name: 'Esquadrias compartilhadas', exact: true }).click()
    await until(async () => (await page.locator('.tiptap').textContent()).includes('VIDRO_PRIVATIVO_ALUMINIO'), 'unit content after reload')
    assert.equal(await page.getByPlaceholder('Descrição da atividade').inputValue(), 'LIMPEZA_PRIVATIVA')
    await page.screenshot({ path: path.join(output, 'proprietario.png'), fullPage: true })
    console.log('PASS description and maintenance isolated, immediate switching, reload persistence')

    await page.getByRole('button', { name: /^Checklist Inicial/ }).click()
    assert.equal(await page.getByRole('button', { name: 'Aprovar e congelar', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Histórico', exact: true }).click()
    await page.getByText('Histórico de alterações', { exact: true }).waitFor()
    console.log('PASS approval removed and central change history available')

    // Finishing table is a required section of the owner's manual.
    await pool.query('INSERT INTO finishing_table (id,"developmentId","organizationId",typology,"unitModel",area,data,"lastEditorId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [`finish-${suffix}`,id,organizationId,'Tipo A','101','70',{ambientes:[{id:'1',ambiente:'Sala',piso:'PISO_EXCLUSIVO_UNIDADE'}]},userId])
    // Server-side enforcement: neither the UI nor direct API calls may bypass pending items.
    const invalid = await saved()
    invalid.checklist[0].status = 'nao_especificado'
    await pool.query('UPDATE development SET data=$1 WHERE id=$2',[invalid,id])
    const blocked = await context.request.post(origin+'/api/manuals/validate',{data:{developmentId:id,manualType:'proprietario'}})
    assert.equal((await blocked.json()).ok,false)
    const rejected = await context.request.post(origin+'/api/manuals/compile',{data:{developmentId:id,manualType:'proprietario'}})
    assert.equal(rejected.status(),400)
    invalid.checklist[0].status = 'possui'
    await pool.query('UPDATE development SET data=$1 WHERE id=$2',[invalid,id])
    console.log('PASS incomplete checklist blocks direct PDF emission')

    for (const manual of ['proprietario', 'sindico']) {
      const validation = await context.request.post(`${origin}/api/manuals/validate`, { data: { developmentId: id, manualType: manual } })
      assert.equal(validation.status(), 200, await validation.text())
      assert.equal((await validation.json()).ok, true)
      const response = await context.request.post(`${origin}/api/manuals/compile`, { data: { developmentId: id, manualType: manual } })
      assert.equal(response.status(), 201, await response.text())
      const file = await response.json()
      const download = await context.request.get(`${origin}/api/manuals/file?pathname=${encodeURIComponent(file.pathname)}`)
      assert.equal(download.status(), 200)
      const pdfPath = path.join(output, `${manual}.pdf`)
      await fs.writeFile(pdfPath, await download.body())
      const text = execFileSync('pdftotext', [pdfPath,'-'], { encoding: 'utf8' })
      assert.ok(text.includes(manual === 'proprietario' ? 'VIDRO_PRIVATIVO_ALUMINIO' : 'PORTA_COMUM_CORTA_FOGO'))
      assert.ok(!text.includes(manual === 'proprietario' ? 'PORTA_COMUM_CORTA_FOGO' : 'VIDRO_PRIVATIVO_ALUMINIO'))
      assert.ok(text.includes(manual === 'proprietario' ? 'LIMPEZA_PRIVATIVA' : 'INSPECAO_COMUM'))
      assert.ok(!text.includes(manual === 'proprietario' ? 'Elevador comum' : 'Piso privativo'))
      if (manual === 'sindico') assert.ok(!text.includes('PISO_EXCLUSIVO_UNIDADE'))
      console.log(`PASS ${manual} PDF generation, authenticated download and content segregation`)
    }
    const unauthenticated = await browser.newContext()
    const anonymousResponse = await unauthenticated.request.get(`${origin}/empreendimentos/${id}`)
    assert.ok(anonymousResponse.url().includes('/sign-in') || anonymousResponse.status() >= 400, 'unauthenticated request must not expose the development')
    await unauthenticated.close()
    assert.deepEqual(errors, [])
    await page.screenshot({ path: path.join(output, 'sindico.png'), fullPage: true })
    console.log('PASS auth protection and no browser exceptions')
    console.log('MANUAL_SCOPE_E2E_PASS')
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
    console.error('PAGE:', await page.locator('body').innerText().catch(() => ''))
    throw error
  } finally { await context.close(); await browser.close(); await pool.end() }
})().catch((error) => { console.error(error); process.exitCode = 1 })
