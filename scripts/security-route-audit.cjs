const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
// Only intentionally public operations are exceptions. Private routes are discovered,
// and each exported HTTP handler must reach a recognized authorization boundary.
const publicMethods = {
  'app/api/auth/[...all]/route': ['GET', 'POST'],
  'app/api/health/route': ['GET'],
  'app/api/v1/health/route': ['GET', 'OPTIONS'],
  'app/api/v1/openapi.json/route': ['GET', 'OPTIONS'],
  'app/api/v1/route': ['GET', 'OPTIONS'],
}
const boundaries = {
  'lib/organization': { requireDevelopmentAccess: 'TENANT', requireDevelopmentRole: 'TENANT', requireActiveMembership: 'TENANT', requireCompanyRole: 'TENANT' },
  'lib/clients': { requireClientManual: 'CLIENT' },
  'lib/public-api': { requirePublicApiScope: 'API_KEY', publicOptions: 'CORS' },
}
const normalize = value => value.split(path.sep).join('/')
const withoutExtension = value => value.replace(/\.(?:tsx?|jsx?)$/, '')
const exported = node => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)

function discoverRoutes(root) {
  const routes = []
  function walk(directory) {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(filename)
      else if (/^route\.(?:tsx?|jsx?)$/.test(entry.name)) routes.push(normalize(path.relative(root, filename)))
    }
  }
  walk(path.join(root, 'app', 'api'))
  return routes.sort()
}

function auditRoutes(root) {
  root = path.resolve(root)
  const modules = new Map()
  function resolveImport(from, specifier) {
    const base = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : specifier.startsWith('.') ? path.resolve(path.dirname(from), specifier) : null
    if (!base || !base.startsWith(root + path.sep)) return null
    return [base, ...['.ts', '.tsx', '.js', '.jsx'].map(extension => base + extension), ...['.ts', '.tsx', '.js', '.jsx'].map(extension => path.join(base, 'index' + extension))].find(filename => fs.existsSync(filename) && fs.statSync(filename).isFile()) || null
  }
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename)
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
    const module = { filename, source, bindings: new Map(), exports: new Map(), imports: new Map(), namespaces: new Map() }
    modules.set(filename, module)
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause && ts.isStringLiteral(statement.moduleSpecifier)) {
        const target = resolveImport(filename, statement.moduleSpecifier.text)
        const clause = statement.importClause
        if (clause.name) module.imports.set(clause.name.text, { target, name: 'default' })
        const named = clause.namedBindings
        if (named && ts.isNamedImports(named)) for (const element of named.elements) module.imports.set(element.name.text, { target, name: (element.propertyName || element.name).text })
        if (named && ts.isNamespaceImport(named)) module.namespaces.set(named.name.text, target)
      }
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        module.bindings.set(statement.name.text, statement)
        if (exported(statement)) module.exports.set(statement.name.text, { local: statement.name.text })
      }
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          module.bindings.set(declaration.name.text, declaration.initializer)
          if (exported(statement)) module.exports.set(declaration.name.text, { local: declaration.name.text })
        } else if (exported(statement) && ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements) if (ts.isIdentifier(element.name)) module.exports.set(element.name.text, { node: declaration.initializer })
        }
      }
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const target = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? resolveImport(filename, statement.moduleSpecifier.text) : null
        for (const element of statement.exportClause.elements) module.exports.set(element.name.text, target ? { target, name: (element.propertyName || element.name).text } : { local: (element.propertyName || element.name).text })
      }
    }
    return module
  }
  function trace(filename, name, isExport, seen, found) {
    if (!filename) return
    const key = filename + ':' + (isExport ? 'export:' : 'local:') + name
    if (seen.has(key)) return
    seen.add(key)
    const relative = withoutExtension(normalize(path.relative(root, filename)))
    const boundary = isExport && boundaries[relative]?.[name]
    if (boundary) { found.set(relative + ':' + name, boundary); return }
    const module = load(filename)
    if (isExport) {
      const definition = module.exports.get(name)
      if (!definition) return
      if (definition.target) return trace(definition.target, definition.name, true, seen, found)
      if (definition.local) return trace(filename, definition.local, false, seen, found)
      return visit(module, definition.node, seen, found)
    }
    const imported = module.imports.get(name)
    if (imported) return trace(imported.target, imported.name, true, seen, found)
    const node = module.bindings.get(name)
    if (node && ts.isIdentifier(node)) return trace(filename, node.text, false, seen, found)
    visit(module, node, seen, found)
  }
  function visit(module, node, seen, found) {
    if (!node) return
    function walk(current) {
      if (current !== node && (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current))) return
      if (ts.isIfStatement(current) && [ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.TrueKeyword].includes(current.expression.kind)) {
        return walk(current.expression.kind === ts.SyntaxKind.TrueKeyword ? current.thenStatement : current.elseStatement || ts.factory.createEmptyStatement())
      }
      if (ts.isBlock(current)) {
        for (const statement of current.statements) { walk(statement); if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) break }
        return
      }
      if (ts.isCallExpression(current)) {
        const call = current.expression
        if (ts.isIdentifier(call)) trace(module.filename, call.text, false, seen, found)
        if (ts.isPropertyAccessExpression(call) && ts.isIdentifier(call.expression)) trace(module.namespaces.get(call.expression.text), call.name.text, true, seen, found)
      }
      ts.forEachChild(current, walk)
    }
    walk(node)
  }
  const routes = [], failures = []
  for (const relative of discoverRoutes(root)) {
    const filename = path.join(root, relative), module = load(filename)
    const handlers = [...module.exports.keys()].filter(name => methods.has(name)).sort()
    const operations = []
    if (!handlers.length) failures.push(relative + ': no statically discoverable exported HTTP handler')
    for (const method of handlers) {
      if (publicMethods[withoutExtension(relative)]?.includes(method)) { operations.push({ method, classification: 'PUBLIC', guards: [] }); continue }
      const found = new Map()
      trace(filename, method, true, new Set(), found)
      const classifications = [...new Set(found.values())].filter(value => value !== 'CORS')
      const corsOnly = method === 'OPTIONS' && relative.startsWith('app/api/v1/') && found.has('lib/public-api:publicOptions')
      const classification = corsOnly ? 'CORS' : classifications.includes('CLIENT') ? 'CLIENT' : classifications.includes('API_KEY') ? 'API_KEY' : classifications.includes('TENANT') ? 'TENANT' : 'UNGUARDED'
      operations.push({ method, classification, guards: [...found.keys()].sort() })
      if (classification === 'UNGUARDED') failures.push(relative + ' ' + method + ': no reachable recognized server authorization call')
    }
    routes.push({ file: relative, operations })
  }
  return { routes, failures, limitation: 'Heuristic static call-graph evidence only; execution order, every authorization branch, resource ownership and runtime denials require API/browser tests.' }
}

module.exports = { auditRoutes, discoverRoutes }
if (require.main === module) {
  const result = auditRoutes(path.resolve(__dirname, '..'))
  if (process.env.DG_ROUTE_AUDIT_OUTPUT) fs.writeFileSync(process.env.DG_ROUTE_AUDIT_OUTPUT, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  if (result.failures.length) process.exitCode = 1
}
