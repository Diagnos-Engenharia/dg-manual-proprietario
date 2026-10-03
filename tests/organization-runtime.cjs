/* Real Drizzle/PostgreSQL actions on an explicitly isolated local database.
 * Only Next's request/session/cache context is substituted. No production data.
 */
const assert=require("node:assert/strict")
const fs=require("node:fs")
const path=require("node:path")
const ts=require("typescript")
const {createHash,randomUUID}=require("node:crypto")
const {and,eq,inArray,like,sql}=require("drizzle-orm")
const root=path.resolve(__dirname,"..")
const prefix="organization_test_"+randomUUID().replaceAll("-","").slice(0,12)
const id=name=>prefix+"_"+name
const email=name=>id(name)+"@example.test"
const hash=value=>createHash("sha256").update(value).digest("hex")
const cache=new Map()
let currentUser,database,schema,failures=0
const mocks={
  "server-only":{},"next/cache":{revalidatePath(){}},
  "next/headers":{headers:async()=>new Headers()},
  "@/lib/auth":{auth:{api:{getSession:async()=>currentUser?{user:currentUser}:null}}},
}
function load(relative){
  const filename=path.resolve(root,relative)
  if(cache.has(filename))return cache.get(filename).exports
  const output=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  const module={exports:{}};cache.set(filename,module)
  const localRequire=name=>{
    if(Object.hasOwn(mocks,name))return mocks[name]
    if(name.startsWith("@/")||name.startsWith(".")){
      const target=name.startsWith("@/")?path.join(root,name.slice(2)):path.resolve(path.dirname(filename),name)
      const selected=[target+".ts",path.join(target,"index.ts")].find(file=>fs.existsSync(file))
      if(selected)return load(path.relative(root,selected))
    }
    return require(name)
  }
  new Function("require","module","exports","__filename","__dirname",output)(localRequire,module,module.exports,filename,path.dirname(filename))
  return module.exports
}
async function one(table,key){return(await database.db.select().from(table).where(eq(table.id,key)).limit(1))[0]}
async function login(name){currentUser=await one(schema.user,id(name))}
async function check(name,fn){try{await fn();console.log("PASS",name)}catch(error){failures++;console.error("FAIL",name,error.message)}}
const pgCode=code=>error=>error.code===code||error.cause?.code===code
async function auditFailure(action,fn){
  assert.match(action,/^[a-z_.]+$/)
  await database.db.execute(sql.raw(`CREATE OR REPLACE FUNCTION ${prefix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."actorId" LIKE '${prefix}%' AND NEW.action='${action}' THEN RAISE EXCEPTION 'isolated audit rejection'; END IF; RETURN NEW; END $$`))
  await database.db.execute(sql.raw(`CREATE TRIGGER ${prefix} BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION ${prefix}()`))
  try{return await fn()}finally{await database.db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${prefix} ON audit_log`))}
}
async function fixture(){
  const {db}=database
  for(const name of ["manager","adminA","spareA","adminB","editor","multi","invitee","newperson"]){
    await db.insert(schema.user).values({id:id(name),name,email:email(name),emailVerified:true,platformRole:name==="manager"?"manager":null})
  }
  for(const name of ["orgA","orgB",...Array.from({length:11},(_,i)=>"empty"+String(i).padStart(2,"0"))]){
    await db.insert(schema.organizations).values({id:id(name),name:id(name),slug:id(name)})
  }
  for(const [name,org,role] of [["adminA","orgA","admin"],["spareA","orgA","admin"],["adminB","orgB","admin"],["editor","orgA","editor"],["multiA","orgA","editor"],["multiB","orgB","editor"]]){
    await db.insert(schema.members).values({id:id(name+"_member"),userId:id(name.startsWith("multi")?"multi":name),organizationId:id(org),role})
    if(!name.startsWith("multi"))await db.update(schema.user).set({activeOrganizationId:id(org)}).where(eq(schema.user.id,id(name)))
  }
  for(const org of ["A","B"]){
    await db.insert(schema.developments).values({id:id("dev"+org),organizationId:id("org"+org),userId:id("admin"+org),name:"Development "+org,client:"Fixture",deliveryDate:"2027-01-01"})
  }
  await db.insert(schema.developmentAssignments).values({id:id("editor_grant"),organizationId:id("orgA"),developmentId:id("devA"),memberId:id("editor_member"),role:"editor"})
  await db.insert(schema.session).values({id:id("editor_session"),userId:id("editor"),token:id("editor_token"),expiresAt:new Date(Date.now()+86400000)})
}
async function cleanup(){
  if(!database)return
  await database.db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${prefix} ON audit_log`))
  await database.db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${prefix}()`))
  for(const table of [schema.organizationInvitations,schema.auditLogs,schema.developmentAssignments,schema.developmentUnits,schema.developments,schema.members]){
    await database.db.delete(table).where(like(table.organizationId,prefix+"%"))
  }
  await database.db.delete(schema.organizations).where(like(schema.organizations.name,prefix+"%"))
  await database.db.delete(schema.session).where(like(schema.session.userId,prefix+"%"))
  await database.db.delete(schema.user).where(like(schema.user.id,prefix+"%"))
  await database.db.delete(schema.rateLimits).where(like(schema.rateLimits.key,"%"+prefix+"%"))
  await database.pool.end()
}
async function main(){
  const target=new URL(process.env.DG_TEST_DATABASE_URL||"")
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(target.hostname)&&/(test|review)/i.test(target.pathname),"Only an isolated local test/review database is allowed")
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,"Hosted databases are forbidden")
  process.env.DATABASE_URL=target.href
  database=load("lib/db/index.ts");schema=load("lib/db/schema.ts")
  await fixture()
  const organization=load("lib/organization.ts")
  const actions=load("app/actions/organization.ts")
  const manager=load("app/actions/manager.ts")
  await check("RF001 explicit tenant choice rejects ambiguity, foreign tenant and suspended access",async()=>{
    await login("multi")
    assert.equal((await organization.getOrganizationChoices()).activeOrganizationId,null)
    await assert.rejects(organization.requireActiveMembership(),/Selecione a construtora/)
    await assert.rejects(organization.setActiveOrganization(id("empty00")),/não possui acesso ativo/)
    await organization.setActiveOrganization(id("orgA"))
    assert.equal((await organization.requireActiveMembership()).organization.id,id("orgA"))
    const response=await load("app/api/organization/context/route.ts").GET()
    assert.equal((await response.json()).canSwitchOrganization,true)
    await organization.setActiveOrganization(id("orgB"))
    assert.equal((await organization.requireActiveMembership()).organization.id,id("orgB"))
    await database.db.update(schema.members).set({status:"suspended"}).where(eq(schema.members.id,id("multiA_member")))
    await assert.rejects(organization.setActiveOrganization(id("orgA")),/não possui acesso ativo/)
  })
  await check("RF010 fresh access makes zero UPDATE queries; stale concurrent access refreshes once",async()=>{
    await login("adminA")
    await organization.requireActiveMembership()
    const before=(await one(schema.members,id("adminA_member"))).lastAccessAt.getTime()
    const original=database.pool.query
    const queries=[]
    database.pool.query=function(...args){queries.push(typeof args[0]==="string"?args[0]:args[0]?.text??"");return original.apply(this,args)}
    try{await organization.requireActiveMembership();await organization.requireActiveMembership()}finally{database.pool.query=original}
    assert.equal(queries.filter(query=>/^update\s+"member"/i.test(query)).length,0)
    assert.equal((await one(schema.members,id("adminA_member"))).lastAccessAt.getTime(),before)
    await database.db.update(schema.members).set({lastAccessAt:new Date(Date.now()-3600000)}).where(eq(schema.members.id,id("adminA_member")))
    await database.db.execute(sql.raw(`CREATE TABLE ${prefix}_access_counter (updates integer NOT NULL); INSERT INTO ${prefix}_access_counter VALUES(0)`))
    await database.db.execute(sql.raw(`CREATE FUNCTION ${prefix}_access() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${id("adminA_member")}' THEN UPDATE ${prefix}_access_counter SET updates=updates+1; END IF; RETURN NEW; END $$`))
    await database.db.execute(sql.raw(`CREATE TRIGGER ${prefix}_access BEFORE UPDATE OF "lastAccessAt" ON member FOR EACH ROW EXECUTE FUNCTION ${prefix}_access()`))
    try{
      await Promise.all([organization.requireActiveMembership(),organization.requireActiveMembership()])
      assert.ok((await one(schema.members,id("adminA_member"))).lastAccessAt.getTime()>before-1000)
      assert.equal((await database.pool.query(`SELECT updates FROM ${prefix}_access_counter`)).rows[0].updates,1)
    }finally{
      await database.db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${prefix}_access ON member; DROP FUNCTION IF EXISTS ${prefix}_access(); DROP TABLE IF EXISTS ${prefix}_access_counter`))
    }
  })
  await check("RF002 concurrent staff invites create one membership and DB rejects duplicates",async()=>{
    const tokens=[randomUUID(),randomUUID()]
    await database.db.insert(schema.organizationInvitations).values(tokens.map((token,index)=>({id:id("staff_invite"+index),organizationId:id("orgA"),email:email("invitee"),name:"Invitee",role:"admin",tokenHash:hash(token),developmentIds:[],invitedBy:id("adminA"),expiresAt:new Date(Date.now()+86400000)})))
    await login("invitee")
    assert.equal((await Promise.allSettled(tokens.map(token=>actions.acceptOrganizationInvitation(token)))).filter(result=>result.status==="fulfilled").length,2)
    const rows=await database.db.select().from(schema.members).where(and(eq(schema.members.organizationId,id("orgA")),eq(schema.members.userId,id("invitee"))))
    assert.equal(rows.length,1)
    await assert.rejects(database.db.insert(schema.members).values({id:id("duplicate"),organizationId:id("orgA"),userId:id("invitee"),role:"editor"}),pgCode("23505"))
  })
  await check("RF008 composed FK rejects a unit for a development from another tenant",async()=>{
    await assert.rejects(database.db.insert(schema.developmentUnits).values({id:id("foreign_unit"),organizationId:id("orgB"),developmentId:id("devA"),number:"1",typology:"T",lastEditorId:id("adminB")}),pgCode("23503"))
  })
  await check("RF012 pagination/search runs in DB and returns only scoped company relationships",async()=>{
    await login("manager")
    const first=await manager.listManagedOrganizations({search:prefix,page:1,pageSize:5})
    const second=await manager.listManagedOrganizations({search:prefix,page:2,pageSize:5})
    assert.equal(first.pagination.total,13);assert.equal(first.pagination.totalPages,3)
    assert.equal(first.companies.length,5);assert.equal(second.companies.length,5)
    assert.ok(first.companies.every(company=>!second.companies.some(next=>company.id===next.id)))
    const byMember=await manager.listManagedOrganizations({search:email("editor"),page:999,pageSize:999})
    assert.equal(byMember.pagination.pageSize,25);assert.deepEqual(byMember.companies.map(company=>company.id),[id("orgA")])
    assert.ok(byMember.companies[0].members.every(member=>member.organizationId===id("orgA")))
    assert.deepEqual(byMember.companies[0].developments.map(item=>item.id),[id("devA")])
    assert.equal((await manager.listManagedOrganizations({search:prefix+"%"})).pagination.total,0,"LIKE metacharacters are literal")
    await login("editor");await assert.rejects(manager.listManagedOrganizations(),/Gerenciador/)
  })
  await check("RF009 organization profile, assignment, status and invitation roll back when audit fails",async()=>{
    await login("adminA")
    const company=await one(schema.organizations,id("orgA"))
    await auditFailure("organization.updated",()=>assert.rejects(actions.updateOrganization({name:id("changed")})))
    assert.equal((await one(schema.organizations,id("orgA"))).name,company.name)
    await auditFailure("development.access_revoked",()=>assert.rejects(actions.setDevelopmentAssignment(id("editor_member"),id("devA"),null)))
    assert.ok(await one(schema.developmentAssignments,id("editor_grant")))
    await auditFailure("member.suspended",()=>assert.rejects(actions.updateMemberStatus(id("editor_member"),"suspended")))
    assert.equal((await one(schema.members,id("editor_member"))).status,"active")
    await auditFailure("member.role_changed",()=>assert.rejects(actions.updateMemberRole(id("spareA_member"),"editor")))
    assert.equal((await one(schema.members,id("spareA_member"))).role,"admin")
    await database.db.insert(schema.organizationInvitations).values({id:id("cancel_invite"),organizationId:id("orgA"),email:email("newperson"),name:"Pending",role:"editor",tokenHash:hash(randomUUID()),developmentIds:[id("devA")],expiresAt:new Date(Date.now()+86400000),invitedBy:id("adminA")})
    await auditFailure("invitation.canceled",()=>assert.rejects(actions.cancelOrganizationInvitation(id("cancel_invite"))))
    assert.equal((await one(schema.organizationInvitations,id("cancel_invite"))).status,"pending")
    const invitationsBefore=await database.db.select().from(schema.organizationInvitations).where(eq(schema.organizationInvitations.organizationId,id("orgA")))
    await auditFailure("invitation.created",()=>assert.rejects(actions.createOrganizationInvitation({email:id("pending")+"@example.test",name:"Pending",developmentId:id("devA")})))
    assert.equal((await database.db.select().from(schema.organizationInvitations).where(eq(schema.organizationInvitations.organizationId,id("orgA")))).length,invitationsBefore.length)
    await assert.rejects(actions.updateMemberStatus(id("adminB_member"),"suspended"),/não encontrado/)
  })
  await check("RF009 staff acceptance rolls back claim, membership and active tenant with audit",async()=>{
    const token=randomUUID()
    await database.db.insert(schema.organizationInvitations).values({id:id("rollback_invite"),organizationId:id("orgA"),email:email("newperson"),name:"New",role:"editor",developmentIds:[id("devA")],tokenHash:hash(token),invitedBy:id("adminA"),expiresAt:new Date(Date.now()+86400000)})
    await login("newperson")
    await auditFailure("invitation.accepted",()=>assert.rejects(actions.acceptOrganizationInvitation(token)))
    assert.equal((await one(schema.organizationInvitations,id("rollback_invite"))).status,"pending")
    assert.equal((await one(schema.user,id("newperson"))).activeOrganizationId,null)
    assert.equal((await database.db.select().from(schema.members).where(eq(schema.members.userId,id("newperson")))).length,0)
  })
  await check("RF009 Manager organization/member/global status/delete roll back with audit and return safe errors",async()=>{
    await login("manager")
    await auditFailure("manager.organization_created",async()=>{
      const result=await manager.createManagedOrganization({name:id("rollback_created")})
      assert.equal(result.ok,false);assert.equal(result.message,"Não foi possível cadastrar a construtora")
    })
    assert.equal((await database.db.select().from(schema.organizations).where(eq(schema.organizations.name,id("rollback_created")))).length,0)
    await auditFailure("manager.member_permissions_updated",async()=>assert.equal((await manager.managerUpdateMemberAccess({organizationId:id("orgA"),memberId:id("editor_member"),role:"admin",developmentIds:[]})).ok,false))
    assert.equal((await one(schema.members,id("editor_member"))).role,"editor");assert.ok(await one(schema.developmentAssignments,id("editor_grant")))
    await auditFailure("manager.account_disabled",async()=>assert.equal((await manager.managerSetUserAccess({userId:id("editor"),status:"disabled"})).ok,false))
    assert.equal((await one(schema.user,id("editor"))).accessStatus,"active");assert.ok(await one(schema.session,id("editor_session")))
    await auditFailure("manager.member_deleted",async()=>assert.equal((await manager.managerDeleteMember({organizationId:id("orgA"),memberId:id("editor_member")})).ok,false))
    assert.ok(await one(schema.members,id("editor_member")));assert.ok(await one(schema.developmentAssignments,id("editor_grant")))
    await auditFailure("manager.access_linked",async()=>assert.equal((await manager.createManagerAccess({organizationId:id("orgB"),name:"New",email:email("newperson"),role:"admin",developmentIds:[]})).ok,false))
    assert.equal((await database.db.select().from(schema.members).where(eq(schema.members.userId,id("newperson")))).length,0)
    const invitedEmail=email("not_registered")
    await database.db.insert(schema.organizationInvitations).values({id:id("previous_invite"),organizationId:id("orgB"),email:invitedEmail,name:"Previous",role:"admin",tokenHash:hash(randomUUID()),developmentIds:[],expiresAt:new Date(Date.now()+86400000),invitedBy:id("manager")})
    await auditFailure("manager.access_invited",async()=>assert.equal((await manager.createManagerAccess({organizationId:id("orgB"),name:"Pending",email:invitedEmail,role:"admin",developmentIds:[]})).ok,false))
    const remaining=await database.db.select().from(schema.organizationInvitations).where(eq(schema.organizationInvitations.email,invitedEmail))
    assert.equal(remaining.length,1);assert.equal(remaining[0].status,"pending")
  })
  await check("RF009 concurrent administrator demotions retain coverage",async()=>{
    await login("manager")
    const inviteeMember=(await database.db.select().from(schema.members).where(eq(schema.members.userId,id("invitee"))))[0]
    await database.db.update(schema.members).set({status:"suspended"}).where(eq(schema.members.id,inviteeMember.id))
    const results=await Promise.all(["adminA","spareA"].map(name=>manager.managerUpdateMemberAccess({organizationId:id("orgA"),memberId:id(name+"_member"),role:"editor",developmentIds:[id("devA")]})))
    assert.equal(results.filter(result=>result.ok).length,1)
    const remaining=await database.db.select().from(schema.members).where(and(eq(schema.members.organizationId,id("orgA")),eq(schema.members.role,"admin"),eq(schema.members.status,"active")))
    assert.equal(remaining.length,1)
  })
  await check("RF004 deleting company removes its keys/integrations/notifications atomically",async()=>{
    await login("manager")
    const org=id("empty00")
    await database.db.insert(schema.organizationApiKeys).values({id:id("key"),organizationId:org,name:"Fixture",keyPrefix:"fixture",keyHash:hash(id("key")),createdBy:id("manager")})
    await database.db.insert(schema.organizationIntegrations).values({id:id("integration"),organizationId:org,provider:"openai",encryptedKey:"fixture-only"})
    await database.db.insert(schema.organizationNotifications).values({id:id("notification"),organizationId:org,userId:id("editor"),type:"test",title:"Fixture",body:"Fixture"})
    await auditFailure("manager.organization_deleted",async()=>assert.equal((await manager.deleteManagedOrganization({organizationId:org})).ok,false))
    assert.ok(await one(schema.organizations,org));assert.ok(await one(schema.organizationApiKeys,id("key")));assert.ok(await one(schema.organizationIntegrations,id("integration")));assert.ok(await one(schema.organizationNotifications,id("notification")))
    assert.equal((await manager.deleteManagedOrganization({organizationId:org})).ok,true)
    for(const [table,key] of [[schema.organizationApiKeys,"key"],[schema.organizationIntegrations,"integration"],[schema.organizationNotifications,"notification"]])assert.equal(await one(table,id(key)),undefined)
    assert.equal((await manager.deleteManagedOrganization({organizationId:id("orgB")})).ok,false,"Occupied company cannot be deleted")
  })
  await check("RF004 database rejects credentials racing a committed company deletion",async()=>{
    const deleting=await database.pool.connect(),writer=await database.pool.connect()
    let pending
    try{
      await deleting.query("BEGIN")
      await deleting.query('SELECT id FROM organization WHERE id=$1 FOR UPDATE',[id("empty01")])
      await writer.query("SET statement_timeout='3000ms'")
      const writerPid=(await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid
      pending=writer.query('INSERT INTO organization_api_key(id,"organizationId",name,"keyPrefix","keyHash","createdBy") VALUES($1,$2,$3,$4,$5,$6)',[id("racing_key"),id("empty01"),"Fixture","fixture",hash(id("racing_key")),id("manager")]).then(()=>({ok:true}),error=>({ok:false,code:error.code}))
      let waiting=false
      for(let attempt=0;attempt<40&&!waiting;attempt++){
        waiting=(await database.pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[writerPid])).rows[0]?.wait_event_type==="Lock"
        if(!waiting)await new Promise(resolve=>setTimeout(resolve,5))
      }
      assert.equal(waiting,true,"Credential insertion must actually wait on the deleting tenant lock")
      await deleting.query('DELETE FROM organization WHERE id=$1',[id("empty01")]);await deleting.query("COMMIT")
      assert.deepEqual(await pending,{ok:false,code:"23503"})
      assert.equal(await one(schema.organizationApiKeys,id("racing_key")),undefined)
    }finally{await deleting.query("ROLLBACK");if(pending)await pending;await writer.query("RESET statement_timeout");deleting.release();writer.release()}
  })
}
main().catch(error=>{failures++;console.error("FAIL setup",error.message)}).finally(async()=>{
  try{await cleanup()}catch(error){failures++;console.error("FAIL cleanup",error.message)}
  process.exitCode=failures?1:0
})
