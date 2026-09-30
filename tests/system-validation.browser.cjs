const assert=require('node:assert/strict')
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH||'playwright')
const {Pool}=require('pg')

const origin=process.env.TEST_BASE_URL||'http://localhost:3000'
const pool=new Pool({connectionString:process.env.DATABASE_URL})
const suffix=Date.now().toString(36)
const password='Validation!'+Date.now()

;(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
  const context=await browser.newContext()
  const page=await context.newPage()
  const validatorContext=await browser.newContext()
  const validatorPage=await validatorContext.newPage()
  try{
    await page.goto(origin+'/sign-up')
    const email='validation-owner-'+suffix+'@example.test'
    await page.getByPlaceholder('Nome completo').fill('Administrador de validação')
    await page.getByPlaceholder('E-mail',{exact:true}).fill(email)
    await page.getByPlaceholder('Senha (mínimo 8 caracteres)').fill(password)
    await page.getByRole('button',{name:'Criar conta',exact:true}).click()
    await page.waitForURL('**/onboarding')
    const user=(await pool.query('SELECT id FROM "user" WHERE email=$1',[email])).rows[0]
    await page.getByPlaceholder('Nome oficial da empresa').fill('Construtora validação '+suffix)
    await page.getByRole('button',{name:'Salvar e acessar o Dashboard'}).click()
    await page.waitForURL(origin+'/')
    const membership=(await pool.query('SELECT id,"organizationId" FROM member WHERE "userId"=$1',[user.id])).rows[0]

    const developmentId='validation-dev-'+suffix
    const data={
      ficha:{completionDate:'2027-01-01',towers:'1',apartments:'1',typologies:'1',areas:'70'},
      checklist:[{id:'radier',item:'Radier',category:'Sistema de Fundação',scope:'unidade',scopes:['unidade'],status:'possui',obsProprietario:'',obsSindico:'',norms:['NBR 6118'],maintenance:[]}],
      manuals:{proprietario:{sistemas:{},manutencao:{}},sindico:{sistemas:{},manutencao:{}}},
      schedule:[]
    }
    await pool.query('INSERT INTO development(id,"userId","organizationId",name,client,"deliveryDate",data) VALUES($1,$2,$3,$4,$5,$6,$7)',[developmentId,user.id,membership.organizationId,'Validação de sistemas','Construtora validação','2027-01-01',data])
    const validatorRegistration=await validatorContext.request.post(origin+'/api/auth/sign-up/email',{data:{name:'Validador independente',email:'validator-'+suffix+'@example.test',password}})
    assert.equal(validatorRegistration.status(),200)
    const validatorUser=(await validatorRegistration.json()).user
    const validatorMember='validator-member-'+suffix
    await pool.query('INSERT INTO member(id,"organizationId","userId",role,status) VALUES($1,$2,$3,$4,$5)',[validatorMember,membership.organizationId,validatorUser.id,'validator','active'])
    await pool.query('INSERT INTO development_assignment(id,"organizationId","developmentId","memberId",role) VALUES($1,$2,$3,$4,$5)',['validator-grant-'+suffix,membership.organizationId,developmentId,validatorMember,'validator'])

    await page.goto(origin+'/empreendimentos/'+developmentId+'?modulo=elaboracao')
    await page.getByRole('button',{name:/^Sistemas Construtivos/}).click()
    await page.getByRole('button',{name:'Radier',exact:true}).click()
    await page.locator('.tiptap').fill('DESCRIÇÃO TÉCNICA PARA VALIDAR')
    await page.getByRole('button',{name:'Linha',exact:true}).click()
    await page.getByPlaceholder('Descrição da atividade').fill('INSPEÇÃO PREVENTIVA')

    const sendButtons=page.getByRole('button',{name:'Mandar para validação',exact:true})
    await sendButtons.first().click()
    await page.getByRole('button',{name:'Mandar para validação',exact:true}).first().click()

    const pending=await pool.query('SELECT section,status FROM development_content_validation WHERE "developmentId"=$1 ORDER BY section',[developmentId])
    assert.equal(pending.rowCount,2)
    assert.ok(pending.rows.every(row=>row.status==='aguardando_validacao'))

    const stored=(await pool.query('SELECT data FROM development WHERE id=$1',[developmentId])).rows[0].data
    assert.ok(stored.manuals.proprietario.sistemas['radier::unidade'].includes('DESCRIÇÃO TÉCNICA PARA VALIDAR'))
    assert.equal(stored.manuals.proprietario.manutencao['radier::unidade'][0].task,'INSPEÇÃO PREVENTIVA')
    await page.getByRole('button',{name:'Validar',exact:true}).first().click()
    await page.getByText(/Quem enviou o conteúdo não pode aprovar/).waitFor()
    assert.ok((await pool.query('SELECT status FROM development_content_validation WHERE "developmentId"=$1',[developmentId])).rows.every(row=>row.status==='aguardando_validacao'))

    await validatorPage.goto(origin+'/empreendimentos/'+developmentId+'?modulo=elaboracao')
    await validatorPage.getByRole('button',{name:'Notificações'}).click()
    await validatorPage.getByText('1 item enviado para validação',{exact:true}).first().waitFor()
    await validatorPage.getByRole('button',{name:'Notificações'}).click()
    await validatorPage.getByRole('button',{name:/^Sistemas Construtivos/}).click()
    await validatorPage.getByRole('button',{name:'Radier',exact:true}).click()
    assert.equal(await validatorPage.locator('.tiptap').getAttribute('contenteditable'),'false')
    assert.equal(await validatorPage.getByRole('button',{name:'Mandar para validação',exact:true}).count(),0)
    await validatorPage.getByRole('button',{name:'Validar',exact:true}).first().click()
    await validatorPage.getByRole('button',{name:'Validar',exact:true}).first().click()

    const approved=await pool.query('SELECT section,status FROM development_content_validation WHERE "developmentId"=$1 ORDER BY section',[developmentId])
    assert.equal(approved.rowCount,2)
    assert.ok(approved.rows.every(row=>row.status==='aprovado'))
    await validatorPage.getByLabel('Validado').waitFor()
    console.log('PASS item submission, validator notification and independent validation for description and maintenance')
    console.log('SYSTEM_VALIDATION_E2E_PASS')
  }finally{
    await validatorContext.close();await context.close();await browser.close();await pool.end()
  }
})().catch(error=>{console.error(error);process.exitCode=1})
