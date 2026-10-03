/* Real isolated PostgreSQL + Drizzle queries + BetterAuth password hashing.
 * Only Next request/session/cache context and private file storage are substituted.
 * Run explicitly with DG_TEST_DATABASE_URL pointing to a local review/test database.
 */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const { createHash, randomUUID } = require("node:crypto")
const { and, eq, inArray, like, or } = require("drizzle-orm")
const root = path.resolve(__dirname, "..")
const prefix = "client_test_" + randomUUID().replaceAll("-", "").slice(0, 12)
let currentUser = null
let realCrypto
let dbModule
let schema
let authConfig
let failures = 0
const resetLimitKeys = []
const cache = new Map()
const requestHeaders = new Headers({ "x-real-ip": prefix })
const authStub = { auth: { api: { getSession: async () => currentUser ? { user: currentUser } : null } } }
const contextMocks = {
  "@/lib/auth": authStub,
  "next/headers": { headers: async () => requestHeaders },
  "next/cache": { revalidatePath: () => {} },
  "server-only": {},
  "@/lib/manual-files": { getManualFile: async () => ({ stream: new Uint8Array(Buffer.from("%PDF-1.7\nfixture")), blob: { contentType: "application/pdf" } }) },
}
function load(relative, extraMocks = {}) {
  const filename = path.resolve(root, relative)
  if (!Object.keys(extraMocks).length && cache.has(filename)) return cache.get(filename).exports
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  if (!Object.keys(extraMocks).length) cache.set(filename, module)
  const localRequire = (name) => {
    if (Object.hasOwn(extraMocks, name)) return extraMocks[name]
    if (Object.hasOwn(contextMocks, name)) return contextMocks[name]
    if (name === "better-auth/crypto") return realCrypto
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name)
      const selected = [target + ".ts", path.join(target, "index.ts")].find(file => fs.existsSync(file))
      if (selected) return load(path.relative(root, selected))
    }
    return require(name)
  }
  new Function("require", "module", "exports", "__filename", "__dirname", output)(localRequire, module, module.exports, filename, path.dirname(filename))
  return module.exports
}
const id = (name) => prefix + "_" + name
const hash = (value) => createHash("sha256").update(value).digest("hex")
async function check(name, fn) {
  try { await fn(); console.log("PASS", name) }
  catch (error) { failures++; console.error("FAIL", name, error instanceof Error ? error.message : error) }
}
async function login(userId) {
  currentUser = (await dbModule.db.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1))[0] ?? null
}
async function readOne(table, value) { return (await dbModule.db.select().from(table).where(eq(table.id, value)).limit(1))[0] }
async function fixture() {
  const { db } = dbModule
  const { user, organizations, members, developments, developmentUnits, account, clientAccesses, manualVersions } = schema
  for (const name of ["adminA", "adminB", "editor", "client", "other", "pending", "staffClient", "offboard"]) {
    await db.insert(user).values({ id: id(name), name, email: name.toLowerCase() + "_" + prefix + "@example.test", emailVerified: true })
  }
  await db.insert(organizations).values([{ id: id("orgA"), name: "A", slug: id("orgA") }, { id: id("orgB"), name: "B", slug: id("orgB") }])
  for (const [name, org, role] of [["adminA", "orgA", "admin"], ["adminB", "orgB", "admin"], ["editor", "orgA", "editor"], ["staffClient", "orgB", "admin"]]) {
    await db.insert(members).values({ id: id(name + "_member"), userId: id(name), organizationId: id(org), role })
    await db.update(user).set({ activeOrganizationId: id(org) }).where(eq(user.id, id(name)))
  }
  for (const org of ["A", "B"]) {
    await db.insert(developments).values({ id: id("dev" + org), userId: id("admin" + org), organizationId: id("org" + org), name: "Development " + org, client: "Fixture", deliveryDate: "2026-12-01" })
    for (const number of ["1", "2"]) await db.insert(developmentUnits).values({ id: id("unit" + org + number), developmentId: id("dev" + org), organizationId: id("org" + org), number, tower: org, typology: "T1", lastEditorId: id("admin" + org) })
  }
  for (const name of ["client", "staffClient", "offboard"]) await db.insert(account).values({ id: id(name + "_account"), accountId: id(name), userId: id(name), providerId: "credential", password: await realCrypto.hashPassword("original-password") })
  for (const [name, person, org, unit, status] of [["otherAccess", "other", "B", "1", "active"], ["pendingAccess", null, "A", "2", "pending"], ["staffAccess", "staffClient", "A", "2", "active"], ["offboardAccess", "offboard", "A", "2", "active"]]) {
    await db.insert(clientAccesses).values({ id: id(name), organizationId: id("org" + org), developmentId: id("dev" + org), unitId: id("unit" + org + unit), userId: person ? id(person) : null, name: person ?? "pending", email: (person ?? "pending").toLowerCase() + "_" + prefix + "@example.test", status, createdBy: id("admin" + org) })
  }
  for (const [name, org, type, status, unit] of [["owner", "A", "proprietario", "publicado", null], ["finish", "A", "acabamentos", "publicado", "1"], ["otherUnit", "A", "acabamentos", "publicado", "2"], ["draft", "A", "proprietario", "rascunho", null], ["syndic", "A", "sindico", "publicado", null], ["foreign", "B", "proprietario", "publicado", null]]) {
    await db.insert(manualVersions).values({ id: id(name), organizationId: id("org" + org), developmentId: id("dev" + org), manualType: type, status, unitId: unit ? id("unit" + org + unit) : null, revision: 1, filename: name + ".pdf", pathname: "private/" + name + ".pdf", pages: 1, createdBy: id("admin" + org), publishedAt: status === "publicado" ? new Date() : null, sourceSnapshot: { confidentialAuthoring: "secret" } })
  }
}
async function cleanup() {
  if (!dbModule || !schema) return
  const { db } = dbModule
  for (const table of [schema.clientPasswordResets, schema.organizationInvitations, schema.clientAccesses, schema.manualVersions, schema.developmentUnits, schema.auditLogs, schema.developmentAssignments, schema.developments, schema.members]) await db.delete(table).where(inArray(table.organizationId, [id("orgA"), id("orgB")]))
  await db.delete(schema.organizations).where(inArray(schema.organizations.id, [id("orgA"), id("orgB")]))
  for (const table of [schema.account, schema.session]) await db.delete(table).where(like(table.userId, prefix + "%"))
  await db.delete(schema.user).where(like(schema.user.id, prefix + "%"))
  await db.delete(schema.rateLimits).where(like(schema.rateLimits.key, "%" + prefix + "%"))
  if(resetLimitKeys.length)await db.delete(schema.rateLimits).where(inArray(schema.rateLimits.key,resetLimitKeys))
  await dbModule.pool.end()
}
async function main() {
  const url = process.env.DG_TEST_DATABASE_URL
  if (!url) throw new Error("Set DG_TEST_DATABASE_URL to an isolated local review/test PostgreSQL database.")
  const parsed = new URL(url)
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || !/(?:test|review)/i.test(parsed.pathname)) throw new Error("This suite refuses a non-local database or a database without test/review in its name.")
  process.env.DATABASE_URL = url
  realCrypto = await import("better-auth/crypto")
  dbModule = load("lib/db/index.ts")
  schema = load("lib/db/schema.ts")
  await fixture()
  const actions = load("app/actions/clients.ts")
  const invites = load("app/actions/organization.ts")
  const clients = load("lib/clients.ts")
  const file = load("app/api/clients/manuals/file/route.ts")
  const authApi = await import("better-auth/api")
  load("lib/auth.ts", { "better-auth": { betterAuth: config => { authConfig = config; return authStub.auth } }, "better-auth/api": { APIError: authApi.APIError, createAuthMiddleware: handler => handler } })
  let accessId
  let invitationToken
  await check("company authorization rejects editor, anonymous and foreign unit", async () => {
    await login(id("editor")); assert.equal((await actions.createClientInvitation({ name: "Client", email: "someone@example.test", unitId: id("unitA1") })).ok, false)
    currentUser = null; await assert.rejects(actions.listClientAdminData())
    await login(id("adminA")); assert.equal((await actions.createClientInvitation({ name: "Client", email: "someone@example.test", unitId: id("unitB1") })).ok, false)
    const data = await actions.listClientAdminData(); assert.equal(data.organizationId, id("orgA")); assert.ok(data.clients.every(row => row.developmentId === id("devA")))
  })
  await check("client invite stores a hash and signup validates email/status/unit", async () => {
    await login(id("adminA"))
    const email = (await readOne(schema.user, id("client"))).email
    const result = await actions.createClientInvitation({ name: "Client", email, unitId: id("unitA1") }); assert.equal(result.ok, true)
    invitationToken = result.data.invitationPath.split("/").at(-1)
    const invitation = (await dbModule.db.select().from(schema.organizationInvitations).where(eq(schema.organizationInvitations.tokenHash, hash(invitationToken))).limit(1))[0]
    assert.equal(invitation.role, "client"); assert.notEqual(invitation.tokenHash, invitationToken); accessId = invitation.clientAccessId
    const ctx = { path: "/sign-up/email", body: { email }, headers: new Headers({ "x-dg-invite": invitationToken }) }
    await authConfig.hooks.before(ctx)
    await assert.rejects(authConfig.hooks.before({ ...ctx, body: { email: "wrong@example.test" } }))
    assert.equal((await actions.setClientAccessStatus({ id: accessId, enabled: false })).ok, true)
    await assert.rejects(authConfig.hooks.before(ctx)); assert.equal(await invites.getInvitationPreview(invitationToken), null)
    assert.equal((await actions.setClientAccessStatus({ id: accessId, enabled: true })).ok, true)
  })
  await check("concurrent client acceptance is single use and creates no staff grant", async () => {
    await login(id("other")); await assert.rejects(invites.acceptOrganizationInvitation(invitationToken))
    await login(id("client")); const preview = await invites.getInvitationPreview(invitationToken); assert.equal(preview.clientUnit.unitLabel, "A · Unidade 1")
    const results = await Promise.allSettled([invites.acceptOrganizationInvitation(invitationToken), invites.acceptOrganizationInvitation(invitationToken)])
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1)
    const access = await readOne(schema.clientAccesses, accessId); assert.equal(access.userId, id("client")); assert.equal(access.status, "active")
    const staff = await dbModule.db.select().from(schema.members).where(eq(schema.members.userId, id("client"))); assert.equal(staff.length, 0)
    assert.equal((await readOne(schema.user, id("client"))).activeOrganizationId, null)
  })
  await check("portal and file isolate tenant/unit/publication and hide authoring metadata", async () => {
    await login(id("client")); const data = await clients.getClientPortalData()
    assert.deepEqual(data.accesses[0].manuals.map(row => row.id).sort(), [id("owner"), id("finish")].sort())
    const serialized = JSON.stringify(data); assert.equal(serialized.includes("private/"), false); assert.equal(serialized.includes("sourceSnapshot"), false); assert.equal(serialized.includes("secret"), false)
    for (const manual of ["otherUnit", "draft", "syndic", "foreign"]) await assert.rejects(clients.requireClientManual({ accessId, manualId: id(manual) }), error => error.status === 404)
    const response = await file.GET(new Request("http://localhost/api/clients/manuals/file?" + new URLSearchParams({ accessId, id: id("owner"), download: "1" })))
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/); assert.match(response.headers.get("content-disposition"), /attachment/); assert.match(await response.text(), /^%PDF/)
    currentUser = null; const denied = await file.GET(new Request("http://localhost/api/clients/manuals/file?" + new URLSearchParams({ accessId, id: id("owner") }))); assert.equal(denied.status, 401)
    await login(id("other")); await assert.rejects(clients.requireClientManual({ accessId, manualId: id("owner") }), error => error.status === 404)
  })
  await check("individual and bulk blocks affect only company client access", async () => {
    await login(id("adminA")); assert.equal((await actions.setClientAccessStatus({ id: id("otherAccess"), enabled: false })).ok, false)
    assert.equal((await actions.setAllClientsAccessStatus({ enabled: false })).ok, true)
    assert.equal((await readOne(schema.clientAccesses, id("otherAccess"))).status, "active")
    assert.equal((await readOne(schema.members, id("adminA_member"))).status, "active"); assert.equal((await readOne(schema.user, id("client"))).accessStatus, "active")
    await login(id("client")); assert.equal(await clients.hasClientIdentity(id("client")), true); await assert.rejects(clients.getClientPortalData(), error => error.status === 403)
    await assert.rejects(clients.requireClientManual({ accessId, manualId: id("owner") }), error => error.status === 404)
    await login(id("adminA")); assert.equal((await actions.setAllClientsAccessStatus({ enabled: true })).ok, true)
    assert.equal((await readOne(schema.clientAccesses, id("pendingAccess"))).status, "pending")
  })
  await check("password reset rejects staff identity and foreign/pending access", async () => {
    await login(id("adminA"))
    for (const value of [id("otherAccess"), id("pendingAccess"), id("staffAccess")]) assert.equal((await actions.createClientPasswordReset({ id: value })).ok, false)
    const staffPassword = (await readOne(schema.account, id("staffClient_account"))).password; assert.equal(await realCrypto.verifyPassword({ hash: staffPassword, password: "original-password" }), true)
  })
  await check("concurrent reset hashes via BetterAuth, consumes token and revokes sessions", async () => {
    await login(id("adminA")); const result = await actions.createClientPasswordReset({ id: accessId }); assert.equal(result.ok, true)
    const token = result.data.resetPath.split("/").at(-1)
    resetLimitKeys.push("client-reset-token:"+hash(token))
    const stored = (await dbModule.db.select().from(schema.clientPasswordResets).where(eq(schema.clientPasswordResets.tokenHash, hash(token))).limit(1))[0]
    assert.notEqual(stored.tokenHash, token); assert.ok(stored.expiresAt.getTime() - Date.now() <= 15 * 60 * 1000)
    await dbModule.db.insert(schema.session).values({ id: id("client_session"), userId: id("client"), token: id("session_token"), expiresAt: new Date(Date.now() + 3600000) })
    currentUser = null
    const outcomes = await Promise.all([actions.resetClientPassword({ token, password: "new-password-123" }), actions.resetClientPassword({ token, password: "new-password-123" })])
    assert.equal(outcomes.filter(row => row.ok).length, 1); assert.equal((await actions.resetClientPassword({ token, password: "new-password-456" })).ok, false)
    const credential = await readOne(schema.account, id("client_account")); assert.equal(await realCrypto.verifyPassword({ hash: credential.password, password: "new-password-123" }), true); assert.equal(await realCrypto.verifyPassword({ hash: credential.password, password: "original-password" }), false)
    assert.equal((await dbModule.db.select().from(schema.session).where(eq(schema.session.userId, id("client")))).length, 0)
    assert.ok((await readOne(schema.clientPasswordResets, stored.id)).usedAt)
  })
  await check("expired/revoked reset token cannot change credentials", async () => {
    await login(id("adminA")); let result = await actions.createClientPasswordReset({ id: accessId }); assert.equal(result.ok, true)
    let token = result.data.resetPath.split("/").at(-1)
    resetLimitKeys.push("client-reset-token:"+hash(token))
    await dbModule.db.update(schema.clientPasswordResets).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.clientPasswordResets.tokenHash, hash(token)))
    currentUser = null; assert.equal((await actions.resetClientPassword({ token, password: "invalid-new-password" })).ok, false)
    await login(id("adminA")); result = await actions.createClientPasswordReset({ id: accessId }); assert.equal(result.ok, true); token = result.data.resetPath.split("/").at(-1)
    resetLimitKeys.push("client-reset-token:"+hash(token))
    assert.equal((await actions.setClientAccessStatus({ id: accessId, enabled: false })).ok, true)
    currentUser = null; assert.equal((await actions.resetClientPassword({ token, password: "invalid-new-password" })).ok, false)
    const password = (await readOne(schema.account, id("client_account"))).password; assert.equal(await realCrypto.verifyPassword({ hash: password, password: "new-password-123" }), true)
    await login(id("adminA")); await actions.setClientAccessStatus({ id: accessId, enabled: true })
  })
  await check("shared identity denies creating reset and redeeming a previously issued token", async () => {
    await login(id("adminA")); const issued=await actions.createClientPasswordReset({id:accessId}); assert.equal(issued.ok,true)
    const token=issued.data.resetPath.split("/").at(-1); resetLimitKeys.push("client-reset-token:"+hash(token))
    await dbModule.db.insert(schema.clientAccesses).values({id:id("resetOtherTenant"),organizationId:id("orgB"),developmentId:id("devB"),unitId:id("unitB1"),userId:id("client"),name:"Shared client",email:(await readOne(schema.user,id("client"))).email,status:"disabled",createdBy:id("adminB")})
    const denied=await actions.createClientPasswordReset({id:accessId}); assert.equal(denied.ok,false); assert.match(denied.message,/compartilhada/)
    currentUser=null; const completion=await actions.resetClientPassword({token,password:"stolen-password-123"}); assert.equal(completion.ok,false); assert.match(completion.message,/compartilhada/)
    const credential=await readOne(schema.account,id("client_account")); assert.equal(await realCrypto.verifyPassword({hash:credential.password,password:"new-password-123"}),true)
    await dbModule.db.delete(schema.clientAccesses).where(eq(schema.clientAccesses.id,id("resetOtherTenant")))
  })
  await check("offboarding deletes only selected client grant and preserves staff/other tenant", async () => {
    await login(id("adminA")); assert.equal((await actions.deleteClientAccess({ id: id("otherAccess") })).ok, false)
    assert.equal((await actions.deleteClientAccess({ id: id("staffAccess") })).ok, true)
    assert.equal((await readOne(schema.user, id("staffClient"))).accessStatus, "active"); assert.ok(await readOne(schema.members, id("staffClient_member")))
    await dbModule.db.insert(schema.clientAccesses).values({ id: id("clientOtherTenant"), organizationId: id("orgB"), developmentId: id("devB"), unitId: id("unitB1"), userId: id("client"), name: "Client", email: (await readOne(schema.user, id("client"))).email, status: "disabled", createdBy: id("adminB") })
    await dbModule.db.insert(schema.session).values({ id: id("shared_session"), userId: id("client"), token: id("shared_token"), expiresAt: new Date(Date.now() + 3600000) })
    assert.equal((await actions.deleteClientAccess({ id: accessId })).ok, true); assert.equal((await readOne(schema.user, id("client"))).accessStatus, "active"); assert.equal((await readOne(schema.clientAccesses, id("clientOtherTenant"))).status,"disabled"); assert.ok(await readOne(schema.session,id("shared_session")))
    await login(id("adminB")); assert.equal((await actions.setClientAccessStatus({id:id("clientOtherTenant"),enabled:true})).ok,true)
    await login(id("client")); assert.equal((await clients.getClientPortalData()).accesses[0].developmentName,"Development B")
    await login(id("adminA"))
    await dbModule.db.insert(schema.session).values({ id: id("offboard_session"), userId: id("offboard"), token: id("offboard_token"), expiresAt: new Date(Date.now() + 3600000) })
    assert.equal((await actions.deleteClientAccess({ id: id("offboardAccess") })).ok, true)
    assert.equal((await readOne(schema.user, id("offboard"))).accessStatus, "active"); assert.ok(await readOne(schema.account, id("offboard_account"))); assert.equal(await readOne(schema.session, id("offboard_session")), undefined)
    const reinvite=await actions.createClientInvitation({name:"Offboard",email:(await readOne(schema.user,id("offboard"))).email,unitId:id("unitA2")}); assert.equal(reinvite.ok,true)
    await login(id("offboard")); await invites.acceptOrganizationInvitation(reinvite.data.invitationPath.split("/").at(-1)); assert.equal((await clients.getClientPortalData()).accesses[0].developmentName,"Development A")
  })
  await check("audit log covers invitation, access change, recovery and deletion without token/password", async () => {
    const rows = await dbModule.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.organizationId, id("orgA")))
    const names = new Set(rows.map(row => row.action)); for (const event of ["client.invited", "invitation.accepted", "client.access_changed", "client.all_access_changed", "client.password_reset_created", "client.password_reset_completed", "client.access_deleted"]) assert.ok(names.has(event), event)
    const serialized = JSON.stringify(rows); assert.equal(serialized.includes(invitationToken), false); assert.equal(serialized.includes("new-password-123"), false)
  })
  console.log("Client runtime suite:", 11 - failures, "passed,", failures, "failed. Session/header context mocked; DB, authorization queries, transactions and hashing real.")
  if (failures) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(cleanup)
