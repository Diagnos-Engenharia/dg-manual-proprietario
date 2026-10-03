import { publicJson,publicOptions } from "@/lib/public-api"

export function GET(request:Request){
  return publicJson({status:"ok",service:"dg-manual-public-api",version:"1.0.0",time:new Date().toISOString()},200,request)
}

export function OPTIONS(request:Request){return publicOptions(request)}
