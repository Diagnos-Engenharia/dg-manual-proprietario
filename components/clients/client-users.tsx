"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Menu } from "@base-ui/react/menu"
import { ChevronLeft, ChevronRight, Copy, KeyRound, MoreHorizontal, Plus, Search, Trash2, UserRound } from "lucide-react"
import { createClientInvitation, createClientPasswordReset, deleteClientAccess, listClientAdminData, setAllClientsAccessStatus, setClientAccessStatus } from "@/app/actions/clients"
import type { ClientActionResult, ClientAdminData, ClientUserRow } from "@/lib/client-types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const statusLabel = { active: "Habilitado", pending: "Convite pendente", disabled: "Inativo" }
const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")

export function ClientUsers({ initialData }: { initialData: ClientAdminData }) {
  const [data, setData] = useState(initialData)
  const [search, setSearch] = useState("")
  const [developmentId, setDevelopmentId] = useState("")
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteDevelopment, setInviteDevelopment] = useState("")
  const [link, setLink] = useState<{ title: string; description: string; url: string } | null>(null)
  const [disable, setDisable] = useState<ClientUserRow | "all" | null>(null)
  const [remove, setRemove] = useState<ClientUserRow | null>(null)
  const previousOrganization = useRef(initialData.organizationId)
  useEffect(() => {
    setData(initialData)
    if (previousOrganization.current !== initialData.organizationId) {
      previousOrganization.current = initialData.organizationId
      setPage(1); setLink(null); setMessage(""); setDisable(null); setRemove(null); setInviteOpen(false)
    }
  }, [initialData])
  const filtered = useMemo(() => data.clients.filter(row => (!developmentId || row.developmentId === developmentId) && fold([row.name, row.email, row.unitLabel, row.developmentName].join(" ")).includes(fold(search.trim()))), [data.clients, developmentId, search])
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10)), currentPage = Math.min(page, pageCount)
  const rows = filtered.slice((currentPage - 1) * 10, currentPage * 10)
  const allEnabled = data.clients.length > 0 && data.clients.every(row => row.status !== "disabled")

  async function perform<T>(action: () => Promise<ClientActionResult<T>>, success?: (result: { ok: true; message: string; data?: T }) => void) {
    if (busy) return
    setBusy(true); setMessage(""); setFailed(false)
    try {
      const result = await action()
      setMessage(result.message); setFailed(!result.ok)
      if (result.ok) {
        success?.(result)
        try { setData(await listClientAdminData()) }
        catch { setFailed(true); setMessage("A operação foi concluída, mas a lista precisa ser atualizada. Recarregue a página.") }
      }
    } catch { setFailed(true); setMessage("Não foi possível concluir a operação. Tente novamente.") }
    finally { setBusy(false) }
  }
  function changeAccess(row: ClientUserRow, enabled: boolean) {
    if (!enabled) setDisable(row)
    else void perform(() => setClientAccessStatus({ id: row.id, enabled: true }))
  }
  function reset(row: ClientUserRow) {
    void perform(() => createClientPasswordReset({ id: row.id }), result => {
      if (result.data) setLink({ title: "Redefinir senha", description: "Envie este link ao cliente pelo canal da construtora. Ele é válido por 15 minutos e pode ser usado uma vez.", url: new URL(result.data.resetPath, window.location.origin).href })
    })
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    void perform(() => createClientInvitation({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), unitId: String(form.get("unitId") ?? "") }), result => {
      if (result.data) { setInviteOpen(false); setLink({ title: "Convite criado", description: "Copie o link e envie ao cliente pelo canal da construtora.", url: new URL(result.data.invitationPath, window.location.origin).href }) }
    })
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative min-w-48 max-w-sm flex-1"><Search aria-hidden className="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input aria-label="Buscar usuários" placeholder="Buscar nome, e-mail ou unidade" className="h-9 pl-9" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} /></div>
        <select aria-label="Filtrar por empreendimento" value={developmentId} onChange={event => { setDevelopmentId(event.target.value); setPage(1) }} className="h-9 max-w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="">Todos os empreendimentos</option>{data.developments.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
      </div>
      <Button onClick={() => { setInviteDevelopment(developmentId); setInviteOpen(true) }} disabled={busy || !data.units.length}><Plus /> Convidar cliente</Button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <p>{data.organizationName} · {data.clients.length} {data.clients.length === 1 ? "cliente" : "clientes"}</p>
      <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2">Acesso dos clientes<Switch aria-label="Acesso de todos os clientes da construtora" checked={allEnabled} disabled={busy || !data.clients.length} onCheckedChange={enabled => enabled ? void perform(() => setAllClientsAccessStatus({ enabled: true })) : setDisable("all")} className="data-checked:bg-emerald-600 data-unchecked:bg-red-500" /></label><Button variant="ghost" size="xs" disabled={busy || !data.clients.length || allEnabled} onClick={() => void perform(() => setAllClientsAccessStatus({ enabled: true }))}>Habilitar todos</Button><Button variant="ghost" size="xs" disabled={busy || !data.clients.some(row => row.status !== "disabled")} onClick={() => setDisable("all")}>Desabilitar todos</Button></div>
    </div>
    {message && <p role={failed ? "alert" : "status"} className={failed ? "rounded-lg bg-red-50 p-3 text-sm text-red-700" : "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"}>{message}</p>}
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto"><table className="w-full text-left text-xs">
        <thead className="border-b text-muted-foreground"><tr>{["Nome", "E-mail", "Unidade", "Empreendimento", "Cadastrado em", "Ações"].map(title => <th scope="col" key={title} className="h-10 px-3 font-medium whitespace-nowrap">{title}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/80 last:border-0 hover:bg-muted/40">
          <td className="px-3 py-1.5"><div className="flex min-w-40 items-center gap-2"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-slate-800"><UserRound className="size-4" aria-hidden /></span><span className="min-w-0"><span className="block font-medium">{row.name}</span><span className={row.status === "active" ? "text-emerald-700" : row.status === "disabled" ? "text-red-600" : "text-muted-foreground"}>{statusLabel[row.status]}</span></span></div></td>
          <td className="px-3 py-2 break-all">{row.email}</td><td className="px-3 py-2 whitespace-nowrap">{row.unitLabel}</td><td className="px-3 py-2">{row.developmentName}</td><td className="px-3 py-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
          <td className="px-3 py-2"><Menu.Root><Menu.Trigger render={<Button variant="ghost" size="icon-sm" aria-label={"Ações de " + row.name} disabled={busy} />}><MoreHorizontal /></Menu.Trigger><Menu.Portal><Menu.Positioner align="end" sideOffset={4} className="z-40"><Menu.Popup className="min-w-52 rounded-lg border border-border bg-popover p-1 shadow-lg">
            <Menu.CheckboxItem checked={row.status !== "disabled"} disabled={busy} onCheckedChange={enabled => changeAccess(row, enabled)} closeOnClick className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-muted"><span>{row.status === "disabled" ? "Habilitar acesso" : "Desabilitar acesso"}</span><span aria-hidden className={"relative h-4 w-7 rounded-full " + (row.status === "disabled" ? "bg-red-500" : "bg-emerald-600")}><span className={"absolute top-0.5 size-3 rounded-full bg-white " + (row.status === "disabled" ? "left-0.5" : "right-0.5")} /></span></Menu.CheckboxItem>
            <Menu.Item disabled={busy || !row.userId || row.status !== "active"} onClick={() => reset(row)} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-muted data-disabled:opacity-40"><KeyRound className="size-4" /> Redefinir senha</Menu.Item>
            <Menu.Item disabled={busy} onClick={() => setRemove(row)} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 outline-none data-highlighted:bg-muted data-disabled:opacity-40"><Trash2 className="size-4" /> Remover acesso</Menu.Item>
          </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></td>
        </tr>)}{!rows.length && <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">{data.clients.length ? "Nenhum usuário corresponde à busca." : "Nenhum cliente cadastrado. Convide um cliente para uma unidade."}</td></tr>}</tbody>
      </table></div>
      <div className="flex items-center justify-end gap-3 border-t px-3 py-3 text-xs text-muted-foreground"><span className="hidden sm:inline">Linhas por página:10</span><span>{filtered.length ? (currentPage - 1) * 10 + 1 : 0}–{Math.min(currentPage * 10, filtered.length)} de {filtered.length}</span><Button variant="ghost" size="icon-sm" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></Button><Button variant="ghost" size="icon-sm" aria-label="Próxima página" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight /></Button></div>
    </div>
    <Dialog open={Boolean(disable)} onOpenChange={open => { if (!open && !busy) setDisable(null) }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>{disable === "all" ? "Desabilitar todos os clientes?" : "Desabilitar acesso?"}</DialogTitle><DialogDescription>{disable === "all" ? "Os clientes desta construtora deixarão de acessar documentos e chat. Os acessos internos da equipe continuam com suas permissões atuais." : "Este cliente deixará de acessar os documentos e o chat desta unidade. Você pode habilitá-lo novamente."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDisable(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => { const target = disable; if (target) void perform(() => target === "all" ? setAllClientsAccessStatus({ enabled: false }) : setClientAccessStatus({ id: target.id, enabled: false }), () => setDisable(null)) }}>{busy ? "Salvando…" : "Desabilitar"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(remove)} onOpenChange={open => { if (!open && !busy) setRemove(null) }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Remover acesso de {remove?.name}?</DialogTitle><DialogDescription>Este vínculo com a unidade será removido e seus convites e links de redefinição deixarão de funcionar. Os demais acessos da pessoa e os documentos publicados permanecem disponíveis para seus destinatários.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRemove(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => { const target = remove; if (target) void perform(() => deleteClientAccess({ id: target.id }), () => setRemove(null)) }}>{busy ? "Removendo…" : "Remover acesso"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={inviteOpen} onOpenChange={open => { if (!busy) setInviteOpen(open) }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Convidar cliente</DialogTitle><DialogDescription>O cliente recebe acesso apenas aos documentos publicados do empreendimento e da unidade vinculada.</DialogDescription></DialogHeader><form onSubmit={invite} className="space-y-3"><label className="block space-y-1 text-sm"><span>Nome</span><Input name="name" required maxLength={120} autoComplete="name" /></label><label className="block space-y-1 text-sm"><span>E-mail</span><Input name="email" type="email" required maxLength={254} autoComplete="email" /></label><label className="block space-y-1 text-sm"><span>Empreendimento</span><select required value={inviteDevelopment} onChange={event => setInviteDevelopment(event.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-2"><option value="">Selecione</option>{data.developments.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="block space-y-1 text-sm"><span>Unidade</span><select key={inviteDevelopment} name="unitId" required defaultValue="" disabled={!inviteDevelopment} className="h-9 w-full rounded-lg border border-input bg-background px-2"><option value="">Selecione</option>{data.units.filter(row => row.developmentId === inviteDevelopment).map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>{failed && message && <p role="alert" className="text-sm text-red-600">{message}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setInviteOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar convite"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(link)} onOpenChange={open => { if (!open) setLink(null) }}><DialogContent><DialogHeader><DialogTitle>{link?.title}</DialogTitle><DialogDescription>{link?.description}</DialogDescription></DialogHeader><Input aria-label="Link para o cliente" readOnly value={link?.url ?? ""} onFocus={event => event.target.select()} /><Button onClick={async () => { if (link) try { await navigator.clipboard.writeText(link.url); setFailed(false); setMessage("Link copiado.") } catch { setFailed(true); setMessage("Selecione e copie o link exibido.") } }}><Copy /> Copiar link</Button></DialogContent></Dialog>
  </div>
}
