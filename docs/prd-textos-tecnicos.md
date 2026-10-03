# PRD — Textos técnicos: checklist, sistemas e manutenção

Versão 1.0 · DG Manual · 1 de outubro de 2026

Destino: PR #5, branch refactor/manual-document-composer.

## 1. Problema e resultado esperado

A elaboração está dividida entre Textos do manual e Sistemas Construtivos. O usuário precisa alternar entre listas, escopos e interfaces para redigir um documento que, na emissão, já aparece integrado. Isso dificulta localizar conteúdo, entender o impacto do checklist e acompanhar a descrição e a manutenção de cada sistema.

A guia passa a se chamar **Textos técnicos** e reúne textos fixos, sistemas aplicáveis e manutenção em uma experiência única. O checklist determina quais sistemas compõem cada manual; a redação e a revisão ocorrem nesse mesmo catálogo. O preview continua sendo a representação do documento, com conteúdo enviado em amarelo e conteúdo aprovado nas cores do design.

## 2. Objetivos e escopo desta entrega

1. Integrar os sistemas do checklist ao catálogo de Textos técnicos, eliminando a guia separada de Sistemas Construtivos.
2. Integrar a manutenção ao painel de cada sistema, com edição, salvamento e revisão próprios.
3. Tornar evidente o manual, o sistema, o escopo, o conteúdo selecionado e o estado de salvamento.
4. Manter correspondência entre catálogo, ordem do manual, preview e PDF.
5. Reutilizar as fontes existentes, preservando textos, atividades, aprovações, permissões e histórico.

Não fazem parte desta entrega: gerar textos técnicos ou prazos de garantia automaticamente, criar uma nova base paralela de conteúdo, unificar aprovações de descrição e manutenção, aprovar conteúdo automaticamente ou alterar o fluxo de publicação dos PDFs.

## 3. Usuários e tarefas

| Usuário | Tarefas principais |
| --- | --- |
| Editor ou administrador do empreendimento | Preencher checklist, redigir descrição, registrar atividades, corrigir reprovações e enviar conteúdo para revisão. |
| Administrador responsável pela validação | Localizar pendências, revisar descrição e manutenção separadamente, aprovar ou reprovar com justificativa. |
| Usuário com acesso de leitura | Consultar os textos permitidos, identificar estados e navegar para o preview. |

A autorização continua sendo verificada no servidor. A interface só oferece as ações permitidas; quem enviou ou editou não aprova a própria contribuição quando essa regra se aplica.

## 4. Arquitetura da experiência

### 4.1 Entrada e contexto

Elaboração apresenta a guia **Textos técnicos**. O seletor de manual fica no cabeçalho da área: Manual do Proprietário ou Manual do Síndico. Um texto curto explica que os sistemas são definidos pelo checklist. Há um atalho para ajustar o Checklist Inicial.

A área contém um único catálogo e um único painel de conteúdo. Não haverá um segundo seletor de escopo ou uma segunda árvore de sistemas dentro do painel.

### 4.2 Catálogo unificado

O catálogo apresenta as seções fixas e os sistemas do manual selecionado, com identificação numérica consistente com a composição. Os sistemas ficam no capítulo correspondente, organizados pelas categorias existentes.

A busca considera título, categoria e normas de referência. O pedido posterior de 02/10 removeu os filtros de tipo, estado e categoria da interface; os indicadores de validação continuam visíveis nos itens. O resultado mantém contexto suficiente para identificar o destino; estados vazios distinguem ausência de sistemas, resultado sem correspondência e item indisponível.

Cada sistema apresenta dois indicadores identificáveis: **Descrição** e **Manutenção**. Um único indicador de aprovado não deve esconder uma manutenção pendente. Cor é um reforço; texto e ícone também identificam o estado.

A seleção usa IDs estáveis e a chave item::escopo. A numeração 4.N é uma informação de apresentação e pode mudar quando o checklist mudar.

### 4.3 Painel de sistema

O cabeçalho mostra nome, categoria, manual e normas cadastradas. Abaixo, duas vistas acessíveis por teclado:

- **Descrição técnica:** editor rico e revisão da seção sistemas.
- **Manutenção:** tabela de atividades e revisão da seção manutencao.

Cada vista mostra seu estado e oferece ações claras de salvar, enviar, aprovar ou reprovar, conforme permissão. O painel mantém apenas a vista selecionada, evitando uma página longa com dois fluxos misturados.

