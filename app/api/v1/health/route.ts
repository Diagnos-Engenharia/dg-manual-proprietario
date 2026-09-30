import { publicJson,publicOptions } from "@/lib/public-api"

export function GET(){
  return publicJson({status:"ok",service:"dg-manual-public-api",version:"1.0.0",time:new Date().toISOString()})
}

export function OPTIONS(){return publicOptions()}
