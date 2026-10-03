const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname,'..')
const database = new URL(process.env.DATABASE_URL || '')
assert.ok(['localhost','127.0.0.1','[::1]'].includes(database.hostname), 'An isolated local database is required')
assert.ok(!process.env.VERCEL && !process.env.VERCEL_ENV, 'Never run fixtures on hosted environments')
assert.ok(process.env.DG_PREVIEW_FILES_DIR, 'Private files must use the isolated local adapter')
const origin = 'http://localhost:3000'
const env = {...process.env, TEST_BASE_URL:origin, BETTER_AUTH_URL:origin, BETTER_AUTH_SECRET:process.env.BETTER_AUTH_SECRET || 'local-isolated-e2e-secret-only-2026'}
const work = path.resolve(root,'..')
let server
let activeSuite
let timedOut=false
const wait = ms=>new Promise(resolve=>setTimeout(resolve,ms))
function stop(){activeSuite?.kill();server?.kill()}
const deadline = setTimeout(()=>{timedOut=true;stop();process.exitCode=1},10*60*1000)
function run(suite){
  return new Promise((resolve,reject)=>{
    activeSuite=spawn(process.execPath,[path.join(root,'tests',suite)],{cwd:root,env,stdio:'inherit',windowsHide:true})
    activeSuite.on('error',reject)
    activeSuite.on('exit',code=>code===0?resolve():reject(new Error(suite+' failed with exit '+code)))
  })
}
;(async()=>{
  try {
    try { await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)});throw new Error('Port 3000 already serves an application; refusing to test an unrelated process') }
    catch(error){if(error.message?.includes('already serves'))throw error}
    const log=fs.openSync(path.join(work,'local-e2e-server.log'),'w')
    server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','localhost','--port','3000'],{cwd:root,env,stdio:['ignore',log,log],windowsHide:true})
    server.on('error',error=>{console.error(error);stop()})
    let ready=false
    for(let attempt=0;attempt<30;attempt++){
      if(server.exitCode!==null)throw new Error('Local server failed to start; inspect local-e2e-server.log')
      try {const response=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(2000)});if(response.ok){ready=true;break}}catch{}
      await wait(500)
    }
    assert.ok(ready,'Local application health must pass before browser tests')
    console.log('TEMPORARY_LOCAL_SERVER_READY')
    const failures=[]
    const suites=process.argv.slice(2).length?process.argv.slice(2):['manual-composer.browser.cjs','clients.browser.cjs']
    assert.ok(suites.every(suite=>['manual-composer.browser.cjs','clients.browser.cjs'].includes(suite)),'Only the isolated suites may be selected')
    for(const suite of suites){
      if(timedOut)throw new Error('Temporary test execution exceeded ten minutes')
      try{await run(suite)}catch(error){console.error(error);failures.push(suite)}
    }
    assert.equal(failures.length,0,'Local suites failed: '+failures.join(', '))
  } finally {clearTimeout(deadline);stop()}
})().catch(error=>{console.error(error);process.exitCode=1})
