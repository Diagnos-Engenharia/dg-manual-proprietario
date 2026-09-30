"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle,KeyRound,Trash2 } from "lucide-react"
import { createPublicApiKey,revokePublicApiKey } from "@/app/actions/public-api-keys"
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog"

type ApiKey={id:string;name:string;keyPrefix:string;scopes:string[];lastUsedAt:string|null;expiresAt:string|null;createdAt:string}

function formatDate(value:string|null){
  if(!value)return "Nunca"
  return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))
}

export function PublicApiPanel({apiKeys}:{apiKeys:ApiKey[]}){
  const router=useRouter()
  const [name,setName]=useState("Portal do Cliente")
  const [generated,setGenerated]=useState("")
  const [busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState("")
  const [revokeTarget,setRevokeTarget]=useState<ApiKey|null>(null)

  async function generate(){
    setBusy(true);setFeedback("")
    try{
      const result=await createPublicApiKey({name})
      setGenerated(result.token)
      setFeedback("Chave criada. Copie e guarde agora: por segurança ela não será exibida novamente.")
      router.refresh()
    }catch(error){
      setFeedback(error instanceof Error?error.message:"Não foi possível gerar a chave.")
    }finally{setBusy(false)}
  }

  async function revoke(){
    if(!revokeTarget)return
    setBusy(true);setFeedback("")
    try{
      await revokePublicApiKey(revokeTarget.id)
      setFeedback("Chave revogada.")
      setRevokeTarget(null)
      router.refresh()
    }catch(error){
      setFeedback(error instanceof Error?error.message:"Não foi possível revogar a chave.")
    }finally{setBusy(false)}
  }

  return <Card>
    <CardHeader><CardTitle>API pública do DG Manual</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-sm font-medium">API de leitura para portais e sistemas externos</p>
        <p className="mt-1 text-sm text-muted-foreground">A documentação OpenAPI é pública; empreendimentos, metadados e PDFs exigem uma chave Bearer.</p>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div><span className="font-medium text-foreground">Base:</span> /api/v1</div>
          <div><span className="font-medium text-foreground">OpenAPI:</span> /api/v1/openapi.json</div>
          <div><span className="font-medium text-foreground">Empreendimentos:</span> GET /api/v1/developments</div>
          <div><span className="font-medium text-foreground">Manuais:</span> GET /api/v1/manuals</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5"><Label>Nome da credencial</Label><Input value={name} onChange={event=>setName(event.target.value)} maxLength={80} placeholder="Portal do Cliente"/></div>
        <Button onClick={()=>void generate()} disabled={busy}><KeyRound className="h-4 w-4"/>Gerar chave</Button>
      </div>

      {generated&&<div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <Label>Nova chave — exibida somente agora</Label>
        <Input readOnly value={generated} className="font-mono text-xs"/>
        <p className="text-xs text-muted-foreground">Use no cabeçalho: Authorization: Bearer &lt;chave&gt;</p>
      </div>}

      <div className="space-y-2">
        <p className="text-sm font-medium">Chaves ativas</p>
        {apiKeys.length===0?<p className="text-sm text-muted-foreground">Nenhuma chave de API criada.</p>:apiKeys.map(key=><div key={key.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{key.name}</span><Badge variant="outline">Ativa</Badge></div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{key.keyPrefix}••••••••</p>
            <p className="mt-1 text-xs text-muted-foreground">Último uso: {formatDate(key.lastUsedAt)} · Criada: {formatDate(key.createdAt)}</p>
          </div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={()=>setRevokeTarget(key)}><Trash2 className="h-4 w-4"/>Revogar</Button>
        </div>)}
      </div>
      {feedback&&<p role="status" className="text-xs text-muted-foreground">{feedback}</p>}
    </CardContent>

    <Dialog open={revokeTarget!==null} onOpenChange={open=>{if(!open&&!busy)setRevokeTarget(null)}}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><AlertTriangle className="h-5 w-5"/></div>
            <div className="min-w-0">
              <DialogTitle>Revogar chave de API</DialogTitle>
              <DialogDescription className="mt-1">Esta ação interrompe imediatamente o acesso de sistemas que usam esta credencial.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {revokeTarget&&<div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Credencial</p>
          <p className="mt-1 font-medium">{revokeTarget.name}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{revokeTarget.keyPrefix}••••••••</p>
        </div>}

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={()=>setRevokeTarget(null)}>Cancelar</Button>
          <Button variant="destructive" disabled={busy} onClick={()=>void revoke()}><Trash2 className="h-4 w-4"/>{busy?"Revogando…":"Revogar chave"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>
}
