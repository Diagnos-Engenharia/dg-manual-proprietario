import { checklistCategories as spreadsheetChecklistCategories, checklistItems as spreadsheetChecklistItems } from "@/generated-checklist"

export type ProjectStatus = "em_andamento" | "pausado" | "finalizado"

export type Phase = {
  name: string
  weight: number // peso percentual no progresso Master
  progress: number // 0-100
}

export type Unit = {
  label: string // Torre A, Bloco 2, 4º andar...
  progress: number // 0-100
}

export type Development = {
  id: string
  name: string
  client: string
  status: ProjectStatus
  deliveryDate: string // ISO
  masterProgress: number // calculado por peso
  dia0: {
    sistemasConstrutivos: number // % preenchido
    fornecedores: number // % preenchido
  }
  phases: Phase[]
  units: Unit[]
}

export type Bottleneck = {
  stage: string
  count: number // itens travados
}

export type ReviewAlert = {
  id: string
  development: string
  item: string
  responsible: string
  daysWaiting: number
  severity: "ok" | "warning" | "critical"
}

// Cálculo do progresso Master ponderado pelo peso de cada fase
export function computeMaster(phases: Phase[]): number {
  const totalWeight = phases.reduce((acc, p) => acc + p.weight, 0)
  if (totalWeight === 0) return 0
  const weighted = phases.reduce((acc, p) => acc + p.progress * p.weight, 0)
  return Math.round(weighted / totalWeight)
}

const rawDevelopments: Omit<Development, "masterProgress">[] = [
  {
    id: "emp-residencial-aurora",
    name: "Residencial Aurora",
    client: "Construtora Meridian",
    status: "em_andamento",
    deliveryDate: "2026-09-30",
    dia0: { sistemasConstrutivos: 92, fornecedores: 78 },
    phases: [
      { name: "Sistemas Construtivos", weight: 25, progress: 92 },
      { name: "Fornecedores", weight: 15, progress: 78 },
      { name: "Revestimentos", weight: 20, progress: 64 },
      { name: "Áreas Comuns", weight: 20, progress: 41 },
      { name: "Documentação Legal", weight: 20, progress: 30 },
    ],
    units: [
      { label: "Torre A", progress: 72 },
      { label: "Torre B", progress: 58 },
      { label: "Torre C", progress: 34 },
    ],
  },
  {
    id: "emp-vista-park",
    name: "Vista Park Residence",
    client: "Incorporadora Solar",
    status: "em_andamento",
    deliveryDate: "2026-11-15",
    dia0: { sistemasConstrutivos: 100, fornecedores: 95 },
    phases: [
      { name: "Sistemas Construtivos", weight: 25, progress: 100 },
      { name: "Fornecedores", weight: 15, progress: 95 },
      { name: "Revestimentos", weight: 20, progress: 88 },
      { name: "Áreas Comuns", weight: 20, progress: 70 },
      { name: "Documentação Legal", weight: 20, progress: 62 },
    ],
    units: [
      { label: "Bloco 1", progress: 91 },
      { label: "Bloco 2", progress: 84 },
      { label: "Bloco 3", progress: 78 },
      { label: "Bloco 4", progress: 65 },
    ],
  },
  {
    id: "emp-jardim-horizonte",
    name: "Jardim Horizonte",
    client: "Construtora Meridian",
    status: "pausado",
    deliveryDate: "2027-02-20",
    dia0: { sistemasConstrutivos: 55, fornecedores: 40 },
    phases: [
      { name: "Sistemas Construtivos", weight: 25, progress: 55 },
      { name: "Fornecedores", weight: 15, progress: 40 },
      { name: "Revestimentos", weight: 20, progress: 22 },
      { name: "Áreas Comuns", weight: 20, progress: 10 },
      { name: "Documentação Legal", weight: 20, progress: 8 },
    ],
    units: [
      { label: "Torre Única", progress: 27 },
    ],
  },
  {
    id: "emp-portal-das-aguas",
    name: "Portal das Águas",
    client: "MRV Empreendimentos",
    status: "finalizado",
    deliveryDate: "2025-12-10",
    dia0: { sistemasConstrutivos: 100, fornecedores: 100 },
    phases: [
      { name: "Sistemas Construtivos", weight: 25, progress: 100 },
      { name: "Fornecedores", weight: 15, progress: 100 },
      { name: "Revestimentos", weight: 20, progress: 100 },
      { name: "Áreas Comuns", weight: 20, progress: 100 },
      { name: "Documentação Legal", weight: 20, progress: 100 },
    ],
    units: [
      { label: "Bloco A", progress: 100 },
      { label: "Bloco B", progress: 100 },
    ],
  },
  {
    id: "emp-terra-nova",
    name: "Terra Nova Life",
    client: "Incorporadora Solar",
    status: "em_andamento",
    deliveryDate: "2026-08-05",
    dia0: { sistemasConstrutivos: 80, fornecedores: 60 },
    phases: [
      { name: "Sistemas Construtivos", weight: 25, progress: 80 },
      { name: "Fornecedores", weight: 15, progress: 60 },
      { name: "Revestimentos", weight: 20, progress: 48 },
      { name: "Áreas Comuns", weight: 20, progress: 33 },
      { name: "Documentação Legal", weight: 20, progress: 25 },
    ],
    units: [
      { label: "Torre Norte", progress: 55 },
      { label: "Torre Sul", progress: 42 },
    ],
  },
]

export const developments: Development[] = rawDevelopments.map((d) => ({
  ...d,
  masterProgress: computeMaster(d.phases),
}))

export const bottlenecks: Bottleneck[] = [
  { stage: "Revestimentos", count: 8 },
  { stage: "Documentação Legal", count: 6 },
  { stage: "Áreas Comuns", count: 5 },
  { stage: "Fornecedores", count: 3 },
  { stage: "Sistemas Constr.", count: 1 },
]

