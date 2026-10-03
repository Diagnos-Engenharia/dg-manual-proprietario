# DSI — Gate do DG Manual

Este documento registra os gates aplicáveis do Diagnos Standard Implement (DSI) para o DG Manual.

## G3 — Production Ready

- Segurança server-side: autenticação, conta ativa, RBAC, escopo por organização/empreendimento e negação por padrão.
- Integridade multitenant: constraints/FKs compostas e filtros por organizationId/developmentId.
- Uploads: armazenamento privado, validação de tipo/conteúdo, nomes seguros e autorização por recurso.
- IA: chave apenas server-side, OpenAI-only no Memorial, documento tratado como dado não confiável, Structured Output e rate limit.
- APIs: CORS por allowlist, API key com escopos, rate limit por IP/chave e respostas minimizadas.
- Documento: preview autenticado, emissão a partir de dados server-side, fingerprint/revisão, concorrência e limpeza de arquivo não registrado.
- Observabilidade: trilha de auditoria, logs sanitizados e endpoint `/api/health`.
- Testes: segurança estática/runtime e testes de domínio executados no build; build comum exige atestado de API/banco/navegador e matrizes de celular/tablet/desktop correspondente ao código atual. `pnpm test:release` gera esse atestado em ambiente local isolado. O atestado é autodeclarado, sem assinatura/prova de proveniência; é evidência revisável, não um controle independente de CI. Ready não substitui validação funcional da Preview. Detalhes em `pr6-rf-checklist.md`.
- Deploy: somente Preview da PR antes de merge; main permanece protegida por aprovação humana.
- Rollback: realizado por Git/Vercel; migrations devem permanecer ordenadas e compatíveis com roll-forward.

## Gate de aprovação

A PR só pode seguir para a main quando:
1. build da Vercel estiver Ready;
2. `/api/health` responder OK;
3. Preview abrir e permitir login;
4. fluxos afetados forem testados visual e funcionalmente;
5. não houver erro crítico de autorização, persistência, emissão ou isolamento;
6. houver aprovação explícita antes do merge.
