# PR #6 — clientes, Usuários e revisão final

## Requisitos consolidados

Pedido atual: implementar na PR #6 e revisar. Clientes entram no portal `/meu-manual`, visualizam/baixam somente documentos publicados autorizados e consultam um chat restrito ao Manual do Proprietário. O Administrador encontra Usuários no menu e gerencia clientes por construtora, com ações individuais, em lote e recuperação de senha. Databook fica abaixo de Empreendimentos.

### Lista de implementação

- [x] Clientes separados dos papéis internos, associados à construtora, empreendimento e unidade.
- [x] Login exclusivo de cliente leva ao Manual; identidades internas que também são clientes preservam o Dashboard.
- [x] Portal com visualização/download privado, estado sem publicação, bloqueio e saída da conta.
- [x] Proprietário publicado e acabamentos publicados da própria unidade; rascunhos, Síndico e outras unidades/construtoras são recusados.
- [x] Chat usa apenas o documento aprovado da versão publicada, sem dados atuais de autoria, navegação externa ou ferramentas.
- [x] Respostas restritas a trechos literais validados, com referências; fora do assunto/sem evidência orienta confirmar com a construtora.
- [x] Limites de pergunta/resposta, quotas, timeout e nova autorização após a espera pela IA. Sem configuração verificada, informa indisponibilidade.
- [x] Menu Databook abaixo de Empreendimentos e Usuários exclusivo do Administrador.
- [x] Tabela de usuários: Nome, E-mail, Unidade, Empreendimento, Cadastrado em e Ações; busca, filtro e paginação de dez registros.
- [x] Menu de ações com switch individual, redefinição de senha e remoção explícita do acesso para offboarding.
- [x] Habilitar todos/Desabilitar todos, incluindo estado misto, com confirmação antes do bloqueio; somente clientes da construtora ativa.
- [x] Convite copiável, aceite único e concorrente, sem conceder edição ou criar membership interno.
- [x] Reset com link copiável, token hash, validade de 15 minutos, uso único, hash BetterAuth e revogação de sessões.
- [x] Reset administrativo recusa contas internas e contas de clientes ligadas a outra construtora, inclusive vínculo bloqueado; verifica novamente ao consumir o token.
- [x] Remoção de cliente preserva a identidade, outros vínculos e o bloqueio global independente do Gerenciador; permite reconvite.
- [x] Tokens de convite/reset e rotas de autenticação excluídos da telemetria.

### Pendências anteriores incorporadas à correção

- [x] Manuais finalizados usa identificador de versão para Visualizar/Baixar e disposition de download correto.
- [x] CSP permite os caminhos reais de upload simples/multipart do Blob, mantendo bloqueio de outros caminhos.
- [x] Exclusão de pasta é uma operação em lote; não consome a quota individual para cada arquivo. Conflito de renomeação preserva os restantes.
- [x] Gerenciador pode remover explicitamente o último Administrador antes de excluir uma construtora sem usuários/recursos. Alterações comuns de papel/status continuam protegidas.
- [x] Descoberta, health público e OpenAPI respeitam CORS da allowlist em GET/OPTIONS.
- [x] Erro de processamento do Memorial não altera importação sem autorização; retorno de erro é seguro.
- [x] Migração de contas com credenciais de teste é ignorada por padrão. Opt-in exige banco local isolado, fora de produção/Vercel.
- [x] Suites antigas atualizadas para convite obrigatório, download por ID e modo atual de visualização. Erros de sintaxe/escaping e referências dos testes de segurança corrigidos.
- [x] Organização ativa explícita: múltiplos vínculos não escolhem o primeiro tenant silenciosamente.
- [x] Documentação alinhada à retirada dos filtros técnicos e à exceção de acabamentos salvos visíveis em amarelo na prévia.

As correções já existentes em `46eae117` de reativação global independente, aceite transacional de convite e OpenAI filtrada por provider foram preservadas.

## Origem nos demais chats