A manutenção permite adicionar e remover atividades, editar descrição, periodicidade e responsável. Os campos possuem rótulos acessíveis. Uma tabela vazia deve comunicar que não há atividades cadastradas; a decisão de não exigir atividades pode ser submetida e validada explicitamente. Nenhuma atividade de modelo deve ser tratada como registrada ou aprovada sem persistência.

Textos fixos, garantias e revisões de fontes permanecem disponíveis no mesmo catálogo com os editores existentes.

## 5. Integração 1 — Checklist → Textos técnicos → manual

A elegibilidade continua sendo a regra existente: item marcado **possui** e com escopo compatível.

| Configuração do item | Proprietário | Síndico |
| --- | --- | --- |
| possui + unidade | Inclui sistema em unidade | Não inclui |
| possui + comum | Não inclui | Inclui sistema em comum |
| possui + unidade e comum | Inclui contexto próprio | Inclui contexto próprio |
| Não possui, em andamento, não aplicado ou não especificado | Não inclui sistema | Não inclui sistema |
| Sem escopo válido | Não inclui | Não inclui |

Depois de salvar o checklist, o catálogo reflete a alteração ao acessar Textos técnicos, sem etapa adicional de cadastro. O preview atualizado inclui a estrutura correspondente. Texto técnico ainda não enviado permanece oculto no preview, conforme a política vigente.

Alterar o escopo não copia redação, atividades ou aprovação entre manuais. Um item presente nos dois manuais possui dois contextos independentes. O conteúdo legado sem chave de escopo só pode ser reutilizado quando sua origem pertence inequivocamente a um único escopo.

Retirar o item do checklist remove sua participação ativa no catálogo, preview e PDF, preservando a fonte para eventual reativação. Um link direto para um item removido informa a indisponibilidade e oferece o checklist; não abre silenciosamente outro editor.

A ordenação do catálogo e do documento usa uma regra compartilhada: categorias na ordem registrada e systemOrder dentro da categoria, com deduplicação por ID.

## 6. Integração 2 — Sistema → descrição e manutenção

Descrição e manutenção continuam armazenadas em manuals[tipo].sistemas e manuals[tipo].manutencao, pela chave item::escopo. As validações continuam em development_content_validation, distinguindo sistemas e manutencao.

Salvar altera somente o contexto e a seção selecionados, preservando outros sistemas e o outro manual. Uma edição efetiva invalida somente a aprovação correspondente. Salvar descrição não rebaixa manutenção aprovada; salvar manutenção não rebaixa descrição aprovada.

O usuário deve conseguir verificar o salvamento antes de enviar. Os rascunhos locais são separados por empreendimento, manual e contexto e permanecem disponíveis ao alternar seleções durante a sessão. O envio utiliza a última fonte salva; alterações não salvas são indicadas e precisam ser salvas antes do envio.

As ações têm estados em andamento, sucesso e falha. Falhas preservam o rascunho, oferecem nova tentativa e impedem uma confirmação falsa de salvamento. Trocas de contexto não aplicam respostas antigas ao novo painel.

Uma descrição vazia não pode ser enviada como conteúdo técnico completo. Manutenção vazia pode ser enviada como decisão explícita, mantendo sua validação própria. Conteúdo em validação fica bloqueado para edição até decisão, de acordo com o fluxo existente.

## 7. Preview, edição e links existentes

- Modo edição no preview abre Textos técnicos no manual, sistema e vista corretos.
- Visualizar no manual leva à seção correspondente, preservando o manual.
- Links antigos com aba=sistemas continuam funcionando como alias da área unificada.
- Links com aba=textos continuam válidos; o rótulo exibido é Textos técnicos.
- item identifica o sistema e conteudo=manutencao identifica a vista de manutenção.
- Ao selecionar texto fixo, parâmetros de sistema são removidos. Ao selecionar sistema, parâmetros da seção fixa são substituídos.
- Um manual explícito incompatível com o contexto gera orientação de indisponibilidade e não troca de escopo silenciosamente.
- Voltar, avançar e recarregar mantêm uma seleção coerente.

## 8. Design e usabilidade

Usar os componentes, espaçamentos, cores e tipografia já adotados pelo DG Manual. O catálogo é compacto e legível; o painel prioriza o trabalho de edição. O seletor de manual aparece uma única vez.

