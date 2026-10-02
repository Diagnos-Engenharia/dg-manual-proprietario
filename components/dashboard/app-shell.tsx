"use client"

import { useState,type ReactNode } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Topbar } from "@/components/dashboard/topbar"

export function AppShell({title,description,actions,children}:{title:string;description?:string;actions?:ReactNode;children:ReactNode}){
  const [open,setOpen]=useState(false)
  return <div className="flex min-h-svh bg-background">
    <Sidebar open={open} onClose={()=>setOpen(false)}/>
    <div className="flex min-w-0 flex-1 flex-col">
      <Topbar onMenu={()=>setOpen(true)}/>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-4 md:px-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h1 className="text-pretty text-2xl font-semibold tracking-tight">{title}</h1>{description?<p className="mt-1 text-sm text-muted-foreground">{description}</p>:null}</div>
          {actions?<div className="flex shrink-0 items-center gap-2">{actions}</div>:null}
        </div>
        {children}
      </main>
    </div>
  </div>
}
