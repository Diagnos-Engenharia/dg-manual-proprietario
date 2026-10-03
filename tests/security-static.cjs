const fs=require("node:fs")
const path=require("node:path")

const root=path.resolve(__dirname,"..")
let failures=0
function read(p){return fs.readFileSync(path.join(root,p),"utf8")}
function check(condition,message){
  if(condition) console.log("PASS",message)
  else {console.error("FAIL",message);failures++}
}
function walk(dir){
  const base=path.join(root,dir)
  if(!fs.existsSync(base))return[]
  const out=[]
  for(const entry of fs.readdirSync(base,{withFileTypes:true})){
    const rel=path.join(dir,entry.name)
    if(entry.isDirectory())out.push(...walk(rel))
    else if(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name))out.push(rel)
  }
  return out
}

const auth=read("lib/auth.ts")
const organization=read("lib/organization.ts")
const manager=read("app/actions/manager.ts")
const organizationActions=read("app/actions/organization.ts")
const packageJson=JSON.parse(read("package.json"))
const ai=read("app/actions/platform-integrations.ts")
const memorial=read("app/api/memorial/process/route.ts")
const memorialUpload=read("app/api/memorial/upload/route.ts")
const brandUpload=read("app/api/brand/upload/route.ts")
const databookUpload=read("app/api/databook/upload/route.ts")
const databookService=read("lib/databook/service.ts")
const technicalService=read("lib/manual-document/technical-service.ts")
const finishingUnits=read("lib/finishing-units.ts")
const databookTicket=read("lib/databook/ticket.ts")
const databookStorage=read("lib/databook/storage.ts")
const publicApi=read("lib/public-api.ts")
const nextConfig=read("next.config.mjs")
const createManagerAccessSource=manager.slice(manager.indexOf("export async function createManagerAccess"),manager.indexOf("export async function managerUpdateMemberAccess"))

