"use client"

import { useState } from "react"
import {
  Plus,
  Pencil,
  Phone,
  Mail,
  MessageCircle,
  ShieldCheck,
  DraftingCompass,
  Truck,
  Trash2,
} from "lucide-react"
import {
  technicalContacts as initialContacts,
  disciplines,
  nbrNorms,
  type TechnicalContact,
  type ContactKind,
} from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const emptyContact = (kind: ContactKind): TechnicalContact => ({
  id: "",
  kind,
  name: "",
  company: "",
  discipline: disciplines[0],
  registration: "",
  phone: "",
  whatsapp: "",
  email: "",
  warranty: "",
  nbr: Object.keys(nbrNorms)[0],
})

export function ProjetistasFornecedores() {
  const [contacts, setContacts] = useState<TechnicalContact[]>(initialContacts)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<TechnicalContact | null>(null)

  const projetistas = contacts.filter((c) => c.kind === "projetista")
  const fornecedores = contacts.filter((c) => c.kind === "fornecedor")

  function openNew(kind: ContactKind) {
    setDraft(emptyContact(kind))
    setDialogOpen(true)
  }

  function openEdit(contact: TechnicalContact) {
    setDraft({ ...contact })
    setDialogOpen(true)
  }

  function save() {
    if (!draft) return
    setContacts((prev) => {
      if (draft.id) return prev.map((c) => (c.id === draft.id ? draft : c))
      return [...prev, { ...draft, id: `${draft.kind}-${Date.now()}` }]
    })
    setDialogOpen(false)
    setDraft(null)
  }

  function remove(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ManagerCard
        title="Projetistas"
        subtitle="Engenheiros e arquitetos responsáveis"
        icon={DraftingCompass}
        kind="projetista"
        contacts={projetistas}
        onAdd={() => openNew("projetista")}
        onEdit={openEdit}
        onRemove={remove}
      />
      <ManagerCard
        title="Fornecedores"
        subtitle="Fabricantes e prestadores de serviço"
        icon={Truck}
        kind="fornecedor"
        contacts={fornecedores}
        onAdd={() => openNew("fornecedor")}
        onEdit={openEdit}
        onRemove={remove}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "Editar" : "Adicionar"}{" "}
              {draft?.kind === "projetista" ? "projetista" : "fornecedor"}
            </DialogTitle>
            <DialogDescription>
              Dados técnicos e de contato incluídos no manual gerado.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={draft.kind === "projetista" ? "Nome" : "Contato"}>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Nome do responsável"
                  />
                </Field>
                <Field label="Empresa">
                  <Input
                    value={draft.company}
                    onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                    placeholder="Razão social"
                  />
                </Field>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Disciplina / Especialidade">
                  <Select
                    value={draft.discipline}
                    onValueChange={(v) => setDraft({ ...draft, discipline: v ?? "" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {disciplines.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={draft.kind === "projetista" ? "CREA / CAU" : "CNPJ"}>
                  <Input
                    value={draft.registration}
                    onChange={(e) => setDraft({ ...draft, registration: e.target.value })}
                    placeholder={draft.kind === "projetista" ? "CREA-SP 000000" : "00.000.000/0001-00"}
                  />
                </Field>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Telefone">
                  <Input
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    placeholder="(11) 0000-0000"
                  />
                </Field>
                <Field label="WhatsApp (só números)">
                  <Input
                    value={draft.whatsapp}
                    onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
                    placeholder="5511900000000"
                  />
                </Field>
              </div>

              <Field label="E-mail">
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  placeholder="contato@empresa.com.br"
                />
              </Field>

              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Prazo de garantia">
                  <Input
                    value={draft.warranty}
                    onChange={(e) => setDraft({ ...draft, warranty: e.target.value })}
                    placeholder="Ex.: 5 anos (estrutura)"
                  />
                </Field>
                <Field label="Norma técnica (NBR)">
                  <Select
                    value={draft.nbr}
                    onValueChange={(v) => setDraft({ ...draft, nbr: v ?? "" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(nbrNorms).map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!draft?.name || !draft?.company}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function ManagerCard({
  title,
  subtitle,
  icon: Icon,
  contacts,
  onAdd,
  onEdit,
  onRemove,
}: {
  title: string
  subtitle: string
  icon: typeof DraftingCompass
  kind: ContactKind
  contacts: TechnicalContact[]
  onAdd: () => void
  onEdit: (c: TechnicalContact) => void
  onRemove: (id: string) => void
}) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Badge variant="outline" className="border-border font-mono">
          {contacts.length}
        </Badge>
      </div>

      <ul className="mt-4 flex flex-1 flex-col gap-3">
        {contacts.map((c) => (
          <li key={c.id} className="rounded-lg border border-border bg-background/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">{c.company}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label="Editar"
                  onClick={() => onEdit(c)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Remover"
                  onClick={() => onRemove(c.id)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-xs">
                {c.discipline}
              </Badge>
              <span className="font-mono text-[11px] text-muted-foreground">{c.registration}</span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <a
                href={`tel:${c.phone.replace(/\D/g, "")}`}
                className="flex items-center gap-1 transition-colors hover:text-foreground"
              >
                <Phone className="h-3 w-3" />
                {c.phone}
              </a>
              <a
                href={`https://wa.me/${c.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-success transition-colors hover:opacity-80"
              >
                <MessageCircle className="h-3 w-3" />
                WhatsApp
              </a>
              <a
                href={`mailto:${c.email}`}
                className="flex items-center gap-1 transition-colors hover:text-foreground"
              >
                <Mail className="h-3 w-3" />
                E-mail
              </a>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                {c.warranty}
              </span>
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/5 font-mono text-[10px] text-primary"
              >
                {c.nbr}
              </Badge>
            </div>
          </li>
        ))}
        {contacts.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Nenhum registro ainda.
          </li>
        )}
      </ul>

      <Button variant="outline" className="mt-4 w-full bg-transparent" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Adicionar {title === "Projetistas" ? "projetista" : "fornecedor"}
      </Button>
    </Card>
  )
}
