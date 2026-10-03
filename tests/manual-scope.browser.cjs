const assert=require('node:assert/strict')
const fs=require('node:fs/promises')
const path=require('node:path')
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH||'playwright')
const {Pool}=require('pg')
const {execFileSync}=require('node:child_process')

const origin=process.env.TEST_BASE_URL||'http://localhost:3000'
const pool=new Pool({connectionString:process.env.DATABASE_URL})
const suffix=Date.now()
const id='scope-test-'+suffix
const output=process.env.TEST_OUTPUT_DIR||'/tmp/dg-scope-evidence'
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(check,label){for(let i=0;i<70;i++){if(await check())return;await delay(250)}throw new Error('Timeout: '+label)}

;(async()=>{
  await fs.mkdir(output,{recursive:true})
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
  const context=await browser.newContext({viewport:{width:1440,height:1100}})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  try{
    await page.goto(origin+'/sign-up')
    await page.getByPlaceholder('Nome completo').fill('Auditoria da revisão')
    await page.getByPlaceholder('E-mail',{exact:true}).fill('scope-'+suffix+'@example.test')
    await page.getByPlaceholder('Senha (mínimo 8 caracteres)').fill('IsolatedScope!'+suffix)
    await page.getByRole('button',{name:'Criar conta',exact:true}).click()
    await page.waitForURL('**/onboarding')
    await page.getByPlaceholder('Nome oficial da empresa').fill('Construtora de validação isolada')
    await page.getByRole('button',{name:'Salvar e acessar o Dashboard'}).click()
    await page.waitForURL(origin+'/')
    const rows=await pool.query('SELECT u.id,m."organizationId" FROM "user" u JOIN member m ON m."userId"=u.id WHERE u.email=$1',['scope-'+suffix+'@example.test'])
    const {id:userId,organizationId}=rows.rows[0]
    const item=(id,name,scope)=>({id,item:name,category:'Sistemas de validação',scope,scopes:[scope],status:'possui',obsProprietario:'',obsSindico:'',norms:[],maintenance:[]})
    const data={
      ficha:{completionDate:'2027-01-01',towers:'1',apartments:'8',typologies:'1',areas:'70'},
      schedule:['Ficha Técnica do Empreendimento','Checklist Inicial','Manual do Proprietário','Manual do Síndico'].map((name,index)=>({id:'stage-'+(index+1),name,weight:25,originalDate:'2027-01-01',scheduledDate:'2027-01-01',status:'no_prazo',revisions:[]})),
      manuals:{proprietario:{sistemas:{'unit::unidade':'<p>PISO_PRIVATIVO_VALIDADO</p>'}},sindico:{sistemas:{'common::comum':'<p>ELEVADOR_COMUM_VALIDADO</p>'}}},
      checklist:[item('unit','Piso privativo','unidade'),item('common','Elevador comum','comum'),item('shared','Esquadrias compartilhadas','unidade')]
    }
    await pool.query('INSERT INTO development (id,"userId","organizationId",name,client,"deliveryDate",data) VALUES ($1,$2,$3,$4,$5,$6,$7)',[id,userId,organizationId,'Empreendimento de validação','Construtora de validação isolada','2027-01-01',data])

    await page.goto(origin+'/empreendimentos/'+id)
    await page.getByRole('button',{name:'Informações iniciais',exact:true}).waitFor()
    await page.getByRole('button',{name:'Ficha técnica',exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Design do Manual',exact:true}).count(),1)
    console.log('PASS initial information contains technical sheet, design and commissioning')

    await page.getByRole('button',{name:'Elaboração',exact:true}).click()
    assert.equal(await page.getByRole('button',{name:'Comissionamento',exact:true}).count(),1)
    await page.getByText('Piso privativo',{exact:true}).waitFor()
    assert.equal(await page.getByRole('tab',{name:/Manual do Proprietário/}).count(),0)
    assert.equal(await page.getByRole('tab',{name:/Manual do Síndico/}).count(),0)
    assert.equal(await page.getByText('Elevador comum',{exact:true}).count(),1)

    const sharedRow=page.getByRole('row').filter({hasText:'Esquadrias compartilhadas'})
    const unitTag=sharedRow.getByRole('button',{name:'Unidades privativas',exact:true})
    const commonTag=sharedRow.getByRole('button',{name:'Áreas comuns',exact:true})
    assert.equal(await unitTag.getAttribute('aria-pressed'),'true')
    assert.equal(await commonTag.getAttribute('aria-pressed'),'false')
    await commonTag.click()
    await sharedRow.getByText('Esquadrias compartilhadas',{exact:true}).waitFor()
    await until(async()=>{const d=(await pool.query('SELECT data FROM development WHERE id=$1',[id])).rows[0].data;return d.checklist[2].scopes?.length===2},'shared scope saved')
    assert.equal(await commonTag.getAttribute('aria-pressed'),'true')
    console.log('PASS scope tags toggle without removing checklist items')

    await page.getByRole('button',{name:/^Sistemas Construtivos/}).click()
    await until(async()=>await page.getByRole('button',{name:'Esquadrias compartilhadas',exact:true}).count()===2,'shared system in both groups')
    const sharedButtons=page.getByRole('button',{name:'Esquadrias compartilhadas',exact:true})
    await sharedButtons.nth(0).click()
    await page.locator('.tiptap').fill('VIDRO_PRIVATIVO_ALUMINIO')
    await page.getByRole('button',{name:'Linha',exact:true}).click()
    await page.getByPlaceholder('Descrição da atividade').fill('LIMPEZA_PRIVATIVA')
    await page.getByPlaceholder('Ex.: Anual').fill('Anual')

    await sharedButtons.nth(1).click()
    await page.locator('.tiptap').fill('PORTA_COMUM_CORTA_FOGO')
    await page.getByRole('button',{name:'Linha',exact:true}).click()
    await page.getByPlaceholder('Descrição da atividade').fill('INSPECAO_COMUM')
    await page.getByPlaceholder('Ex.: Anual').fill('Anual')

    const saved=async()=>(await pool.query('SELECT data FROM development WHERE id=$1',[id])).rows[0].data
    await until(async()=>{
      const d=await saved()
      return d.manuals?.proprietario?.sistemas?.['shared::unidade']?.includes('VIDRO_PRIVATIVO_ALUMINIO')&&
        d.manuals?.sindico?.sistemas?.['shared::comum']?.includes('PORTA_COMUM_CORTA_FOGO')&&
        d.manuals?.proprietario?.manutencao?.['shared::unidade']?.[0]?.task==='LIMPEZA_PRIVATIVA'&&
        d.manuals?.sindico?.manutencao?.['shared::comum']?.[0]?.task==='INSPECAO_COMUM'
    },'independent scoped system content saved')
    console.log('PASS unit/common system content remains independently persisted')

    await page.reload()
    await page.getByRole('button',{name:'Elaboração',exact:true}).click()
    await page.getByRole('button',{name:/^Sistemas Construtivos/}).click()
    const reloadedButtons=page.getByRole('button',{name:'Esquadrias compartilhadas',exact:true})
    await until(async()=>await reloadedButtons.count()===2,'shared buttons after reload')
    await reloadedButtons.nth(1).click()
    await until(async()=>(await page.locator('.tiptap').textContent()).includes('PORTA_COMUM_CORTA_FOGO'),'common content after reload')
    await reloadedButtons.nth(0).click()
    await until(async()=>(await page.locator('.tiptap').textContent()).includes('VIDRO_PRIVATIVO_ALUMINIO'),'unit content after reload')

    await page.getByRole('button',{name:'Histórico',exact:true}).click()
    await page.getByText('Histórico',{exact:true}).first().waitFor()
    assert.equal(await page.getByText(/\["comum","unidade"\]/).count(),0)
    console.log('PASS readable history without raw scope JSON')

    await pool.query('INSERT INTO finishing_table (id,"developmentId","organizationId",typology,"unitModel",area,data,"lastEditorId",status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',['finish-'+suffix,id,organizationId,'Tipo A','101','70',{ambientes:[{id:'1',ambiente:'Sala',piso:'PISO_EXCLUSIVO_UNIDADE'}]},userId,'aprovado'])
    // This test verifies scope persistence and PDF segregation. The independent
    // validation workflow has its own browser test; seed approved scoped records
    // here so official issuance respects the strengthened publication contract.
    for(const contextKey of ['unit::unidade','common::comum','shared::unidade','shared::comum']){
      for(const section of ['sistemas','manutencao'])await pool.query('INSERT INTO development_content_validation (id,"developmentId","organizationId","contextKey",section,status,"lastEditorId") VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("developmentId","contextKey",section) DO UPDATE SET status=EXCLUDED.status',['approval-'+suffix+'-'+contextKey+'-'+section,id,organizationId,contextKey,section,'aprovado',userId])
    }
    const invalid=await saved();invalid.checklist[0].status='nao_especificado';await pool.query('UPDATE development SET data=$1 WHERE id=$2',[invalid,id])
    const blocked=await context.request.post(origin+'/api/manuals/validate',{data:{developmentId:id,manualType:'proprietario'}})
    assert.equal((await blocked.json()).ok,false)
    invalid.checklist[0].status='possui';await pool.query('UPDATE development SET data=$1 WHERE id=$2',[invalid,id])

    for(const manual of ['proprietario','sindico']){
      const validation=await context.request.post(origin+'/api/manuals/validate',{data:{developmentId:id,manualType:manual}})
      assert.equal(validation.status(),200,await validation.text())
      assert.equal((await validation.json()).ok,true)
      const response=await context.request.post(origin+'/api/manuals/compile',{data:{developmentId:id,manualType:manual}})
      assert.equal(response.status(),201,await response.text())
      const file=await response.json()
      const download=await context.request.get(origin+'/api/manuals/file?id='+encodeURIComponent(file.id))
      assert.equal(download.status(),200)
      const pdfPath=path.join(output,manual+'.pdf');await fs.writeFile(pdfPath,await download.body())
      const text=execFileSync('pdftotext',[pdfPath,'-'],{encoding:'utf8'})
      assert.ok(text.includes(manual==='proprietario'?'VIDRO_PRIVATIVO_ALUMINIO':'PORTA_COMUM_CORTA_FOGO'))
      assert.ok(!text.includes(manual==='proprietario'?'PORTA_COMUM_CORTA_FOGO':'VIDRO_PRIVATIVO_ALUMINIO'))
      assert.ok(text.includes(manual==='proprietario'?'LIMPEZA_PRIVATIVA':'INSPECAO_COMUM'))
      assert.ok(!text.includes(manual==='proprietario'?'Elevador comum':'Piso privativo'))
      if(manual==='sindico')assert.ok(!text.includes('PISO_EXCLUSIVO_UNIDADE'))
      console.log('PASS '+manual+' PDF segregation')
    }
    assert.deepEqual(errors,[])
    await page.screenshot({path:path.join(output,'revised-authoring.png'),fullPage:true})
    console.log('MANUAL_SCOPE_E2E_PASS')
  }catch(error){
    await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{})
    console.error('PAGE:',await page.locator('body').innerText().catch(()=>''))
    throw error
  }finally{await context.close();await browser.close();await pool.end()}
})().catch(error=>{console.error(error);process.exitCode=1})
