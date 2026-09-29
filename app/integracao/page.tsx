import { AppShell } from "@/components/dashboard/app-shell"
import { IntegrationPanel } from "@/components/integracao/integration-panel"

export default function IntegracaoPage() {
  return (
    <AppShell
      title="API & integração com o CV"
      description="Autenticação por tokens, webhooks de entrada e rotas de saída para o Construtor de Vendas."
    >
      <IntegrationPanel />
    </AppShell>
  )
}
