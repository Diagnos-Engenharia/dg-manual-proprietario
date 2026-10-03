const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { auditRoutes } = require('../scripts/security-route-audit.cjs')

function fixture(files, task) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-route-audit-'))
  try {
    for (const [filename, content] of Object.entries(files)) {
      const target = path.resolve(root, filename)
      assert.ok(target.startsWith(root + path.sep))
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content)
    }
    return task(root)
  } finally {
    const target = fs.realpathSync(root)
    assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('dg-route-audit-'))
    fs.rmSync(target, { recursive: true, force: true })
  }
}
const guard = 'export async function requireDevelopmentAccess(id) { return id }'

test('new guarded JS/TSX/JSX API routes enter the inventory without a manual manifest', () => {
  fixture({ 'lib/organization.ts': guard, ...Object.fromEntries(['js', 'tsx', 'jsx'].map(extension => ['app/api/new-' + extension + '/route.' + extension, 'import { requireDevelopmentAccess as access } from "@/lib/organization"; export async function POST() { await access("dev"); return null }'])) }, root => {
    const result = auditRoutes(root)
    assert.equal(result.routes.length, 3); assert.deepEqual(result.failures, [])
    assert.ok(result.routes.every(route => route.operations[0].classification === 'TENANT'))
  })
})
test('a new route without authorization fails closed automatically', () => {
  fixture({ 'app/api/future/route.ts': 'export async function GET() { return Response.json({ secret: "private" }) }' }, root => assert.match(auditRoutes(root).failures[0], /future\/route.ts GET/))
})
test('an unused import, dead helper and comment do not count as handler authorization', () => {
  fixture({ 'lib/organization.ts': guard, 'app/api/private/route.ts': 'import { requireDevelopmentAccess } from "@/lib/organization"; async function unused() { await requireDevelopmentAccess("dev") }; export function GET() { /* requireDevelopmentAccess */ return null }' }, root => assert.equal(auditRoutes(root).routes[0].operations[0].classification, 'UNGUARDED'))
})
test('every HTTP method is audited, even when another method is guarded', () => {
  fixture({ 'lib/organization.ts': guard, 'app/api/private/route.ts': 'import { requireDevelopmentAccess } from "@/lib/organization"; export async function GET() { await requireDevelopmentAccess("dev") }; export function DELETE() { return null }' }, root => {
    const result = auditRoutes(root); assert.equal(result.failures.length, 1); assert.match(result.failures[0], /DELETE/)
  })
})
test('delegated services, namespace imports and re-exported handlers preserve guard evidence', () => {
  fixture({ 'lib/organization.ts': guard, 'lib/service.ts': 'import * as organization from "@/lib/organization"; export async function serve() { await organization.requireDevelopmentAccess("dev") }', 'app/api/delegated/handler.ts': 'import { serve } from "@/lib/service"; export async function handler() { return serve() }', 'app/api/delegated/route.ts': 'export { handler as GET } from "./handler"' }, root => {
    const result = auditRoutes(root); assert.deepEqual(result.failures, []); assert.deepEqual(result.routes[0].operations[0].guards, ['lib/organization:requireDevelopmentAccess'])
  })
})
test('a public exception does not exempt a newly added mutation method', () => {
  fixture({ 'app/api/health/route.ts': 'export function GET() { return null }; export function POST() { return null }' }, root => {
    const result = auditRoutes(root); assert.equal(result.failures.length, 1); assert.match(result.failures[0], /POST/)
  })
})
test('a same-named local function cannot impersonate the server guard', () => {
  fixture({ 'app/api/private/route.ts': 'function requireDevelopmentAccess() { return true }; export function GET() { requireDevelopmentAccess(); return null }' }, root => assert.equal(auditRoutes(root).failures.length, 1))
})
test('unknown handler export patterns require review instead of silently skipping the route', () => {
  fixture({ 'app/api/private/route.ts': 'export * from "./handlers"' }, root => assert.match(auditRoutes(root).failures[0], /no statically discoverable/))
})
test('optional membership lookup alone is not a mandatory authorization guard', () => {
  fixture({ 'lib/organization.ts': 'export async function getActiveMembership() { return null }', 'app/api/private/route.ts': 'import { getActiveMembership } from "@/lib/organization"; export async function GET() { await getActiveMembership(); return null }' }, root => assert.equal(auditRoutes(root).failures.length, 1))
})
test('obviously dead branches, unused nested helpers and calls after return do not authorize a handler', () => {
  for (const body of ['if (false) { await requireDevelopmentAccess("dev") }; return null', 'async function unused() { await requireDevelopmentAccess("dev") }; return null', 'return null; await requireDevelopmentAccess("dev")']) {
    fixture({ 'lib/organization.ts': guard, 'app/api/private/route.ts': 'import { requireDevelopmentAccess } from "@/lib/organization"; export async function GET() { ' + body + ' }' }, root => assert.equal(auditRoutes(root).failures.length, 1))
  }
})
