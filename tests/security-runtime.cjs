const fs=require("node:fs")
const path=require("node:path")
const ts=require("typescript")

const root=path.resolve(__dirname,"..")
let failures=0
function pass(name){console.log("PASS",name)}
function fail(name,error){console.error("FAIL",name,error instanceof Error?error.message:error);failures++}
async function expectOk(name,fn){try{await fn();pass(name)}catch(error){fail(name,error)}}
async function expectReject(name,fn){try{await fn();fail(name,"expected rejection")}catch{pass(name)}}

function loadTs(relative){
  const filename=path.join(root,relative)
  const source=fs.readFileSync(filename,"utf8")
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  const module={exports:{}}
  const runner=new Function("require","module","exports","__filename","__dirname",output)
  runner(require,module,module.exports,filename,path.dirname(filename))
  return module.exports
}

class MockFile{
  constructor(bytes,name,type){
    this.buffer=Buffer.from(bytes)
    this.name=name
    this.type=type
    this.size=this.buffer.length
  }
  slice(start,end){
    const part=this.buffer.subarray(start,end)
    return {arrayBuffer:async()=>part.buffer.slice(part.byteOffset,part.byteOffset+part.byteLength)}
  }
  async arrayBuffer(){
    return this.buffer.buffer.slice(this.buffer.byteOffset,this.buffer.byteOffset+this.buffer.byteLength)
  }
}

async function main(){
  const input=loadTs("lib/security/input.ts")
  const uploads=loadTs("lib/security/uploads.ts")

  await expectOk("safe technical HTML is accepted",()=>input.assertSafeRichTextPayload({description:'<h2>Estrutura</h2><p>Concreto armado.</p>'}))
  await expectReject("script XSS is rejected",()=>input.assertSafeRichTextPayload({description:'<script>alert(1)</script>'}))
  await expectReject("event-handler XSS is rejected",()=>input.assertSafeRichTextPayload({description:'<img src=x onerror=alert(1)>'}))
  await expectReject("javascript URL XSS is rejected",()=>input.assertSafeRichTextPayload({description:'<a href="javascript:alert(1)">x</a>'}))
  await expectReject("prototype pollution keys are rejected",()=>input.assertJsonPayload(JSON.parse('{"__proto__":{"polluted":true}}')))
  await expectOk("SQL-like strings remain ordinary data",()=>input.assertJsonPayload({observation:"'; DROP TABLE development; --"}))
  await expectReject("oversized JSON is rejected",()=>input.assertJsonPayload({value:"x".repeat(2_100_000)}))

  const pdf=new MockFile(Buffer.from("%PDF-1.7\n1 0 obj\n"),"memorial.pdf","application/pdf")
  await expectOk("valid PDF signature is accepted",async()=>{const type=await uploads.assertMemorialFile(pdf);if(type!=="application/pdf")throw new Error("wrong type")})
  const fakePdf=new MockFile(Buffer.from("<html>not pdf</html>"),"memorial.pdf","application/pdf")
  await expectReject("fake PDF content is rejected",()=>uploads.assertMemorialFile(fakePdf))

  const pngBytes=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0])
  await expectOk("valid PNG signature is accepted",()=>uploads.assertImageFile(new MockFile(pngBytes,"logo.png","image/png"),1024))
  await expectReject("spoofed image MIME is rejected",()=>uploads.assertImageFile(new MockFile(Buffer.from("not-an-image"),"logo.png","image/png"),1024))
  await expectReject("active HTML upload is rejected from Databook",()=>uploads.assertDatabookFile(new MockFile(Buffer.from("<html></html>"),"arquivo.html","text/html")))
  await expectReject("HTML disguised as a generic file is rejected",()=>uploads.assertDatabookFile(new MockFile(Buffer.from("\uFEFF <!doctype html><html>active</html>"),"arquivo.txt","application/octet-stream")))
  await expectReject("generic MIME cannot bypass JPEG file signature",()=>uploads.assertDatabookFile(new MockFile(Buffer.from("plain text"),"arquivo.jpeg","application/octet-stream")))
  await expectReject("generic MIME cannot bypass Office file signature",()=>uploads.assertDatabookFile(new MockFile(Buffer.from("plain text"),"arquivo.xlsx","application/octet-stream")))
  await expectOk("filename sanitizer removes CRLF and path characters",()=>{
    const safe=uploads.sanitizeFilename('..\\evil\r\nContent-Type: text/html?.pdf')
    if(/[\r\n\\/<>:*?|]/.test(safe))throw new Error("unsafe filename: "+safe)
  })

  if(failures){
    console.error("\nSecurity runtime tests failed with",failures,"finding(s).")
    process.exit(1)
  }
  console.log("\nSecurity runtime tests passed.")
}

main().catch(error=>{console.error(error);process.exit(1)})
