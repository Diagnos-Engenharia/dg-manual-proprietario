import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import ts from "typescript"
import { assertDatabookFile } from "../lib/security/uploads"
import * as uploads from "../lib/security/uploads"
import * as ticketModule from "../lib/databook/ticket"
import * as typesModule from "../lib/databook/types"

const require = createRequire(import.meta.url)
function load(relative: string, mocks: Record<string, unknown>, timers = setTimeout) {
  const source = readFileSync(path.resolve(relative), "utf8")
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  new Function("require", "module", "exports", "setTimeout", output)((id: string) => id in mocks ? mocks[id] : require(id), module, module.exports, timers)
  return module.exports as Record<string, (...args: any[]) => Promise<any>>
}

test("direct private Blob uploads and local uploads share actual-content inspection before registration", async () => {
  const oldLocal = process.env.DG_PREVIEW_FILES_DIR, oldToken = process.env.BLOB_READ_WRITE_TOKEN, oldSecret = process.env.BETTER_AUTH_SECRET
  delete process.env.DG_PREVIEW_FILES_DIR
  process.env.BLOB_READ_WRITE_TOKEN = "isolated-mock-only"
  process.env.BETTER_AUTH_SECRET = "isolated-content-test-only"
  try {
    let bytes = Buffer.from('%PDF-1.7\nfixture'), cancelled = 0, reads = 0, deleted = 0, registered = 0, audits = 0, failRead = false, failCleanup = false
    let metadataMismatch: "size" | "pathname" | "private" | null = null
    const ticket = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", developmentId: "development-test", organizationId: "organization-test", userId: "editor-test", folderId: "folder-test", name: "document.pdf", contentType: "application/pdf", size: bytes.length, pathname: "", expiresAt: Date.now() + 60000 }
    ticket.pathname = ticketModule.uploadPath(ticket.organizationId, ticket.developmentId, ticket.id, ticket.name)
    const context = { user: { id: ticket.userId }, organization: { id: ticket.organizationId }, developmentRole: "editor", development: { id: ticket.developmentId, data: { databookFolders: [{ id: ticket.folderId, name: "Documentos" }] } } }
    const storage = load("lib/databook/storage.ts", {
      "./ticket": ticketModule,
      "@vercel/blob": {
        head: async () => ({ pathname: metadataMismatch === "pathname" ? "another/object" : ticket.pathname, size: ticket.size + (metadataMismatch === "size" ? 1 : 0), url: metadataMismatch === "private" ? 'https://store.public.blob.vercel-storage.com/object' : 'https://store.private.blob.vercel-storage.com/' + ticket.pathname }),
        del: async () => { if (failCleanup) throw new Error('private credentials omitted'); deleted++ },
        get: async (pathname: string, options: Record<string, unknown>) => {
          assert.equal(pathname, ticket.pathname)
          assert.equal(options.access, "private"); assert.equal(options.useCache, false)
          assert.ok(options.abortSignal instanceof AbortSignal)
          let sent = false
          return { statusCode: 200, stream: { getReader: () => ({
            read: async () => { reads++; if (failRead) throw new ticketModule.DatabookError('retry storage', 503); if (sent) return { done: true }; sent = true; return { done: false, value: bytes } },
            cancel: async () => { cancelled++ },
          }) } }
        },
      },
    })
    const schema = { databookFiles: { name: 'files' }, developments: { name: 'developments' }, auditLogs: { name: 'audit' }, databookObjectCleanup: { name: 'cleanup', pathname: 'pathname', developmentId: 'developmentId', requestedAt: 'requestedAt', lastAttemptAt: 'lastAttemptAt', completedAt: 'completedAt', attempts: 'attempts' } }
    const tx = {
      select: () => ({ from: (table: unknown) => ({ where: () => Object.assign(Promise.resolve(table === schema.developments ? [context.development] : []), { for: async () => [context.development], orderBy: async () => [] }) }) }),
      insert: (table: unknown) => ({ values: (row: any) => { if (table === schema.databookFiles) registered++; else audits++; return Object.assign(Promise.resolve(), { returning: async () => [{ ...row, createdAt: new Date() }] }) } }),
    }
    const service = load("lib/databook/service.ts", {
      '@/lib/db': { db: { ...tx, transaction: (callback: (value: typeof tx) => unknown) => callback(tx) } }, '@/lib/db/schema': schema,
      '@/lib/organization': { requireDevelopmentAccess: async () => context, canEditContent: () => true },
      '@/lib/security/rate-limit': {}, '@/lib/security/uploads': uploads, '@/lib/security/logging': { logSafeError: () => {} },
      './types': typesModule, './ticket': ticketModule, './storage': storage,
    })
    for (const [name, type, content, accepted] of [
      ['document.pdf', 'application/pdf', '%PDF-1.7\nfixture', true],
      ['document.pdf', 'application/pdf', '<html>fake PDF</html>', false],
      ['photo.jpeg', 'application/octet-stream', 'spoofed image', false],
      ['plan.xlsx', 'application/octet-stream', 'spoofed Office', false],
      ['note.txt', 'application/octet-stream', '\uFEFF <!doctype html><html>active</html>', false],
      ['note.txt', 'application/octet-stream', 'ordinary technical document', true],
    ] as const) {
      bytes = Buffer.from(content); ticket.name = name; ticket.contentType = type; ticket.size = bytes.length
      ticket.pathname = ticketModule.uploadPath(ticket.organizationId, ticket.developmentId, ticket.id, name)
      const file = new File([bytes], name, { type })
      const beforeRegistered = registered, beforeDeleted = deleted, beforeCancelled = cancelled
      if (accepted) {
        await assertDatabookFile(file)
        await service.finalizeDatabookUpload(ticketModule.signUploadTicket(ticket))
        assert.equal(registered, beforeRegistered + 1); assert.equal(deleted, beforeDeleted)
      } else {
        await assert.rejects(() => assertDatabookFile(file))
        await assert.rejects(() => service.finalizeDatabookUpload(ticketModule.signUploadTicket(ticket)), (error: any) => error.status === 400)
        assert.equal(registered, beforeRegistered); assert.equal(deleted, beforeDeleted + 1)
      }
      assert.equal(cancelled, beforeCancelled + 1, 'stream cancelled after bounded inspection')
    }
    assert.equal(audits, registered, 'only accepted objects are registered and audited')
    for (const mismatch of ["size", "pathname", "private"] as const) {
      metadataMismatch = mismatch
      const beforeReads = reads, beforeRegistered = registered, beforeDeleted = deleted
      await assert.rejects(() => service.finalizeDatabookUpload(ticketModule.signUploadTicket(ticket)), (error: any) => error.status === 409)
      assert.equal(reads, beforeReads); assert.equal(registered, beforeRegistered); assert.equal(deleted, beforeDeleted)
    }
    metadataMismatch = null
    bytes = Buffer.alloc(1024 * 1024, 65)
    const beforeReads = reads
    assert.equal((await storage.readDatabookFileHead(ticket.pathname)).length, 8192)
    assert.equal(reads, beforeReads + 1, 'stop after the first chunk covers the inspection window')
    await assert.rejects(() => storage.readDatabookFileHead(ticket.pathname, 50 * 1024 * 1024))
    failRead = true
    const beforeDeleted = deleted, beforeRegistered = registered
    await assert.rejects(() => service.finalizeDatabookUpload(ticketModule.signUploadTicket(ticket)), (error: any) => error.status === 503)
    assert.equal(deleted, beforeDeleted, 'transient storage failures retain the object for retry')
    assert.equal(registered, beforeRegistered)
    failRead = false; failCleanup = true; bytes = Buffer.from('<html>unsafe</html>')
    await assert.rejects(() => service.finalizeDatabookUpload(ticketModule.signUploadTicket(ticket)), (error: any) => error.status === 400)
    assert.equal(registered, beforeRegistered, 'failed cleanup never authorizes unsafe content')
    const stalledStorage = load("lib/databook/storage.ts", {
      "./ticket": ticketModule,
      "@vercel/blob": { get: async (_path: string, options: { abortSignal: AbortSignal }) => new Promise((_resolve, reject) => options.abortSignal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })) },
    }, ((callback: () => void) => setTimeout(callback, 10)) as typeof setTimeout)
    await assert.rejects(() => stalledStorage.readDatabookFileHead(ticket.pathname), (error: any) => error.status === 503, 'remote inspection has a deadline')
  } finally {
    for (const [name, value] of Object.entries({ DG_PREVIEW_FILES_DIR: oldLocal, BLOB_READ_WRITE_TOKEN: oldToken, BETTER_AUTH_SECRET: oldSecret })) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
  }
})

