"use client"

import { useState } from "react"
import { Building2,PlugZap,Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { OrganizationIdentity } from "@/components/settings/organization-identity"
import { TeamPageContent } from "@/components/team/team-page-content"
import { IntegrationsPanel } from "@/components/settings/integrations-panel"
import { PublicApiPanel } from "@/components/settings/public-api-panel"

type Grant={developmentId:string;role:string}
type Member={id:string;userId:string;role:string;status:string;name:string;email:string;image:string|null;createdAt:string;lastAccessAt:string|null;assignments:Grant[]}
type Development={id:string;name:string}
type Integration={provider:string;configured:boolean;status:string;testedAt:string|null;config:{endpoint?:string}}
type ApiKey={id:string;name:string;keyPrefix:string;scopes:string[];lastUsedAt:string|null;expiresAt:string|null;createdAt:string}

const tabs=[
  {id:"info",label:"Informações da construtora",icon:Building2},
  {id:"equipe",label:"Equipe e acessos",icon:Users},
  {id:"integracoes",label:"API e integrações",icon:PlugZap},
] as const
type TabId=(typeof tabs)[number]["id"]

export function SettingsWorkspace({organization,members,developments,integrations,apiKeys}:{organization:{name:string;logo:string|null;initials:string;color:string};members:Member[];developments:Development[];integrations:Integration[];apiKeys:ApiKey[]}){
  const [active,setActive]=useState<TabId>("info")
  return <div className="space-y-5">
    <div className="grid gap-2 rounded-lg border border-border bg-card p-1 sm:grid-cols-3">{tabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} onClick={()=>setActive(tab.id)} className={cn("flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",active===tab.id?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-4 w-4"/>{tab.label}</button>})}</div>
    {active==="info"&&<OrganizationIdentity name={organization.name} logo={organization.logo} initials={organization.initials} color={organization.color}/>}
    {active==="equipe"&&<TeamPageContent members={members} developments={developments}/>}
    {active==="integracoes"&&<div className="space-y-5"><PublicApiPanel apiKeys={apiKeys}/><IntegrationsPanel entries={integrations}/></div>}
  </div>
}
