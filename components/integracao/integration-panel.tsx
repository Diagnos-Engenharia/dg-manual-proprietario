"use client"

import { useState } from "react"
import {
  KeyRound,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Check,
  Plus,
  Webhook,
  ShieldCheck,
} from "lucide-react"
import {
  apiKeys as initialKeys,
  webhookEvents,
  formatDate,
  formatDateTime,
  type ApiKey,
} from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export function IntegrationPanel() {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys)
  const [copied, setCopied] = useState<string | null>(null)

  function copyToken(token: string) {
    navigator.clipboard?.writeText(token)
    setCopied(token)
    setTimeout(() => setCopied(null), 1500)
  }

  function toggleKey(id: string) {
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, active: !k.active } : k)))
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Autenticação / API keys */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Autenticação — Tokens JWT / API keys</h3>
          </div>
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Gerar nova chave
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Assinatura criptográfica com validade configurável para requisições ao servidor.
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                  key.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <KeyRound className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{key.label}</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      key.active
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {key.active ? "Ativa" : "Revogada"}
                  </Badge>
                </div>
                <button
                  onClick={() => copyToken(key.token)}
                  className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {key.active ? key.token : `${key.token.slice(0, 10)}••••••`}
                  {copied === key.token ? (
                    <Check className="h-3 w-3 text-success" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Criada {formatDate(key.createdAt)}</p>
                <p>Expira {formatDate(key.expiresAt)}</p>
              </div>
              <Switch checked={key.active} onCheckedChange={() => toggleKey(key.id)} />
            </li>
          ))}
        </ul>
      </Card>

      {/* Rotas */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4 text-success" />
            <h3 className="text-sm font-semibold">Webhooks de entrada (CV → Plataforma)</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Rotas POST que recebem o JSON do CV e abrem a pasta do manual da unidade.
          </p>
          <div className="mt-3 rounded-md bg-muted/40 p-3 font-mono text-xs">
            <span className="font-semibold text-success">POST</span>{" "}
            <span className="text-foreground">/api/cv/nova-venda</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Rotas de saída (Plataforma → CV)</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Ao publicar, envia o PDF em base64 ou link com expiração ao endpoint do CV.
          </p>
          <div className="mt-3 rounded-md bg-muted/40 p-3 font-mono text-xs">
            <span className="font-semibold text-primary">PUT</span>{" "}
            <span className="text-foreground">/assistencia/manual</span>
          </div>
        </Card>
      </div>

      {/* Log de eventos */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Log de eventos de integração</h3>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {webhookEvents.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md",
                    ev.direction === "in"
                      ? "bg-success/10 text-success"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {ev.direction === "in" ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {ev.method}
                </Badge>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-foreground">{ev.endpoint}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {ev.payload}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono",
                    ev.status < 300
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                  )}
                >
                  {ev.status}
                </Badge>
                <span className="hidden whitespace-nowrap text-muted-foreground sm:inline">
                  {formatDateTime(ev.timestamp)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
