"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2,Eye,EyeOff,KeyRound,Save,ShieldCheck,Trash2 } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { removePlatformAiIntegration,savePlatformAiIntegration,testPlatformAiIntegration } from "@/app/actions/platform-integrations"
import { Button } from "@/components/ui/button"
import { Card,CardContent,CardDescription,CardHeader,CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type AiIntegration={provider:string;status:string;testedAt:string|null;updatedAt:string;config:{model?:string}}|null
type FeedbackHandler=(tone:"success"|"error"|"info",message:string)=>void

export function ManagerSettings({managerName,managerEmail,aiIntegration,onFeedback}:{managerName:string;managerEmail:string;aiIntegration:AiIntegration;onFeedback:FeedbackHandler}){
  const router=useRouter()
  const [busy,setBusy]=useState(false)
  const [model,setModel]=useState(aiIntegration?.config.model??"")
  const [apiKey,setApiKey]=useState("")
  const [currentPassword,setCurrentPassword]=useState("")
  const [newPassword,setNewPassword]=useState("")
  const [confirmPassword,setConfirmPassword]=useState("")
  const [showPasswords,setShowPasswords]=useState(false)
  const [revokeOtherSessions,setRevokeOtherSessions]=useState(true)

  async function changePassword(){
    if(newPassword.length<8){onFeedback("error","A nova senha deve ter pelo menos 8 caracteres.");return}
    if(newPassword!==confirmPassword){onFeedback("error","A confirmação da nova senha não confere.");return}
    if(currentPassword===newPassword){onFeedback("error","A nova senha deve ser diferente da senha atual.");return}
    setBusy(true)
    try{
      const result=await authClient.changePassword({currentPassword,newPassword,revokeOtherSessions})
      if(result.error)throw new Error(result.error.message||"Não foi possível alterar a senha.")
      setCurrentPassword("");setNewPassword("");setConfirmPassword("")
      onFeedback("success","Senha alterada com sucesso.")
    }catch(error){onFeedback("error",error instanceof Error?error.message:"Não foi possível alterar a senha.")}
    finally{setBusy(false)}
  }

  async function saveAi(){
    setBusy(true)
    try{
      const result=await savePlatformAiIntegration({apiKey,model})
      onFeedback(result.ok?"success":"error",result.message)
      if(result.ok){setApiKey("");router.refresh()}
    }catch(error){onFeedback("error",error instanceof Error?error.message:"Não foi possível salvar a integração.")}
    finally{setBusy(false)}
  }

  async function testAi(){
    setBusy(true)
    try{
      const result=await testPlatformAiIntegration()
      onFeedback(result.ok?"success":"error",result.message)
      router.refresh()
    }catch(error){onFeedback("error",error instanceof Error?error.message:"Não foi possível testar a OpenAI.")}
    finally{setBusy(false)}
  }

  async function removeAi(){
    if(!window.confirm("Remover a integração OpenAI? O pré-cadastro por Memorial ficará indisponível."))return
    setBusy(true)
    try{
      const result=await removePlatformAiIntegration()
      onFeedback(result.ok?"success":"error",result.message)
      if(result.ok){setApiKey("");setModel("");router.refresh()}
    }catch(error){onFeedback("error",error instanceof Error?error.message:"Não foi possível remover a integração.")}
    finally{setBusy(false)}
  }

  return <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Minha conta</CardTitle><CardDescription>Dados de acesso e segurança do Gerenciador.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</p><p className="mt-1 font-medium">{managerName}</p></div>
            <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">E-mail</p><p className="mt-1 break-all font-medium">{managerEmail}</p></div>
          </div>
          <div className="border-t border-border pt-4">
            <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary"/><p className="font-medium">Alterar senha</p></div>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Senha atual</Label><Input type={showPasswords?"text":"password"} autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Nova senha</Label><Input type={showPasswords?"text":"password"} autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} placeholder="Mínimo de 8 caracteres"/></div>
                <div className="space-y-1.5"><Label>Confirmar senha</Label><Input type={showPasswords?"text":"password"} autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground" onClick={()=>setShowPasswords(value=>!value)}>{showPasswords?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}{showPasswords?"Ocultar senhas":"Mostrar senhas"}</button>
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={revokeOtherSessions} onChange={event=>setRevokeOtherSessions(event.target.checked)} className="h-4 w-4 accent-primary"/>Encerrar outras sessões</label>
              </div>
              <Button disabled={busy||!currentPassword||newPassword.length<8||newPassword!==confirmPassword} onClick={()=>void changePassword()}><KeyRound className="h-4 w-4"/>Alterar senha</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Integração OpenAI</CardTitle><CardDescription>Credencial global usada exclusivamente no servidor para leitura estruturada dos Memoriais.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm"><strong>Fluxo:</strong> Memorial → OpenAI → Checklist oficial → Biblioteca Técnica → revisão humana.</div>
          <div className="space-y-1.5"><Label>Modelo da OpenAI</Label><Input value={model} onChange={event=>setModel(event.target.value)} placeholder="Informe um modelo disponível na sua conta"/></div>
          <div className="space-y-1.5"><Label>Chave da API OpenAI</Label><Input type="password" autoComplete="off" value={apiKey} onChange={event=>setApiKey(event.target.value)} placeholder={aiIntegration?.provider==="openai"?"•••••••• (vazio mantém a chave atual)":"Insira sua chave da OpenAI"}/><p className="text-xs text-muted-foreground">A chave é criptografada no servidor e nunca é devolvida ao navegador após salvar.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy||!model.trim()||(!apiKey&&aiIntegration?.provider!=="openai")} onClick={()=>void saveAi()}><Save className="h-4 w-4"/>Salvar configuração</Button>
            {aiIntegration?.provider==="openai"&&<Button variant="outline" disabled={busy} onClick={()=>void testAi()}>Testar chave e modelo</Button>}
            {aiIntegration&&<Button variant="ghost" disabled={busy} onClick={()=>void removeAi()}><Trash2 className="h-4 w-4"/>Remover</Button>}
          </div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader><CardTitle>Status do motor de IA</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-full",aiIntegration?.status==="verified"?"bg-emerald-500/10 text-emerald-600":"bg-muted text-muted-foreground")}><CheckCircle2 className="h-6 w-6"/></div>
        <div><p className="font-medium">{aiIntegration?.status==="verified"?"OpenAI validada":aiIntegration?"Configuração salva — teste pendente":"OpenAI não configurada"}</p><p className="mt-1 text-sm text-muted-foreground">{aiIntegration?"Modelo: "+(aiIntegration.config.model??"não informado")+(aiIntegration.testedAt?" · último teste "+new Date(aiIntegration.testedAt).toLocaleString("pt-BR"):""):"Cadastre a chave e o modelo para habilitar o processamento dos memoriais."}</p></div>
      </CardContent>
    </Card>
  </div>
}
