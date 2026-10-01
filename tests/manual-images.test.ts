import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import { normalizeManualImage } from "../lib/manual-document/images"

test("authorized PNG, JPEG and WebP bytes normalize into shared PDF-compatible images",async()=>{
  const image = sharp({create:{width:8,height:12,channels:4,background:{r:30,g:80,b:140,alpha:.5}}})
  const samples = [
    [await image.clone().png().toBuffer(),"image/png"],
    [await image.clone().jpeg().toBuffer(),"image/jpeg"],
    [await image.clone().webp().toBuffer(),"image/webp"],
  ] as const
  for(const [bytes,mime] of samples){
    const output = await normalizeManualImage(bytes,mime)
    assert.equal(output.width,8)
    assert.equal(output.height,12)
    assert.ok(/^data:image\/(png|jpeg);base64,/.test(output.dataUri))
    assert.equal(output.contentType,mime==="image/jpeg"?"image/jpeg":"image/png")
    if(mime!=="image/jpeg") assert.equal((await sharp(output.bytes).metadata()).hasAlpha,true)
  }
})

test("rejects corrupt data and formats outside the supported identity images",async()=>{
  await assert.rejects(normalizeManualImage(Buffer.from("invalid"),"image/png"))
  await assert.rejects(normalizeManualImage(Buffer.from("<svg />"),"image/svg+xml"))
})