export const reviewAlerts: ReviewAlert[] = [
  {
    id: "alert-1",
    development: "Residencial Aurora",
    item: "Especificação de pisos — Torre C",
    responsible: "Arq. Helena Braga",
    daysWaiting: 16,
    severity: "critical",
  },
  {
    id: "alert-2",
    development: "Jardim Horizonte",
    item: "Memorial descritivo — Áreas comuns",
    responsible: "Eng. Marcos Vinícius",
    daysWaiting: 21,
    severity: "critical",
  },
  {
    id: "alert-3",
    development: "Terra Nova Life",
    item: "Lista de fornecedores hidráulicos",
    responsible: "Arq. Helena Braga",
    daysWaiting: 9,
    severity: "warning",
  },
  {
    id: "alert-4",
    development: "Vista Park Residence",
    item: "Revisão de garantias — Bloco 4",
    responsible: "Eng. Patrícia Lemos",
    daysWaiting: 11,
    severity: "warning",
  },
  {
    id: "alert-5",
    development: "Residencial Aurora",
    item: "Texto de manutenção preventiva",
    responsible: "Eng. Marcos Vinícius",
    daysWaiting: 4,
    severity: "ok",
  },
]

export const statusLabels: Record<ProjectStatus, string> = {
  em_andamento: "Em andamento",
  pausado: "Pausado",
  finalizado: "Finalizado",
}

export function formatDate(iso: string): string {
  // Datas de calendário são tratadas como texto, não como instantes no tempo.
  // Isso evita que o fuso do servidor ou do navegador altere o dia exibido.
  const [year, month, day] = iso.slice(0, 10).split("-")
  const monthNames = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."]
  const monthName = monthNames[Number(month) - 1]
  return `${day} de ${monthName} de ${year}`
}

// ---------------------------------------------------------------------------
// Módulo 2 — Gestão de Cronograma
// ---------------------------------------------------------------------------

export type Revision = {
  tag: string // Rev 01, Rev 02
  date: string // ISO — data em que a revisão foi criada
  previousDate: string // snapshot da data anterior
  newDate: string // nova data reprogramada
  justification: string
  author: string
}

export type SchedulePhase = {
  id: string
  name: string
  weight: number // peso percentual no progresso Master
  originalDate: string // ISO — bloqueada após a primeira gravação
  scheduledDate: string // ISO — editável, gera revisão
  status: "no_prazo" | "atrasado" | "concluido"
  revisions: Revision[]
  /** Identificador imutável da etapa nativa. */
  kind?: "ficha" | "checklist" | "proprietario" | "sindico" | "custom"
  /** Progresso manual usado somente em etapas adicionais. */
  progress?: number
}

export const schedulePhases: SchedulePhase[] = [
  {
    id: "ph-sistemas",
name: "Ficha Técnica do Empreendimento",
    weight: 25,
    originalDate: "2024-11-30",
    scheduledDate: "2024-11-30",
    status: "concluido",
    revisions: [],
  },
  {
    id: "ph-fornecedores",
name: "Checklist Inicial",
    weight: 25,
    originalDate: "2025-02-15",
    scheduledDate: "2025-03-10",
    status: "concluido",
    revisions: [
      {
        tag: "Rev 01",
        date: "2025-01-20",
        previousDate: "2025-02-15",
        newDate: "2025-03-10",
        justification: "Atraso na entrega da lista de fornecedores hidráulicos pela construtora.",
        author: "Rafael Gomes",
      },
    ],
  },
  {
    id: "ph-revestimentos",
    name: "Manual do Proprietário",
    weight: 25,
    originalDate: "2026-04-30",
    scheduledDate: "2026-06-15",
    status: "atrasado",
    revisions: [
      {
        tag: "Rev 01",
        date: "2026-03-02",
        previousDate: "2026-04-30",
        newDate: "2026-05-20",
        justification: "Reabertura de escopo — inclusão da linha ELIANE na Torre C.",
        author: "Arq. Helena Braga",
      },
      {
        tag: "Rev 02",
        date: "2026-05-10",
        previousDate: "2026-05-20",
        newDate: "2026-06-15",
        justification: "Auditoria linha a linha exigiu revalidação do padrão do Apartamento 11.",
        author: "Arq. Helena Braga",
      },
    ],
  },
  {
    id: "ph-areas-comuns",
    name: "Manual do Síndico",
    weight: 25,
    originalDate: "2026-07-31",
    scheduledDate: "2026-07-31",
    status: "no_prazo",
    revisions: [],
  },
  {
    id: "ph-documentacao",
    name: "Documentação Legal",
    weight: 20,
    originalDate: "2026-08-31",
    scheduledDate: "2026-09-20",
    status: "no_prazo",
    revisions: [
      {
        tag: "Rev 01",
        date: "2026-06-18",
        previousDate: "2026-08-31",
        newDate: "2026-09-20",
        justification: "Aguardando emissão do Habite-se para consolidar garantias legais.",
        author: "Eng. Marcos Vinícius",
      },
    ],
  },
]

export const schedulePhaseStatusLabels: Record<SchedulePhase["status"], string> = {
  no_prazo: "No prazo",
  atrasado: "Atrasado",
  concluido: "Concluído",
}

