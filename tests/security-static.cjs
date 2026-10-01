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
const ai=read("app/actions/platform-integrations.ts")
const memorial=read("app/api/memorial/process/route.ts")
const memorialUpload=read("app/api/memorial/upload/route.ts")
const brandUpload=read("app/api/brand/upload/route.ts")
const databookUpload=read("app/api/databook/upload/route.ts")
const publicApi=read("lib/public-api.ts")
const nextConfig=read("next.config.mjs")

check(auth.includes('ctx.path !== "/sign-in/email"')&&auth.includes('accessStatus==="disabled"'),"login rejects globally disabled accounts")
check(auth.includes('storage: "database"')&&auth.includes('"/sign-in/email"'),"authentication uses persistent rate limiting")
check(organization.includes('isManager: platformRole === "manager"')&&!organization.includes("legacyOwner"),"platform Manager requires explicit platform role")
check(organization.includes('profile?.accessStatus==="disabled"'),"server authorization rejects disabled accounts")
check(manager.includes('db.delete(session).where(eq(session.userId,input.userId))'),"disabling an account revokes existing sessions")
check(manager.includes("ensureAdministratorCoverage"),"last active Administrator is protected on the server")
check(manager.includes("ensureDevelopmentSelection"),"Constructor access requires server-validated development assignments")
check(!ai.match(/return\s+\{[^}]*encryptedKey/),"OpenAI encrypted key is never returned by integration actions")
check(ai.includes('https://api.openai.com/v1/models/')&&ai.includes("model"),"OpenAI test validates the selected model")
check(memorial.includes("DADO NÃO CONFIÁVEL")&&memorial.includes('role:"system"'),"Memorial is explicitly treated as untrusted data with separated system instructions")
check(memorial.includes("store:false")&&memorial.includes("data:application/pdf;base64,"),"OpenAI processing disables storage and uses an explicit PDF data URL")
check(memorial.includes("consumeRateLimit"),"AI processing is rate limited")
check(memorialUpload.includes('access:"private"')&&brandUpload.includes('access: "private"')&&databookUpload.includes('access: "private"'),"document and image uploads use private Blob storage")
check(memorialUpload.includes("assertMemorialFile")&&brandUpload.includes("assertImageFile")&&databookUpload.includes("assertDatabookFile"),"upload routes validate content beyond filename extension")
check(publicApi.includes("public-api-ip:")&&publicApi.includes("public-api-key:"),"public API is rate limited by IP and API key")
check(nextConfig.includes("Content-Security-Policy")&&nextConfig.includes("frame-ancestors 'none'")&&nextConfig.includes("object-src 'none'"),"browser security headers include CSP anti-framing and anti-object rules")
check(nextConfig.includes("Strict-Transport-Security")&&nextConfig.includes("X-Content-Type-Options"),"HSTS and nosniff are configured")

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

const scopedRoutes=[
  "app/api/brand/file/route.ts",
  "app/api/brand/upload/route.ts",
  "app/api/databook/delete/route.ts",
  "app/api/databook/file/route.ts",
  "app/api/databook/upload/route.ts",
  "app/api/manuals/compile/route.ts",
  "app/api/manuals/file/route.ts",
  "app/api/manuals/validate/route.ts",
  "app/api/manuals/versions/route.ts",
  "app/api/manuals/versions/status/route.ts",
  "app/api/memorial/process/route.ts",
  "app/api/memorial/upload/route.ts",
]
const unguarded=scopedRoutes.filter(p=>!(/requireDevelopment(?:Access|Role)/.test(read(p))))
check(unguarded.length===0,"tenant-sensitive routes enforce development authorization"+(unguarded.length?" ("+unguarded.join(", ")+")":""))

if(failures){
  console.error("\nSecurity static review failed with",failures,"finding(s).")
  process.exit(1)
}
console.log("\nSecurity static review passed.")