check(auth.includes('ctx.path==="/sign-in/email"')&&auth.includes('accessStatus==="disabled"'),"login rejects globally disabled accounts")
check(auth.includes('storage: "database"')&&auth.includes('"/sign-in/email"'),"authentication uses persistent rate limiting")
check(auth.includes("httpOnly: true")&&auth.includes("sameSite:")&&auth.includes("secure: true"),"session cookies are explicitly hardened")
check(auth.includes('ctx.path==="/sign-up/email"')&&auth.includes('"x-dg-invite"')&&auth.includes("organizationInvitations"),"account registration requires a valid invitation token")
check(organization.includes('isManager: platformRole === "manager"')&&!organization.includes("legacyOwner"),"platform Manager requires explicit platform role")
check(organization.includes('profile?.accessStatus==="disabled"'),"server authorization rejects disabled accounts")
check(manager.includes('db.delete(session).where(eq(session.userId,input.userId))'),"disabling an account revokes existing sessions")
check(manager.includes("ensureAdministratorCoverage"),"last active Administrator is protected on the server")
check(manager.includes("ensureDevelopmentSelection"),"Constructor access requires server-validated development assignments")
check(!manager.includes('db.update(members).set({status:input.status==="active"?"active":"suspended"})'),"global account toggle preserves tenant-specific membership status")
check(!createManagerAccessSource.includes('set({accessStatus:"active"'),"linking an existing user never reactivates a globally disabled account implicitly")
check(manager.includes('set({accessStatus:"disabled"')&&!manager.includes('db.delete(user).where(eq(user.id,person.userId))'),"removing the last tenant access preserves user identity for audit history")
check(ai.includes('where(eq(platformIntegrations.provider,"openai"))'),"platform AI actions are scoped to OpenAI instead of an arbitrary provider row")
check(!ai.match(/return\s+\{[^}]*encryptedKey/),"OpenAI encrypted key is never returned by integration actions")
check(ai.includes('https://api.openai.com/v1/models/')&&ai.includes("model"),"OpenAI test validates the selected model")
check((ai.match(/where\(eq\(platformIntegrations\.provider,"openai"\)\)/g)??[]).length>=4,"all platform AI operations are explicitly scoped to OpenAI")
check(ai.includes("config:{model}"),"platform AI config returned to the client is minimized to the model only")
check(organizationActions.includes('for update')&&organizationActions.includes('returning({ id: organizationInvitations.id })'),"invitation acceptance serializes the user and atomically claims a pending invite")
check(packageJson.scripts?.["test:gate"]?.includes("test:security")&&packageJson.scripts?.["test:gate"]?.includes("test:domain")&&packageJson.scripts?.build?.includes("test:gate"),"Vercel/local build is gated by security and domain tests")
check(!memorial.includes("generativelanguage.googleapis.com"),"Memorial processing has no legacy Google AI execution path")
check(memorial.includes("DADO NÃO CONFIÁVEL")&&memorial.includes('role:"system"'),"Memorial is explicitly treated as untrusted data with separated system instructions")
check(memorial.includes("store:false")&&memorial.includes("data:application/pdf;base64,"),"OpenAI processing disables storage and uses an explicit PDF data URL")
check(memorial.includes("consumeRateLimit"),"AI processing is rate limited")
check(memorialUpload.includes('access:"private"')&&brandUpload.includes('access: "private"')&&databookStorage.includes('access: "private"'),"document and image uploads use private Blob storage")
check(memorialUpload.includes("assertMemorialFile")&&brandUpload.includes("assertImageFile")&&databookUpload.includes("assertDatabookFile")&&databookTicket.includes("blockedExtensions"),"upload flows validate content or signed metadata beyond filename extension")
check(publicApi.includes("public-api-ip:")&&publicApi.includes("public-api-key:"),"public API is rate limited by IP and API key")
check(!publicApi.includes('"Access-Control-Allow-Origin":"*"')&&publicApi.includes("PUBLIC_API_ALLOWED_ORIGINS"),"public API CORS requires explicitly configured origins")
check(nextConfig.includes("Content-Security-Policy")&&nextConfig.includes("frame-ancestors 'none'")&&nextConfig.includes("object-src 'none'"),"browser security headers include CSP anti-framing and anti-object rules")
check(nextConfig.includes("Strict-Transport-Security")&&nextConfig.includes("X-Content-Type-Options"),"HSTS and nosniff are configured")
check(read("migrations/0016_tenant_integrity_constraints.sql").includes("assignment_development_tenant_fk"),"database enforces tenant integrity for development assignments")
check(read("migrations/0017_organization_integrity_constraints.sql").includes("member_organization_fk")&&read("migrations/0017_organization_integrity_constraints.sql").includes("ON DELETE RESTRICT"),"database blocks organization deletion while tenant resources still reference it")
const revisionMigration=read("migrations/0018_revision_final_tenancy.sql")
check(revisionMigration.includes("member_organization_user_unique"),"database enforces one membership per organization/user")
check(revisionMigration.includes("development_unit_development_tenant_fk"),"development units enforce composite tenant integrity")
check(organization.includes("activeOrganizationId")&&organization.includes("setActiveOrganization"),"tenant context is selected explicitly and validated server-side")
check(databookService.includes("readDatabookFileHead")&&databookService.includes("assertDatabookContent"),"direct Blob uploads are content-sniffed before finalization")
check(technicalService.includes("assertSafeRichTextPayload"),"technical rich text receives server-side active-content validation")

const sourceFiles=[...walk("app"),...walk("components"),...walk("lib")]
const rawHtml=sourceFiles.filter(p=>read(p).includes("dangerouslySetInnerHTML"))
check(rawHtml.length===0,"no application source uses dangerouslySetInnerHTML"+(rawHtml.length?" ("+rawHtml.join(", ")+")":""))

