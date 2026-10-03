import sanitizeHtml from "sanitize-html"

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

const technicalTags = ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "strike", "ul", "ol", "li", "blockquote", "pre", "code", "hr", "a", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "div", "span", "sub", "sup"]
const activeTags = new Set(["script", "iframe", "object", "embed", "svg", "math", "style", "link", "meta", "base", "form", "input", "button", "textarea", "select", "video", "audio", "template"])

/** Parse decoded attributes on the server; browser-side cleaning is only UX. */
export function assertTechnicalHtml(html: string) {
  if (html.length > 500_000) throw new InputValidationError("Conteúdo excede o limite da seção.")
  let active = false
  const clean = sanitizeHtml(html, {
    allowedTags: technicalTags,
    allowedAttributes: {
      a: ["href", "title"], ol: ["start"],
      th: ["colspan", "rowspan", "colwidth", "scope", "style"], td: ["colspan", "rowspan", "colwidth", "style"],
      "*": ["style"],
    },
    allowedSchemes: ["http", "https", "mailto"], allowProtocolRelative: false,
    allowedStyles: { "*": {
      "text-align": [/^(?:left|right|center|justify)$/],
      "font-weight": [/^(?:normal|bold|[1-9]00)$/], "font-style": [/^(?:normal|italic)$/],
      "text-decoration": [/^(?:none|underline|line-through)$/],
      "width": [/^\d+(?:\.\d+)?(?:px|%)$/],
      "color": [/^#[\da-f]{3,8}$/i, /^(?:black|white|gray|red|blue|green)$/i],
    } },
    nestingLimit: 40,
    onOpenTag(tag, attributes) {
      if (activeTags.has(tag)) active = true
      for (const [name, value] of Object.entries(attributes)) {
        if (/^on/i.test(name) || name === "srcdoc") active = true
        if (["href", "src", "cite", "action", "formaction", "xlink:href"].includes(name)) {
          // htmlparser2 has already decoded numeric/named HTML entities.
          const compact = value.replace(/[\s\u0000-\u0020\u007f]/g, "")
          const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1]?.toLowerCase()
          if (compact.startsWith("//") || (scheme && !["http", "https", "mailto"].includes(scheme))) active = true
        }
      }
    },
  })
  if (active) throw new InputValidationError("O conteúdo contém HTML ativo não permitido.")
  return clean
}

export function assertSafeRichTextPayload<T>(value:T):T{
  assertJsonPayload(value)
  const scan=(node:unknown):unknown=>{
    if(typeof node==="string")return /<\s*\/?\s*[a-z!]/i.test(node) ? assertTechnicalHtml(node) : node
    if(Array.isArray(node))return node.map(scan)
    if(node&&typeof node==="object")return Object.fromEntries(Object.entries(node as Record<string,unknown>).map(([key,child])=>[key,scan(child)]))
    return node
  }
  return scan(value) as T
}