// Ordenação cronológica ascendente estrita (mais antigo → mais recente),
// comparando timestamps reais para não classificar 2024 acima de 2026.
export function sortByScheduledDate(phases: SchedulePhase[]): SchedulePhase[] {
  return [...phases].sort(
    (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
  )
}

export function daysUntil(iso: string, todayIso?: string): number {
  const today = todayIso ? new Date(`${todayIso}T00:00:00`) : new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(iso)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
}

// ---------------------------------------------------------------------------
// Módulo 3 — Motor de Autoria e Validação Técnica
// ---------------------------------------------------------------------------

export type TeamMember = {
  id: string
  name: string
  role: string
  initials: string
}

export const teamMembers: TeamMember[] = [
  { id: "u-helena", name: "Arq. Helena Braga", role: "Arquiteta", initials: "HB" },
  { id: "u-marcos", name: "Eng. Marcos Vinícius", role: "Engenheiro civil", initials: "MV" },
  { id: "u-patricia", name: "Eng. Patrícia Lemos", role: "Engenheira", initials: "PL" },
  { id: "u-rafael", name: "Rafael Gomes", role: "Gestor de projetos", initials: "RG" },
]

export type MaterialRow = {
  id: string
  ambiente: string
  aplicacao: string
  marca: string
  linha: string
  referencia: string
  formato: string
}

// Apartamento 11 — unidade de referência (padrão-base para clonagem)
export const referenceMaterials: MaterialRow[] = [
  {
    id: "m-1",
    ambiente: "Sala de estar",
    aplicacao: "Piso",
    marca: "ELIANE",
    linha: "Habitat",
    referencia: "Marfim",
    formato: "60x60 cm",
  },
  {
    id: "m-2",
    ambiente: "Cozinha",
    aplicacao: "Piso",
    marca: "ELIANE",
    linha: "Habitat",
    referencia: "Marfim",
    formato: "60x60 cm",
  },
  {
    id: "m-3",
    ambiente: "Cozinha",
    aplicacao: "Parede",
    marca: "ELIANE",
    linha: "Forma",
    referencia: "Branco AC",
    formato: "30x60 cm",
  },
  {
    id: "m-4",
    ambiente: "Banheiro social",
    aplicacao: "Piso",
    marca: "PORTINARI",
    linha: "Ceppo",
    referencia: "Cinza",
    formato: "60x60 cm",
  },
  {
    id: "m-5",
    ambiente: "Banheiro social",
    aplicacao: "Parede",
    marca: "ELIANE",
    linha: "Munari",
    referencia: "Branco",
    formato: "32x60 cm",
  },
  {
    id: "m-6",
    ambiente: "Área de serviço",
    aplicacao: "Piso",
    marca: "ELIANE",
    linha: "Habitat",
    referencia: "Marfim",
    formato: "60x60 cm",
  },
]

export type TabStatus = "rascunho" | "em_revisao" | "aprovado"

export type ApprovalLog = {
  id: string
  tabName: string
  user: string
  action: string
  timestamp: string // ISO
}

export type AuthoringTab = {
  id: string
  label: string
  status: TabStatus
  assignees: string[] // ids de TeamMember
  contentHtml: string
}

export const authoringTabs: AuthoringTab[] = [
  {
    id: "tab-fornecedores",
    label: "Fornecedores",
    status: "aprovado",
    assignees: ["u-marcos"],
    contentHtml:
      "<h2>Fornecedores homologados</h2><p>Relação de <strong>fornecedores</strong> e prestadores responsáveis pelos sistemas do empreendimento.</p><ul><li>Hidráulica — Tigre</li><li>Elétrica — Pial Legrand</li><li>Esquadrias — Sasazaki</li></ul>",
  },
  {
    id: "tab-sistemas",
    label: "Sistemas Construtivos",
    status: "aprovado",
    assignees: ["u-marcos", "u-patricia"],
    contentHtml:
      "<h2>Sistemas construtivos</h2><p>Descrição da estrutura, vedações e impermeabilizações adotadas na obra.</p>",
  },
  {
    id: "tab-revestimentos",
    label: "Revestimentos",
    status: "em_revisao",
    assignees: ["u-helena"],
    contentHtml:
      "<h2>Revestimentos cerâmicos</h2><p>Especificação de pisos e paredes por ambiente, auditada linha a linha a partir do <strong>Apartamento 11</strong> (unidade de referência).</p>",
  },
  {
    id: "tab-areas-comuns",
    label: "Áreas Comuns",
    status: "rascunho",
    assignees: ["u-helena", "u-patricia"],
    contentHtml:
      "<h2>Áreas comuns</h2><p>Salão de festas, piscina, academia e demais espaços de uso coletivo.</p>",
  },
  {
    id: "tab-documentacao",
    label: "Documentação Legal",
    status: "rascunho",
    assignees: ["u-marcos"],
    contentHtml: "<h2>Documentação legal</h2><p>Garantias, memoriais e certidões.</p>",
  },
]

export const approvalLogs: ApprovalLog[] = [
  {
    id: "log-1",
    tabName: "Fornecedores",
    user: "Eng. Marcos Vinícius",
    action: "Aprovou a aba",
    timestamp: "2026-07-28T14:32:00",
  },
  {
    id: "log-2",
    tabName: "Sistemas Construtivos",
    user: "Eng. Patrícia Lemos",
    action: "Aprovou a aba",
    timestamp: "2026-07-25T09:15:00",
  },
  {
    id: "log-3",
    tabName: "Revestimentos",
    user: "Arq. Helena Braga",
    action: "Enviou para revisão",
    timestamp: "2026-08-01T16:48:00",
  },
]

export const tabStatusLabels: Record<TabStatus, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ---------------------------------------------------------------------------
// Módulo 4 — White-Label (Multi-Tenant)
// ---------------------------------------------------------------------------

export type Tenant = {
  id: string
  name: string
  manuals: number
  primary: string // HEX
  secondary: string // HEX
  logoInitials: string
  coverTemplate: string
}

export const tenants: Tenant[] = [
  {
    id: "tnt-meridian",
    name: "Construtora Meridian",
    manuals: 2,
    primary: "#1E4B8F",
    secondary: "#E8A33D",
    logoInitials: "CM",
    coverTemplate: "moderno",
  },
  {
    id: "tnt-solar",
    name: "Incorporadora Solar",
    manuals: 2,
    primary: "#C2410C",
    secondary: "#0F766E",
    logoInitials: "IS",
    coverTemplate: "classico",
  },
  {
    id: "tnt-mrv",
    name: "MRV Empreendimentos",
    manuals: 1,
    primary: "#047857",
    secondary: "#334155",
    logoInitials: "MRV",
    coverTemplate: "minimalista",
  },
]

export const coverTemplates: { id: string; label: string; description: string }[] = [
  { id: "moderno", label: "Moderno", description: "Bloco de cor diagonal com logo centralizado" },
  { id: "classico", label: "Clássico", description: "Faixa superior sólida e moldura discreta" },
  { id: "minimalista", label: "Minimalista", description: "Fundo neutro com logo e título alinhados" },
]

// ---------------------------------------------------------------------------
// Módulo 5 — Emissão de PDF
// ---------------------------------------------------------------------------

export type CompileStep = {
  id: string
  label: string
  description: string
}

export const compileSteps: CompileStep[] = [
  {
    id: "costura",
    label: "Costura e unificação das abas",
    description: "Junta o HTML das abas aprovadas na ordem configurada em uma página única.",
  },
  {
    id: "sumario",
    label: "Geração de sumário e variáveis",
    description: "Varre tags H1/H2 para o índice e substitui {{variáveis}} pelos dados do banco.",
  },
  {
    id: "render",
    label: "Renderização (Puppeteer)",
    description: "Imprime a página invisível como PDF com as cores e o logo do tenant.",
  },
  {
    id: "merge",
    label: "Mesclagem e compressão",
    description: "Anexa documentos externos, reduz resolução das fotos e achata o arquivo final.",
  },
]

export type ManualVariable = { token: string; value: string }

export const manualVariables: ManualVariable[] = [
  { token: "{{nome_cliente}}", value: "Residencial Aurora" },
  { token: "{{construtora}}", value: "Construtora Meridian" },
  { token: "{{unidade}}", value: "Apartamento 402 — Torre A" },
  { token: "{{data_entrega}}", value: "30/09/2026" },
  { token: "{{responsavel_tecnico}}", value: "Eng. Marcos Vinícius" },
]

export type PdfSummaryItem = { level: 1 | 2; title: string; page: number }

export const pdfSummary: PdfSummaryItem[] = [
  { level: 1, title: "Sistemas Construtivos", page: 3 },
  { level: 2, title: "Estrutura e vedações", page: 4 },
  { level: 2, title: "Impermeabilização", page: 7 },
  { level: 1, title: "Fornecedores", page: 9 },
  { level: 1, title: "Revestimentos", page: 12 },
  { level: 2, title: "Especificação por ambiente", page: 13 },
  { level: 1, title: "Áreas Comuns", page: 18 },
  { level: 1, title: "Documentação Legal", page: 22 },
]

// ---------------------------------------------------------------------------
// Módulo 6 — API e Integração com o CV
// ---------------------------------------------------------------------------

export type ApiKey = {
  id: string
  label: string
  token: string
  createdAt: string
  expiresAt: string
  active: boolean
}

export const apiKeys: ApiKey[] = [
  {
    id: "key-1",
    label: "CV Produção",
    token: "dg_live_8f3a1c9b7e2d4a6f",
    createdAt: "2026-01-15",
    expiresAt: "2027-01-15",
    active: true,
  },
  {
    id: "key-2",
    label: "CV Homologação",
    token: "dg_test_2b7d4e1a9c6f3082",
    createdAt: "2026-03-02",
    expiresAt: "2026-09-02",
    active: true,
  },
  {
    id: "key-3",
    label: "Integração legada",
    token: "dg_live_5a2f8c1d3b9e7064",
    createdAt: "2025-06-10",
    expiresAt: "2026-06-10",
    active: false,
  },
]

export type WebhookEvent = {
  id: string
  direction: "in" | "out"
  method: "POST" | "PUT"
  endpoint: string
  payload: string
  status: number
  timestamp: string
}

export const webhookEvents: WebhookEvent[] = [
  {
    id: "wh-1",
    direction: "in",
    method: "POST",
    endpoint: "/api/cv/nova-venda",
    payload: '{ "evento": "Nova Venda", "unidade": "402", "torre": "A" }',
    status: 201,
    timestamp: "2026-08-06T10:12:00",
  },
  {
    id: "wh-2",
    direction: "out",
    method: "PUT",
    endpoint: "https://cv.cliente.com/assistencia/manual",
    payload: '{ "unidade": "310", "pdf": "base64...", "status": "publicado" }',
    status: 200,
    timestamp: "2026-08-06T09:47:00",
  },
  {
    id: "wh-3",
    direction: "in",
    method: "POST",
    endpoint: "/api/cv/nova-venda",
    payload: '{ "evento": "Nova Venda", "unidade": "115", "torre": "B" }',
    status: 201,
    timestamp: "2026-08-05T17:30:00",
  },
  {
    id: "wh-4",
    direction: "out",
    method: "POST",
    endpoint: "https://cv.cliente.com/assistencia/manual",
    payload: '{ "unidade": "402", "link": "https://.../expira-24h", "status": "publicado" }',
    status: 200,
    timestamp: "2026-08-05T14:05:00",
  },
]

// ---------------------------------------------------------------------------
// Módulo 3.1 — Manual duplo & progressão da obra (Elaboração Contínua)
// ---------------------------------------------------------------------------

export type ManualType = "proprietario" | "sindico"

export const manualLabels: Record<ManualType, { title: string; subtitle: string }> = {
  proprietario: {
    title: "Manual do Proprietário",
    subtitle: "Especificações técnicas da unidade e guia de uso",
  },
  sindico: {
    title: "Manual do Síndico",
    subtitle: "Áreas comuns, manutenção predial e procedimentos de operação",
  },
}

export type ConstructionMilestone = {
  id: string
  label: string
  progress: number // 0-100
  done: boolean
}

export const constructionMilestones: ConstructionMilestone[] = [
  { id: "fundacao", label: "Fundação", progress: 100, done: true },
  { id: "estrutura", label: "Estrutura", progress: 100, done: true },
  { id: "acabamentos", label: "Acabamentos", progress: 62, done: false },
  { id: "entrega", label: "Entrega", progress: 0, done: false },
]

// Normas técnicas de referência (mapa NBR → descrição curta)
export const nbrNorms: Record<string, string> = {
  "NBR 15575": "Desempenho de edificações habitacionais",
  "NBR 14037": "Manual de uso, operação e manutenção",
  "NBR 5674": "Manutenção de edificações — requisitos",
  "NBR 6118": "Projeto de estruturas de concreto",
  "NBR 15575-2": "Desempenho — sistemas estruturais",
  "NBR 15575-4": "Desempenho — vedações verticais",
  "NBR 13753": "Revestimento de piso com placas cerâmicas",
  "NBR 13754": "Revestimento de paredes com placas cerâmicas",
  "NBR 14715": "Chapas de gesso para drywall (tetos)",
  "NBR 10821": "Esquadrias externas para edificações",
  "NBR 7199": "Projeto, execução e aplicação de vidros",
  "NBR 5626": "Sistemas prediais de água fria e quente",
  "NBR 8160": "Sistemas prediais de esgoto sanitário",
  "NBR 5410": "Instalações elétricas de baixa tensão",
  "NBR 13103": "Adequação de ambientes para gás combustível",
  "NBR 15526": "Redes de distribuição interna de gás",
  "NBR 16401": "Instalações de ar-condicionado central",
}

// Selos normativos destacados no rastreador da obra
export const complianceTags: { code: string; label: string }[] = [
  { code: "NBR 15575", label: "Desempenho" },
  { code: "NBR 14037", label: "Manual de Uso e Manutenção" },
  { code: "NBR 5674", label: "Manutenção de Edificações" },
]

// ---------------------------------------------------------------------------
// Módulo 3.2 — Projetistas e Fornecedores
// ---------------------------------------------------------------------------

export type ContactKind = "projetista" | "fornecedor"

export type TechnicalContact = {
  id: string
  kind: ContactKind
  name: string
  company: string
  discipline: string
  registration: string // CREA/CAU para projetistas, CNPJ para fornecedores
  phone: string
  whatsapp: string
  email: string
  warranty: string
  nbr: string
}

export const disciplines = [
  "Estrutural",
  "Elétrica",
  "Hidráulica",
  "Caixilharia",
  "Arquitetura",
  "Gás",
  "Impermeabilização",
  "Ar-condicionado",
]

export const technicalContacts: TechnicalContact[] = [
  {
    id: "pj-1",
    kind: "projetista",
    name: "Eng. Marcos Vinícius",
    company: "MV Estruturas Ltda.",
    discipline: "Estrutural",
    registration: "CREA-SP 5062890123",
    phone: "(11) 3255-8890",
    whatsapp: "5511982550001",
    email: "marcos@mvestruturas.com.br",
    warranty: "5 anos (estrutura)",
    nbr: "NBR 6118",
  },
  {
    id: "pj-2",
    kind: "projetista",
    name: "Arq. Helena Braga",
    company: "Braga Arquitetura",
    discipline: "Arquitetura",
    registration: "CAU A88123-4",
    phone: "(11) 3411-2020",
    whatsapp: "5511983410002",
    email: "helena@bragaarq.com.br",
    warranty: "3 anos (revestimentos)",
    nbr: "NBR 15575",
  },
  {
    id: "pj-3",
    kind: "projetista",
    name: "Eng. Patrícia Lemos",
    company: "Lemos Instalações",
    discipline: "Elétrica",
    registration: "CREA-SP 5099120456",
    phone: "(11) 3766-4512",
    whatsapp: "5511984760003",
    email: "patricia@lemosinst.com.br",
    warranty: "1 ano (instalações)",
    nbr: "NBR 5410",
  },
  {
    id: "fn-1",
    kind: "fornecedor",
    name: "Central de Atendimento",
    company: "Tigre S.A.",
    discipline: "Hidráulica",
    registration: "CNPJ 76.500.000/0001-90",
    phone: "0800 707 1015",
    whatsapp: "5547999990010",
    email: "sac@tigre.com.br",
    warranty: "1 ano (tubulações)",
    nbr: "NBR 5626",
  },
  {
    id: "fn-2",
    kind: "fornecedor",
    name: "Suporte Técnico",
    company: "Sasazaki Ind. e Com.",
    discipline: "Caixilharia",
    registration: "CNPJ 44.120.000/0001-55",
    phone: "0800 770 1600",
    whatsapp: "5514997770020",
    email: "atendimento@sasazaki.com.br",
    warranty: "2 anos (esquadrias)",
    nbr: "NBR 10821",
  },
]

// ---------------------------------------------------------------------------
// Módulo 3.3 — Sistemas Construtivos (árvore hierárquica)
// ---------------------------------------------------------------------------

export type MaintenanceItem = {
  task: string
  frequency: string
  responsible: "Proprietário" | "Síndico"
}

export type SistemaNode = {
  code: string
  label: string
  norms: string[]
  descriptionHtml: string
  maintenance: MaintenanceItem[]
}

export const sistemasConstrutivos: {
  rootCode: string
  rootLabel: string
  nodes: SistemaNode[]
} = {
  rootCode: "3.3",
  rootLabel: "Sistemas Construtivos da Unidade",
  nodes: [
    {
      code: "3.4.1",
      label: "Estrutura",
      norms: ["NBR 6118", "NBR 15575-2"],
      descriptionHtml:
        "<h2>Estrutura</h2><p>Estrutura em <strong>concreto armado</strong> moldado in loco, com lajes nervuradas e pilares dimensionados conforme projeto estrutural.</p>",
      maintenance: [
        { task: "Inspeção de fissuras e recalques", frequency: "Anual", responsible: "Síndico" },
        { task: "Não sobrecarregar lajes além do previsto", frequency: "Uso contínuo", responsible: "Proprietário" },
      ],
    },
    {
      code: "3.4.2",
      label: "Vedações verticais",
      norms: ["NBR 15575-4"],
      descriptionHtml:
        "<h2>Vedações verticais</h2><p>Alvenaria de blocos cerâmicos e paredes em drywall nas áreas internas secas.</p>",
      maintenance: [
        { task: "Verificar fixações de peças suspensas", frequency: "Semestral", responsible: "Proprietário" },
      ],
    },
    {
      code: "3.4.3",
      label: "Revestimentos de Paredes e Pisos",
      norms: ["NBR 13753", "NBR 13754"],
      descriptionHtml:
        "<h2>Revestimentos de paredes e pisos</h2><p>Placas cerâmicas assentadas com argamassa colante AC-III e rejunte flexível.</p>",
      maintenance: [
        { task: "Verificar e refazer rejuntes", frequency: "Anual", responsible: "Proprietário" },
        { task: "Limpeza com produtos neutros", frequency: "Uso contínuo", responsible: "Proprietário" },
      ],
    },
    {
      code: "3.4.4",
      label: "Tetos",
      norms: ["NBR 14715"],
      descriptionHtml:
        "<h2>Tetos</h2><p>Forros em chapa de gesso acartonado (drywall) com pintura acrílica.</p>",
      maintenance: [
        { task: "Inspeção de manchas de umidade", frequency: "Semestral", responsible: "Proprietário" },
      ],
    },
    {
      code: "3.4.5",
      label: "Esquadrias e Vidros",
      norms: ["NBR 10821", "NBR 7199"],
      descriptionHtml:
        "<h2>Esquadrias e vidros</h2><p>Esquadrias de alumínio anodizado com vidros temperados e laminados.</p>",
      maintenance: [
        { task: "Lubrificação de roldanas e trilhos", frequency: "Semestral", responsible: "Proprietário" },
        { task: "Limpeza de drenos das esquadrias", frequency: "Trimestral", responsible: "Proprietário" },
      ],
    },
    {
      code: "3.4.6",
      label: "Pinturas e Acabamentos",
      norms: ["NBR 15575"],
      descriptionHtml:
        "<h2>Pinturas e acabamentos</h2><p>Pintura látex acrílica sobre massa corrida PVA nas paredes internas.</p>",
      maintenance: [
        { task: "Repintura preventiva", frequency: "A cada 3 anos", responsible: "Proprietário" },
      ],
    },
    {
      code: "3.4.7",
      label: "Instalações Hidrossanitárias",
      norms: ["NBR 5626", "NBR 8160"],
      descriptionHtml:
        "<h2>Instalações hidrossanitárias</h2><p>Tubulações de água fria/quente em PPR e esgoto em PVC rígido.</p>",
      maintenance: [
        { task: "Limpeza de sifões e ralos", frequency: "Trimestral", responsible: "Proprietário" },
        { task: "Teste de válvulas e registros gerais", frequency: "Anual", responsible: "Síndico" },
      ],
    },
    {
      code: "3.4.8",
      label: "Instalações Elétricas",
      norms: ["NBR 5410"],
      descriptionHtml:
        "<h2>Instalações elétricas</h2><p>Quadro de distribuição com disjuntores DR e DPS conforme projeto.</p>",
      maintenance: [
        { task: "Teste do dispositivo DR (botão de teste)", frequency: "Mensal", responsible: "Proprietário" },
        { task: "Reaperto de conexões do quadro", frequency: "Anual", responsible: "Síndico" },
      ],
    },
    {
      code: "3.4.9",
      label: "Gás",
      norms: ["NBR 13103", "NBR 15526"],
      descriptionHtml:
        "<h2>Gás</h2><p>Rede de gás encanado com tubulação em cobre e detector de vazamento.</p>",
      maintenance: [
        { task: "Inspeção de mangueiras e reguladores", frequency: "Anual", responsible: "Proprietário" },
      ],
    },
    {
      code: "3.4.10",
      label: "Ar-condicionado",
      norms: ["NBR 16401"],
      descriptionHtml:
        "<h2>Ar-condicionado</h2><p>Infraestrutura para sistema split com pontos de dreno e alimentação previstos.</p>",
      maintenance: [
        { task: "Limpeza de filtros", frequency: "Mensal", responsible: "Proprietário" },
        { task: "Higienização técnica (PMOC)", frequency: "Semestral", responsible: "Proprietário" },
      ],
    },
    {
      code: "3.4.11",
      label: "Sistemas Especiais da Unidade",
      norms: ["NBR 15575"],
      descriptionHtml:
        "<h2>Sistemas especiais</h2><p>Automação, infraestrutura de dados e interfonia da unidade.</p>",
      maintenance: [
        { task: "Atualização de senhas e dispositivos", frequency: "Conforme uso", responsible: "Proprietário" },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Módulo 3.4 — Checklist Inicial (fonte de verdade dos sistemas)
// ---------------------------------------------------------------------------

export type ChecklistStatus = "possui" | "nao_aplicado" | "em_andamento" | "nao_especificado"

export const checklistStatusLabels: Record<ChecklistStatus, string> = {
  possui: "Possui no empreendimento",
  nao_aplicado: "Não aplicado",
  em_andamento: "Em andamento",
  nao_especificado: "Não especificado",
}

// Escopo define o roteamento na árvore de Sistemas Construtivos.
export type ChecklistScope = "unidade" | "comum"

export type ChecklistItem = {
  id: string
  category: string
  item: string
  /** Escopo legado. Mantido para compatibilidade com checklists existentes. */
  scope: ChecklistScope
  /** Um item pode atender unidade, áreas comuns ou ambos os contextos. */
  scopes?: ChecklistScope[]
  status: ChecklistStatus
  approvalStatus?: "rascunho" | "em_revisao" | "aprovado"
  approvalStatusByScope?: Partial<Record<ChecklistScope, "rascunho" | "em_revisao" | "aprovado">>
  obsProprietario: string
  obsSindico: string
  norms: string[]
  // Diretriz técnica pré-preenchida herdada para o editor de Sistemas Construtivos.
  guideline?: string
  maintenance?: MaintenanceItem[]
}

// Categorias técnicas na ordem da planilha-base.
const legacyChecklistCategories: string[] = [
  "Sistema de Coberturas",
  "Sistema de Fundação",
  "Estrutura",
  "Sistema de Vedação",
  "Sistema de Esquadrias",
  "Sistema de Pisos",
  "Sistema de Impermeabilização",
  "Instalações Hidráulicas",
  "Instalações Elétricas",
  "Sistema de Instalação de Gás",
  "Sistema de Climatização",
  "Sistema de Prevenção e Combate a Incêndio",
  "Mobiliário",
  "Área Comum",
]

const legacyChecklistItems: ChecklistItem[] = [
  {
    id: "ck-cob-1",
    category: "Sistema de Coberturas",
    item: "Cobertura metálica com telhas termoacústicas",
    scope: "comum",
    status: "possui",
    obsProprietario: "Não acessar a cobertura sem acompanhamento técnico.",
    obsSindico: "Inspeção semestral de calhas, rufos e fixações.",
    norms: ["NBR 15575"],
    guideline:
      "<h2>Cobertura</h2><p>Cobertura metálica com telhas termoacústicas sobre estrutura em treliça. Inclinação e calhas dimensionadas para a pluviometria local.</p><ul><li>Inspeção de fixações e vedações após temporais.</li><li>Limpeza de calhas e condutores a cada 6 meses.</li></ul>",
    maintenance: [
      { task: "Limpeza de calhas e condutores", frequency: "Semestral", responsible: "Síndico" },
      { task: "Inspeção de fixações da telha", frequency: "Anual", responsible: "Síndico" },
    ],
  },
  {
    id: "ck-cob-2",
    category: "Sistema de Coberturas",
    item: "Forro de gesso",
    scope: "unidade",
    status: "possui",
    obsProprietario: "Evitar perfurações e cargas suspensas no forro de gesso.",
    obsSindico: "—",
    norms: ["NBR 14715"],
    guideline:
      "<h2>Forro de gesso</h2><p>Forro em placas de gesso acartonado com pintura acrílica. Não fixar peças pesadas diretamente no forro.</p>",
    maintenance: [
      { task: "Inspeção de manchas de umidade", frequency: "Semestral", responsible: "Proprietário" },
    ],
  },
  {
    id: "ck-fund-1",
    category: "Sistema de Fundação",
    item: "Fundação profunda (estacas)",
    scope: "comum",
    status: "possui",
    obsProprietario: "—",
    obsSindico: "Não executar escavações próximas às fundações sem projeto.",
    norms: ["NBR 6118"],
    guideline:
      "<h2>Fundação</h2><p>Fundação profunda em estacas hélice contínua, com blocos de coroamento em concreto armado.</p>",
    maintenance: [
      { task: "Inspeção de recalques e fissuras", frequency: "Anual", responsible: "Síndico" },
    ],
  },
  {
    id: "ck-estr-1",
    category: "Estrutura",
    item: "Estrutura de concreto armado",
    scope: "comum",
    status: "possui",
    obsProprietario: "Não remover ou perfurar elementos estruturais (pilares, vigas, lajes).",
    obsSindico: "Inspeção periódica conforme plano de manutenção predial.",
    norms: ["NBR 6118", "NBR 15575-2"],
    guideline:
      "<h2>Estrutura</h2><p>Estrutura em concreto armado moldado in loco, com lajes nervuradas. Cargas máximas de utilização definidas em projeto — <strong>não sobrecarregar</strong>.</p>",
    maintenance: [
      { task: "Inspeção de fissuras estruturais", frequency: "Anual", responsible: "Síndico" },
    ],
  },
  {
    id: "ck-ved-1",
    category: "Sistema de Vedação",
    item: "Alvenaria de vedação",
    scope: "unidade",
    status: "possui",
    obsProprietario: "Consultar planta antes de perfurar paredes (tubulações embutidas).",
    obsSindico: "—",
    norms: ["NBR 15575-4"],
    guideline:
      "<h2>Vedação — alvenaria</h2><p>Alvenaria de blocos cerâmicos revestida. Verificar posição de tubulações antes de furar.</p>",
  },
  {
    id: "ck-ved-2",
    category: "Sistema de Vedação",
    item: "Drywall interno (paredes secas)",
    scope: "unidade",
    status: "em_andamento",
    obsProprietario: "Fixações em drywall exigem buchas específicas para a carga.",
    obsSindico: "—",
    norms: ["NBR 15575-4"],
    guideline:
      "<h2>Vedação — drywall</h2><p>Paredes internas secas em chapas de gesso acartonado sobre estrutura metálica. Use buchas tipo basculante para peças suspensas.</p>",
  },
  {
    id: "ck-esq-1",
    category: "Sistema de Esquadrias",
    item: "Esquadrias de alumínio com vidros",
    scope: "unidade",
    status: "possui",
    obsProprietario: "Lubrificar roldanas e manter drenos desobstruídos.",
    obsSindico: "—",
    norms: ["NBR 10821", "NBR 7199"],
    guideline:
      "<h2>Esquadrias e vidros</h2><p>Esquadrias de alumínio anodizado com vidros temperados/laminados. Manter drenos das esquadrias sempre desobstruídos.</p>",
    maintenance: [
      { task: "Lubrificação de roldanas e trilhos", frequency: "Semestral", responsible: "Proprietário" },
      { task: "Limpeza de drenos", frequency: "Trimestral", responsible: "Proprietário" },
    ],
  },
  {
    id: "ck-piso-1",
    category: "Sistema de Pisos",
    item: "Porcelanato assentado",
    scope: "unidade",
    status: "possui",
    obsProprietario: "Usar produtos neutros na limpeza; verificar rejuntes anualmente.",
    obsSindico: "—",
    norms: ["NBR 13753"],
    guideline:
      "<h2>Pisos — porcelanato</h2><p>Porcelanato assentado com argamassa AC-III e rejunte flexível. Evitar produtos ácidos na limpeza.</p>",
    maintenance: [
      { task: "Verificação e reparo de rejuntes", frequency: "Anual", responsible: "Proprietário" },
    ],
  },
  {
    id: "ck-imp-1",
    category: "Sistema de Impermeabilização",
    item: "Impermeabilização de áreas frias",
    scope: "unidade",
    status: "nao_especificado",
    obsProprietario: "Não danificar a camada impermeável ao fazer reformas em áreas molhadas.",
    obsSindico: "—",
    norms: ["NBR 15575"],
  },
  {
    id: "ck-hid-1",
    category: "Instalações Hidráulicas",
    item: "Reservatório superior",
    scope: "comum",
    status: "possui",
    obsProprietario: "—",
    obsSindico: "Limpeza e desinfecção dos reservatórios a cada 6 meses.",
    norms: ["NBR 5626"],
    guideline:
      "<h2>Reservatório e recalque</h2><p>Reservatório superior de <strong>20.000 L</strong> alimentado por conjunto de recalque. Capacidade das bombas: <strong>2 × 3 cv</strong> em regime alternado.</p><ul><li>Limpeza dos reservatórios: semestral.</li><li>Teste de alternância das bombas: mensal.</li></ul>",
    maintenance: [
      { task: "Limpeza e desinfecção dos reservatórios", frequency: "Semestral", responsible: "Síndico" },
      { task: "Teste de alternância das bombas", frequency: "Mensal", responsible: "Síndico" },
    ],
  },
  {
    id: "ck-hid-2",
    category: "Instalações Hidráulicas",
    item: "Bomba de recalque / pressurização",
    scope: "comum",
    status: "nao_especificado",
    obsProprietario: "—",
    obsSindico: "Verificar pressostatos e vazamentos no barrilete.",
    norms: ["NBR 5626"],
  },
  {
    id: "ck-ele-1",
    category: "Instalações Elétricas",
    item: "Quadro de distribuição da unidade",
    scope: "unidade",
    status: "possui",
    obsProprietario: "Testar o dispositivo DR mensalmente pelo botão de teste.",
    obsSindico: "—",
    norms: ["NBR 5410"],
    guideline:
      "<h2>Quadro de distribuição</h2><p>Quadro com <strong>12 circuitos</strong>, disjuntores DR e DPS. Distribuição de referência:</p><ul><li>Circuitos 1–3: iluminação</li><li>Circuitos 4–7: tomadas de uso geral</li><li>Circuitos 8–9: cozinha / área de serviço</li><li>Circuito 10: chuveiro</li><li>Circuitos 11–12: ar-condicionado</li></ul>",
    maintenance: [
      { task: "Teste do dispositivo DR (botão)", frequency: "Mensal", responsible: "Proprietário" },
    ],
  },
  {
    id: "ck-ele-2",
    category: "Instalações Elétricas",
    item: "Gerador de energia",
    scope: "comum",
    status: "nao_especificado",
    obsProprietario: "—",
    obsSindico: "Ensaio mensal do grupo gerador e verificação de combustível.",
    norms: ["NBR 5410"],
  },
  {
    id: "ck-gas-1",
    category: "Sistema de Instalação de Gás",
    item: "Rede de gás encanado",
    scope: "unidade",
    status: "nao_aplicado",
    obsProprietario: "—",
    obsSindico: "—",
    norms: ["NBR 13103", "NBR 15526"],
  },
  {
    id: "ck-clim-1",
    category: "Sistema de Climatização",
    item: "Ar-condicionado (infraestrutura split)",
    scope: "unidade",
    status: "nao_aplicado",
    obsProprietario: "—",
    obsSindico: "—",
    norms: ["NBR 16401"],
  },
  {
    id: "ck-inc-1",
    category: "Sistema de Prevenção e Combate a Incêndio",
    item: "Sprinklers e hidrantes",
    scope: "comum",
    status: "nao_aplicado",
    obsProprietario: "—",
    obsSindico: "—",
    norms: ["NBR 15575"],
  },
  {
    id: "ck-mob-1",
    category: "Mobiliário",
    item: "Persiana integrada",
    scope: "unidade",
    status: "nao_especificado",
    obsProprietario: "Acionar conforme manual do fabricante; evitar forçar o mecanismo.",
    obsSindico: "—",
    norms: [],
  },
  {
    id: "ck-mob-2",
    category: "Mobiliário",
    item: "Armários planejados",
    scope: "unidade",
    status: "nao_aplicado",
    obsProprietario: "—",
    obsSindico: "—",
    norms: [],
  },
  {
    id: "ck-com-1",
    category: "Área Comum",
    item: "Salão de festas",
    scope: "comum",
    status: "possui",
    obsProprietario: "Reserva conforme regimento interno.",
    obsSindico: "Manutenção de mobiliário e revisão elétrica anual.",
    norms: ["NBR 15575"],
    guideline:
      "<h2>Salão de festas</h2><p>Espaço de uso coletivo com copa de apoio. Uso mediante reserva e regras do regimento interno.</p>",
  },
]

// Execução da obra contabilizada automaticamente pelos itens do checklist.
// Peso: "possui" = 1, "em andamento" = 0,5; exclui os "não aplicado".
export function computeExecucaoObra(items: ChecklistItem[]): number {
  const applicable = items.filter((i) => i.status !== "nao_aplicado")
  if (applicable.length === 0) return 0
  const score = applicable.reduce((sum, i) => {
    if (i.status === "possui") return sum + 1
    if (i.status === "em_andamento") return sum + 0.5
    return sum
  }, 0)
  return Math.round((score / applicable.length) * 100)
}

// Itens que fluem para a aba Sistemas Construtivos (marcados/ em andamento).
export function linkedSystemItems(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter((i) => i.status === "possui")
}

export function getChecklistItemScopes(item: ChecklistItem): ChecklistScope[] {
  if (Array.isArray(item.scopes)) return item.scopes.filter((scope, index, list) => list.indexOf(scope) === index)
  return ["unidade", "comum"]
}

export function checklistItemMatchesScope(item: ChecklistItem, scope: ChecklistScope): boolean {
  return getChecklistItemScopes(item).includes(scope)
}

export function checklistItemContextKey(item: ChecklistItem, scope: ChecklistScope): string {
  return `${item.id}::${scope}`
}

export const scopeLabels: Record<ChecklistScope, string> = {
  unidade: "Unidades privativas",
  comum: "Áreas comuns",
}

// ---------------------------------------------------------------------------
// Módulo 3.5 — DATABOOK (maleta do síndico)
// ---------------------------------------------------------------------------

export const databookCategories: string[] = [
  "Projetos As Built",
  "ART / RRT",
  "Garantias",
  "Manuais de Fabricantes",
  "Certidões e Laudos",
  "Atas e Convenção",
]

export type DatabookDoc = {
  id: string
  name: string
  category: string
  ext: string
  sizeKB: number
  uploadedAt: string // ISO
  uploadedBy: string
  pathname?: string
}

export const databookDocs: DatabookDoc[] = [
  {
    id: "db-1",
    name: "Projeto estrutural - As Built",
    category: "Projetos As Built",
    ext: "pdf",
    sizeKB: 4820,
    uploadedAt: "2026-07-30T10:12:00",
    uploadedBy: "Eng. Marcos Vinícius",
  },
  {
    id: "db-2",
    name: "Projeto hidrossanitário - As Built",
    category: "Projetos As Built",
    ext: "pdf",
    sizeKB: 3110,
    uploadedAt: "2026-07-30T10:15:00",
    uploadedBy: "Eng. Patrícia Lemos",
  },
  {
    id: "db-3",
    name: "ART estrutural - CREA-SP",
    category: "ART / RRT",
    ext: "pdf",
    sizeKB: 180,
    uploadedAt: "2026-07-31T09:02:00",
    uploadedBy: "Eng. Marcos Vinícius",
  },
  {
    id: "db-4",
    name: "Garantia esquadrias Sasazaki",
    category: "Garantias",
    ext: "pdf",
    sizeKB: 640,
    uploadedAt: "2026-08-01T14:40:00",
    uploadedBy: "Rafael Gomes",
  },
  {
    id: "db-5",
    name: "Manual bomba de recalque KSB",
    category: "Manuais de Fabricantes",
    ext: "pdf",
    sizeKB: 2200,
    uploadedAt: "2026-08-02T11:20:00",
    uploadedBy: "Rafael Gomes",
  },
  {
    id: "db-6",
    name: "AVCB - Corpo de Bombeiros",
    category: "Certidões e Laudos",
    ext: "pdf",
    sizeKB: 950,
    uploadedAt: "2026-08-03T16:05:00",
    uploadedBy: "Rafael Gomes",
  },
  {
    id: "db-7",
    name: "Convenção de condomínio",
    category: "Atas e Convenção",
    ext: "docx",
    sizeKB: 320,
    uploadedAt: "2026-08-04T08:30:00",
    uploadedBy: "Arq. Helena Braga",
  },
]

export function formatFileSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${kb} KB`
}

// Checklist baseado na planilha oficial enviada pelo cliente.
export const checklistCategories = spreadsheetChecklistCategories
export const checklistItems = spreadsheetChecklistItems