test("Databook delete commits metadata and audit before removing the private object and retains retryable cleanup", async () => {
  const development = { id: "development-delete-test", organizationId: "organization-delete-test", data: { databookFolders: [] } }
  const context = { user: { id: "editor-delete-test" }, organization: { id: development.organizationId }, developmentRole: "editor", development }
  const file = { id: "file-delete-test", developmentId: development.id, folder: "Documentos", name: "manual.pdf", pathname: "databook/organization-delete-test/development-delete-test/file-delete-test/manual.pdf", contentType: "application/pdf", sizeBytes: 12, createdAt: new Date() }
  const schema = { databookFiles: { name: "files" }, developments: { name: "developments" }, auditLogs: { name: "audit" }, databookObjectCleanup: { name: "cleanup", pathname: "pathname", developmentId: "developmentId", requestedAt: "requestedAt", lastAttemptAt: "lastAttemptAt", completedAt: "completedAt", attempts: "attempts" } }

  for (const failure of ["audit", "commit"] as const) {
    const state = { failAudit: failure === "audit", failCommit: failure === "commit", failCleanup: false, committed: false, removed: [] as string[], cleanup: [] as any[], deleted: false }
    const tx = makeDatabookDeleteTx(schema, file, development, state)
    const dbMock = makeDatabookDeleteDb(schema, tx, state)
    const service = load("lib/databook/service.ts", {
      "drizzle-orm": mockDrizzle(),
      "@/lib/db": { db: dbMock }, "@/lib/db/schema": schema,
      "@/lib/organization": { requireDevelopmentAccess: async () => context, canEditContent: () => true },
      "@/lib/security/rate-limit": { consumeRateLimit: async () => {} }, "@/lib/security/uploads": uploads,
      "@/lib/security/logging": { logSafeError: () => {} }, "./types": typesModule, "./ticket": ticketModule,
      "./storage": { hasLocalDatabookStorage: () => true, headDatabookFile: async () => null, readDatabookFileHead: async () => new Uint8Array(), removeDatabookFile: async (pathname: string) => { state.removed.push(pathname) }, requireDatabookStorage: () => {} },
    })
    await assert.rejects(() => service.deleteDatabookFile({ developmentId: development.id, id: file.id, expectedName: file.name }))
    assert.deepEqual(state.removed, [], failure + " failure must not remove the object before the SQL transaction commits")
    assert.deepEqual(state.cleanup, [], failure + " failure must roll back the outbox entry")
  }

  const state = { failAudit: false, failCommit: false, failCleanup: true, committed: false, removed: [] as string[], cleanup: [] as any[], deleted: false }
  const tx = makeDatabookDeleteTx(schema, file, development, state)
  const dbMock = makeDatabookDeleteDb(schema, tx, state)
  const service = load("lib/databook/service.ts", {
    "drizzle-orm": mockDrizzle(),
    "@/lib/db": { db: dbMock }, "@/lib/db/schema": schema,
    "@/lib/organization": { requireDevelopmentAccess: async () => context, canEditContent: () => true },
    "@/lib/security/rate-limit": { consumeRateLimit: async () => {} }, "@/lib/security/uploads": uploads,
    "@/lib/security/logging": { logSafeError: () => {} }, "./types": typesModule, "./ticket": ticketModule,
    "./storage": { hasLocalDatabookStorage: () => true, headDatabookFile: async () => null, readDatabookFileHead: async () => new Uint8Array(), removeDatabookFile: async (pathname: string) => { assert.equal(state.committed, true); state.removed.push(pathname); if (state.failCleanup) throw new Error("private cleanup failure") }, requireDatabookStorage: () => {} },
  })
  assert.deepEqual(await service.deleteDatabookFile({ developmentId: development.id, id: file.id, expectedName: file.name }), { success: true })
  assert.deepEqual(state.removed, [file.pathname])
  assert.equal(state.cleanup.length, 1, "failed object cleanup must remain durably retryable after the DB commit")
  state.failCleanup = false
  await service.listDatabookCatalog(development.id)
  assert.ok(state.cleanup[0].completedAt instanceof Date, "a successful retry retains a tombstone to reject stale upload tickets")
  assert.equal(state.removed.length, 2)

  const queueState = { failAudit: false, failCommit: false, failCleanup: true, committed: true, removed: [] as string[], cleanup: [] as any[], deleted: false }
  const queuedTx = makeDatabookDeleteTx(schema, file, development, queueState)
  const queuedDb = makeDatabookDeleteDb(schema, queuedTx, queueState)
  for (let index = 0; index < 7; index++) queueState.cleanup.push({ pathname: "pending-" + index, developmentId: development.id, requestedAt: new Date(Date.now() - 70_000 + index * 1_000), lastAttemptAt: null, attempts: 0 })
  const queuedService = load("lib/databook/service.ts", {
    "drizzle-orm": mockDrizzle(),
    "@/lib/db": { db: queuedDb }, "@/lib/db/schema": schema,
    "@/lib/organization": { requireDevelopmentAccess: async () => context, canEditContent: () => true },
    "@/lib/security/rate-limit": { consumeRateLimit: async () => {} }, "@/lib/security/uploads": uploads,
    "@/lib/security/logging": { logSafeError: () => {} }, "./types": typesModule, "./ticket": ticketModule,
    "./storage": { hasLocalDatabookStorage: () => true, headDatabookFile: async () => null, readDatabookFileHead: async () => new Uint8Array(), removeDatabookFile: async (pathname: string) => { queueState.removed.push(pathname); if (queueState.failCleanup) throw new Error("private cleanup failure") }, requireDatabookStorage: () => {} },
  })
  await queuedService.listDatabookCatalog(development.id)
  assert.deepEqual(queueState.removed, ["pending-0", "pending-1", "pending-2", "pending-3", "pending-4"])
  await queuedService.listDatabookCatalog(development.id)
  assert.deepEqual(queueState.removed.slice(5, 7), ["pending-5", "pending-6"], "failed older work must rotate behind untried cleanup records")
})

