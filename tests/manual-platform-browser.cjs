const assert = require('node:assert/strict')
const { viewports, capture, record } = require('./responsive-contract.cjs')

module.exports = async function runPlatformMatrix({ browser, dev, origin, directory, adminEmail }) {
  const results = [], errors = []
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.name !== 'desktop', extraHTTPHeaders: { 'X-Forwarded-For': '198.18.' + (Date.now() % 240) + '.' + (viewports.indexOf(viewport) + 1) } })
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    const page = await context.newPage(); page.setDefaultTimeout(15000)
    page.on('pageerror', error => errors.push(error.message))
    try {
      const destination = '/empreendimentos/' + dev + '?modulo=emissao'
      await page.goto(origin + destination)
      await page.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor()
      await capture(page, directory, viewport.name + '-login')
      await page.getByLabel('Usuário ou E-mail', { exact: true }).fill(adminEmail)
      await page.getByLabel('Senha', { exact: true }).fill('ComposerTest!2026-isolated')
      await page.getByRole('button', { name: 'ENTRAR NA MINHA CONTA', exact: true }).click()
      await page.waitForURL(url => url.pathname === '/empreendimentos/' + dev && url.searchParams.get('modulo') === 'emissao')
      await page.locator('[data-manual-page]').first().waitFor()
      await page.getByLabel('Modo de visualização').selectOption('single')
      await page.getByRole('button', { name: 'Aumentar zoom', exact: true }).click()
      await capture(page, directory, viewport.name + '-compositor')
      await page.getByLabel('Modo de visualização').selectOption('continuous')
      assert.ok(await page.locator('[data-manual-page]').count() > 1, 'Continuous mode must display the multi-page owner manual')
      if (viewport.name === 'desktop') {
        let releaseOld, markStarted
        const oldStarted = new Promise(resolve => { markStarted = resolve })
        const delayed = new Promise(resolve => { releaseOld = resolve })
        const delayPreviousManual = async route => {
          if (route.request().postDataJSON()?.manualType !== 'sindico') return route.continue()
          const response = await route.fetch()
          markStarted(); await delayed
          await route.fulfill({ response }).catch(() => {}) // The real obsolete request may already be aborted by React cleanup.
        }
        await page.route('**/api/manuals/preview', delayPreviousManual)
        try {
          await page.getByLabel('Tipo de manual').selectOption('sindico')
          let pendingTimer
          try { await Promise.race([oldStarted, new Promise((_, reject) => { pendingTimer = setTimeout(() => reject(new Error('Delayed previous-manual request did not reach the real API')), 15000) })]) } finally { clearTimeout(pendingTimer) }
          const current = page.waitForResponse(response => response.url().endsWith('/api/manuals/preview') && response.request().postDataJSON()?.manualType === 'proprietario' && response.ok())
          await page.getByLabel('Tipo de manual').selectOption('proprietario'); await current
          releaseOld(); await page.waitForTimeout(150)
          assert.equal(await page.getByLabel('Tipo de manual').inputValue(), 'proprietario')
          await page.waitForFunction(() => [...document.querySelectorAll('[data-manual-page] svg')].some(svg => svg.textContent.includes('PRIVATIVO_shared')))
          assert.ok(!(await page.locator('[data-manual-page] svg').allTextContents()).join(' ').includes('COMUM_HIDRAULICA'), 'Delayed previous manual must never overwrite the latest preview')
        } finally { releaseOld(); await page.unroute('**/api/manuals/preview', delayPreviousManual) }
      }
      await page.getByRole('button', { name: 'Histórico', exact: true }).click()
      await page.getByRole('dialog').waitFor()
      await capture(page, directory, viewport.name + '-historico')
      await page.keyboard.press('Escape')
      if (viewport.width < 1024) await page.getByRole('button', { name: 'Abrir menu', exact: true }).click()
      const navigation = page.locator('aside nav')
      await navigation.getByRole('link', { name: 'Databook', exact: true }).waitFor()
      const labels = await navigation.getByRole('link').allTextContents()
      assert.equal(labels.indexOf('Databook'), labels.indexOf('Empreendimentos') + 1)
      await navigation.getByRole('link', { name: 'Databook', exact: true }).click()
      await page.getByRole('heading', { name: 'Databook', exact: true }).waitFor()
      await page.getByLabel('Empreendimento', { exact: true }).selectOption(dev)
      await page.getByRole('button', { name: 'Abrir arquivos', exact: true }).click()
      await page.getByRole('heading', { name: 'DATABOOK', exact: true }).waitFor()
      await capture(page, directory, viewport.name + '-databook')
      await page.getByRole('button', { name: 'Nova pasta', exact: true }).click()
      await page.getByRole('dialog').getByLabel('Nome da pasta', { exact: true }).fill('Cancelar matriz ' + viewport.name)
      await capture(page, directory, viewport.name + '-databook-dialogo')
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      results.push({ viewport: viewport.name, passed: ['login with deep-link resume', 'PDF preview and zoom', 'history dialog and keyboard escape', 'sidebar order/navigation', 'Databook development selection and folder dialog cancel', 'document and dialog horizontal containment'] })
      console.log('PASS platform matrix:', viewport.name)
    } finally { await context.close() }
  }
  assert.deepEqual(errors, [])
  await record(directory, 'internal', results)
}
