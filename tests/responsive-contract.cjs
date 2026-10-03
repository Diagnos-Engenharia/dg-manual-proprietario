const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

const viewports = [{ name: 'mobile', width: 390, height: 844 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1600, height: 1100 }]
async function assertLayout(page, label) {
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(node => node.getBoundingClientRect().width > 0).map(node => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right } }) }))
  assert.ok(geometry.document <= geometry.viewport + 1, label + ': document overflows (' + geometry.document + ' > ' + geometry.viewport + ')')
  for (const dialog of geometry.dialogs) assert.ok(dialog.left >= -1 && dialog.right <= geometry.viewport + 1, label + ': dialog must fit the viewport')
}
async function capture(page, directory, label) {
  await assertLayout(page, label)
  await page.screenshot({ path: path.join(directory, label + '.png'), fullPage: true })
}
async function record(directory, suite, results) {
  await fs.writeFile(path.join(directory, 'matrix-' + suite + '.json'), JSON.stringify({ suite, browser: 'Chromium', viewports, results, limitation: 'Viewport and touch emulation are not a physical-device or Safari/Firefox certification.' }, null, 2))
}
module.exports = { viewports, assertLayout, capture, record }