| Fonte | Pedido vigente relevante |
| --- | --- |
| PRD Emissor PDF (`6abe8ca7-71ec-83e9-8d80-ff49ac422b60`) | Prévia completa, paridade PDF, aprovação e fontes preservadas. |
| Transformar emissão em compositor (`01a0f85d-93af-7090-8f88-eed9e476a6d1`) | Unidade número/torre, acabamentos em paisagem somente tabela, registros preenchidos visíveis; upload por arrastar e Adicionar arquivo funcional; textos técnicos unificados. |
| Deploy DG Manual (`6abdcbca-6c20-83e9-b668-4cc30e1b8004`) | Permissões, desativação integral, conta/OpenAI e exclusão de usuários antes da construtora; continuar na PR sem tocar main. |
| DG Manual Preview (`6abf872d-61c4-83e9-9dba-1223b255253d`) | Interface compacta, tabela visível, prévia atual funcional. |
| Analisar e implementar auditorias (`6ac066df-06d4-83e9-988b-e76ee3e673b4`) | Implementar resultados das auditorias na PR do DG Manual. |
| Incorporar checklist ao DSI (`6ac09365-3af0-83e9-9ed4-8ead6c3db56c`) | Aceite conceitual de Release Readiness; aplicar somente controles pertinentes e demonstrados. |
| Revisar controles do DSI (`6ac06956-cac8-83e8-918c-433adb234e58`) | Aceite conceitual de hardening, análise de secrets e atores adversariais. |

Termine a implementação (`6abe9b37-c1b4-83e9-893c-cf5c81ef3bc6`) foi interrompido pelo pedido humano “Pare”; não acrescenta requisitos. A autorização atual de implementar a PR é a fonte desta execução. Relatório de QA tratava do DG Tech/PR #2 e não teve seus bugs transferidos para o DG Manual. Conversas sobre GTM e cronograma também foram excluídas por não pertencerem a este produto.

Junção física de anexos ao PDF e reordenação livre de blocos foram explicitamente adiadas no texto integral do compositor. Equivalência de HTML arbitrário/imagens externas e persistência avançada do editor não foram ampliadas neste pedido.

## Operação e limites

A migração `0019_client_access.sql` é aditiva. Deve ser aplicada no banco do ambiente antes de usar o portal; executar `db:migrate` com a conexão desse ambiente, sem `DG_ALLOW_TEST_SEEDS`. A implementação não migra dados reais nem cadastra clientes de produção por si só. `0011_seed_test_users.sql` fica restrita a opt-in local; esta mudança não revoga automaticamente contas antigas já provisionadas em outros ambientes.

Os clientes precisam receber e aceitar um convite ligado à sua unidade; nenhum cadastro de morador é inventado ou importado automaticamente a partir da imagem. O botão de reset gera link para a construtora compartilhar; não houve envio real de e-mail. Contas internas/compartilhadas precisam de recuperação da identidade por um canal verificado separado; o Administrador de um tenant não recebe controle da senha global.

O chat depende da integração OpenAI verificada do Gerenciador e de um snapshot publicado compatível. PDFs antigos sem esse snapshot permanecem disponíveis para download, mas o chat informa indisponibilidade. Não cria respostas fictícias. O bloqueio impede novas consultas; não recolhe um PDF já baixado pelo cliente.

## Validação e entrega

`test:gate` executa os checks estáticos/runtime de entradas e o domínio antes do build; não equivale a teste completo de navegador. `test:clients-runtime` exige `DG_TEST_DATABASE_URL` local isolada e usa banco/transações/crypto reais, com sessão/headers do harness. `test:csp` usa Chromium com todas as chamadas externas interceptadas. `test:e2e` exige aplicação local e banco isolado; `test:local` inicia temporariamente a aplicação em localhost:3000, roda as duas suites e encerra seu próprio servidor.

Resultados finais e snapshot de revisão ficam no relatório de revisão da PR. Gates de merge seguem `docs/dsi-dg-manual-gate.md`: Preview Ready do commit corrente, health/login/fluxos verificados e aprovação humana. Não confundir testes locais com Preview protegida nem um status Ready com teste funcional autenticado.
