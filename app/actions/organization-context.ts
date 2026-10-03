"use server"

import { redirect } from "next/navigation"
import { setActiveOrganization } from "@/lib/organization"

export async function chooseActiveOrganization(formData:FormData){
  const organizationId=String(formData.get("organizationId")??"")
  if(!organizationId)throw new Error("Selecione uma construtora")
  await setActiveOrganization(organizationId)
  redirect("/")
}
