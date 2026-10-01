# Compositor de documentos

Emitir PDF oferece Manual do Proprietário, Manual do Síndico e Tabelas de acabamento. A prévia permanece disponível durante a elaboração; a emissão oficial exige preenchimento e aprovação das fontes do documento escolhido. Tabelas de acabamento são documentos independentes por unidade e não compõem nem bloqueiam os manuais.

## Fonte única e renderização

`loadManualSource()` lê dados, checklist, validações, DATABOOK e revisão em um snapshot consistente. `buildManualDocument()` monta a árvore editorial dos manuais. `loadFinishingSource()` lê a identificação da unidade, sua tabela, identidade visual e revisão; `buildFinishingDocument()` monta somente a identificação, ambientes e itens daquela unidade. Os dois builders recebem finalidade explícita: `preview` para revisão ou `publication` para emissão oficial.

`paginateManualDocument()` calcula páginas A4, quebras, cabeçalhos repetidos, destinos e sumário até estabilizar a paginação. O SVG do aplicativo e `renderManualPdf()` consomem o mesmo modelo e comandos de desenho, com fontes Unicode locais. Linhas extensas continuam nas páginas seguintes com cabeçalho repetido. Não há um segundo layout HTML do documento.

A identidade é normalizada por `lib/manual-identity.ts`, compartilhada com o WhiteLabelStudio. Os quatro conjuntos tipográficos e suas licenças OFL estão em `public/fonts`. Logotipos e imagens são carregados apenas do armazenamento autorizado da organização/empreendimento e normalizados para PNG/JPEG, inclusive originais WebP.

## Elaboração e Textos técnicos

A ordem das guias é Checklist Inicial, Comissionamento, Textos técnicos, Tabela de Acabamentos, Projetistas e Fornecedores e Histórico. O selo geral de progresso do checklist foi retirado dessa navegação. A guia Textos técnicos aguarda a conclusão do salvamento do checklist e oferece nova tentativa contextual quando o carregamento falha.

Textos técnicos reúne as seções fixas com os sistemas selecionados no checklist. Seções fixas permanecem disponíveis independentemente do checklist; sistemas aparecem conforme “Possui no empreendimento” e aplicação em unidades privativas ou áreas comuns. O catálogo por capítulos mantém seleção do manual, pesquisa por título/categoria/norma e estados junto aos conteúdos. Foram retirados os filtros Tipo de texto, Estado do texto, Categoria do sistema, o botão Atualizar e a inserção de variáveis do editor. O conteúdo carrega ao entrar, trocar o manual e concluir operações.

O painel de sistema alterna entre Descrição técnica e Manutenção, com salvamento explícito e revisão independente. Atividades podem ser adicionadas, editadas ou removidas. Manutenção vazia pode ser enviada como decisão explícita; linhas incompletas impedem o envio. Um checklist ausente não insere sistemas de referência. Nenhum texto geral, atividade técnica ou prazo legal é inventado.

Proprietário utiliza o contexto `unidade`; Síndico utiliza `comum`. Descrição e manutenção usam `development_content_validation`, pelas chaves `item::escopo` e seções `sistemas`/`manutencao`. O catálogo e a composição compartilham `orderManualSystems()`. Retirar um sistema do checklist remove sua participação e preserva fontes/validações para reativação. Acrescentar outro escopo não copia texto nem aprovação. Fontes legadas sem escopo só são reutilizadas quando sua aplicação única é inequívoca.

Conteúdo editorial reutiliza `development.data.manuals[tipo].editorial`: `sections`, `warranties`, `attachments`, `systemOrder`. A aprovação usa a seção `editorial`, contexto `secao::escopo`. Contatos e providências iniciais reutilizam as fontes de autoria, com validação própria para cada manual; alterações invalidam as aprovações correspondentes. Status enviados pelo cliente não autorizam publicação.

Os capítulos principais não podem ser movidos. A ordem dos sistemas aceita `systemOrder`; o controle de arrastar permanece futuro. Meio ambiente, uso racional da água, telefones úteis e glossário podem ser ativados/desativados. Desativado é não aplicável; vazio é sem conteúdo. Esses estados ficam fora das páginas do documento.

## Unidades e tabelas de acabamento

