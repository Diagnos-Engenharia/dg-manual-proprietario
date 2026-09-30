const assert=require('node:assert/strict')
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH||'playwright')
const {Pool}=require('pg')

const origin=process.env.TEST_BASE_URL||'http://localhost:3000'
const pool=new Pool({connectionString:process.env.DATABASE_URL})
const suffix=Date.now().toString(36)
const password='Validation!'+Date.now()

async function signup(context,email,name){
  const page=await context.newPage()
  await page.goto(origin+'/sign-up')
  await page.getByPlaceholder('Nome completo').fill(name)
  await page.getByPlaceholder('E-mail',{exact:true}).fill(email)
  await page.getByPlaceholder('Senha (mínimo 8 caracteres)').fill(password)
  await page.getByRole('button',{name:'Criar conta',exact:true}).click()
  let user=null
  for(let attempt=0;attempt<40;attempt++){
    user=(await pool.query('SELECT id FROM "user" WHERE email=$1',[email])).rows[0]??null
    if(user)break
    await new Promise(resolve=>setTimeout(resolve,250))
  }
  if(!user)throw new Error('Cadastro de teste não foi persistido: '+email)
  return {page,userId:user.id}
}

;(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
  const ownerContext=await browser.newContext()
  const editorContext=await browser.newContext()
  const validatorContext=await browser.newContext()
  try{
    const owner=await signup(ownerContext,'validation-owner-'+suffix+'@example.test','Administrador')
    await owner.page.goto(origin+'/onboarding')
    await owner.page.getByPlaceholder('Nome oficial da empresa').fill('Construtora validação '+suffix)
    await owner.page.getByRole('button',{name:'Salvar e acessar o Dashboard'}).click()
    await owner.page.waitForURL(origin+'/')
    const ownerMembership=(await pool.query('SELECT id,"organizationId" FROM member WHERE "userId"=$1',[owner.userId])).rows[0]
    const developmentId='validation-dev-'+suffix
    const data={
      ficha:{completionDate:'2027-01-01',towers:'1',apartments:'1',typologies:'1',areas:'70'},
      checklist:[{id:'radier',item:'Radier',category:'Sistema de Fundação',scope:'unidade',scopes:['unidade'],status:'possui',obsProprietario:'',obsSindico:'',norms:['NBR 6118'],maintenance:[]}],
      manuals:{proprietario:{sistemas:{},manutencao:{}},sindico:{sistemas:{},manutencao:{}}},
      schedule:[]
    }
    await pool.query('INSERT INTO development(id,"userId","organizationId",name,client,"deliveryDate",data) VALUES($1,$2,$3,$4,$5,$6,$7)',[developmentId,owner.userId,ownerMembership.organizationId,'Validação de sistemas','Construtora validação','2027-01-01',data])

    const editor=await signup(editorContext,'validation-editor-'+suffix+'@example.test','Editor')
    const editorMember='editor-member-'+suffix
    await pool.query('INSERT INTO member(id,"organizationId","userId",role,status) VALUES($1,$2,$3,$4,$5)',[editorMember,ownerMembership.organizationId,editor.userId,'editor','active'])
    await pool.query('INSERT INTO development_assignment(id,"organizationId","developmentId","memberId",role) VALUES($1,$2,$3,$4,$5)',['editor-grant-'+suffix,ownerMembership.organizationId,developmentId,editorMember,'editor'])

    const validator=await signup(validatorContext,'validation-validator-'+suffix+'@example.test','Validador')
    const validatorMember='validator-member-'+suffix
    await pool.query('INSERT INTO member(id,"organizationId","userId",role,status) VALUES($1,$2,$3,$4,$5)',[validatorMember,ownerMembership.organizationId,validator.userId,'validator','active'])
    await pool.query('INSERT INTO development_assignment(id,"organizationId","developmentId","memberId",role) VALUES($1,$2,$3,$4,$5)',['validator-grant-'+suffix,ownerMembership.organizationId,developmentId,validatorMember,'validator'])

    await editor.page.goto(origin+'/empreendimentos/'+developmentId+'?modulo=elaboracao')
    await editor.page.getByRole('button',{name:/^Sistemas Construtivos/}).click()
    await editor.page.getByRole('button',{name:'Radier',exact:true}).click()
    await editor.page.locator('.tiptap').fill('DESCRIÇÃO TÉCNICA PARA VALIDAR')
    await editor.page.getByRole('button',{name:'Linha',exact:true}).click()
    await editor.page.getByPlaceholder('Descrição da atividade').fill('INSPEÇÃO PREVENTIVA')
    const sendButtons=editor.page.getByRole('button',{name:'Mandar para validação',exact:true})
    await sendButtons.first().click()
    await editor.page.getByRole('button',{name:'Mandar para validação',exact:true}).first().click()

    const pending=await pool.query('SELECT section,status FROM development_content_validation WHERE "developmentId"=$1 ORDER BY section',[developmentId])
    assert.equal(pending.rowCount,2)
    assert.ok(pending.rows.every(row=>row.status==='aguardando_validacao'))

    await validator.page.goto(origin+'/empreendimentos/'+developmentId+'?modulo=elaboracao')
    await validator.page.getByRole('button',{name:/^Sistemas Construtivos/}).click()
    await validator.page.getByRole('button',{name:'Radier',exact:true}).click()
    assert.equal(await validator.page.getByRole('button',{name:'Mandar para validação',exact:true}).count(),0)
    assert.equal(await validator.page.getByRole('button',{name:'Validar',exact:true}).count(),2)
    await validator.page.getByRole('button',{name:'Validar',exact:true}).first().click()
    await validator.page.getByRole('button',{name:'Validar',exact:true}).first().click()

    const approved=await pool.query('SELECT section,status FROM development_content_validation WHERE "developmentId"=$1 ORDER BY section',[developmentId])
    assert.equal(approved.rowCount,2)
    assert.ok(approved.rows.every(row=>row.status==='aprovado'))
    await validator.page.getByLabel('Validado').waitFor()

    await validator.page.getByRole('button',{name:'Notificações'}).click()
    await validator.page.getByText('1 item enviado para validação',{exact:true}).first().waitFor()
    await validator.page.getByText(/Radier/).first().waitFor()
    console.log('PASS editor submission, validator notification and independent validation for description and maintenance')

    await editor.page.reload()
    await editor.page.getByRole('button',{name:'Notificações'}).click()
    await editor.page.getByText('Item validado',{exact:true}).first().waitFor()
    console.log('SYSTEM_VALIDATION_E2E_PASS')
  }finally{
    await ownerContext.close();await editorContext.close();await validatorContext.close();await browser.close();await pool.end()
  }
})().catch(error=>{console.error(error);process.exitCode=1})
