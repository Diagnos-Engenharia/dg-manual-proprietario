import { publicJson,publicOptions } from "@/lib/public-api"

export function GET(request:Request){
  const origin=new URL(request.url).origin
  return publicJson({
    name:"DG Manual Public API",
    version:"1.0.0",
    documentation:origin+"/api/v1/openapi.json",
    health:origin+"/api/v1/health",
    resources:{
      developments:origin+"/api/v1/developments",
      manuals:origin+"/api/v1/manuals",
    },
    authentication:"Bearer API key",
  },200,request)
}

export function OPTIONS(request:Request){return publicOptions(request)}