`development_unit` registra unidades reais com ID estável. Cadastro e edição usam apenas número obrigatório e torre/bloco opcional. Tipologia, pavimento e área antigos permanecem armazenados, mas são omitidos da interface atual e preservados quando não enviados em uma edição. Número é único dentro da torre/bloco do empreendimento, com normalização de caixa, espaços e Unicode NFC. Quantidades da ficha técnica e rótulos antigos não criam unidades por inferência.

Tabela de Acabamentos apresenta uma lista pesquisável de unidades e um painel de identificação/edição. Cadastro e alteração da identificação usam diálogos internos. Cada unidade possui uma tabela própria, com grupos de ambientes, materiais, instalações hidráulicas, esquadrias/ferragens e instalações elétricas. Linhas e ambientes usam confirmação interna para exclusão; o servidor só muda após Salvar tabela.

Tabelas legadas permanecem como bases sem unidade vinculada. Copiar uma base prepara um rascunho local na unidade escolhida, preserva a origem e exige salvamento e nova aprovação. A cópia não herda aprovação e não modifica a base. A interface não usa uma lista fixa de tipologias.

Rascunhos de acabamentos são persistidos em `sessionStorage`, separados por usuário e empreendimento, incluindo unidade, dados e impressão digital da fonte. Só são restaurados após o servidor identificar o usuário e retornar as unidades autorizadas; dados armazenados são validados antes do uso. Voltar ou recarregar mantém o rascunho durante a sessão do navegador. Fonte alterada mantém o rascunho em conflito para revisão explícita. Descartar alterações remove os rascunhos da sessão antes da navegação. Falhas de armazenamento exibem aviso para salvar antes de sair; não há confirmação nativa do navegador nesses fluxos.

Estados da fonte são sem tabela, rascunho, aguardando validação, aprovado e reprovado. Enviar exige registros completos. Quem editou ou enviou não aprova a própria fonte; reprovar exige justificativa. Alterar a identificação ou salvar conteúdo diferente invalida a aprovação. Salvar conteúdo idêntico preserva a aprovação. Conteúdo em validação fica protegido contra edição.

A migração aditiva `0012_units_finishing_documents.sql` acrescenta o cadastro, `finishing_table.unitId` e os campos de unidade/impressão digital/snapshot de `manual_version`. Dados legados e PDFs já emitidos permanecem preservados. `GET/POST /api/finishing/units` atende cadastro/catálogo; `GET/POST /api/finishing/tables` atende edição, cópia e revisão. Permissão, vínculo com empreendimento e revisão são conferidos no servidor; concorrência retorna `409`.

## Prévia, navegação e edição

No preview, conteúdo aguardando validação aparece em amarelo (`#B77900`); conteúdo aprovado utiliza as cores da identidade. Rascunhos e rejeitados mantêm estrutura/pendências, sem exibir seu corpo nas páginas. Na composição oficial, somente conteúdo aprovado entra nos blocos técnicos. `renderManualPdf()` recusa blocos ou comandos de revisão mesmo quando chamado diretamente.

Visualizar faz o sumário navegar até a página correspondente. Modo edição transforma tópicos e textos em atalhos para sua fonte na Elaboração. Descrição e manutenção levam ao conteúdo específico do sistema; a tabela independente preserva unidade, grupo e ambiente, inclusive quando só existem registros de materiais ou instalações naquele ambiente. Ficha, identidade, contatos e comissionamento mantêm seus próprios destinos.

O compositor oferece contínuo e página única, zoom, ajuste à página/largura, sumário/pesquisa, navegação de página, informações da seção, pendências, Gerar PDF e Histórico. Módulos opcionais dos manuais não são oferecidos para tabelas de acabamento. Nesse documento, a unidade é selecionada a partir do cadastro real e mantida na URL: `manual=acabamentos&unidade=<id>`. Ausência de cadastro, falta de seleção e link inválido têm orientação explícita; não se escolhe outra unidade silenciosamente.

Tabelas de acabamento usam A4 em paisagem na prévia e no PDF, com dimensões próprias do documento; os manuais mantêm A4 em retrato. O documento e o menu contêm somente Tabela de acabamentos, sem capa, sumário ou identificação separada. Todas as páginas identificam empreendimento, torre/bloco e número no cabeçalho. Ambientes e grupos organizam os blocos da tabela e mantêm links para edição da fonte correta, sem criar seções adicionais no menu.

