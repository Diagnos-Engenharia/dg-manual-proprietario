export class InputValidationError extends Error{}

export function assertId(value:string,label="Identificador",max=120){
  if(!new RegExp("^[a-zA-Z0-9_-]{3,"+max+"}$").test(value))throw new InputValidationError(label+" inválido.")
  return value
}

export function cleanText(value:string,label:string,max=200,min=1){
  const clean=value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim()
  if(clean.length<min||clean.length>max)throw new InputValidationError(label+" deve ter entre "+min+" e "+max+" caracteres.")
  return clean
}

export function assertIsoDate(value:string,label="Data"){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new InputValidationError(label+" inválida.")
  const parsed=new Date(value+"T00:00:00Z")
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new InputValidationError(label+" inválida.")
  return value
}

function inspectJson(value:unknown,seen:Set<object>,depth:number){
  if(depth>24)throw new InputValidationError("Estrutura de dados excessivamente profunda.")
  if(!value||typeof value!=="object")return
  if(seen.has(value as object))throw new InputValidationError("Estrutura de dados inválida.")
  seen.add(value as object)
  if(Array.isArray(value)){
    if(value.length>5000)throw new InputValidationError("Estrutura de dados excede o limite de itens.")
    for(const item of value)inspectJson(item,seen,depth+1)
    return
  }
  const object=value as Record<string,unknown>
  const keys=Object.keys(object)
  if(keys.length>1000)throw new InputValidationError("Estrutura de dados excede o limite de campos.")
  for(const key of keys){
    if(key==="__proto__"||key==="prototype"||key==="constructor")throw new InputValidationError("Campo reservado não permitido.")
    inspectJson(object[key],seen,depth+1)
  }
}

export function assertJsonPayload(value:unknown,maxBytes=2_000_000){
  inspectJson(value,new Set(),0)
  let serialized=""
  try{serialized=JSON.stringify(value)}catch{throw new InputValidationError("Estrutura de dados inválida.")}
  if(Buffer.byteLength(serialized,"utf8")>maxBytes)throw new InputValidationError("O conteúdo excede o tamanho permitido.")
  return value
}

const activeHtml=/<\s*(?:script|iframe|object|embed|svg)\b|javascript\s*:|data\s*:\s*text\/html|\son(?:error|load|click|mouseover|focus)\s*=/i
export function assertSafeRichTextPayload(value:unknown){
  assertJsonPayload(value)
  const scan=(node:unknown)=>{
    if(typeof node==="string"&&activeHtml.test(node))throw new InputValidationError("O conteúdo contém HTML ativo não permitido.")
    if(Array.isArray(node)){for(const item of node)scan(item);return}
    if(node&&typeof node==="object")for(const child of Object.values(node as Record<string,unknown>))scan(child)
  }
  scan(value)
  return value
}
