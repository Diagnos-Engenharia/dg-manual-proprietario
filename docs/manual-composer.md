# Compositor do manual

O módulo Emitir PDF monta o documento antes da emissão. O preview permanece disponível durante a elaboração; a emissão exige preenchimento e aprovação das fontes obrigatórias.

## Fonte única e renderização

`loadManualSource()` lê dados, checklist, validações, acabamentos, DATABOOK e revisão em um snapshot consistente. `buildManualDocument()` monta a árvore editorial protegida e os blocos tipados com uma finalidade explícita: `preview` para revisão ou `publication` para emissão oficial. `paginateManualDocument()` calcula páginas A4, quebras, cabeçalhos repetidos, destinos e sumário até estabilizar a paginação. O SVG do aplicativo e `renderManualPdf()` consomem o mesmo modelo, paginador e comandos de desenho, com fontes Unicode locais. Não há um segundo layout HTML do documento.

A identidade é normalizada por `lib/manual-identity.ts`, compartilhada com o WhiteLabelStudio. Os quatro conjuntos tipográficos e suas licenças OFL estão em `public/fonts`. Logotipos e imagens são carregados apenas do armazenamento autorizado da organização/empreendimento e normalizados para PNG/JPEG, inclusive originais WebP.

## Conteúdo e escopo

Proprietário utiliza `unidade`; Síndico utiliza `comum`. Descrição e manutenção usam aprovações independentes de `development_content_validation`, pelas chaves `item::escopo` e pelas seções `sistemas`/`manutencao`. Conteúdo ausente de validação é rascunho. Sistemas selecionados aparecem como estrutura mesmo incompletos. No preview, textos e tabelas aguardando validação aparecem em amarelo (`#B77900`); conteúdo aprovado utiliza as cores da identidade. Rascunhos e textos reprovados não exibem o corpo nas páginas. Conteúdo removido do checklist não participa do documento.

Na composição oficial, somente conteúdo aprovado entra nos blocos técnicos. `renderManualPdf()` recusa blocos ou comandos marcados como aguardando validação, mesmo que seja chamado diretamente, e a emissão continua bloqueada pelas pendências de aprovação. Quando o conteúdo é aprovado, a prévia assume o desenho oficial correspondente.

Conteúdo editorial reutiliza `development.data.manuals[tipo].editorial`: `sections`, `warranties`, `attachments`, `systemOrder`. Sua aprovação usa a mesma tabela existente, seção `editorial`, contexto `secao::escopo`. Status enviados pelo cliente não autorizam publicação. Contatos e providências iniciais reutilizam as fontes existentes de autoria, com validação própria para cada manual. Alterações nessas fontes invalidam aprovações correspondentes. Acabamentos reutilizam suas tabelas e revisões existentes e são agrupados por torre, tipologia e ambiente.

Os textos fixos — apresentação, finalidade, instruções de uso, conceitos, garantias, reformas e demais seções editoriais — estão disponíveis em **Elaboração → Textos do manual**, independentemente do checklist. A aba permite selecionar o manual e a seção, editar texto rico e garantias, enviar para validação e revisar as fontes cadastradas de contatos, comissionamento e acabamentos. O armazenamento e a autorização continuam nas APIs existentes. Nenhum texto geral ou prazo legal é gerado automaticamente.

Os capítulos principais não podem ser movidos. A ordem dos sistemas aceita `systemOrder`; a interface de arrastar permanece futura. Meio ambiente, uso racional da água, telefones úteis e glossário podem ser ativados/desativados. Desativado é não aplicável; vazio é sem conteúdo. A interface mostra esses estados fora das páginas do documento.

## Navegação e edição

**Visualizar** faz os tópicos do sumário navegarem até a página e o texto correspondentes. **Modo edição** transforma tópicos e textos das páginas em atalhos para sua fonte na Elaboração, preservando manual, seção e item. Descrição técnica e manutenção levam ao conteúdo específico do sistema; contatos, comissionamento, acabamentos, ficha e identidade mantêm seus destinos próprios. O compositor oferece visualização contínua e página única, com zoom, ajuste à página e à largura. O painel do sumário ocupa toda a altura disponível.

## Emissão e acesso