Links técnicos usam `aba=textos` com manual, item e `conteudo=manutencao` quando necessário. `aba=sistemas` continua como alias. Item removido ou incompatível com o manual não abre outro editor. Rascunhos dos textos técnicos ficam separados por manual/seção/sistema enquanto o painel está montado; é necessário salvar antes de visualizar o sistema no manual.

Sem sessão, um link de empreendimento redireciona para `/sign-in?next=...`, preservando o destino interno. Após entrar, o usuário retorna à seleção solicitada; destinos externos ou ofuscados são recusados. Empreendimentos ausentes ou sem autorização retornam 404. Falhas inesperadas de infraestrutura não são apresentadas como inexistência de página.

## Emissão, histórico e Manuais

`DocumentType` admite `proprietario`, `sindico` e `acabamentos`. As rotas existentes de prévia, emissão e histórico aceitam `manualType=acabamentos` com `unitId`. A prontidão da tabela depende de identificação, itens completos e aprovação de sua própria fonte; checklist, cronograma e capítulos dos manuais não entram nesse documento. Tabelas pendentes não bloqueiam a emissão dos manuais.

`POST /api/manuals/compile` remonta a fonte autorizada no servidor, confere a impressão digital da prévia e as pendências, produz o PDF e registra uma revisão privada. Uma segunda conferência de fonte e revisão ocorre sob bloqueios antes do registro. Escritas nas fontes compartilham o bloqueio do empreendimento. Arquivos de emissões rejeitadas são descartados; cada emissão usa um caminho exclusivo.

Para acabamentos, a impressão digital da prévia inclui fonte, próxima revisão e data. A impressão digital histórica da fonte permanece independente de outras emissões. A revisão guarda `sourceSnapshot` com identificação e tabela daquele momento; editar a unidade posteriormente não modifica esse histórico. A publicação confere novamente a fonte, inclusive a identidade visual da organização.

Gerar PDF inicia o ciclo documental: rascunho emitido → validação → aprovado → publicado. Histórico, sequência de revisão e substituição da publicação são separados por empreendimento, tipo de documento e unidade. Publicar uma unidade não substitui outra. Publicações concorrentes compartilham o bloqueio do empreendimento. Fonte alterada impede publicar uma revisão antiga como atual, sem apagar o PDF anteriormente publicado.

A página `/manuais` oferece Manual do Proprietário, Manual do Síndico e Unidades. Os dois primeiros apresentam seus documentos publicados e empreendimentos autorizados. Unidades inclui todo o cadastro autorizado, mesmo sem PDF, com empreendimento, torre/bloco, número, estado da tabela e situação: Pendente de emissão, Em validação, Emitida ou Atualização pendente. Pesquisa e filtros de situação usam o cadastro real. Abrir prévia leva à unidade correta; publicações oferecem visualizar/baixar e continuam acessíveis quando há atualização pendente.

`GET/POST /api/manuals/technical` conserva os mapas de sistemas/manutenção e as aprovações por contexto. Gravações em contextos distintos preservam as demais entradas; alterações no mesmo conteúdo conferem a impressão digital. Autoaprovação é recusada no servidor. Auditoria e notificações existentes permanecem. PDFs são acessados pelo download privado autorizado; organização e concessões de acesso ao empreendimento são verificadas.

O cache dos manuais é limitado a 8 documentos/24 MB/30 segundos e inclui finalidade (`preview`/`publication`) na chave. A prévia independente da unidade lê sua própria fonte. Métricas de fonte e quebra de texto têm limites. Digitar no editor não repagina o documento; Atualizar preview, no compositor, reconstrói as páginas após alterações da Elaboração. Trocas de documento/unidade cancelam respostas antigas.

## DATABOOK

A pasta aberta é o destino do envio e permanece selecionada após renomear. A seleção aguarda o cadastro de pastas carregar, evitando usar identidades provisórias. O seletor Pasta do upload e o título redundante do painel direito foram removidos; a pesquisa fica alinhada ao início do menu. Todos os arquivos permanece como visão agregada à esquerda; nessa visão, uploads vão para Arquivos gerais, informado na área de envio.

A área superior aceita clique, teclado e arraste de arquivos; a área de conteúdo da pasta também aceita arraste. Adicionar arquivos utiliza o mesmo fluxo. Cada arquivo mostra progresso e resultado, com nova tentativa para falhas; um erro não apaga os envios concluídos. Arquivos vazios ou acima de 50 MB recebem mensagem específica.