const exposedSecrets=[]
for(const p of sourceFiles){
  const body=read(p)
  const client=/^[\s\S]*?["']use client["']/.test(body.slice(0,300))
  if(client&&/process\.env\.(?:OPENAI|DATABASE|BETTER_AUTH|INTEGRATION|SUPABASE).*?(?:KEY|SECRET|URL|ROLE)?/i.test(body))exposedSecrets.push(p)
  if(/NEXT_PUBLIC_(?:OPENAI|DATABASE|BETTER_AUTH|INTEGRATION|SUPABASE).*?(?:KEY|SECRET|TOKEN|ROLE)/i.test(body))exposedSecrets.push(p)
}
check(exposedSecrets.length===0,"no sensitive server environment variables are referenced from client code"+(exposedSecrets.length?" ("+[...new Set(exposedSecrets)].join(", ")+")":""))

const routeClassification={
  "app/api/auth/[...all]/route.ts":"PUBLIC",
  "app/api/brand/file/route.ts":"TENANT",
  "app/api/brand/upload/route.ts":"TENANT",
  "app/api/clients/manuals/chat/route.ts":"CLIENT",
  "app/api/clients/manuals/file/route.ts":"CLIENT",
  "app/api/databook/delete/route.ts":"TENANT",
  "app/api/databook/file/route.ts":"TENANT",
  "app/api/databook/folders/route.ts":"TENANT",
  "app/api/databook/upload/route.ts":"TENANT",
  "app/api/finishing/tables/route.ts":"TENANT",
  "app/api/finishing/units/route.ts":"TENANT",
  "app/api/health/route.ts":"PUBLIC",
  "app/api/manuals/compile/route.ts":"TENANT",
  "app/api/manuals/editorial/route.ts":"TENANT",
  "app/api/manuals/file/route.ts":"TENANT",
  "app/api/manuals/preview/route.ts":"TENANT",
  "app/api/manuals/technical/route.ts":"TENANT",
  "app/api/manuals/validate/route.ts":"TENANT",
  "app/api/manuals/versions/route.ts":"TENANT",
  "app/api/manuals/versions/status/route.ts":"TENANT",
  "app/api/memorial/process/route.ts":"TENANT",
  "app/api/memorial/upload/route.ts":"TENANT",
  "app/api/organization/context/route.ts":"TENANT",
  "app/api/organization/logo/route.ts":"TENANT",
  "app/api/v1/developments/route.ts":"API_KEY",
  "app/api/v1/health/route.ts":"PUBLIC",
  "app/api/v1/manuals/[id]/file/route.ts":"API_KEY",
  "app/api/v1/manuals/[id]/route.ts":"API_KEY",
  "app/api/v1/manuals/route.ts":"API_KEY",
  "app/api/v1/openapi.json/route.ts":"PUBLIC",
  "app/api/v1/route.ts":"PUBLIC",
}
const discoveredRoutes=walk("app/api").filter(p=>p.endsWith("route.ts")).map(p=>p.split(path.sep).join("/")).sort()
const unclassifiedRoutes=discoveredRoutes.filter(p=>!routeClassification[p])
const staleRouteClassifications=Object.keys(routeClassification).filter(p=>!discoveredRoutes.includes(p))
check(unclassifiedRoutes.length===0,"every API route has an explicit security classification"+(unclassifiedRoutes.length?" ("+unclassifiedRoutes.join(", ")+")":""))
check(staleRouteClassifications.length===0,"security route manifest has no stale entries"+(staleRouteClassifications.length?" ("+staleRouteClassifications.join(", ")+")":""))

const tenantRoutes=Object.entries(routeClassification).filter(([,classification])=>classification==="TENANT").map(([p])=>p)
const unguarded=tenantRoutes.filter(p=>{
  const body=read(p)
  if(/requireDevelopment(?:Access|Role)|requireActiveMembership|getActiveMembership|requireCompanyRole/.test(body))return false
  if(p.includes("/databook/")&&body.includes("@/lib/databook/")&&/requireDevelopmentAccess/.test(databookService))return false
  if(p.includes("/finishing/")&&body.includes("@/lib/finishing-units")&&/requireDevelopmentAccess/.test(finishingUnits))return false
  if(p==="app/api/manuals/technical/route.ts"&&body.includes("technical-service")&&/requireDevelopmentAccess/.test(technicalService))return false
  return true
})
check(unguarded.length===0,"tenant-classified routes enforce server-side tenant authorization"+(unguarded.length?" ("+unguarded.join(", ")+")":""))
const clientRoutes=Object.entries(routeClassification).filter(([,classification])=>classification==="CLIENT").map(([p])=>p)
check(clientRoutes.every(p=>read(p).includes("requireClientManual")),"client routes require current published-manual authorization")

const apiKeyRoutes=Object.entries(routeClassification).filter(([,classification])=>classification==="API_KEY").map(([p])=>p)
const apiKeyUnguarded=apiKeyRoutes.filter(p=>!read(p).includes("requirePublicApiScope"))
check(apiKeyUnguarded.length===0,"API_KEY routes require scoped public API authentication"+(apiKeyUnguarded.length?" ("+apiKeyUnguarded.join(", ")+")":""))

check(databookService.includes("consumeRateLimit"),"Databook mutation services are rate limited")

if(failures){
  console.error("\nSecurity static review failed with",failures,"finding(s).")
  process.exit(1)
}
console.log("\nSecurity static review passed.")
