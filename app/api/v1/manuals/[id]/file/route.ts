import { publicJson } from "@/lib/public-api"

export async function GET(){
  return publicJson({error:{code:"not_implemented",message:"Rota em configuração."}},501)
}
