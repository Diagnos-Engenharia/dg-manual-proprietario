const fs=require("node:fs")
const path=require("node:path")
const {spawnSync}=require("node:child_process")
const root=path.resolve(__dirname,"..")
let failures=0
function check(condition,message){if(condition)console.log("PASS",message);else{console.error("FAIL",message);failures++}}
function read(relative){return fs.readFileSync(path.join(root,relative),"utf8")}

const criticalSuites=[
  "manual-finishing-api.cjs",
  "manual-finishing-browser.cjs",
  "manual-technical-api.cjs",
  "manual-technical-browser.cjs",
  "manual-public-contract.cjs",
  "databook-browser.cjs",
  "databook-folder-race.cjs",
]
const composer=read("tests/manual-composer.browser.cjs")
for(const suite of criticalSuites)check(composer.includes(suite),"composer E2E registers "+suite)

const browserSuites=fs.readdirSync(path.join(root,"tests")).filter(name=>name.endsWith(".browser.cjs")||name.endsWith("-browser.cjs"))
for(const suite of browserSuites){
  const result=spawnSync(process.execPath,["--check",path.join(root,"tests",suite)],{encoding:"utf8"})
  check(result.status===0,"browser suite parses: "+suite+(result.status===0?"":" "+result.stderr))
}

const finishing=read("tests/manual-finishing-browser.cjs")
check(finishing.includes("width: 390")&&finishing.includes("width: 768")&&finishing.includes("width: 1600"),"finishing browser coverage declares mobile, tablet and desktop viewports")

if(failures){console.error("\nQA contract gate failed with",failures,"finding(s).");process.exit(1)}
console.log("\nQA contract gate passed. Runtime E2E still requires an isolated local database and application.")
