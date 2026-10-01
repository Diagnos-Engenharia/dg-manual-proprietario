# PRD — Unidades, tabelas de acabamento e DATABOOK

Data: 01/10/2026. Implementação na PR #5 do DG Manual.

## Objetivo

Organizar a elaboração na ordem em que as informações constroem os documentos, simplificar Textos técnicos, tornar o envio de arquivos confiável e conectar cada tabela de acabamento a uma unidade real. O usuário deve conseguir cadastrar a unidade, preparar e validar sua tabela, conferir as páginas, emitir o PDF e acompanhar a publicação em Manuais sem perder o contexto.

## Problemas observados

- Textos técnicos oferece controles que não serão usados: variáveis, três filtros, atualização manual e indicador geral de checklist.
- O DATABOOK tem dois destinos concorrentes: a pasta aberta e a seleção de upload. Um erro pode esconder os arquivos enviados com sucesso. Exclusões alteram a tela mesmo quando a API falha, e pastas vazias não persistem.
- Arquivos enviados através da Function estão sujeitos ao limite de corpo de 4,5 MB da Vercel. A mensagem atual também encobre problemas de configuração e permissão; a captura não comprova a causa específica do arquivo do usuário.
- A tabela de acabamento escolhe uma tipologia fixa, sem cadastro de unidades. Duas unidades ou torres com a mesma tipologia podem compartilhar a seleção errada.
- As tabelas integram o Manual do Proprietário e sua prontidão. O novo fluxo exige um documento independente por unidade.
- Manuais mostra apenas PDFs publicados; não mostra as unidades cadastradas que ainda precisam de emissão.

## Experiência proposta

### 1. Elaboração e Textos técnicos

Ordem das guias: Checklist Inicial, Comissionamento, Textos técnicos, Tabela de Acabamentos, Projetistas e Fornecedores, Histórico. Remover o selo de progresso do checklist desta navegação. Preservar o aviso de salvamento e impedir a navegação para textos enquanto houver gravação ou erro do checklist.

Textos técnicos mantém seleção do manual, pesquisa, árvore de capítulos e estados junto aos conteúdos. Remover Tipo de texto, Estado do texto, Categoria do sistema e Atualizar. Carregar automaticamente ao entrar, trocar de manual e concluir operações. Erros terão nova tentativa contextual. Remover a inserção de variáveis do editor; textos e formatação existentes permanecem editáveis.

Sistemas e manutenção continuam provenientes do checklist e separados por contexto do proprietário/síndico. As tabelas de acabamento saem do catálogo técnico do manual e passam a ter sua própria elaboração e emissão.

### 2. DATABOOK

A pasta aberta determina o destino. Remover o seletor Pasta do upload e o título redundante Todos os arquivos no painel direito. Alinhar a pesquisa ao início da navegação de pastas. A visão agregada Todos os arquivos continua no menu esquerdo; envios nessa visão vão para Arquivos gerais, informado na área de envio.

Exibir uma área superior: “Arraste arquivos ou clique para adicionar”, com destino visível. Permitir soltar arquivos também na área de conteúdo da pasta. O botão Adicionar arquivos usa o mesmo envio. Não iniciar upload a partir de arraste interno de um item da interface.

Cada arquivo tem nome, progresso e resultado. Um arquivo que falha não apaga os sucessos. Oferecer Tentar novamente somente para falhas. Limite inicial: 50 MB por arquivo, comunicado antes do envio. Rejeitar vazio e excesso de tamanho com mensagem específica. Upload direto para armazenamento privado, autorizado pelo servidor, evita o limite de corpo da Function. A confirmação no banco é idempotente e verifica o arquivo recebido.

Pastas padrão, criadas e renomeadas persistem. Não excluir ou retirar um arquivo da tela até o servidor confirmar. A exclusão de pasta usa diálogo da aplicação com nome e quantidade de arquivos, Cancelar e Excluir pasta. Falhas permanecem no diálogo/tela. Criação e renomeação também usam formulários internos. Acesso de leitura, alteração e download respeita organização, empreendimento e função do usuário.

### 3. Cadastro de unidades e tabela de acabamento

A guia Tabela de Acabamentos terá uma lista pesquisável de unidades à esquerda e identificação/edição à direita. Oferecer Cadastrar unidade e editar sua identificação em diálogo da aplicação. Não transformar quantidades da ficha ou rótulos antigos em unidades fictícias.

