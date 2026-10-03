# PR #6 — revisão final DSI e QA

## Alvo revisado

- Repositório: `Diagnos-Engenharia/dg-manual-proprietario`, PR #6.
- Base: `282ee5d42119891247923f911edc9e15694e4ca8`.
- HEAD revisado: `f91a1761fc7a2764ed30b9e21ee54f36c1c7e19a`.
- Fingerprint do snapshot DSI/QA: `c7045e13a692ebecfffa397e148e9962f03039fef532cbdee5488f46db3e02cd`.
- DSI e QA revisaram o mesmo snapshot independentemente, sem editar código ou PR.

## Resultado

QA não encontrou novos bugs acionáveis depois das correções de concorrência do Databook. A fila mantém tombstones, rejeita finalização tardia enquanto a inspeção está em andamento e distribui as tentativas de limpeza por itens além do primeiro lote de cinco. Os três testes direcionados de Databook passaram; o gate completo do snapshot também passou.

A implementação e os gates locais estão aprovados para revisão da PR, mas o DSI não considera o gate suficiente para atestar produção. Permanecem pendências P1 para procedência independente do gate e para auditoria dos dados legados antes de validar constraints remotas.

## Achados e pendências

| Prioridade | Item | Estado e evidência |
| --- | --- | --- |
| P1 | RF-003 — procedência do release gate | Parcial. O atestado local tem fingerprint correspondente, mas é autodeclarado e não assinado; não prova que a execução ocorreu em ambiente independente. Exigir resultado de CI protegido ou executar as verificações necessárias em CI antes de tratar o gate como prova de release. |
| P1 | RF-004 — credenciais órfãs | As FKs/cascades protegem novas gravações e exclusões concorrentes. Constraints remotas `NOT VALID` não certificam linhas históricas; auditar órfãos antes de validá-las. |
| P1 | RF-008 — integridade de unidade | A FK composta protege gravações novas. Auditar unidades históricas com empreendimento e construtora incompatíveis antes de validar a constraint remota. |
| P2 | RF-009 — liveness da limpeza Blob | Outbox, auditoria e remoção de metadados são transacionais; falhas ficam retryáveis e a fila não sofre starvation. O consumidor atual é acionado pela leitura autorizada do catálogo; sem essa leitura posterior, uma remoção Blob pode aguardar indefinidamente. Considerar worker/rotina durável. |
| Parcial | RF-012 — listagem de organizações | Busca/paginação ocorre no banco. Pessoas, empreendimentos e grants continuam carregados integralmente para as empresas da página. |
| Parcial | RF-013 — multiplataforma | Matrizes Chromium em emulação para celular, tablet e desktop passaram; aparelhos físicos, Safari e Firefox não foram cobertos. |
| Limite de validação | RF-005 e IA | Blob remoto e chamadas semânticas ao OpenAI não foram testados; os testes usam adapter local/doubles. |
| Limite de ambiente | G3 Preview | Vercel Preview autenticada, health e login não foram certificados por esta revisão. A evidência local não substitui essa etapa. |

## Validação local observada

- Correção do gate após falha no Preview: o fingerprint passou a normalizar CRLF/LF também em arquivos TypeScript `.mts` e `.cts`, além de `.ts`/`.tsx`. O teste de regressão falhou antes da correção e passou depois.
- `node scripts/run-release-gate.cjs`: 14/14 etapas aprovadas no snapshot atualizado; fingerprint `9c88858784a8395abb57c7128fed7ffda7bcee4d6620251b85479a746464daec`. Inclui migrations `0001`–`0021` no PostgreSQL UTF8 isolado, 76 testes de domínio, suítes runtime, build de produção e fluxos de navegador.
- `corepack pnpm run build` com o `pnpm@9.15.9` declarado no projeto: `test:gate`, verificação do fingerprint e build Next.js aprovados.
- Matrizes Chromium: interface interna e portal de clientes em 390×844, 768×1024 e 1600×1100.
- Testes direcionados de Databook: 3/3 aprovados para a correção final.
- O servidor temporário de teste rodou apenas em `localhost:3000`, com banco e arquivos fictícios isolados, e foi encerrado pelo runner.

Nenhum dado de produção foi alterado; não houve deploy de produção, merge ou aprovação de produção.
