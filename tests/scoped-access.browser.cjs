const assert=require("node:assert/strict")
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH||"playwright")
const {Pool}=require("pg")
const origin=process.env.TEST_BASE_URL||"http://localhost:3000"
const suffix=Date.now().toString(36)+Math.random().toString(36).slice(2,6)
const pool=new Pool({connectionString:process.env.DATABASE_URL})
const password="ScopedAccess!"+Date.now()
async function register(page,email,name){
  await page.goto(origin+"/sign-up")
  await page.getByPlaceholder("Nome completo").fill(name)
  await page.getByPlaceholder("E-mail",{exact:true}).fill(email)
  await page.getByPlaceholder("Senha (mínimo 8 caracteres)").fill(password)
  await page.getByRole("button",{name:"Criar conta",exact:true}).click()
  await page.waitForURL("**/onboarding")
  const rows=await pool.query('SELECT id FROM "user" WHERE email=$1',[email])
  return rows.rows[0].id
}
;(async()=>{
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"]})
  const owner=await browser.newContext(),ownerPage=await owner.newPage()
  const scoped=await browser.newContext(),scopedPage=await scoped.newPage()
  try {
    const ownerId=await register(ownerPage,"scope-owner-"+suffix+"@example.test","Administrador de testes")
    await ownerPage.getByPlaceholder("Nome oficial da empresa").fill("Construtora teste de isolamento")
    await ownerPage.getByRole("button",{name:"Salvar e acessar o Dashboard"}).click()
    await ownerPage.waitForURL(origin+"/")
    const orgId=(await pool.query('SELECT "organizationId" FROM member WHERE "userId"=$1',[ownerId])).rows[0].organizationId
    const allowedId="accessible-"+suffix,blockedId="restricted-"+suffix
    const allowedName="PROJETO_PERMITIDO_"+suffix,blockedName="PROJETO_SIGILOSO_"+suffix
    for(const [id,name] of [[allowedId,allowedName],[blockedId,blockedName]]){
      await pool.query('INSERT INTO development(id,"userId","organizationId",name,client,"deliveryDate",data) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,ownerId,orgId,name,"Construtora teste de isolamento","2027-10-01",{checklist:[],schedule:[],ficha:{towers:"1",apartments:"8",typologies:"1",areas:"70",completionDate:"2027-10-01"}}])
    }
    const memberId=await register(scopedPage,"scope-editor-"+suffix+"@example.test","Editor restrito")
    const assignmentId="assignment-"+suffix
    await pool.query('INSERT INTO member(id,"organizationId","userId",role,status) VALUES($1,$2,$3,$4,$5)',[assignmentId,orgId,memberId,"editor","active"])
    await pool.query('INSERT INTO development_assignment(id,"organizationId","developmentId","memberId",role) VALUES($1,$2,$3,$4,$5)',["grant-"+suffix,orgId,allowedId,assignmentId,"editor"])
    await scopedPage.goto(origin+"/")
    await scopedPage.getByText(allowedName,{exact:true}).first().waitFor()
    assert.equal(await scopedPage.getByText(blockedName,{exact:true}).count(),0,"other project must not appear in dashboard")
    await scopedPage.goto(origin+"/empreendimentos")
    await scopedPage.getByText(allowedName,{exact:true}).first().waitFor()
    assert.equal(await scopedPage.getByText(blockedName,{exact:true}).count(),0,"other project must not appear in project listing")
    const forbiddenPage=await scopedPage.goto(origin+"/empreendimentos/"+blockedId)
    assert.ok(forbiddenPage.status()>=400,"direct project route should be forbidden")
    assert.ok(!(await scopedPage.locator("body").innerText()).includes(blockedName),"forbidden detail must not disclose project name")
    const forbiddenVersions=await scoped.request.get(origin+"/api/manuals/versions?developmentId="+blockedId+"&manualType=proprietario")
    assert.ok(forbiddenVersions.status()>=400,"PDF version listing should reject unauthorized project")
    const forbiddenValidation=await scoped.request.post(origin+"/api/manuals/validate",{data:{developmentId:blockedId,manualType:"proprietario"}})
    assert.ok(forbiddenValidation.status()>=400,"PDF validation should reject unauthorized project")
    const forbiddenCompile=await scoped.request.post(origin+"/api/manuals/compile",{data:{developmentId:blockedId,manualType:"proprietario"}})
    assert.ok(forbiddenCompile.status()>=400,"PDF compiler should reject unauthorized project")
    const settings=await scopedPage.goto(origin+"/configuracoes")
    assert.ok(!settings.url().includes("/configuracoes"),"builder-wide settings should be restricted")
    await scopedPage.goto(origin+"/empreendimentos/"+allowedId)
    await scopedPage.getByText(allowedName,{exact:true}).first().waitFor()
    console.log("PASS scoped user sees only assigned project; direct routes and PDF endpoints reject others")
    await pool.query('DELETE FROM development_assignment WHERE "memberId"=$1 AND "developmentId"=$2',[assignmentId,allowedId])
    await scopedPage.goto(origin+"/empreendimentos")
    assert.equal(await scopedPage.getByText(allowedName,{exact:true}).count(),0,"revoked project must vanish immediately")
    const revoked=await scoped.request.get(origin+"/empreendimentos/"+allowedId)
    assert.ok(revoked.status()>=400,"revoked user must lose direct access")
    console.log("PASS access revocation is immediate")
    console.log("SCOPED_ACCESS_E2E_PASS")
  }finally{await scoped.close();await owner.close();await browser.close();await pool.end()}
})().catch(e=>{console.error(e);process.exitCode=1})