test("a retired upload ticket cannot re-register a file while an in-flight cleanup is pending", async () => {
  const oldSecret = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = "isolated-retired-ticket-test-secret"
  try {
    const development = { id: "development-replay-test", organizationId: "organization-replay-test", data: { databookFolders: [{ id: "folder-replay-test", name: "Documentos" }] } }
    const context = { user: { id: "editor-replay-test" }, organization: { id: development.organizationId }, developmentRole: "editor", development }
    const ticket = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", developmentId: development.id, organizationId: development.organizationId, userId: context.user.id, folderId: "folder-replay-test", name: "manual.pdf", contentType: "application/pdf", size: 12, pathname: "", expiresAt: Date.now() + 60_000 }
    ticket.pathname = ticketModule.uploadPath(ticket.organizationId, ticket.developmentId, ticket.id, ticket.name)
    const token = ticketModule.signUploadTicket(ticket)
    const schema = { databookFiles: { name: "files", id: "file.id", developmentId: "file.developmentId" }, developments: { name: "developments" }, auditLogs: { name: "audit" }, databookObjectCleanup: { name: "cleanup", pathname: "cleanup.pathname", developmentId: "cleanup.developmentId", requestedAt: "cleanup.requestedAt", lastAttemptAt: "cleanup.lastAttemptAt", completedAt: "cleanup.completedAt", attempts: "cleanup.attempts" } }
    const state = { queue: [] as any[], insertedFiles: 0, removed: 0, inTransaction: false }
    const matches = (condition: any, column: unknown, value: unknown) => (Array.isArray(condition) ? condition : [condition]).some(item => item?.column === column && item.value === value)
    const selection = (table: unknown) => {
      let condition: any
      const rows = () => {
        if (table === schema.developments) return [development]
        if (table === schema.databookFiles) return []
        if (table === schema.databookObjectCleanup) return state.queue.filter(row => (!condition || matches(condition, schema.databookObjectCleanup.pathname, row.pathname) || matches(condition, schema.databookObjectCleanup.developmentId, row.developmentId)))
        return []
      }
      const query: any = {
        where: (value: any) => { condition = value; return query }, for: () => query, orderBy: () => query,
        limit: async (count: number) => rows().slice(0, count),
        then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject),
      }
      return query
    }
    const tx = {
      select: () => ({ from: selection }),
      insert: (table: unknown) => ({ values: (row: any) => { if (table === schema.databookFiles) state.insertedFiles++; return Object.assign(Promise.resolve(), { returning: async () => [{ ...row, createdAt: new Date() }] }) } }),
      delete: () => ({ where: async () => {} }),
    }
    const dbMock = {
      select: () => ({ from: selection }),
      transaction: async (callback: (transaction: any) => Promise<unknown>) => { state.inTransaction = true; try { return await callback(tx) } finally { state.inTransaction = false } },
      update: (table: unknown) => ({ set: (values: any) => ({ where: async (condition: any) => { if (table === schema.databookObjectCleanup) { const row = state.queue.find(item => matches(condition, schema.databookObjectCleanup.pathname, item.pathname)); if (row) Object.assign(row, values) } } }) }),
      delete: () => ({ where: async () => {} }),
    }
    const bytes = Buffer.from("%PDF-1.7\nPDF")
    const service = load("lib/databook/service.ts", {
      "drizzle-orm": mockDrizzle(), "@/lib/db": { db: dbMock }, "@/lib/db/schema": schema,
      "@/lib/organization": { requireDevelopmentAccess: async () => context, canEditContent: () => true },
      "@/lib/security/rate-limit": { consumeRateLimit: async () => {} }, "@/lib/security/uploads": uploads,
      "@/lib/security/logging": { logSafeError: () => {} }, "./types": typesModule, "./ticket": ticketModule,
      "./storage": {
        hasLocalDatabookStorage: () => true,
        headDatabookFile: async (pathname: string) => { state.queue.push({ pathname, developmentId: development.id, requestedAt: new Date(), lastAttemptAt: null, completedAt: null, attempts: 0 }); return { pathname, size: bytes.length, private: true } },
        readDatabookFileHead: async () => bytes,
        removeDatabookFile: async () => { assert.equal(state.inTransaction, false); state.removed++; }, requireDatabookStorage: () => {},
      },
    })
    await assert.rejects(() => service.finalizeDatabookUpload(token), (error: any) => error.status === 409)
    assert.equal(state.insertedFiles, 0, "a delete tombstone committed during inspection prevents registration under the development lock")
    assert.equal(state.removed, 1, "a late-arriving object is cleaned after the tombstone is detected")
    assert.ok(state.queue[0].completedAt instanceof Date)
  } finally {
    if (oldSecret === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = oldSecret
  }
})

