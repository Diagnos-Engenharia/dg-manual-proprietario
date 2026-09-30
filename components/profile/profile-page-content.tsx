"use client"

import { useState } from "react"
import { CheckCircle2,Eye,EyeOff,KeyRound,ShieldCheck,UserRound } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card,CardContent,CardDescription,CardHeader,CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props={
  name:string
  email:string
  organizationName:string
  roleLabel:string
}

export function ProfilePageContent({name,email,organizationName,roleLabel}:Props){
  const [currentPassword,setCurrentPassword]=useState("")
  const [newPassword,setNewPassword]=useState("")
  const [confirmPassword,setConfirmPassword]=useState("")
  const [showPasswords,setShowPasswords]=useState(false)
  const [revokeOtherSessions,setRevokeOtherSessions]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [success,setSuccess]=useState<string|null>(null)

  const passwordType=showPasswords?"text":"password"
  const canSubmit=currentPassword.length>0&&newPassword.length>=8&&confirmPassword===newPassword&&!saving

  async function changePassword(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault()
    setError(null);setSuccess(null)

    if(newPassword.length<8){
      setError("A nova senha deve ter pelo menos 8 caracteres.")
      return
    }
    if(newPassword!==confirmPassword){
      setError("A confirmação da nova senha não confere.")
      return
    }
    if(currentPassword===newPassword){
      setError("A nova senha deve ser diferente da senha atual.")
      return
    }

    setSaving(true)
    try{
      const result=await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions,
      })
      if(result.error)throw new Error(result.error.message||"Não foi possível alterar a senha.")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setSuccess("Senha alterada com sucesso.")
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Não foi possível alterar a senha.")
    }finally{
      setSaving(false)
    }
  }

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
    <Card className="h-fit">
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserRound className="h-5 w-5"/></div>
          <div className="min-w-0">
            <CardTitle>Conta</CardTitle>
            <CardDescription>Seus dados de identificação no DG Manual.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</p>
          <p className="mt-1 text-base font-medium">{name}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">E-mail</p>
          <p className="mt-1 break-all font-medium">{email}</p>
        </div>
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Construtora</p>
            <p className="mt-1 font-medium">{organizationName}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Perfil de acesso</p>
            <div className="mt-1"><Badge variant="outline">{roleLabel}</Badge></div>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5"/></div>
          <div className="min-w-0">
            <CardTitle>Segurança</CardTitle>
            <CardDescription>Altere sua senha de acesso à plataforma.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={event=>void changePassword(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Senha atual</Label>
            <Input id="current-password" type={passwordType} autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} placeholder="Digite sua senha atual"/>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input id="new-password" type={passwordType} autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} placeholder="Mínimo de 8 caracteres"/>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <Input id="confirm-password" type={passwordType} autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} placeholder="Repita a nova senha"/>
            </div>
          </div>

          <button type="button" onClick={()=>setShowPasswords(value=>!value)} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            {showPasswords?<EyeOff className="h-3.5 w-3.5"/>:<Eye className="h-3.5 w-3.5"/>}
            {showPasswords?"Ocultar senhas":"Mostrar senhas"}
          </button>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3">
            <input type="checkbox" checked={revokeOtherSessions} onChange={event=>setRevokeOtherSessions(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary"/>
            <span className="text-xs leading-relaxed text-muted-foreground"><strong className="font-medium text-foreground">Encerrar outras sessões</strong><br/>Recomendado para manter sua conta protegida após a troca da senha.</span>
          </label>

          {error&&<p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
          {success&&<p role="status" className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4"/>{success}</p>}

          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" disabled={!canSubmit}><KeyRound className="h-4 w-4"/>{saving?"Alterando…":"Alterar senha"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
}
