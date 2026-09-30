"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ImageUp,Trash2 } from "lucide-react"
import { updateOrganization } from "@/app/actions/organization"
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function OrganizationIdentity({name:initialName,logo:initialLogo,initials:initialInitials,color:initialColor}:{name:string;logo:string|null;initials:string;color:string}){
  const router=useRouter()
  const [name,setName]=useState(initialName),[logo,setLogo]=useState(initialLogo),[initials,setInitials]=useState(initialInitials),[color,setColor]=useState(initialColor)
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("")
  async function upload(file?:File){
    if(!file)return
    setBusy(true);setError("");setSuccess("")
    try{const form=new FormData();form.append("file",file);const response=await fetch("/api/organization/logo",{method:"POST",body:form});const result=await response.json() as {url?:string;error?:string};if(!response.ok||!result.url)throw new Error(result.error??"Falha no upload");setLogo(result.url);setSuccess("Logotipo enviado. Salve para aplicar.")}
    catch(e){setError(e instanceof Error?e.message:"Falha no envio")}finally{setBusy(false)}
  }
  async function save(){
    if(!name.trim())return setError("Informe o nome da construtora.")
    setBusy(true);setError("");setSuccess("")
    try{await updateOrganization({name,logo:logo??"",initials,primaryColor:color});setSuccess("Informações atualizadas.");window.dispatchEvent(new Event("dg-organization-updated"));router.refresh()}
    catch(e){setError(e instanceof Error?e.message:"Erro ao salvar")}finally{setBusy(false)}
  }
  return <Card><CardHeader><CardTitle>Informações da construtora</CardTitle></CardHeader><CardContent className="space-y-5">
    <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={e=>setName(e.target.value)}/></div>
    <div className="space-y-2"><Label>Logotipo</Label><div className="flex items-center gap-4 rounded-lg border border-border p-4"><div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">{logo?<img src={logo} alt="Logotipo" className="h-full w-full object-contain"/>:<ImageUp className="h-6 w-6 text-muted-foreground"/>}</div><div className="flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted">Selecionar arquivo<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={e=>void upload(e.target.files?.[0])}/></label>{logo&&<Button type="button" variant="outline" onClick={()=>setLogo(null)}><Trash2 className="h-4 w-4"/>Remover</Button>}</div></div><p className="text-xs text-muted-foreground">PNG, JPG ou WebP · até 5 MB.</p></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Iniciais</Label><Input maxLength={4} value={initials} onChange={e=>setInitials(e.target.value)}/></div><div className="space-y-2"><Label>Cor principal</Label><Input type="color" value={color} onChange={e=>setColor(e.target.value)} className="h-10 w-full p-1"/></div></div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{success&&<p role="status" className="text-sm text-success">{success}</p>}
    <Button disabled={busy||!name.trim()} onClick={()=>void save()}>{busy?"Salvando…":"Salvar"}</Button>
  </CardContent></Card>
}
