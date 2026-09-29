"use client"

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { developments } from "@/lib/mock-data"

function Donut({ label, value }: { label: string; value: number }) {
  const data = [
    { name: "preenchido", value },
    { name: "restante", value: 100 - value },
  ]
  const color =
    value >= 90 ? "var(--success)" : value >= 60 ? "var(--chart-1)" : "var(--warning)"

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-28 w-28">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={38}
              outerRadius={52}
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
            >
              <Cell fill={color} />
              <Cell fill="var(--muted)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-lg font-semibold">{value}%</span>
        </div>
      </div>
      <span className="mt-1 text-center text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export function Dia0Widget() {
  // Média das fases "Dia 0" entre empreendimentos ativos (contrato assinado)
  const active = developments.filter((d) => d.status !== "finalizado")
  const sistemas = Math.round(
    active.reduce((a, d) => a + d.dia0.sistemasConstrutivos, 0) / active.length,
  )
  const fornecedores = Math.round(
    active.reduce((a, d) => a + d.dia0.fornecedores, 0) / active.length,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Acompanhamento &quot;Dia 0&quot;</CardTitle>
        <CardDescription>
          Preenchimento das fases iniciais desde a assinatura do contrato, desvinculado do
          cronograma de acabamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-around gap-4 pt-2">
        <Donut label="Sistemas Construtivos" value={sistemas} />
        <Donut label="Fornecedores" value={fornecedores} />
      </CardContent>
    </Card>
  )
}
