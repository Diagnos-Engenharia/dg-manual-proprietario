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
    await pool.query('INSERT INTO development_assignment(id,"organizationId","developmentId","memberId",role) VALUES($1,$2,$3,$4,$5)',['validator-grant-'+suffix,membership.organizationId,developmentId,membership.id,'validator'])

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

    await page.getByRole('button',{name:'Notificações'}).click()
    await page.getByText('1 item enviado para validação',{exact:true}).first().waitFor()
    await page.getByText(/Radier/).first().waitFor()
    await page.getByRole('button',{name:'Notificações'}).click()

    const validateButtons=page.getByRole('button',{name:'Validar',exact:true})
    await validateButtons.first().click()
    await page.getByRole('button',{name:'Validar',exact:true}).first().click()

    const approved=await pool.query('SELECT section,status FROM development_content_validation WHERE "developmentId"=$1 ORDER BY section',[developmentId])
    assert.equal(approved.rowCount,2)
    assert.ok(approved.rows.every(row=>row.status==='aprovado'))
    await page.getByLabel('Validado').waitFor()
    console.log('PASS item submission, validator notification and independent validation for description and maintenance')
    console.log('SYSTEM_VALIDATION_E2E_PASS')
  }finally{
    await context.close();await browser.close();await pool.end()
  }
})().catch(error=>{console.error(error);process.exitCode=1})