Cada unidade possui ID estável, empreendimento, torre/bloco, pavimento, número, tipologia e área. Número e tipologia são obrigatórios. Torre/bloco, pavimento e área podem ficar sem informação; área preenchida deve ser positiva. Número é único dentro da mesma torre/bloco do empreendimento, sem diferenças apenas de caixa ou espaços. Identificação aparece no cabeçalho da edição e no documento.

Cada unidade tem uma tabela própria. Editar ambientes e seus itens em uma tabela legível, com campos definidos de descrição/material/acabamento conforme os dados existentes. Adicionar e excluir linhas/ambientes com nomes claros, estados vazios úteis e confirmação interna para exclusões de conteúdo. Salvar explicitamente; preservar rascunhos durante a sessão do navegador, inclusive ao navegar, voltar e recarregar. O armazenamento é separado por usuário e empreendimento, e sua restauração depende do cadastro autorizado retornado pelo servidor. Se a fonte mudou, manter o rascunho em conflito para revisão explícita. Descartar alterações, inclusive ao confirmar a saída de guia ou módulo, remove os rascunhos da sessão antes da navegação. Falhas de armazenamento mostram um aviso para salvar antes de sair; não utilizar diálogos nativos do navegador.

Tabelas antigas ficam disponíveis como bases “Sem unidade vinculada”. O usuário pode copiar uma base para a unidade selecionada. A cópia preserva a origem e começa em rascunho; não cria vínculo por inferência e não copia a aprovação. Evitar seletores Tipo A/B/C fixos.

Estados da fonte: sem tabela, rascunho, aguardando validação, aprovado e reprovado. Salvar conteúdo diferente ou alterar a identificação invalida a aprovação da tabela. Enviar exige ao menos um item completo. Quem editou não aprova a própria fonte. Reprovar exige justificativa. Conteúdo em validação aparece em amarelo na prévia; conteúdo aprovado usa o design. Rascunhos e rejeitados mantêm estrutura/pendências, conforme o princípio já aplicado aos manuais.

Adicionar “Visualizar PDF” para abrir Emitir PDF com documento e unidade selecionados. O modo de edição da prévia retorna à mesma unidade/ambiente na elaboração.

### 4. Emitir PDF

O seletor terá Manual do Proprietário, Manual do Síndico e Tabelas de acabamento. Ao escolher tabelas, mostrar o seletor de unidade, usando cadastro real. Manter a unidade na URL (`manual=acabamentos&unidade=<id>`). Sem cadastro, explicar a necessidade e oferecer o cadastro na elaboração; sem unidade escolhida, solicitar seleção. Link inválido não seleciona silenciosamente outra unidade.

Reutilizar a mesma experiência A4: sumário/pesquisa, navegação de página, zoom, ajuste à página/largura, contínuo/página única, Visualizar, Modo edição, pendências, informações da seção, Gerar PDF e Histórico. Módulos opcionais do manual não se aplicam à tabela.

O PDF da tabela é independente: identificação da unidade, ambientes, itens e paginação. Não incluir capítulos, checklist ou sistemas dos manuais. Reutilizar identidade visual, fontes com acentos, paginação, repetição de cabeçalho das tabelas e renderização SVG/PDF. Não cortar linhas extensas ou inserir dados de outra unidade.

Prontidão depende da identificação, conteúdo completo e aprovação da própria tabela. As tabelas deixam de bloquear a emissão do Manual do Proprietário e não integram suas páginas. PDFs antigos permanecem no histórico.

Emissão cria uma revisão imutável com identificação e conteúdo da unidade capturados naquele momento. Ciclo: rascunho emitido → validação → aprovado → publicado. Histórico, sequência de revisão e substituição de publicação são separados por empreendimento + tipo de documento + unidade. Publicar a unidade 102 não substitui a 101. Alterações posteriores sinalizam PDF desatualizado; publicação exige fonte correspondente à revisão. Downloads continuam privados e autorizados.

### 5. Manuais

Oferecer Manual do Proprietário, Manual do Síndico e Unidades. Os dois primeiros mantêm os documentos publicados e seus downloads. Unidades mostra todas as unidades dos empreendimentos autorizados, inclusive as que não têm PDF.

Mostrar empreendimento, torre/bloco, número, tipologia, estado da tabela e situação da emissão. Separar “Pendente de emissão”, “Em validação”, “Emitida” e “Atualização pendente” segundo tabela, revisões e publicação. Pesquisa por empreendimento/unidade e filtros de situação ajudam a localizar pendências. Contagens correspondem ao cadastro autorizado, sem usar mocks.