function makeDatabookDeleteTx(schema: any, file: any, development: any, state: any) {
  return {
    select: () => ({ from: (table: unknown) => ({ where: () => Object.assign(Promise.resolve(table === schema.developments ? [development] : [file]), { for: async () => [development], orderBy: async () => [] }) }) }),
    insert: (table: unknown) => ({ values: async (row: any) => { if (table === schema.auditLogs && state.failAudit) throw new Error("audit failed"); if (table === schema.databookObjectCleanup) state.cleanup.push(row) } }),
    delete: (table: unknown) => ({ where: async () => { if (table === schema.databookFiles) state.deleted = true } }),
  }
}

function makeDatabookDeleteDb(schema: any, tx: any, state: any) {
  return {
    transaction: async (callback: (tx: any) => Promise<unknown>) => {
      state.committed = false
      const originalCleanup = state.cleanup.slice()
      try {
        const result = await callback(tx)
        if (state.failCommit) throw new Error("commit failed")
        state.committed = true
        return result
      } catch (error) {
        state.cleanup.splice(0, state.cleanup.length, ...originalCleanup)
        state.deleted = false
        throw error
      }
    },
    delete: (table: unknown) => ({ where: async (condition: any) => {
      if (table !== schema.databookObjectCleanup) return
      const clauses = Array.isArray(condition) ? condition : [condition]
      const pathnameClause = clauses.find(item => item?.column === schema.databookObjectCleanup.pathname)
      if (pathnameClause) state.cleanup.splice(0, state.cleanup.length, ...state.cleanup.filter((item: any) => item.pathname !== pathnameClause.value))
      const purgeClause = clauses.find(item => typeof item === "string" && item.includes("completedAt") && item.includes("IS NOT NULL"))
      if (purgeClause) state.cleanup.splice(0, state.cleanup.length, ...state.cleanup.filter((item: any) => !(item.completedAt && item.requestedAt < new Date(Date.now() - 24 * 60 * 60 * 1000))))
    } }),
    update: (table: unknown) => ({ set: (values: any) => ({ where: async (condition: any) => { if (table === schema.databookObjectCleanup) { const row = state.cleanup.find((item: any) => item.pathname === condition.value); if (row) Object.assign(row, values) } } }) }),
    select: () => ({ from: (table: unknown) => {
      let developmentId: string | undefined
      const query: any = {
        where: (condition: any) => { developmentId = (Array.isArray(condition) ? condition : [condition]).find((item: any) => item?.column === schema.databookObjectCleanup.developmentId)?.value; return query },
        orderBy: () => query,
        limit: async (count: number) => table === schema.databookObjectCleanup
          ? state.cleanup.filter((item: any) => item.developmentId === developmentId && item.completedAt == null).sort((left: any, right: any) => Number((left.lastAttemptAt ?? left.requestedAt) - (right.lastAttemptAt ?? right.requestedAt))).slice(0, count)
          : [],
      }
      return query
    } }),
  }
}

function mockDrizzle() {
  return {
    and: (...values: unknown[]) => values,
    eq: (column: unknown, value: unknown) => ({ column, value }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((result, part, index) => result + part + String(values[index] ?? ""), ""),
  }
}