`POST /api/manuals/preview` autentica e autoriza antes de buscar o cache. `POST /api/manuals/compile` remonta a fonte no servidor, verifica a impressão digital do preview e todas as pendências, produz o PDF e registra uma revisão privada. Uma segunda conferência de fontes e revisão ocorre sob bloqueios antes do registro. Escritas nas fontes compartilham o bloqueio do empreendimento. Arquivos de emissões rejeitadas são descartados; cada emissão usa um caminho exclusivo.

`POST /api/manuals/editorial` permite salvar, enviar, aprovar e reprovar conforme os papéis existentes; o autor não aprova o próprio conteúdo. **Gerar PDF** fica no rodapé do painel de informações da seção e inicia o ciclo documental existente: rascunho → validação → aprovado → publicado. Publicar substitui a revisão publicada anterior do mesmo tipo de manual; publicações concorrentes compartilham o bloqueio do empreendimento para preservar uma única revisão publicada. A página `/manuais` apresenta **Manuais finalizados** somente para revisões publicadas e autorizadas para o usuário. Histórico, autor, auditoria e download autenticado permanecem.

O cache de composição é limitado a 8 documentos/24 MB/30 segundos e depende dos dados e validações atuais. Sua chave inclui a finalidade (`preview` ou `publication`), impedindo a reutilização de uma prévia de revisão na emissão oficial. Métricas de fontes e quebra de texto também têm limites. A interface memoriza páginas e permite ao navegador omitir a pintura das páginas fora da área visível. Digitar no editor não repagina o manual; Atualizar preview reconstrói o documento após alterações na Elaboração. Trocas de manual cancelam respostas antigas; rascunhos locais da aba Textos do manual são separados por manual e seção.

## Limites explícitos

- Anexos podem ser referenciados ou excluídos. O modelo contém a política incluir, mas a união física dos PDFs ainda não está implementada; essa opção é rejeitada com orientação na interface.
- Textos gerais e prazos de garantia não são inventados. Dados legados que não tenham validação precisam ser enviados para revisão para aparecer em amarelo na prévia e aprovados para aparecer na emissão oficial.
- Textos ricos suportam títulos, parágrafos, listas, callouts e tabelas. Formatação inline arbitrária, células mescladas e imagens externas de HTML não têm equivalência editorial completa.
- Configurações extremas de títulos/cabeçalhos geram alertas de layout e bloqueiam a emissão até correção. Linhas de tabela maiores que uma página são continuadas com cabeçalho repetido, sem perder texto.
- A macroestrutura está preparada para reorganização interna segura de sistemas; não existe ainda um controle de arrastar na interface.

## Verificação local

`npm run test:manual` cobre aprovações independentes, todos os estados, escopos, opcionais, tabelas, identidade, Unicode, imagens, limpeza de emissão, sumário/bookmarks, limites A4 e um documento de 150–250 páginas. Os 26 testes unitários passaram na validação desta alteração, incluindo a cor de revisão, o retorno às cores da identidade após aprovação, os destinos de edição e a proteção do PDF oficial.

`npm run test:composer` usa uma aplicação e PostgreSQL **locais e isolados**, já migrados. Defina `DATABASE_URL`, inicie a aplicação com essa mesma conexão, `BETTER_AUTH_URL` e `BETTER_AUTH_SECRET` de teste, e use `DG_PREVIEW_FILES_DIR` para armazenamento privado local. Instale o navegador com `npx playwright install chromium` ou informe `TEST_BROWSER_EXECUTABLE`. `TEST_BASE_URL` é opcional (padrão `http://localhost:3000`); `TEST_ARTIFACT_DIR` escolhe onde salvar PDFs e screenshots. O teste cria contas/empreendimento próprios e recusa endereços remotos. Nunca aponte para um banco real.

O teste completo passou no navegador local: documento incompleto, aprovação editorial/acabamentos/garantias, proibição de autoaprovação, isolamento entre organizações, emissão nos dois escopos, paridade de páginas SVG/PDF, conflito de preview antigo, publicação simultânea/substituição, histórico e navegação/busca/zoom/troca de manual. Também passou o percurso de tópico e texto até a Elaboração, salvamento sem restauração de rascunho antigo, envio com texto amarelo, aprovação com retorno às cores do design, geração e publicação pelo histórico e acesso autenticado aos Manuais finalizados. `npm run build` passou com TypeScript e as migrações existentes no mesmo banco isolado.
