"use client"

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList } from "recharts"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { bottlenecks } from "@/lib/mock-data"

export function BottlenecksChart() {
  const max = Math.max(...bottlenecks.map((b) => b.count))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gargalos por etapa</CardTitle>
        <CardDescription>Itens travados há mais de 14 dias em revisão.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bottlenecks}
              layout="vertical"
              margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
            >
              <XAxis type="number" hide domain={[0, max + 1]} />
              <YAxis
                type="category"
                dataKey="stage"
                width={104}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                {bottlenecks.map((b, i) => (
                  <Cell
                    key={b.stage}
                    fill={i === 0 ? "var(--destructive)" : "var(--chart-1)"}
                  />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  className="fill-foreground"
                  style={{ fontSize: 12, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