Abrir prévia leva à unidade correta em Emitir PDF. PDF publicado oferece visualizar/baixar; ausência de publicação oferece elaborar/emitir conforme permissão. Uma publicação anterior continua disponível quando a fonte mudou, com aviso claro de atualização pendente.

## Dados, compatibilidade e autorização

- Migração aditiva: cadastro `development_unit`; `finishing_table.unitId` opcional; `manual_version.unitId`, `sourceFingerprint` e `sourceSnapshot`.
- Não modificar tabelas legadas nem inferir unidades. Cópias/vínculos são explícitos e auditados.
- `DocumentType = proprietario | sindico | acabamentos`. Operações de acabamentos exigem `unitId`; manuais permanecem sem unidade.
- A API pública v1 mantém o contrato de Proprietário/Síndico em catálogo, detalhe e download; tabelas de unidades usam as APIs autenticadas da aplicação.
- APIs de unidade/tabela retornam revisão ou impressão digital da fonte. Escritas usam controle de concorrência e erro 409, preservando alterações locais para revisão.
- Prévia, cache, emissão, histórico e publicação incluem unidade no escopo. Fonte é verificada sob bloqueio durante emissão/publicação.
- Dados históricos incluem identificação e conteúdo, não apenas um vínculo mutável. Publicações de unidades diferentes são independentes.
- Pastas do DATABOOK persistem por empreendimento, com gravações que não sobrescrevem outros módulos. Tickets de upload associam usuário, organização, empreendimento, pasta e caminho gerado; não aceitar URL arbitrária.
- Adaptador de arquivos local é exclusivo do teste isolado. Produção mantém armazenamento privado.

## Design e acessibilidade

Manter a identidade escura da aplicação, hierarquia compacta e ações primárias constantes. Agrupar ações de fonte junto à edição e ações de emissão no visor. Evitar informações repetidas e seletores sem utilidade. Número da unidade deve permanecer visível durante toda a tarefa.

Diálogos possuem título, descrição, foco inicial adequado, retorno de foco, fechamento por teclado e ação destrutiva explícita. Áreas de arraste também funcionam por clique e teclado. Resultados de upload usam estado acessível; cor não é a única indicação. Em telas pequenas, lista e formulário se empilham e a prévia mantém acesso ao inspector por diálogo.

## Critérios de aceite

1. Os sete controles removidos não aparecem e a ordem das guias é a definida.
2. Envio por botão e arraste usa a pasta aberta; pasta vazia persiste após recarregar. Sucesso parcial, nova tentativa e exclusão com falha mantêm dados consistentes. Nenhum diálogo nativo de confirmação nestes fluxos.
3. Duas unidades de mesma tipologia em torres distintas têm conteúdo, revisão e PDF independentes. Cadastro duplicado e seleção incompatível são rejeitados.
4. Base antiga continua acessível e sua cópia para unidade não copia aprovação.
5. Alterações invalidam aprovação; autor não aprova a fonte; revisão antiga não pode ser publicada como atual. Usuário de outra organização não acessa cadastro, fonte ou arquivo.
6. Prévia e PDF da unidade usam a mesma paginação e conteúdo, com acentos e identificação. Só conteúdo aprovado entra no PDF oficial.
7. Todas as unidades cadastradas aparecem em Manuais, emitidas ou pendentes. Publicações coexistem entre unidades e a situação muda quando a fonte é alterada.
8. Manuais proprietário/síndico e links já existentes continuam operando; tabelas pendentes não impedem a emissão dos manuais.

## Validação e entrega

Testar o fluxo completo com banco e arquivos isolados: cadastro de duas unidades, edição, aprovação, prévia, emissão, publicação, mudança de fonte, download privado e acesso negado entre organizações. Testar DATABOOK com arquivo acima de 4,5 MB, envio parcial, destino de pasta, recarga, diálogos e falha de exclusão. Conferir páginas longas SVG/PDF e layout desktop/móvel. Executar testes de domínio, verificação de tipos e build. Entregar PRD, alterações na mesma PR e prévia da revisão publicada com estado Ready.

Referências para o transporte de arquivos: [upload pelo servidor](https://vercel.com/docs/vercel-blob/server-upload), [upload pelo cliente](https://vercel.com/docs/vercel-blob/client-upload), [armazenamento privado](https://vercel.com/docs/vercel-blob/private-storage).
