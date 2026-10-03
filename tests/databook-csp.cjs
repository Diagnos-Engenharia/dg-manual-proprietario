const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const { chromium } = require('playwright')
;(async()=>{
  const { default:config }=await import(pathToFileURL(path.resolve(__dirname,'../next.config.mjs')).href)
  const policy=(await config.headers())[0].headers.find(header=>header.key==='Content-Security-Policy').value
  const browser=await chromium.launch({headless:true})
  try {
    const context=await browser.newContext()
    const attempted=[]
    await context.route('**/*',route=>{
      if(route.request().url()==='https://csp-test.invalid/')return route.fulfill({status:200,headers:{'Content-Type':'text/html','Content-Security-Policy':policy},body:'<!doctype html><title>Isolated policy test</title>'})
      attempted.push(route.request().url());return route.abort()
    })
    const page=await context.newPage()
    await page.goto('https://csp-test.invalid/')
    const urls=['https://vercel.com/api/blob/?pathname=test','https://vercel.com/api/blob/mpu?pathname=test']
    const violations=await page.evaluate(async urls=>{
      const events=[]
      document.addEventListener('securitypolicyviolation',event=>events.push(event.blockedURI))
      for(const url of urls){try{await fetch(url,{method:'POST',body:'synthetic-no-network'})}catch{}}
      try{await fetch('https://vercel.com/api/other')}catch{}
      await new Promise(resolve=>setTimeout(resolve,50))
      return events
    },urls)
    for(const url of urls)assert.ok(attempted.includes(url),'Blob SDK request must pass CSP: '+url)
    assert.ok(violations.some(url=>url.includes('/api/other')),'Unrelated Vercel API paths must remain blocked')
    assert.ok(!violations.some(url=>url.includes('/api/blob/')),'Both SDK upload paths must pass connect-src')
    console.log('DATABOOK_CSP_PASS: simple and multipart SDK URLs allowed; unrelated path blocked; all external requests intercepted')
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
