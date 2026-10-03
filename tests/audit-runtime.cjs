/* Failure injection against an explicitly isolated PostgreSQL database. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { randomUUID } = require('node:crypto')
const { eq, like, sql } = require('drizzle-orm')
const root = path.resolve(__dirname, '..')
const prefix = 'audit_test_' + randomUUID().replaceAll('-', '').slice(0,12)
const cache = new Map()
let currentUser, database, schema
const mocks = {
  'server-only': {}, 'next/cache': { revalidatePath() {} },
  'next/headers': { headers: async () => new Headers() },
  '@/lib/auth': { auth: { api: { getSession: async () => currentUser ? { user: currentUser } : null } } },
}
function load(relative) {
  const filename=path.resolve(root,relative)
  if(cache.has(filename))return cache.get(filename).exports
  const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  const module={exports:{}};cache.set(filename,module)
  const localRequire=name=>{
    if(Object.hasOwn(mocks,name))return mocks[name]
    if(name.startsWith('@/')||name.startsWith('.')){
      const target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(filename),name)
      const selected=[target+'.ts',path.join(target,'index.ts')].find(file=>fs.existsSync(file))
      if(selected)return load(path.relative(root,selected))
    }
    return require(name)
  }
  new Function('require','module','exports','__filename','__dirname',output)(localRequire,module,module.exports,filename,path.dirname(filename))
  return module.exports
}
const id=name=>prefix+'_'+name
async function one(table,key){return (await database.db.select().from(table).where(eq(table.id,key)).limit(1))[0]}
async function rejectAudit(enabled){
  await database.db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${prefix} ON audit_log`))
  if(enabled){
    await database.db.execute(sql.raw(`CREATE OR REPLACE FUNCTION ${prefix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."actorId" LIKE '${prefix}%' THEN RAISE EXCEPTION 'isolated audit failure'; END IF; RETURN NEW; END $$`))
    await database.db.execute(sql.raw(`CREATE TRIGGER ${prefix} BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION ${prefix}()`))
  }
}
async function main(){
  const target=new URL(process.env.DG_TEST_DATABASE_URL||'')
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname)&&/(test|review)/i.test(target.pathname),'Only a local test/review database is allowed')
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,'Hosted databases are forbidden')
  process.env.DATABASE_URL=target.href
  process.env.BETTER_AUTH_SECRET='audit-runtime-isolated-secret-only-2026'
  database=load('lib/db/index.ts');schema=load('lib/db/schema.ts')
  assert.equal((await database.db.select().from(schema.platformIntegrations)).length,0,'Platform integration tests require an empty isolated fixture table')
  await database.db.insert(schema.user).values([{id:id('admin'),name:'Audit admin',email:id('admin')+'@example.test'},{id:id('editor'),name:'Audit editor',email:id('editor')+'@example.test'}])
  await database.db.insert(schema.organizations).values({id:id('org'),name:'Audit fixture',slug:id('org')})
  await database.db.insert(schema.members).values({id:id('member'),organizationId:id('org'),userId:id('admin'),role:'admin'})
  await database.db.update(schema.user).set({activeOrganizationId:id('org')}).where(eq(schema.user.id,id('admin')))
  await database.db.insert(schema.developments).values({id:id('dev'),organizationId:id('org'),userId:id('editor'),lastEditorId:id('editor'),name:'Audit development',client:'Fixture',deliveryDate:'2026-12-01'})
  currentUser=await one(schema.user,id('admin'))
  const validation=load('app/actions/validation.ts')
  const developmentActions=load('app/actions/developments.ts')
  const integrations=load('app/actions/integrations.ts')
  const platform=load('app/actions/platform-integrations.ts')
  await integrations.saveIntegration({provider:'openai',apiKey:'fake-local-integration-key'})
  const integration=(await database.db.select().from(schema.organizationIntegrations).where(eq(schema.organizationIntegrations.organizationId,id('org'))))[0]
  const before=await one(schema.developments,id('dev'))
  await rejectAudit(true)
  await assert.rejects(validation.approveDevelopment(id('dev')))
  assert.equal((await one(schema.developments,id('dev'))).workflowStatus,before.workflowStatus)
  assert.equal((await database.db.select().from(schema.developmentReviews).where(eq(schema.developmentReviews.developmentId,id('dev')))).length,0)
  console.log('PASS validation and review roll back when audit insert fails')
  await assert.rejects(developmentActions.updateDevelopmentData(id('dev'),{manuals:{proprietario:{sistemas:{fixture:'<p>Alteração de teste</p>'}}}}))
  const unchanged=await one(schema.developments,id('dev'))
  assert.deepEqual(unchanged.data,before.data);assert.equal(unchanged.version,before.version)
  console.log('PASS generic content mutation rolls back data/version when audit fails')
  await assert.rejects(integrations.saveIntegration({provider:'openai',apiKey:'replacement-local-key'}))
  assert.equal((await one(schema.organizationIntegrations,integration.id)).encryptedKey,integration.encryptedKey)
  await assert.rejects(integrations.deleteIntegration('openai'))
  assert.ok(await one(schema.organizationIntegrations,integration.id))
  console.log('PASS integration update and deletion roll back when audit fails')
  await database.db.update(schema.user).set({platformRole:'manager'}).where(eq(schema.user.id,id('admin')))
  currentUser=await one(schema.user,id('admin'))
  assert.equal((await platform.savePlatformAiIntegration({apiKey:'fake-platform-key',model:'fixture-model'})).ok,false)
  assert.equal((await database.db.select().from(schema.platformIntegrations)).length,0)
  await rejectAudit(false)
  assert.equal((await platform.savePlatformAiIntegration({apiKey:'fake-platform-key',model:'fixture-model'})).ok,true)
  const configuration=(await database.db.select().from(schema.platformIntegrations))[0]
  await rejectAudit(true)
  assert.equal((await platform.removePlatformAiIntegration()).ok,false)
  assert.ok(await one(schema.platformIntegrations,configuration.id))
  console.log('PASS platform save/removal roll back when audit fails')
  await rejectAudit(false)
  await validation.approveDevelopment(id('dev'))
  assert.equal((await one(schema.developments,id('dev'))).workflowStatus,'aprovado')
  assert.equal((await database.db.select().from(schema.developmentReviews).where(eq(schema.developmentReviews.developmentId,id('dev')))).length,1)
  const audits=await database.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.actorId,id('admin')))
  assert.equal(audits.filter(row=>row.action==='development.aprovado').length,1)
  assert.equal(audits.find(row=>row.action==='platform_ai.configured').entityId,configuration.id)
  assert.equal(JSON.stringify(audits).includes('fake-platform-key'),false)
  console.log('PASS successful transition persists one matching audit without secret')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
  if(!database||!schema)return
  await rejectAudit(false)
  await database.db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${prefix}()`))
  for(const table of [schema.developmentReviews,schema.auditLogs,schema.organizationIntegrations,schema.developments,schema.members])await database.db.delete(table).where(eq(table.organizationId,id('org')))
  await database.db.delete(schema.auditLogs).where(eq(schema.auditLogs.actorId,id('admin')))
  await database.db.delete(schema.platformIntegrations).where(eq(schema.platformIntegrations.updatedBy,id('admin')))
  await database.db.delete(schema.organizations).where(eq(schema.organizations.id,id('org')))
  await database.db.delete(schema.rateLimits).where(like(schema.rateLimits.key,'%'+prefix+'%'))
  await database.db.delete(schema.user).where(like(schema.user.id,prefix+'%'))
  await database.pool.end()
})
