import { redirect } from "next/navigation"
import { Building2, CheckCircle2 } from "lucide-react"
import { chooseActiveOrganization } from "@/app/actions/organization-context"
import { getOrganizationChoices, isCurrentUserPlatformManager } from "@/lib/organization"
import { Button } from "@/components/ui/button"

export default async function SelectOrganizationPage(){
  if(await isCurrentUserPlatformManager())redirect("/gerenciador")
  const context=await getOrganizationChoices()
  if(!context.organizations.length)redirect("/onboarding")
  if(context.organizations.length===1&&context.activeOrganizationId)redirect("/")
  return <main className="flex min-h-screen items-center justify-center bg-background p-6">
    <section className="w-full max-w-2xl rounded-2xl border border-border bg-card p-7 shadow-sm">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5"/></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">DG Manual</p><h1 className="mt-1 text-2xl font-semibold">Selecione a construtora</h1></div></div>
      <p className="mt-3 text-sm text-muted-foreground">Escolha a construtora com a qual deseja trabalhar. Os empreendimentos e acessos exibidos serão os dessa construtora.</p>
      <div className="mt-6 grid gap-3">
        {context.organizations.map(item=><form key={item.id} action={chooseActiveOrganization}>
          <input type="hidden" name="organizationId" value={item.id}/>
          <Button type="submit" variant={item.current?"default":"outline"} className="h-auto w-full justify-between px-4 py-3 text-left">
            <span><span className="block font-medium">{item.name}</span><span className="mt-0.5 block text-xs opacity-75">{item.role==="owner"||item.role==="admin"?"Administrador":"Construtor"}</span></span>
            {item.current&&<CheckCircle2 className="h-4 w-4"/>}
          </Button>
        </form>)}
      </div>
    </section>
  </main>
}