Em produção, o arquivo é enviado diretamente ao armazenamento privado mediante autorização do servidor. Tickets vinculam usuário, organização, empreendimento, pasta e caminho exclusivo. A confirmação confere o arquivo recebido e é idempotente, sem aceitar URL arbitrária. Isso evita transportar o corpo do arquivo pela Function. A falta de configuração de armazenamento é apresentada como erro de configuração.

Pastas padrão, criadas e renomeadas persistem por empreendimento, inclusive vazias. Gravações preservam os outros módulos. Criação, renomeação e exclusão usam diálogos da aplicação; exclusão de pasta informa nome e quantidade de arquivos. A interface só remove dados após confirmação do servidor e mantém falhas visíveis para nova tentativa. Leitura, envio, alteração e download respeitam organização, empreendimento e papel.

O adaptador local de arquivos é exclusivo do teste isolado; produção utiliza armazenamento privado. Nomes de entrada do arquivo ZIP são normalizados e tratados para evitar caminhos fora da estrutura do DATABOOK.

## Limites explícitos

- Anexos dos manuais podem ser referenciados ou excluídos. A união física de PDFs anexos não está implementada; incluir é recusado com orientação.
- Textos gerais e prazos de garantia não são inventados. Fontes sem validação precisam de revisão antes de entrar na emissão oficial.
- Textos ricos suportam títulos, parágrafos, listas, callouts e tabelas. Formatação inline arbitrária, células mescladas e imagens externas de HTML não têm equivalência editorial completa.
- Configurações extremas de títulos/cabeçalhos geram alertas de layout e bloqueiam a emissão até correção.
- A reorganização interna dos sistemas usa `systemOrder`; não há controle de arrastar na interface.
- Rascunhos de acabamentos são locais à sessão do navegador e não substituem o salvamento no servidor.

## Verificação local

`npm run test:manual` passou com **44 testes**, cobrindo escopos e aprovações independentes, estrutura editorial, fontes e imagens Unicode, limites A4, documento de 150–250 páginas, login, isolamento das tabelas, identificação NFC, links de unidade/grupo/ambiente e restauração/validação de rascunhos da sessão. `npm run test:databook` passou com **4 testes**, incluindo tickets, pastas e segurança de nomes no ZIP. `npm run build` passou com TypeScript e migrações no banco isolado.

`npm run test:composer` usa aplicação, PostgreSQL UTF8 e arquivos locais isolados. Configure `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` e `DG_PREVIEW_FILES_DIR` de teste e inicie a aplicação com esses mesmos valores. O navegador pode ser instalado com `npx playwright install chromium` ou indicado por `TEST_BROWSER_EXECUTABLE`. `TEST_BASE_URL` usa `http://localhost:3000` por padrão; `TEST_ARTIFACT_DIR` recebe PDFs e capturas. A suíte cria suas próprias contas/empreendimentos e recusa endereços remotos.

A suíte integrada passou na revisão final. Foram conferidos os fluxos anteriores dos manuais, cadastro e cópia de base por unidade, conflitos de fonte, bloqueio em validação, autoaprovação recusada, PDF e publicação independente, paridade de páginas SVG/PDF e snapshots históricos. No navegador, rascunhos sobreviveram à recarga e ao retorno, descarte explícito removeu o rascunho e os cliques da prévia mantiveram unidade/ambiente. Manuais exibiu unidades emitidas, pendentes e com atualização pendente, com pesquisa e downloads privados.

O DATABOOK passou com arquivo de 5 MB, envio parcial e nova tentativa, arraste, persistência após recarga, diálogo interno, exclusão com falha e concorrência entre renomeação/exclusão preservando registros e bytes. Após a correção da seleção durante o carregamento, seu fluxo de navegador foi repetido e confirmou o destino antes e após renomear a pasta. O ZIP preservou arquivos com nomes colidentes. A API pública v1 manteve catálogo, detalhe e download de Proprietário/Síndico sem expor tabelas de unidade fora de seu contrato. Capturas de desktop e celular foram inspecionadas, sem erro JavaScript na suíte. A conferência remota permanece dispensada pelo usuário; o transporte do provedor Blob na Vercel não foi testado com arquivos reais.

Os fluxos e critérios de aceite estão no [PRD de Textos técnicos](prd-textos-tecnicos.md) e no [PRD de unidades, acabamentos e DATABOOK](prd-unidades-acabamentos-databook.md). As decisões mais recentes de simplificação e emissão independente seguem o segundo documento.