No desktop, catálogo à esquerda e conteúdo à direita. Em telas menores, os blocos se reorganizam sem sobreposição; a tabela pode rolar horizontalmente dentro de sua área. Botões, filtros, abas e campos devem ter nomes acessíveis e foco visível.

Apresentar nomes de produto, como Descrição técnica, Manutenção e Salvar, sem expor chaves de banco ou detalhes de implementação. Mensagens orientam a próxima ação: ajustar checklist, salvar alterações, enviar para validação ou corrigir conteúdo.

## 9. Integridade e segurança

A aplicação deriva a seleção autorizada no servidor. Contextos malformados, incompatíveis ou retirados do checklist não autorizam gravação ou validação.

A persistência é atômica por item e seção para impedir que a edição de um sistema sobrescreva outro. Alterações de fonte e decisões de validação compartilham bloqueios em ordem consistente, com releitura antes de aprovar. A aprovação é sempre da fonte vigente.

Revisão em amarelo permanece restrita ao preview. Emissão oficial continua bloqueada por pendências e não aceita status ou conteúdo arbitrário fornecidos pelo cliente. Os limites de organização e acesso ao empreendimento permanecem.

## 10. Critérios de aceitação

| ID | Resultado verificável |
| --- | --- |
| AC01 | A guia e o título exibem Textos técnicos; não existe guia separada de Sistemas Construtivos. |
| AC02 | Textos fixos estão disponíveis mesmo com checklist sem sistemas selecionados. |
| AC03 | Marcar possui e unidade inclui o sistema somente no Proprietário; comum inclui somente no Síndico. |
| AC04 | Um item com os dois escopos possui fontes e validações independentes. |
| AC05 | Alterar ou retirar seleção atualiza catálogo e preview sem apagar a fonte antiga nem abrir outro item por engano. |
| AC06 | Ordem e numeração dos sistemas correspondem ao documento, incluindo systemOrder. |
| AC07 | A busca localiza sistemas sem esconder a identidade da seleção; descrição e manutenção mantêm seus indicadores de estado. |
| AC08 | Descrição e Manutenção possuem edição, salvamento, envio e decisão separados. |
| AC09 | Adicionar, editar e remover atividade persiste após recarregar e não modifica o outro manual. |
| AC10 | Envio aguarda fonte salva; descrição vazia, contexto inválido e alteração não salva recebem orientação. |
| AC11 | Uma edição real rebaixa somente a validação da seção/contexto editados; outra sessão não perde conteúdo de outro item. |
| AC12 | Links antigos e cliques do preview abrem o editor correto, inclusive manutenção e manual Síndico. |
| AC13 | Enviado aparece amarelo; aprovado retorna às cores do design; PDF oficial continua protegido. |
| AC14 | Perfis sem permissão não gravam, revisam ou acessam outro empreendimento/organização. |
| AC15 | Build, testes de domínio e percurso real no navegador local passam; a PR e sua prévia são atualizadas sem alterar main. |

## 11. Verificação e entrega

Testes de domínio cobrem catálogo/ordem/escopos, preservação de fontes, legado e manutenção independente. Testes de integração cobrem gravação por contexto, concorrência, transições e permissão. No navegador, exercitar checklist → catálogo → descrição → manutenção → validação → preview, nos dois manuais, além de links legados, busca, filtros e recarga.

O PRD é versionado na mesma PR da implementação. A entrega contém o link da PR, o PRD e a prévia correspondente ao commit validado. A conferência funcional usa dados locais isolados; nenhuma fixture de teste é inserida no empreendimento do usuário.

## 12. Resultado da implementação

As duas integrações foram implementadas na PR #5: catálogo único de Textos técnicos orientado pelo checklist e painel de descrição/manutenção com salvamento e validação separados. A guia antiga é substituída, e seus links continuam válidos como alias.

Verificação local concluída em 1 de outubro de 2026: build com TypeScript, 29 testes de composição e suíte de API/navegador passaram. Os testes exercitaram fontes por escopo, concorrência sem perda, bloqueio de revisão antiga, manutenção vazia/incompleta, links do preview, retenção de rascunhos, remoção/reativação e inclusão de novo escopo pelo checklist. Desktop e celular de 390 px foram conferidos visualmente, sem erros JavaScript. A atualização permanece na branch da PR; a entrega não altera main nem insere dados de teste no empreendimento do usuário.
