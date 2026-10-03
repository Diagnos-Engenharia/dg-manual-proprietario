import { publicJson,publicOptions } from "@/lib/public-api"

const spec={
  openapi:"3.1.0",
  info:{
    title:"DG Manual Public API",
    version:"1.0.0",
    description:"API REST de leitura para integração do DG Manual com portais de clientes e outros sistemas autorizados.",
  },
  servers:[{url:"/api/v1"}],
  components:{
    securitySchemes:{
      BearerAuth:{type:"http",scheme:"bearer",bearerFormat:"DG API key"},
    },
    schemas:{
      ApiError:{
        type:"object",
        properties:{error:{type:"object",properties:{code:{type:"string"},message:{type:"string"}}}},
      },
    },
  },
  paths:{
    "/":{
      get:{summary:"Descoberta da API",responses:{"200":{description:"Links e versão da API"}}},
    },
    "/health":{
      get:{summary:"Health check",responses:{"200":{description:"API disponível"}}},
    },
    "/developments":{
      get:{
        summary:"Lista empreendimentos",
        security:[{BearerAuth:[]}],
        parameters:[
          {name:"since",in:"query",schema:{type:"string",format:"date-time"},description:"Retorna registros atualizados após esta data."},
          {name:"limit",in:"query",schema:{type:"integer",minimum:1,maximum:100,default:50}},
        ],
        responses:{"200":{description:"Empreendimentos acessíveis pela organização"},"401":{description:"Chave inválida"},"403":{description:"Escopo insuficiente"}},
      },
    },
    "/manuals":{
      get:{
        summary:"Lista versões de manuais",
        security:[{BearerAuth:[]}],
        parameters:[
          {name:"development_id",in:"query",schema:{type:"string"}},
          {name:"manual_type",in:"query",schema:{type:"string",enum:["proprietario","sindico"]}},
          {name:"status",in:"query",schema:{type:"string"}},
          {name:"since",in:"query",schema:{type:"string",format:"date-time"},description:"Retorna versões emitidas após esta data."},
          {name:"limit",in:"query",schema:{type:"integer",minimum:1,maximum:100,default:50}},
        ],
        responses:{"200":{description:"Versões de manuais"},"401":{description:"Chave inválida"},"403":{description:"Escopo insuficiente"}},
      },
    },
    "/manuals/{id}":{
      get:{
        summary:"Detalha uma versão de manual",
        security:[{BearerAuth:[]}],
        parameters:[{name:"id",in:"path",required:true,schema:{type:"string"}}],
        responses:{"200":{description:"Metadados do manual"},"404":{description:"Manual não encontrado"}},
      },
    },
    "/manuals/{id}/file":{
      get:{
        summary:"Baixa o PDF de uma versão de manual",
        security:[{BearerAuth:[]}],
        parameters:[{name:"id",in:"path",required:true,schema:{type:"string"}}],
        responses:{"200":{description:"Arquivo PDF",content:{"application/pdf":{schema:{type:"string",contentMediaType:"application/pdf"}}}},"404":{description:"Manual não encontrado"}},
      },
    },
  },
}

export function GET(request:Request){return publicJson(spec,200,request)}
export function OPTIONS(request:Request){return publicOptions(request)}
