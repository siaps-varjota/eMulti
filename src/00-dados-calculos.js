(function(){
  "use strict";

  // ID real da planilha (do link "Compartilhar", não do "Publicar na web").
  // O link antigo de "Publicar na web" só expunha 1 aba mesmo pedindo xlsx
  // (o Google ignorava o parâmetro), o que quebrava o fetch no navegador.
  // Agora buscamos cada aba separadamente via endpoint gviz/tq (CSV com
  // suporte a CORS de verdade), que funciona para qualquer aba por nome.
  // A planilha de dados agora é PRIVADA: o ID dela vive só no Apps Script
  // (Codigo.gs, DADOS_SHEET_ID). O painel pede cada aba ao backend com o
  // token da sessão (ver fetchSheetCsv) — sem login, não há dados.
  // Janela móvel usada SÓ pela aba "Tendência" (mês a mês): cada ponto do
  // gráfico é o M1/M2 calculado com uma janela de JANELA_MESES meses
  // terminando naquele mês. Mude só este número se quiser 3, 4 ou 6 meses
  // de janela.
  var JANELA_MESES = 4;
  // ---- Override com dados OFICIAIS (aba "Q2-26" da mesma planilha) ----
  // Pra mai/jun/jul de 2026, a Secretaria já tem o resultado oficial do
  // SIAPS/Ministério da Saúde (M1 e M2, por equipe e por mês), publicado
  // numa aba separada da mesma planilha. Sempre que esses dados oficiais
  // existirem pra um mês/equipe/indicador, eles SUBSTITUEM o valor
  // calculado pelo painel a partir dos dados brutos (ver
  // aplicarOverrideOficial, mais abaixo) — o cálculo próprio continua
  // valendo só pros meses/indicadores sem dado oficial disponível.
  var OFFICIAL_SHEET_NAME = "SIAPS-OFICIAL";
  // chave "centro|2026-05|M1" -> {numerador, denominador}
  var officialOverrides = {};
  // Quantos pontos (meses) mostrar nos gráficos de tendência — cada ponto
  // é o M1/M2 daquele mês, já calculado com sua própria janela de
  // JANELA_MESES meses terminando naquele mês.
  var TREND_MESES = 16;
  // ---- Filtro principal da Visão geral: Quadrimestre + Mês (opcional) ----
  // Quadrimestres fixos do ano civil: Q1 Jan–Abr, Q2 Mai–Ago, Q3 Set–Dez.
  var QUAD_LABELS = ['Jan–Abr (Q1)', 'Mai–Ago (Q2)', 'Set–Dez (Q3)'];
  // Quadrimestre(s) selecionado(s): agora os filtros "Ano" e
  // "Quadrimestre" do topo são multisseleção INDEPENDENTES (ver
  // renderAnoQuadSelects, mais abaixo) — quadsSelecionados guarda todo
  // combo {ano, qIndex} resultante do cruzamento das duas seleções (ex.:
  // anos [2025,2026] + quadrimestres [Q1,Q3] marcados = 4 combos). Nunca
  // fica vazio (renderAnoQuadSelects garante isso, do mesmo jeito que
  // currentEquipes sempre tem pelo menos 1 equipe marcada). Quando há
  // mais de 1 combo, os meses de TODOS eles entram como uma união única
  // (ver mesesDosQuadsSelecionadosUniao/mesesElapsedDosQuadsSelecionadosUniao,
  // logo abaixo de mesesElapsedDoQuadrimestre) — mesma ideia da média de
  // vários meses já usada pelo filtro de Mês, só que aplicada aos meses
  // de cada quadrimestre marcado. Começa no quadrimestre que contém o mês
  // atual.
  var quadsSelecionados = [quadrimestreDoMes(new Date())];
  // Data(s) escolhida(s) no filtro de Mês. Array vazio = usa a MÉDIA dos
  // meses do(s) quadrimestre(s) selecionado(s). Um ou mais meses
  // marcados: cada mês entra com o SEU PRÓPRIO resultado (já calculado
  // com a janela móvel de JANELA_MESES meses terminando nele — ver
  // calcularJanelaPeriodo) e, havendo mais de um, os resultados são
  // combinados pela média (mesma lógica já usada pra média do
  // quadrimestre, ver mediaDeMeses).
  // PADRÃO: já começa com o mês atual marcado (em vez de vazio/média) —
  // populateMonthSelectForQuad, mais abaixo, descarta esse valor inicial
  // se por algum motivo o mês atual não pertencer ao(s) quadrimestre(s)
  // selecionado(s) (quadsSelecionados também parte do mês atual, então
  // isso não deve acontecer no carregamento normal da página).
  var refMonthDates = [startOfMonth(new Date())];
  function quadrimestreDoMes(d){
    return {ano: d.getFullYear(), qIndex: Math.floor(d.getMonth()/4)};
  }
  // Chave/rótulo do quadrimestre de um mês, usados pra agrupar os pontos
  // do gráfico de Tendência e desenhar a linha de média de cada
  // quadrimestre (ver sparkline).
  function quadKeyOfDate(d){
    var q = quadrimestreDoMes(d);
    return q.ano + '-' + q.qIndex;
  }
  function quadShortLabel(d){
    var q = quadrimestreDoMes(d);
    var base = QUAD_LABELS[q.qIndex].replace(/\s*\(Q\d\)/, '');
    return base + '/' + String(q.ano).slice(2);
  }
  // Código curto (Q1/Q2/Q3) usado só dentro do gráfico de tendência, onde
  // o espaço é pequeno — o rótulo completo (quadShortLabel) fica só como
  // referência textual fora do SVG.
  function quadCode(d){
    return 'Q' + (quadrimestreDoMes(d).qIndex + 1);
  }
  // Os 4 meses (dia 1 de cada) que compõem um quadrimestre.
  function mesesDoQuadrimestre(ano, qIndex){
    var meses = [];
    for(var i=0; i<4; i++){ meses.push(new Date(ano, qIndex*4+i, 1)); }
    return meses;
  }
  // Só os meses do quadrimestre que já terminaram (mês cheio, fim do mês
  // <= hoje) — usado pra "Meta do quadrimestre" e pra Visão geral não
  // diluir a média do quadrimestre com meses futuros que ainda não têm
  // nenhum atendimento/atividade real (o que puxaria o resultado pra
  // baixo artificialmente). O ritmo médio desses meses já decorridos é
  // usado como PROJEÇÃO pros meses que faltam (ver mediaDeMeses e
  // aplicarMesReferencia): matematicamente, preencher os meses futuros
  // com a própria média dos meses decorridos dá o mesmo resultado que
  // simplesmente tirar a média só dos meses decorridos — por isso o
  // cálculo abaixo não recalcula nada pros meses futuros, só os exclui.
  // Se o quadrimestre acabou de começar (nenhum mês ainda fechou), usa
  // ao menos o 1º mês (mesmo em andamento) pra não ficar sem nenhum
  // dado.
  function mesesElapsedDoQuadrimestre(ano, qIndex){
    var meses = mesesDoQuadrimestre(ano, qIndex);
    var hoje = new Date();
    var elapsed = meses.filter(function(m){
      var fimMes = new Date(m.getFullYear(), m.getMonth()+1, 0, 23,59,59,999);
      return fimMes <= hoje;
    });
    return elapsed.length ? elapsed : meses.slice(0,1);
  }
  // ---- Combinação de múltiplos quadrimestres/anos (quadsSelecionados) ----
  // Com os filtros "Ano" e "Quadrimestre" agora em multisseleção
  // independente, quadsSelecionados pode ter mais de 1 combo {ano,
  // qIndex} ao mesmo tempo. As 3 funções abaixo tratam esse conjunto como
  // se fosse "um quadrimestre só", pra todo o resto do painel (Visão
  // geral, Meta do quadrimestre, Tendência etc.) continuar funcionando
  // sem precisar saber quantos combos estão marcados: a união de todos os
  // meses envolvidos, ordenada cronologicamente, sem repetir mês (isso
  // importa se dois combos compartilharem algum mês, o que não deveria
  // acontecer entre quadrimestres distintos, mas evita duplicar de
  // qualquer forma).
  function mesesDosQuadsSelecionadosUniao(){
    var vistos = {}, meses = [];
    quadsSelecionados.forEach(function(c){
      mesesDoQuadrimestre(c.ano, c.qIndex).forEach(function(m){
        var v = monthOptionValue(m);
        if(!vistos[v]){ vistos[v] = true; meses.push(m); }
      });
    });
    meses.sort(function(a,b){ return a-b; });
    return meses;
  }
  function mesesElapsedDosQuadsSelecionadosUniao(){
    var vistos = {}, meses = [];
    quadsSelecionados.forEach(function(c){
      mesesElapsedDoQuadrimestre(c.ano, c.qIndex).forEach(function(m){
        var v = monthOptionValue(m);
        if(!vistos[v]){ vistos[v] = true; meses.push(m); }
      });
    });
    meses.sort(function(a,b){ return a-b; });
    return meses;
  }
  // Último mês (dia 1) entre todos os combos marcados — usado como
  // "âncora" quando nenhum mês específico está selecionado no filtro de
  // Mês (ver anchorMonthDate) e pro cálculo do "quadrimestre anterior"
  // (calcularQuadrimestreAnterior).
  function ultimoMesDosQuadsSelecionados(){
    var max = null;
    quadsSelecionados.forEach(function(c){
      var d = new Date(c.ano, c.qIndex*4+3, 1);
      if(!max || d.getTime() > max.getTime()) max = d;
    });
    return max || startOfMonth(new Date());
  }
  // Rótulo textual combinando todos os combos marcados, ex.: "Set–Dez
  // (Q3)/2026" (1 combo) ou "Jan–Abr (Q1)/2025 + Set–Dez (Q3)/2026" (2+
  // combos) — usado no texto "Média de …" ao lado dos filtros.
  function labelQuadsSelecionados(){
    return quadsSelecionados.slice()
      .sort(function(a,b){ return (a.ano-b.ano) || (a.qIndex-b.qIndex); })
      .map(function(c){ return QUAD_LABELS[c.qIndex]+'/'+c.ano; })
      .join(' + ');
  }
  // Período de um único mês (do dia 1 ao último dia do mesmo mês).
  function periodoMesUnico(d){
    var inicio = new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
    var fim = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
    return {inicio: inicio, fim: fim};
  }
  // Um mês é "futuro" (ainda não fechou) quando seu último dia ainda não
  // chegou — usado pra marcar, no gráfico de Tendência, os pontos que na
  // verdade são projeção (o mês âncora pode ir até o fim do quadrimestre
  // selecionado, mesmo que ele ainda não tenha terminado — ver
  // anchorMonthDate logo abaixo).
  function isMesFuturo(d){
    var fimMes = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
    return fimMes > new Date();
  }
  // Mês "âncora" usado pela aba Tendência: o mais recente dos meses
  // escolhidos, se houver algum, ou o último mês do quadrimestre
  // selecionado.
  function anchorMonthDate(){
    if(refMonthDates.length) return refMonthDates[refMonthDates.length-1];
    return ultimoMesDosQuadsSelecionados();
  }
  // Só as abas de dados BRUTOS — o painel calcula M1/M2 sozinho a partir
  // delas (não lê mais nenhum valor pronto da aba "Indicadores M1 e M2").
  // IMPORTANTE: não existem abas separadas por equipe na planilha — os
  // nomes abaixo são os nomes REAIS das abas (conferidos direto no rodapé
  // do Google Sheets). TOTAL RELATÓRIO AC é uma fonte auxiliar mensal,
  // usada apenas no cálculo preliminar quando supera a contagem detalhada.
  // O filtro por equipe acontece linha a linha, pela
  // coluna "equipe_unidade" de cada aba (ver filtrarLinhasPorEquipe).
  var BASE_SHEET_NAMES = [
    "Atendimentos",
    "Participantes Ativ. Coletiva",
    "Resumo Atividade Coletiva",
    "TOTAL RELATÓRIO AC",
    "Resumo Reuniões"
  ];
  // matchKeyword: trecho (sem acento, maiúsculo) que precisa aparecer no
  // valor da coluna "equipe_unidade" pra a linha pertencer a esta equipe.
  // Ex.: "EMULTI CROATA DOS MARTINS - Croata" e "EMULTI CROATA DOS
  // MARTINS" (formatos variam entre abas) casam com "CROATA".
  var EQUIPES = [
    {key:"centro", label:"EMULTI Centro", suffix:"Centro", matchKeyword:"CENTRO"},
    {key:"croata", label:"EMULTI Croatá", suffix:"Croatá", matchKeyword:"CROATA"}
  ];
  // Agora suporta seleção múltipla: quando mais de uma equipe está
  // marcada, as linhas de AMBAS entram no cálculo (resultado combinado/
  // somado das equipes selecionadas). Sempre fica pelo menos 1 marcada.
  var currentEquipes = [EQUIPES[0]];
  // Indicadores de resultado (Composição do numerador, denominador etc.)
  // sempre mostram a MÉDIA quando o período combina mais de um mês (ver
  // mediaDeMeses) — antes havia um filtro "Tipo de Cálculo" (Soma/Média)
  // na tela; foi removido a pedido, então o comportamento agora é fixo
  // em "média" (cada mês entra com seu M1/M2 já calculado pela janela
  // móvel de JANELA_MESES meses terminando nele, e os meses selecionados
  // são combinados pela média dessas janelas — mesma lógica oficial
  // usada na Tendência).
  var tipoCalculo = 'media';
  // Filtro de Equipe da aba Análises — INDEPENDENTE do filtro global do
  // topo (currentEquipes): mudar um não muda o outro (a pedido). Mesmo
  // visual/comportamento do seletor do topo (single-select + "Todas"),
  // mas filtra client-side em cima do cache bruto (latestRawSheets), sem
  // disparar um novo fetch. Começa igual ao padrão do filtro do topo.
  var analisesEquipes = [EQUIPES[0]];
  // Quadrimestre(s) marcados no multisselect da aba Análises (array de
  // {ano, qIndex}). Vazio = comportamento padrão de sempre: histórico
  // COMPLETO, sem restringir por período. 1+ marcados: as análises
  // passam a considerar só as consultas dentro desses quadrimestres.
  var analisesQuads = [];
  // Filtro de profissional exclusivo da aba Frequência e Retorno.
  // Vazio = todos; uma chave selecionada = apenas esse profissional.
  var analisesProfissional = "";
  var analisesProfissionalMs = null;
  // Devolve true quando o profissional escolhido deixou de existir na lista
  // (ex.: trocou de equipe) e o filtro voltou pra "Todos" — quem chamou
  // precisa recalcular as análises, que ainda estavam com o filtro antigo.
  function atualizarOpcoesProfissionaisAnalises(){
    if(!analisesProfissionalMs) return false;
    var rows = sheetToRows(((latestRawSheets || {})["Atendimentos"]) || []);
    rows = filtrarLinhasPorEquipe(rows, analisesEquipes);
    var header = rows[0] || [];
    var idxProf = profissionalColIndex(header);
    var nomes = {};
    if(idxProf >= 0){
      rows.slice(1).forEach(function(r){
        var nome = String(r[idxProf]||'').trim();
        if(!nome) return;
        nomes[nome] = true;
      });
    }
    var opts = Object.keys(nomes).sort(function(a,b){return a.localeCompare(b,'pt-BR');})
      .map(function(nome){return {value:nome,label:nome};});
    analisesProfissionalMs.setOptions([{value:'',label:'Todos'}].concat(opts));
    var zerou = false;
    if(analisesProfissional && !nomes[analisesProfissional]){ analisesProfissional = ''; zerou = true; }
    analisesProfissionalMs.setSelected([analisesProfissional]);
    return zerou;
  }

  function suffixedName(baseName){
    return baseName + " — " + currentEquipes.map(function(e){ return e.suffix; }).join('+');
  }
  function displayListName(name){
    // remove o sufixo " — Centro"/" — Croatá" só pra exibição (o título da
    // equipe já aparece no topo da página). Esse sufixo agora é só uma
    // CHAVE INTERNA de cache (ver wb.Sheets) — não é mais o nome real da
    // aba buscada no Google.
    return name.replace(/ — .+$/, '');
  }
  function requiredSheetNames(){
    // Nomes REAIS das abas — sem sufixo de equipe (ver comentário acima
    // de BASE_SHEET_NAMES).
    return BASE_SHEET_NAMES.slice();
  }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addMonths(d, n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }
  function monthOptionValue(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0'); }
  function monthOptionLabel(d){
    var s = d.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // refMonthDates vazio: usuário está vendo a MÉDIA do quadrimestre
  // (nenhum mês específico marcado). Com 1+ meses marcados, mostra o(s)
  // mês(es) escolhido(s) — este helper monta o rótulo certo pros dois
  // casos (usado nos lugares que exibem "Mês de referência (...)").
  function refMonthLabel(){
    if(!refMonthDates.length) return 'Média do quadrimestre';
    if(refMonthDates.length === 1) return monthOptionLabel(refMonthDates[0]);
    return refMonthDates.map(monthShortLabel).join(' + ');
  }
  function monthShortLabel(d){
    var s = d.toLocaleDateString('pt-BR', {month:'short'}).replace('.', '');
    return s.charAt(0).toUpperCase() + s.slice(1) + '/' + String(d.getFullYear()).slice(2);
  }
  // Janela móvel de 4 meses (JANELA_MESES) TERMINANDO no mês de referência
  // informado (ex.: referência = maio → janela = fev a maio, incluindo os
  // dois extremos). "refMonth" é sempre o dia 1 do mês.
  function calcularJanelaPeriodo(refMonth){
    var fim = new Date(refMonth.getFullYear(), refMonth.getMonth()+1, 0, 23,59,59,999); // último dia do mês de referência
    var inicioMes = addMonths(refMonth, -(JANELA_MESES-1));
    var inicio = new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 1, 0,0,0,0);
    return {inicio: inicio, fim: fim};
  }
  // Série pra tendência: um ponto por mês (os últimos TREND_MESES meses,
  // terminando no mês de referência selecionado), cada um com sua PRÓPRIA
  // janela móvel de JANELA_MESES meses (não é o mesmo período repetido).
  function calcularSerieTendencia(wb, refMonth, n){
    var pontos = [];
    for(var i=n-1; i>=0; i--){
      var mes = addMonths(refMonth, -i);
      var janela = calcularJanelaPeriodo(mes);
      var res = calcularJanelaComOverride(wb, mes);
      pontos.push({
        mes:mes, m1:res.data.m1, m2:res.data.m2,
        numeradorM1: res.data.numeradorM1, denominadorM1: res.data.denominadorM1,
        numeradorM2: res.data.numeradorM2, denominadorM2: res.data.denominadorM2,
        notaFinal: res.data.notaFinal,
        // Debug: de onde veio "atividades coletivas compartilhadas" NESTE
        // mês — da contagem detalhada (Resumo Atividade Coletiva) ou do
        // total mensal já consolidado (TOTAL RELATÓRIO AC), e os dois
        // valores brutos, pra dar visibilidade quando o painel mostrar um
        // número menor do que o esperado (ver comentário em
        // calcularIndicadoresDoPeriodo sobre atividadesCompartilhadasFonte).
        // IMPORTANTE: atividadesCompartilhadas é só UMA PARTE do
        // numeradorM2 (a outra é reunioesCompartilhadas) — os dois vêm
        // separados aqui pra não dar a entender que o numerador INTEIRO
        // veio da AC quando só a parte de atividades coletivas veio.
        atividadesCompartilhadas: res.data.atividadesCompartilhadas,
        atividadesCompartilhadasFonte: res.data.atividadesCompartilhadasFonte,
        atividadesCompartilhadasListas: res.data.atividadesCompartilhadasListas,
        atividadesTotaisFonte: res.data.atividadesTotaisFonte,
        atividadesTotaisListas: res.data.atividadesTotaisListas,
        totalRelatorioAc: res.data.totalRelatorioAc,
        reunioesCompartilhadas: res.data.reunioesCompartilhadas,
        // Campos usados só pelo relatório de divergência oficial: valor
        // que o painel calcularia sem o override, e se este ponto teve
        // (ou não) override oficial aplicado — ver aplicarOverrideOficial.
        m1Oficial: !!res.data.m1Oficial, m2Oficial: !!res.data.m2Oficial,
        numeradorM1Calculado: res.data.numeradorM1Calculado, denominadorM1Calculado: res.data.denominadorM1Calculado, m1Calculado: res.data.m1Calculado,
        numeradorM2Calculado: res.data.numeradorM2Calculado, denominadorM2Calculado: res.data.denominadorM2Calculado, m2Calculado: res.data.m2Calculado,
        janela:janela
      });
    }
    return pontos;
  }
  // Popula #anoMs (anos disponíveis: ano atual + 2 anteriores) e #quadMs
  // (Q1/Q2/Q3, sem ano — o ano agora é um filtro à parte), os dois em
  // multisseleção independente. quadsSelecionados vira o PRODUTO de todo
  // ano marcado em anoMs por todo quadrimestre marcado em quadMs (ex.:
  // anos [2025,2026] + quadrimestres [Q1,Q3] marcados = os 4 combos
  // 2025-Q1, 2025-Q3, 2026-Q1, 2026-Q3 — ver recomputarQuadsSelecionados).
  // Como os dois filtros são independentes, não dá mais pra esconder
  // "quadrimestre futuro" (dependeria de quais anos estão marcados), então
  // as 3 opções de quadrimestre ficam sempre visíveis — quadrimestres
  // ainda não iniciados simplesmente não têm nenhum mês "decorrido" (ver
  // mesesElapsedDoQuadrimestre), então entram como projeção normalmente.
  var quadMs = null, anoMs = null, mesMs = null;
  // Remove duplicatas de um array de strings e ordena — usado só pra
  // sincronizar os widgets anoMs/quadMs com quadsSelecionados.
  function valoresUnicosOrdenados(arr){
    var vistos = {}, out = [];
    arr.forEach(function(v){ if(!vistos[v]){ vistos[v] = true; out.push(v); } });
    return out.sort();
  }
  // Cruza a seleção atual de anoMs com a de quadMs e atualiza
  // quadsSelecionados. Se o usuário limpar por completo um dos dois
  // filtros (0 anos ou 0 quadrimestres marcados), restaura nos dois
  // widgets a última seleção válida em vez de deixar o painel sem nenhum
  // combo — mesmo princípio do filtro de Equipe, que sempre mantém pelo
  // menos 1 equipe marcada.
  function recomputarQuadsSelecionados(){
    var anos = anoMs ? anoMs.getSelected().map(Number) : [];
    var qIdxs = quadMs ? quadMs.getSelected().map(Number) : [];
    if(!anos.length || !qIdxs.length){
      if(anoMs) anoMs.setSelected(valoresUnicosOrdenados(quadsSelecionados.map(function(c){ return String(c.ano); })));
      if(quadMs) quadMs.setSelected(valoresUnicosOrdenados(quadsSelecionados.map(function(c){ return String(c.qIndex); })));
      return;
    }
    var combos = [];
    anos.forEach(function(ano){
      qIdxs.forEach(function(qIndex){ combos.push({ano:ano, qIndex:qIndex}); });
    });
    combos.sort(function(a,b){ return (a.ano-b.ano) || (a.qIndex-b.qIndex); });
    quadsSelecionados = combos;
    refMonthDates = []; // volta a mostrar a média do(s) quadrimestre(s) escolhido(s)
    populateMonthSelectForQuad();
    aplicarMesReferencia(false);
  }
  function populateAnoQuadSelects(){
    var anoContainer = document.getElementById('anoMs');
    var quadContainer = document.getElementById('quadMs');
    if(!anoContainer || !quadContainer || quadMs) return; // já populado (não recria a cada render)
    anoMs = createMultiSelect(anoContainer, {
      placeholder: 'Selecione', multi: true, search: false, showTags: true,
      onChange: function(){ recomputarQuadsSelecionados(); }
    });
    var anoAtual = new Date().getFullYear();
    var anoOpts = [];
    for(var ano=anoAtual; ano>=anoAtual-2; ano--){ anoOpts.push({value:String(ano), label:String(ano)}); }
    anoMs.setOptions(anoOpts);

    quadMs = createMultiSelect(quadContainer, {
      placeholder: 'Selecione', multi: true, search: false, showTags: true,
      onChange: function(){ recomputarQuadsSelecionados(); }
    });
    quadMs.setOptions(QUAD_LABELS.map(function(label, idx){ return {value:String(idx), label:label}; }));

    anoMs.setSelected(valoresUnicosOrdenados(quadsSelecionados.map(function(c){ return String(c.ano); })));
    quadMs.setSelected(valoresUnicosOrdenados(quadsSelecionados.map(function(c){ return String(c.qIndex); })));
    populateMonthSelectForQuad();
  }
  // Preenche #mesMs com os meses do(s) quadrimestre(s) selecionado(s)
  // (união de todos os combos marcados — ver
  // mesesDosQuadsSelecionadosUniao) — em multisseleção: marcar 1+ meses
  // troca o resultado pro(s) mês(es) escolhido(s) (cada um com sua janela
  // móvel própria, combinados pela média quando há mais de um); nenhum
  // marcado = média de todos os meses selecionados. As opções são
  // refeitas toda vez que a seleção de Ano/Quadrimestre muda; o widget em
  // si (mesMs) é criado uma única vez.
  function populateMonthSelectForQuad(){
    var container = document.getElementById('mesMs');
    if(!container) return;
    if(!mesMs){
      mesMs = createMultiSelect(container, {
        placeholder: 'Média do quadrimestre', multi: true, search: false, showTags: true,
        onChange: function(keys){
          refMonthDates = keys.map(function(v){
            var parts = v.split('-');
            return new Date(+parts[0], +parts[1]-1, 1);
          }).sort(function(a,b){ return a-b; });
          aplicarMesReferencia(false);
        }
      });
    }
    var meses = mesesDosQuadsSelecionadosUniao();
    var mesesValidos = meses.map(monthOptionValue);
    var opts = meses.map(function(d){
      return {value: monthOptionValue(d), label: monthOptionLabel(d)};
    });
    // Ao trocar de quadrimestre/ano, mantém só a seleção que ainda faz
    // parte do novo conjunto de meses (evita "mês fantasma" de outro
    // período).
    refMonthDates = refMonthDates.filter(function(d){ return mesesValidos.indexOf(monthOptionValue(d)) >= 0; });
    mesMs.setOptions(opts);
    mesMs.setSelected(refMonthDates.map(monthOptionValue));
  }
  // Combina os indicadores de vários meses fazendo a MÉDIA de M1 e M2 —
  // é assim que o quadrimestre vira "a média dos meses do quadrimestre".
  // IMPORTANTE: o M1/M2 de CADA mês que entra nessa média já é o valor
  // "oficial" daquele mês/competência, ou seja, calculado com a janela
  // móvel de JANELA_MESES meses terminando naquele mês (ex.: M1 de maio =
  // fev+mar+abr+maio) — é por isso que a função recebe DOIS conjuntos de
  // resultados: `resultadosJanela` (M1/M2 de cada mês já com a janela
  // móvel, usados para a média) e `resultadosMensais` (dados BRUTOS só
  // daquele mês isolado, sem janela, usados apenas pra somar contagens de
  // contexto — atendimentos, participações etc. — e montar a lista de
  // "Pessoas atendidas" sem contar o mesmo atendimento mais de uma vez).
  function mediaDeMeses(resultadosMensais, resultadosJanela, mesesProjecaoLabel){
    function media(campo){
      var vals = resultadosJanela.map(function(r){ return r.data[campo]; }).filter(function(v){ return v!=null; });
      if(!vals.length) return null;
      return vals.reduce(function(a,b){ return a+b; }, 0) / vals.length;
    }
    // Soma "crua": usada só pra contexto que não tem relação direta com
    // M1/M2 (nenhum campo hoje) — mantida por clareza/possível uso futuro.
    function soma(campo){
      return resultadosMensais.reduce(function(a,r){ return a + (r.data[campo]||0); }, 0);
    }
    // Os números de contexto do M1/M2 (numerador, denominador, atendimentos,
    // atividades, reuniões) precisam vir da MESMA base que o m1/m2 exibido
    // no gauge — ou seja, das janelas móveis oficiais (resultadosJanela),
    // não dos meses isolados. Usamos MÉDIA das 4 janelas (não soma): como
    // cada janela já cobre JANELA_MESES meses, somar as 4 janelas do
    // quadrimestre contaria o mesmo dado várias vezes (elas se sobrepõem).
    // A média das janelas fica na mesma ordem de grandeza do quadrimestre
    // e é consistente com como m1/m2 acima já são calculados.
    function mediaJanela(campo){
      var vals = resultadosJanela.map(function(r){ return r.data[campo]; }).filter(function(v){ return v!=null; });
      if(!vals.length) return null;
      var media = vals.reduce(function(a,b){ return a+b; }, 0) / vals.length;
      return Math.round(media);
    }
    // Escolhe, campo a campo, entre a SOMA crua dos meses selecionados
    // (resultadosMensais, sem sobreposição de janela — bate com a lista
    // "Atendimentos" filtrada pelo mesmo período) e a MÉDIA das janelas
    // móveis oficiais (resultadosJanela) — controlado pelo filtro "Tipo
    // de Cálculo" (ver var tipoCalculo, padrão "soma"). O denominador do
    // M1 (pessoas distintas) é tratado à parte logo abaixo, por causa da
    // deduplicação entre meses.
    function campoExibicao(campo){
      return tipoCalculo === 'soma' ? soma(campo) : mediaJanela(campo);
    }

    // "Pessoas atendidas": une as listas dos meses selecionados (sempre
    // pelos meses ISOLADOS, sem janela, pra não trazer gente de fora do
    // período), somando atendimentos e participações de quem aparece em
    // mais de um mês — isso já dedup automaticamente quem se repete.
    var pessoasMap = {};
    resultadosMensais.forEach(function(r){
      r.pessoasAtendidas.rows.forEach(function(row){
        var chave = String(row[0]).trim().toUpperCase();
        if(!pessoasMap[chave]) pessoasMap[chave] = {nome:row[0], at:0, part:0};
        pessoasMap[chave].at += row[1];
        pessoasMap[chave].part += row[2];
      });
    });
    var pessoasLista = Object.keys(pessoasMap).map(function(k){ return pessoasMap[k]; })
      .sort(function(a,b){ return a.nome.localeCompare(b.nome,'pt-BR'); });
    var pessoasAtendidasRows = pessoasLista.map(function(p){ return [p.nome, p.at, p.part, p.at+p.part]; });
    // Denominador do M1 no modo "soma": NÃO pode ser soma('denominadorM1')
    // (somaria a mesma pessoa 2x se ela voltou em 2 meses diferentes) —
    // usa a contagem já deduplicada de pessoasLista. No modo "média"
    // continua vindo da média das janelas oficiais, como sempre foi.
    var denominadorM1Escolhido = tipoCalculo === 'soma' ? pessoasLista.length : mediaJanela('denominadorM1');
    var numeradorM1Escolhido = campoExibicao('numeradorM1');
    var numeradorM2Escolhido = campoExibicao('numeradorM2');
    var denominadorM2Escolhido = campoExibicao('denominadorM2');

    var m1, m2;
    if(tipoCalculo === 'soma'){
      // Ratio calculado direto sobre os totais do período inteiro (e não
      // mais a média das razões mensais) — mais intuitivo quando o
      // numerador/denominador de cima já são a soma/dedup do período: M1
      // = total de atendimentos÷pessoas distintas; M2 = total de ações
      // compartilhadas÷total de ações realizadas×100.
      m1 = denominadorM1Escolhido ? (numeradorM1Escolhido/denominadorM1Escolhido) : null;
      m2 = denominadorM2Escolhido ? (numeradorM2Escolhido/denominadorM2Escolhido*100) : null;
    } else {
      m1 = media('m1');
      m2 = media('m2');
    }
    var classificacaoM1 = classificarM1(m1);
    var classificacaoM2 = classificarM2(m2);
    var pontosM1 = PONTOS_POR_CLASSE[classificacaoM1];
    var pontosM2 = PONTOS_POR_CLASSE[classificacaoM2];
    var pontosM1Pesados = pontosM1!==undefined ? pontosM1*6 : null;
    var pontosM2Pesados = pontosM2!==undefined ? pontosM2*4 : null;
    var notaFinal = (pontosM1Pesados!=null && pontosM2Pesados!=null) ? (pontosM1Pesados+pontosM2Pesados) : null;
    var desempenho = classificarDesempenho(notaFinal);

    return {
      equipe: currentEquipes.map(function(e){ return e.label; }).join(' + '),
      data: {
        atendimentosIndividuais: soma('atendimentosIndividuais'),
        participacoesColetivas: soma('participacoesColetivas'),
        numeradorM1: soma('numeradorM1'),
        denominadorM1: pessoasLista.length,
        // Versões "janela": no modo "média" (comportamento antigo) é a
        // média das janelas móveis oficiais que compõem o m1/m2 acima —
        // usadas nos cards de Composição, na legenda do gauge e na Meta
        // do quadrimestre. No modo "soma" (padrão) é a SOMA crua dos
        // meses selecionados (sem sobreposição de janela), que é o que
        // bate com a lista "Atendimentos" filtrada pelo mesmo período —
        // ver filtro "Tipo de Cálculo" / var tipoCalculo.
        atendimentosIndividuaisJanela: campoExibicao('atendimentosIndividuais'),
        participacoesColetivasJanela: campoExibicao('participacoesColetivas'),
        numeradorM1Janela: numeradorM1Escolhido,
        denominadorM1Janela: denominadorM1Escolhido,
        // Versão "Calculado" (pré-override oficial) do denominador do M1
        // — usada só pro card "Denominador do M1" mostrar a contagem REAL
        // da lista "Pessoas atendidas" embaixo da barra, mesmo quando o
        // total do card (denominadorM1Janela) vem substituído pelo valor
        // oficial da aba Q2-26 (mesmo padrão já usado no card "Composição
        // do numerador", ver numM1Bar). No modo "soma" não existe override
        // aplicado sobre a soma crua, então é o mesmo valor deduplicado de
        // denominadorM1Janela.
        denominadorM1CalculadoJanela: tipoCalculo === 'soma' ? pessoasLista.length : mediaJanela('denominadorM1Calculado'),
        m1: m1,
        classificacaoM1: classificacaoM1,
        atividadesTotais: soma('atividadesTotais'),
        atividadesCompartilhadas: soma('atividadesCompartilhadas'),
        atividadesTotaisJanela: campoExibicao('atividadesTotais'),
        reunioesTotais: soma('reunioesTotais'),
        reunioesCompartilhadas: soma('reunioesCompartilhadas'),
        reunioesCompartilhadasContrib: soma('reunioesCompartilhadasContrib'),
        reunioesTotaisJanela: campoExibicao('reunioesTotais'),
        denominadorM2: soma('denominadorM2'),
        numeradorM2: soma('numeradorM2'),
        atividadesCompartilhadasJanela: campoExibicao('atividadesCompartilhadas'),
        reunioesCompartilhadasJanela: campoExibicao('reunioesCompartilhadas'),
        reunioesCompartilhadasContribJanela: campoExibicao('reunioesCompartilhadasContrib'),
        numeradorM2Janela: numeradorM2Escolhido,
        denominadorM2Janela: denominadorM2Escolhido,
        m2: m2,
        classificacaoM2: classificacaoM2,
        pontosM1: pontosM1Pesados,
        pontosM2: pontosM2Pesados,
        notaFinal: notaFinal,
        desempenho: desempenho,
        // Preenchido só quando a média sai do quadrimestre inteiro (não
        // de uma seleção manual de meses) E nem todos os 4 meses do
        // quadrimestre já terminaram — sinaliza que os meses que faltam
        // estão sendo projetados pelo ritmo médio dos meses já
        // decorridos (ver mesesElapsedDoQuadrimestre e
        // aplicarMesReferencia). null = média "fechada" normal, sem
        // projeção (seleção manual de meses, ou quadrimestre já
        // encerrado).
        mesesProjecaoLabel: mesesProjecaoLabel || null
      },
      notes: NOTAS_METODOLOGICAS,
      pessoasAtendidas: {headers: ["Nome","Atendimentos","Participantes Ativ. Coletiva","Total"], rows: pessoasAtendidasRows}
    };
  }
  // Busca o CSV de uma aba pelo backend (Apps Script), autenticado pelo
  // token da sessão. Devolve uma Promise com o texto CSV.
  function fetchSheetCsv(sheetName){
    var api = window.PAINEL_API;
    var token = window.painelToken && window.painelToken();
    if(!api || !token) return Promise.reject(new Error('Sessão não iniciada — faça login.'));
    return fetch(api.url, {
      method:'POST', headers:{'Content-Type':'text/plain'}, cache:'no-store',
      body: JSON.stringify({chave:api.chave, acao:'dados', token:token, aba:sheetName})
    })
      .then(function(res){ if(!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function(r){
        if(r.status === 'sessao_expirada'){
          if(window.logoutPainelEmulti) window.logoutPainelEmulti();
          throw new Error('Sessão expirada — faça login novamente.');
        }
        if(r.status !== 'ok') throw new Error(r.mensagem || 'Falha ao ler a aba');
        return r.csv;
      });
  }
  function fetchAllSheets(){
    return Promise.all(requiredSheetNames().map(function(name){
      return fetchSheetCsv(name)
        .then(function(csvText){ return {name:name, csvText:csvText, ok:true}; })
        .catch(function(err){ return {name:name, error:err, ok:false}; });
    }));
  }

  var CLASS_PILL_HEX = {"Ótimo":"#2F6F5E","Bom":"#6B8F71","Suficiente":"#C68A3D","Regular":"#B5474B"};
  var CLASS_ARC_HEX = {"Regular":"#E63737","Suficiente":"#F4A734","Bom":"#2BB659","Ótimo":"#2775E7"};
  // Versão só um pouco mais intensa/saturada, usada apenas nos anéis da
  // Visão geral (ovRingSVG) — não afeta os gauges grandes das abas M1/M2,
  // que continuam usando CLASS_ARC_HEX normalmente.
  var CLASS_ARC_HEX_OV = {"Regular":"#BF2929","Suficiente":"#CF7E09","Bom":"#2A894A","Ótimo":"#1B59B5"};
  // Ainda mais saturada que CLASS_ARC_HEX_OV — usada só na faixa ATIVA
  // (o intervalo onde o resultado atual do gauge cai) dos anéis da Visão
  // geral, pra destacar mais o intervalo certo; as demais faixas (fora do
  // intervalo) continuam com CLASS_ARC_HEX_OV, só que com opacidade menor
  // (ver ovRingSVG) pra ficarem ainda mais esmaecidas.
  var CLASS_ARC_HEX_OV_ATIVA = {"Regular":"#C61010","Suficiente":"#D67D00","Bom":"#15933F","Ótimo":"#0553C7"};

  // ---------- Listas complementares ----------
  // As sete tabelas complementares são exibidas uma única vez na aba Listas compartilhadas.
  function listasComplementaresNomes(){ return ["Atendimentos", "Atendimentos interprofissionais", "Participantes Ativ. Coletiva", "Pessoas atendidas", "Busca-Ativa", "Resumo Reuniões", "Resumo Atividade Coletiva"].map(suffixedName); }
  function m1ListNames(){ return listasComplementaresNomes(); }
  function m2ListNames(){ return listasComplementaresNomes(); }
  var latestSheets = {}; // nome da aba -> {headers, rows} | {error}
  // Filtro de mês (multisseleção) das listas das abas M1/M2: por lista
  // (chave = nome sufixado da aba), guarda o índice da coluna de data
  // encontrada e os meses atualmente marcados (["" ] vazio = todos os
  // meses). Persistem entre re-renders pra não perder a seleção do
  // usuário a cada atualização dos dados.
  var listDateColIdx = {};
  var listMonthFilters = {};
  // "Pessoas atendidas": true quando as colunas Data 4+ estão expandidas (por container+lista).
  var listDatasExpandidas = {};
  // Modelo de dados de cada lista (M1/M2): {rows, view, sortCol, sortDir}.
  // Só as linhas da página atual vão pro DOM (mesmo modelo de paginação da
  // tabela "Pacientes em risco de abandono"); filtro/busca/ordenação/PDF
  // trabalham sobre este modelo, não sobre <tr> escondidos.
  var listModel = {};
  // Acha a coluna de data de uma lista bruta, testando os nomes usados
  // nas abas de origem ("data" na maioria, "data_hora" em Atendimentos).
  function dateColIndexForList(headers){
    var idx = colIndex(headers, "data_hora");
    if(idx >= 0) return idx;
    return colIndex(headers, "data");
  }
  // Monta as opções de mês (mais recente primeiro) a partir dos valores
  // de data realmente presentes nas linhas da lista.
  function monthOptionsForList(cached, dateColIdx){
    var seen = {}, months = [];
    cached.rows.forEach(function(r){
      var d = parseBRDate(r[dateColIdx]);
      if(!d) return;
      var v = monthOptionValue(d);
      if(!seen[v]){ seen[v] = true; months.push(new Date(d.getFullYear(), d.getMonth(), 1)); }
    });
    months.sort(function(a,b){ return b-a; });
    return months.map(function(d){ return {value: monthOptionValue(d), label: monthOptionLabel(d)}; });
  }

  var STORAGE_KEY = "uploads";
  var currentRecordId = null;
  var STORAGE_AVAILABLE = !!(window.storage && typeof window.storage.get === 'function'
    && typeof window.storage.set === 'function');
  var memoryHistory = [];

  // ---------- Helpers ----------
  function fmtInt(v){
    if(v===null||v===undefined||isNaN(v)) return "—";
    return Number(v).toLocaleString('pt-BR');
  }
  function fmtDec(v,d){
    if(v===null||v===undefined||isNaN(v)) return "—";
    return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  }
  function fmtDate(ts){
    var d = new Date(ts);
    return d.toLocaleDateString('pt-BR') + " às " + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }
  function shortDate(ts){
    var d = new Date(ts);
    return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  }
  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  // Texto "completo" de uma célula pra busca/filtro-por-coluna/PDF: normalmente
  // é só o texto renderizado (cell.textContent), mas algumas células (ex.: a
  // coluna "Profissional" de "Pessoas Atendidas", que exibe só o profissional
  // responsável + um badge "+N") guardam o valor original completo em
  // data-cell-text (URI-encoded) — ver renderListCard — porque o texto
  // renderizado na tela não é mais igual ao dado bruto usado pra filtrar.
  function cellFullText(cell){
    if(!cell) return '';
    var raw = cell.getAttribute ? cell.getAttribute('data-cell-text') : null;
    if(raw === null || raw === undefined) return cell.textContent.trim();
    try{ return decodeURIComponent(raw); }catch(e){ return cell.textContent.trim(); }
  }
  // Debounce simples: só executa fn depois que o usuário parou de disparar
  // o evento por `ms` milissegundos (ex.: parar de digitar). Evita
  // recalcular uma lista inteira (potencialmente 1000+ linhas) a cada tecla.
  function debounce(fn, ms){
    var timer = null;
    return function(){
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function(){ fn.apply(ctx, args); }, ms);
    };
  }
  function pillHex(c){ return CLASS_PILL_HEX[c] || "#9AA69E"; }
  function arcHex(c){ return CLASS_ARC_HEX[c] || "#9AA69E"; }
  function arcHexOv(c){ return CLASS_ARC_HEX_OV[c] || "#9AA69E"; }
  function arcHexOvAtiva(c){ return CLASS_ARC_HEX_OV_ATIVA[c] || "#9AA69E"; }
  // Texto descritivo da caixa "Interpretação" do card de gauge das abas
  // M1/M2, de acordo com a classificação atual do indicador.
  var GAUGE_INTERPRETATION = {
    'Regular':    'indicando necessidade de atenção nas ações do programa.',
    'Suficiente': 'mostrando um desempenho satisfatório das ações do programa.',
    'Bom':        'mostrando um desempenho positivo das ações do programa.',
    'Ótimo':      'mostrando um desempenho excelente das ações do programa.'
  };
  function gaugeInterpretationHTML(classLabel){
    var txt = GAUGE_INTERPRETATION[classLabel] || 'refletindo o desempenho atual das ações do programa.';
    return 'O indicador está em nível <b>'+(classLabel||'—')+'</b>, '+txt;
  }
  // Cabeçalho dos cards de Numerador/Denominador: ícone de pessoas +
  // título + badge com o valor total, no modelo das imagens de referência.
  function compCardHeaderHTML(title, totalValue){
    return '<div class="comp-card-head">'
      + '<div class="comp-card-icon"><svg viewBox="0 0 24 24">'+OV_ICONS.users+'</svg></div>'
      + '<h4>'+title+'</h4>'
      + '<span class="comp-card-total">'+fmtInt(totalValue)+'</span>'
      + '</div>';
  }

  // ---------- Multi-select arredondado (Equipe / Quadrimestre / Mês) ----------
  // Componente genérico: em modo multi:true permite marcar vários valores
  // (com "Selecionar tudo"/"Limpar" e tags abaixo do botão); em modo
  // multi:false funciona como um "select" de valor único, mas com o
  // mesmo visual arredondado — clicar numa opção troca a seleção e fecha.
  function createMultiSelect(container, cfg){
    cfg = cfg || {};
    var state = {options: [], selected: [], isOpen: false, searchTerm: ''};
    container.innerHTML =
        '<button type="button" class="ms-btn">'
      +   '<span class="ms-btn-text"></span>'
      +   '<svg class="ms-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>'
      + '</button>'
      + '<div class="ms-panel" style="display:none;"></div>';
      // Obs.: não existe mais uma caixa de "tags" fora do botão listando
      // cada valor selecionado (cfg.showTags é ignorado de propósito) — o
      // valor selecionado só aparece DENTRO do próprio filtro (ms-btn-text,
      // abaixo, ex.: "3 selecionados"), nunca plotado fora dele. Vale pra
      // todo filtro (Profissional, Equipe, Mês, coluna etc.) em todas as
      // tabelas do painel, já que todas usam este mesmo componente.
    var btn = container.querySelector('.ms-btn');
    var btnText = container.querySelector('.ms-btn-text');
    var panel = container.querySelector('.ms-panel');
    var tagsBox = container.querySelector('.ms-tags');

    function labelFor(value){
      var found = state.options.filter(function(o){ return o.value===value; })[0];
      return found ? found.label : value;
    }

    function renderTags(){
      if(!tagsBox) return;
      if(!cfg.multi || state.selected.length<2){ tagsBox.innerHTML=''; return; }
      tagsBox.innerHTML = state.selected.map(function(v){
        return '<span class="ms-tag" data-value="'+escapeHtml(v)+'">'+escapeHtml(labelFor(v))
          + '<button type="button" data-remove="'+escapeHtml(v)+'">'
          +   '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>'
          + '</button></span>';
      }).join('');
      tagsBox.querySelectorAll('[data-remove]').forEach(function(b){
        b.addEventListener('click', function(e){
          e.stopPropagation();
          setSelected(state.selected.filter(function(v){ return v!==b.getAttribute('data-remove'); }));
        });
      });
    }

    function render(){
      var selLabels = state.selected.map(labelFor);
      btnText.textContent = selLabels.length===0 ? (cfg.placeholder || 'Todos')
        : (cfg.multi && selLabels.length>1 ? selLabels.length+' selecionados' : selLabels.join(', '));
      container.classList.toggle('ms-has-value', selLabels.length>0);
      btn.classList.toggle('ms-open', state.isOpen);
      renderTags();

      if(!state.isOpen){ panel.style.display='none'; panel.innerHTML=''; return; }
      panel.style.display='block';

      var term = state.searchTerm.toLowerCase();
      var filtered = !term ? state.options : state.options.filter(function(o){
        return o.label.toLowerCase().indexOf(term) >= 0;
      });

      var html = '';
      if(cfg.search){
        html += '<div class="ms-search-wrap"><input type="text" class="ms-search" placeholder="Buscar…" value="'+escapeHtml(state.searchTerm)+'"></div>';
      }
      if(cfg.multi){
        html += state.selected.length>0
          ? '<button type="button" class="ms-action" data-action="clear">Limpar seleção</button>'
          : '<button type="button" class="ms-action" data-action="all">Selecionar tudo</button>';
      }
      html += '<div class="ms-list">';
      html += filtered.length===0
        ? '<div class="ms-empty">Nenhum resultado encontrado</div>'
        : filtered.map(function(o){
            var checked = state.selected.indexOf(o.value)>=0;
            return '<button type="button" class="ms-option'+(checked?' ms-option-checked':'')+'" data-value="'+escapeHtml(o.value)+'">'
              + '<span class="ms-option-label">'+escapeHtml(o.label)+'</span>'
              + (checked ? '<svg class="ms-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>' : '')
              + '</button>';
          }).join('');
      html += '</div>';
      panel.innerHTML = html;

      // Abre pra cima quando não cabe embaixo (mesmo comportamento do
      // <select> nativo do navegador, usado no "Filtrar por coluna…"):
      // sem isso, este painel customizado sempre abria pra baixo, mesmo
      // perto do fim da tela, cortando a lista ou saindo da viewport —
      // vale pra todo filtro deste componente (Mês, Equipe, Profissional
      // etc.) em qualquer tabela, já que todas usam createMultiSelect.
      panel.classList.remove('ms-panel-up');
      var btnRect = btn.getBoundingClientRect();
      var espacoAbaixo = window.innerHeight - btnRect.bottom;
      var espacoAcima = btnRect.top;
      if(panel.offsetHeight > espacoAbaixo && espacoAcima > espacoAbaixo){
        panel.classList.add('ms-panel-up');
      }

      var searchInput = panel.querySelector('.ms-search');
      if(searchInput){
        searchInput.focus();
        var pos = state.searchTerm.length;
        searchInput.setSelectionRange(pos,pos);
        searchInput.addEventListener('input', function(){ state.searchTerm = searchInput.value; render(); });
      }
      var actionBtn = panel.querySelector('.ms-action');
      if(actionBtn){
        actionBtn.addEventListener('click', function(){
          if(actionBtn.getAttribute('data-action')==='clear') setSelected([]);
          else setSelected(filtered.map(function(o){ return o.value; }));
        });
      }
      panel.querySelectorAll('.ms-option').forEach(function(elOpt){
        elOpt.addEventListener('click', function(){
          var v = elOpt.getAttribute('data-value');
          if(cfg.multi){
            var next = state.selected.indexOf(v)>=0
              ? state.selected.filter(function(x){ return x!==v; })
              : state.selected.concat([v]);
            setSelected(next);
          } else {
            state.isOpen = false;
            setSelected([v]);
          }
        });
      });
    }

    function setSelected(values, silent){
      state.selected = values;
      render();
      if(!silent && cfg.onChange) cfg.onChange(state.selected.slice());
    }

    btn.addEventListener('click', function(){
      state.isOpen = !state.isOpen;
      state.searchTerm = '';
      render();
    });
    document.addEventListener('mousedown', function(e){
      if(state.isOpen && !container.contains(e.target)){
        state.isOpen = false;
        state.searchTerm = '';
        render();
      }
    });

    return {
      setOptions: function(opts){ state.options = opts; render(); },
      setSelected: function(values){ setSelected(values, true); },
      getSelected: function(){ return state.selected.slice(); }
    };
  }

  // ---------- Parsing ----------
  function sheetToRows(ws){
    if(Array.isArray(ws)) return ws; // já é uma matriz de linhas (vindo do parseCsv)
    return XLSX.utils.sheet_to_json(ws, {header:1, defval:""});
  }

  // ---------- Filtro por equipe (linha a linha) ----------
  // Não existem abas separadas por equipe — cada linha da aba tem uma
  // coluna "equipe_unidade" (ou similar) que identifica a equipe. Aqui a
  // gente acha essa coluna e mantém só as linhas da equipe selecionada.
  function normalizeText(s){
    return String(s||"").toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }
  // Profissionais que de fato são da eMulti — usado só pra filtrar o
  // gráfico "Comparativo por profissional" (a aba de atendimentos traz
  // profissionais de fora da equipe também, ex. de outros programas que
  // atenderam o mesmo paciente, e esses não devem entrar nesse
  // comparativo). Comparação ignora acento/maiúscula (normalizeText).
  var PROFISSIONAIS_COMPARATIVO_EMULTI = [
    "FRANCISCA TEREZINHA ARAUJO",
    "ANNA ALLYNE ALVES CARVALHO",
    "ECLENE PAULO DOS SANTOS",
    "KELLE ROSSANNE LINHARES PAULO",
    "MARIA EVELINE PONTES MONTE",
    "CLECIANE NOBRE XIMENES",
    "KAROLINY MELO DE CASTRO",
    "IWDMILLY DE SOUSA LINHARES",
    "JOSE LUCAS CAETANO OLIVEIRA",
    "ALINE DE SOUSA ROSA",
    "MARCILENE ALVES DA SILVA",
    "HANNA LUIZA OLIVEIRA GOMES",
    "KARISE SANTOS VASCONCELOS",
    "LETÍCIA EMILLY MESQUITA DE SOUSA",
    "ANNA MAEVILLY LIRA LOPES MARTINS"
  ].map(normalizeText);
  function ehProfissionalComparativoEmulti(nome){
    return PROFISSIONAIS_COMPARATIVO_EMULTI.indexOf(normalizeText(nome)) >= 0;
  }
  function equipeColIndex(headerRow){
    for(var i=0;i<headerRow.length;i++){
      var h = normalizeText(headerRow[i]).replace(/\s+/g,'_');
      if(h === "EQUIPE_UNIDADE") return i;
    }
    for(var j=0;j<headerRow.length;j++){
      if(normalizeText(headerRow[j]).indexOf("EQUIPE") !== -1) return j;
    }
    return -1;
  }
  // ---------- Dados oficiais (aba Q2-26) ----------
  // A aba Q2-26 tem uma única tabela, uma linha por equipe/mês, com
  // cabeçalho: MÊS | NOME DA EQUIPE | SIGLA DA EQUIPE | NUMERADOR M1 |
  // DENOMINADOR M1 | PONTUAÇÃO M1 (não usada — recalculamos pra garantir
  // a mesma fórmula do painel) | NUMERADOR M2 | DENOMINADOR M2 |
  // PONTUAÇÃO M2. Não há coluna separada por aba/equipe — filtramos e
  // agrupamos aqui mesmo.
  var MESES_PT_ABREV = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};
  function parseMesAbrevPt(raw){
    var s = String(raw||"").trim().toLowerCase().replace(/\./g,'');
    var m = s.match(/^([a-z]{3})\/(\d{2,4})$/);
    if(m && MESES_PT_ABREV[m[1]]!==undefined){
      var anoStr = m[2];
      var ano = anoStr.length===2 ? (2000+ +anoStr) : +anoStr;
      return {ano:ano, mesIdx:MESES_PT_ABREV[m[1]]};
    }
    // Reforço: se a célula "MÊS" for uma data de verdade (não texto), o
    // gviz/CSV pode devolver algo como "31/5/2026" ou "2026-05-31" em vez
    // de "mai./26" — tenta os dois formatos antes de desistir.
    var d = parseBRDate(raw);
    if(d) return {ano: d.getFullYear(), mesIdx: d.getMonth()};
    return null;
  }
  // Acha a equipe (EQUIPES) cujo matchKeyword aparece no "NOME DA EQUIPE"
  // da aba oficial — mesma lógica/keywords usadas pra filtrar as abas
  // brutas por equipe (ver EQUIPES e filtrarLinhasPorEquipe).
  function equipeKeyFromNomeOficial(nome){
    var norm = normalizeText(nome);
    var achou = EQUIPES.filter(function(eq){ return norm.indexOf(normalizeText(eq.matchKeyword)) !== -1; });
    return achou.length ? achou[0].key : null;
  }
  function officialOverrideKey(equipeKey, ano, mesIdx, indicador){
    return equipeKey + '|' + ano + '-' + String(mesIdx+1).padStart(2,'0') + '|' + indicador;
  }
  // Faz o parse do CSV bruto da aba Q2-26 pro mapa de overrides. Espera
  // uma linha de cabeçalho com MÊS, NOME DA EQUIPE, SIGLA DA EQUIPE,
  // NUMERADOR M1, DENOMINADOR M1, PONTUAÇÃO M1, NUMERADOR M2,
  // DENOMINADOR M2, PONTUAÇÃO M2 (colunas achadas pelo nome, não por
  // posição fixa — ver colIndex). Cada linha de dado gera até 2 entradas
  // no mapa (M1 e M2); linhas sem MÊS/NOME DA EQUIPE reconhecíveis, ou a
  // própria linha de cabeçalho, são ignoradas.
  function parseOfficialSheetCsv(csvText){
    var rows = parseCsv(csvText);
    var map = {};
    if(!rows.length) return map;
    var header = rows[0];
    var iMes = colIndex(header, 'mes');
    var iEquipe = colIndex(header, 'nome_da_equipe');
    var iNumM1 = colIndex(header, 'numerador_m1');
    var iDenM1 = colIndex(header, 'denominador_m1');
    var iNumM2 = colIndex(header, 'numerador_m2');
    var iDenM2 = colIndex(header, 'denominador_m2');
    if(iMes<0 || iEquipe<0 || iNumM1<0 || iDenM1<0 || iNumM2<0 || iDenM2<0) return map;
    rows.slice(1).forEach(function(r){
      var equipeKey = equipeKeyFromNomeOficial(r[iEquipe]);
      if(!equipeKey) return;
      var mes = parseMesAbrevPt(r[iMes]);
      if(!mes) return;
      map[officialOverrideKey(equipeKey, mes.ano, mes.mesIdx, 'M1')] = {
        numerador: toInt(r[iNumM1]),
        denominador: toInt(r[iDenM1])
      };
      map[officialOverrideKey(equipeKey, mes.ano, mes.mesIdx, 'M2')] = {
        numerador: toInt(r[iNumM2]),
        denominador: toInt(r[iDenM2])
      };
    });
    return map;
  }
  // Busca a aba oficial à parte (não é uma aba "bruta" filtrada por
  // equipe, ver requiredSheetNames). Nunca rejeita a promise — se a aba
  // não existir ou a busca falhar, simplesmente mantém os overrides já
  // carregados antes (ou vazio, na primeira vez), sem travar o resto do
  // carregamento do painel.
  function fetchOfficialOverridesSafe(){
    return fetchSheetCsv(OFFICIAL_SHEET_NAME)
      .then(function(csvText){ officialOverrides = parseOfficialSheetCsv(csvText); })
      .catch(function(){ /* mantém officialOverrides como estava */ });
  }

  // ---------- Cadastro de Profissionais (aba "PROFISSIONAIS") ----------
  // Fonte de verdade de QUEM deve aparecer na aba Desempenho Profissional:
  // cada linha desta aba (na mesma planilha de origem) traz o nome do
  // profissional, a equipe a que pertence e a categoria profissional
  // (CBO/função). Diferente das abas de dados brutos (BASE_SHEET_NAMES),
  // esta é uma aba de CADASTRO, sem data/período — é buscada à parte,
  // igual à aba oficial (ver fetchOfficialOverridesSafe acima), e nunca
  // trava o carregamento do painel se estiver ausente, vazia ou com
  // colunas de nome diferente (ver profRosterColIndex).
  var PROFISSIONAIS_SHEET_NAME = "PROFISSIONAIS";
  // lista de {nome, equipeKey, categoria} — uma entrada por
  // profissional+equipe cadastrados na aba (um profissional que atua em
  // 2 equipes gera 2 entradas, uma pra cada).
  var profissionaisRoster = [];
  // Diz se um nome está cadastrado na aba PROFISSIONAIS (roster da
  // eMulti). Usado em vários lugares (filtro de M1, "Pessoas atendidas",
  // debug) — fica num único lugar pra não duplicar a lógica de
  // normalização. O cache é reconstruído sozinho sempre que
  // profissionaisRoster muda de referência (recarregou a planilha).
  var rosterNomesEmultiCache = null;
  var rosterNomesEmultiCacheFor = null;
  function nomeEhDaEmulti(nome){
    if(rosterNomesEmultiCacheFor !== profissionaisRoster){
      rosterNomesEmultiCache = {};
      profissionaisRoster.forEach(function(p){ rosterNomesEmultiCache[normalizeText(p.nome)] = true; });
      rosterNomesEmultiCacheFor = profissionaisRoster;
    }
    nome = String(nome||"").trim();
    return !!nome && !!rosterNomesEmultiCache[normalizeText(nome)];
  }
  // Acha a coluna certa tentando primeiro nomes exatos e, não achando,
  // cai pra uma busca por palavra-chave no cabeçalho — protege contra a
  // aba PROFISSIONAIS usar um nome de coluna um pouco diferente do
  // esperado.
  function profRosterColIndex(header, candidatos, fallbackKeyword){
    for(var i=0;i<candidatos.length;i++){
      var idx = colIndex(header, candidatos[i]);
      if(idx >= 0) return idx;
    }
    if(fallbackKeyword){
      for(var j=0;j<header.length;j++){
        if(normalizeText(header[j]).indexOf(fallbackKeyword) !== -1) return j;
      }
    }
    return -1;
  }
  // Layout real da aba (ver print do usuário): "Nome do Profissional" |
  // "CATEGORIA PROFISSIONAL" | "Equipe 1" | "Equipe 2" (podendo ter mais
  // colunas "Equipe N" à direita) — cada profissional pode ter 1 ou 2
  // equipes preenchidas (2 quando atua nas duas). Por isso, ao contrário
  // das outras colunas, TODAS as colunas cujo cabeçalho contenha
  // "EQUIPE" são lidas, e cada uma preenchida na linha vira uma entrada
  // separada no roster (mesmo profissional, equipes diferentes).
  function parseProfissionaisCsv(csvText){
    var rows = parseCsv(csvText);
    if(!rows.length) return [];
    var header = rows[0];
    var iNome = profRosterColIndex(header, ["Nome do Profissional","profissional","nome_profissional","nome"], "PROFISSIONAL");
    var iCategoria = profRosterColIndex(header, ["CATEGORIA PROFISSIONAL","categoria_profissional","categoria_prof","categoria","cbo"], "CATEGORIA");
    var equipeCols = [];
    header.forEach(function(h, idx){
      if(normalizeText(h).indexOf("EQUIPE") !== -1) equipeCols.push(idx);
    });
    if(iNome < 0) return [];
    var lista = [];
    // Deduplica por profissional+equipe: evita cartão duplicado no
    // Panorama Assistencial quando a mesma equipe aparece preenchida em
    // mais de uma coluna "Equipe N" da mesma linha (ex.: "Equipe 1" e
    // "Equipe 2" ambas com "Centro" por engano de digitação) — sem isso,
    // cada coluna virava uma entrada separada no roster com o MESMO
    // nome+equipe, e calcularPerformanceProfissionais gerava um cartão
    // idêntico pra cada uma.
    var vistos = {};
    rows.slice(1).forEach(function(r){
      var nome = String(r[iNome]||"").trim();
      if(!nome) return;
      var categoria = iCategoria>=0 ? String(r[iCategoria]||"").trim() : "";
      equipeCols.forEach(function(iEquipe){
        var valorEquipe = normalizeText(r[iEquipe]);
        if(!valorEquipe) return; // "Equipe 2" costuma vir vazia pra quem só atua em 1 equipe
        var equipeMatch = EQUIPES.filter(function(eq){ return valorEquipe.indexOf(normalizeText(eq.matchKeyword)) !== -1; })[0];
        if(!equipeMatch) return;
        var chave = normalizeText(nome) + '|' + equipeMatch.key;
        if(vistos[chave]) return;
        vistos[chave] = true;
        lista.push({nome: nome, equipeKey: equipeMatch.key, categoria: categoria});
      });
    });
    return lista;
  }
  // Nunca rejeita a promise — sem a aba PROFISSIONAIS (ou com erro na
  // busca), profissionaisRoster fica como estava (ou vazio, na primeira
  // vez) e calcularPerformanceProfissionais cai no comportamento antigo
  // (lista derivada da aba Atendimentos — ver mais abaixo).
  function fetchProfissionaisSafe(){
    return fetchSheetCsv(PROFISSIONAIS_SHEET_NAME)
      .then(function(csvText){ profissionaisRoster = parseProfissionaisCsv(csvText); })
      .catch(function(){ /* mantém profissionaisRoster como estava */ });
  }

  // Aplica (in-place) o override oficial em `data` (o objeto retornado por
  // calcularIndicadoresDoPeriodo) pro mês/ano informados, considerando as
  // equipes atualmente selecionadas (currentEquipes). Só substitui M1 (ou
  // M2) quando TODAS as equipes selecionadas têm dado oficial pra aquele
  // indicador/mês — com 2 equipes marcadas, soma numerador e denominador
  // de ambas e recalcula a pontuação (mesma fórmula do painel: M1 =
  // numerador/denominador; M2 = numerador/denominador×100). Sem dado
  // oficial completo, o valor calculado pelo painel é mantido como está.
  function aplicarOverrideOficial(data, ano, mesIdx){
    // Guarda o valor CALCULADO pelo painel antes de qualquer substituição
    // — usado só pelo relatório de divergência (ver gerarPdfDivergenciaOficial),
    // pra poder comparar lado a lado com o valor oficial mesmo depois que
    // `data` já foi sobrescrito abaixo.
    data.numeradorM1Calculado = data.numeradorM1;
    data.denominadorM1Calculado = data.denominadorM1;
    data.m1Calculado = data.m1;
    data.numeradorM2Calculado = data.numeradorM2;
    data.denominadorM2Calculado = data.denominadorM2;
    data.m2Calculado = data.m2;
    ['M1','M2'].forEach(function(indicador){
      var entradas = currentEquipes.map(function(eq){
        return officialOverrides[officialOverrideKey(eq.key, ano, mesIdx, indicador)];
      });
      if(!entradas.length || entradas.some(function(e){ return !e; })) return;
      var numerador = entradas.reduce(function(a,e){ return a+e.numerador; }, 0);
      var denominador = entradas.reduce(function(a,e){ return a+e.denominador; }, 0);
      if(indicador === 'M1'){
        var m1 = denominador ? (numerador/denominador) : null;
        data.numeradorM1 = numerador;
        data.denominadorM1 = denominador;
        data.m1 = m1;
        data.classificacaoM1 = classificarM1(m1);
        data.m1Oficial = true;
      } else {
        var m2 = denominador ? (numerador/denominador*100) : null;
        data.numeradorM2 = numerador;
        data.denominadorM2 = denominador;
        data.m2 = m2;
        data.classificacaoM2 = classificarM2(m2);
        data.m2Oficial = true;
      }
    });
    // Recalcula a síntese (pontos/nota/desempenho) com as classificações
    // já atualizadas acima — idêntico ao cálculo original quando não há
    // override (não altera nada nesse caso, só reexecuta a mesma fórmula).
    var pontosM1 = PONTOS_POR_CLASSE[data.classificacaoM1];
    var pontosM2 = PONTOS_POR_CLASSE[data.classificacaoM2];
    var pontosM1Pesados = pontosM1!==undefined ? pontosM1*6 : null;
    var pontosM2Pesados = pontosM2!==undefined ? pontosM2*4 : null;
    data.pontosM1 = pontosM1Pesados;
    data.pontosM2 = pontosM2Pesados;
    data.notaFinal = (pontosM1Pesados!=null && pontosM2Pesados!=null) ? (pontosM1Pesados+pontosM2Pesados) : null;
    data.desempenho = classificarDesempenho(data.notaFinal);
    return data;
  }
  // Wrapper usado em todo lugar que hoje calcula o resultado "com janela
  // móvel" de um mês de referência (calcularIndicadoresDoPeriodo +
  // calcularJanelaPeriodo) — aplica o override oficial (quando existir)
  // logo em seguida, então o restante do painel (gauge, cards, médias,
  // gráfico de Tendência) nem precisa saber se o valor veio calculado ou
  // da aba oficial.
  function calcularJanelaComOverride(wb, refMonth){
    var res = calcularIndicadoresDoPeriodo(wb, calcularJanelaPeriodo(refMonth));
    aplicarOverrideOficial(res.data, refMonth.getFullYear(), refMonth.getMonth());
    return res;
  }

  function filtrarLinhasPorEquipe(matrix, equipes){
    if(!matrix || !matrix.length) return matrix || [];
    var header = matrix[0];
    var idx = equipeColIndex(header);
    if(idx < 0) return matrix; // aba sem coluna de equipe: não filtra
    var keywords = equipes.map(function(eq){ return normalizeText(eq.matchKeyword || eq.suffix); });
    var linhas = matrix.slice(1).filter(function(r){
      var valor = normalizeText(r[idx]);
      return keywords.some(function(kw){ return valor.indexOf(kw) !== -1; });
    });
    return [header].concat(linhas);
  }

  // Parser de CSV manual (RFC4180: respeita campos entre aspas, vírgulas e
  // quebras de linha dentro de campos). Usado em vez do XLSX.read(string)
  // porque a leitura automática de string do SheetJS não separava as
  // linhas corretamente para o CSV retornado pelo endpoint gviz.
  function parseCsv(text){
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for(var i=0; i<text.length; i++){
      var c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else {
        if(c === '"'){ inQuotes = true; }
        else if(c === ','){ row.push(field); field=''; }
        else if(c === '\r'){ /* ignora, quebra tratada no \n */ }
        else if(c === '\n'){ row.push(field); field=''; rows.push(row); row=[]; }
        else { field += c; }
      }
    }
    if(field.length || row.length){ row.push(field); rows.push(row); }
    return rows;
  }

  // Datas nas abas brutas vêm como texto dd/mm/aaaa (é assim que o script
  // de extração grava). Também aceita aaaa-mm-dd como reforço, caso a
  // célula tenha sido digitada nesse formato.
  function parseBRDate(raw){
    var s = String(raw||"").trim();
    if(!s) return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(m) return new Date(+m[3], +m[2]-1, +m[1]);
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m) return new Date(+m[1], +m[2]-1, +m[3]);
    return null;
  }
  function fmtBRDate(d){
    if(!d) return "—";
    return String(d.getDate()).padStart(2,'0') + "/" + String(d.getMonth()+1).padStart(2,'0') + "/" + d.getFullYear();
  }
  function withinPeriod(dateVal, inicio, fim){
    return dateVal && dateVal >= inicio && dateVal <= fim;
  }
  function colIndex(headerRow, name){
    var aliases = {
      data_hora: ['data_hora','data','date'],
      equipe_unidade: ['equipe_unidade','equipe - unidade','equipe  - unidade','equipe/unidade'],
      qtd_atendimentos: ['qtd_atendimentos','qtd de atendimentos','quantidade de atendimentos','atendimentos'],
      // Variações de nome pra coluna de tipo da Atividade Coletiva.
      tipo_atividade: ['tipo_atividade','tipo de atividade','tipo','tipo_da_atividade'],
      // Variações comuns pra "quantidade total de profissionais" e
      // "quantidade de profissionais envolvidos" na aba Resumo Atividade
      // Coletiva — sem isso, se o cabeçalho real da planilha vier escrito
      // diferente do esperado, nenhuma das duas colunas é encontrada e o
      // painel nunca consegue contar nenhuma atividade como compartilhada
      // (ver comentário em cima do cálculo de atividadesCompartilhadasListas).
      // ID da atividade (chave que liga "Resumo Atividade Coletiva" a
      // "Participantes Ativ. Coletiva") e total de profissionais da eMulti
      // vindo de Participantes.
      id_atividade: ['id_atividade','id atividade','id da atividade','codigo_atividade','codigo da atividade','cod_atividade','cod atividade','id_ativ','id','codigo'],
      responsavel: ['responsavel','responsavel atividade','responsavel da atividade'],
      total_prof_emulti: ['total de profissionails da emulti','total profissionails emulti','total_prof_emulti','total de profissionais da emulti','total de profissionais emulti','total profissionais emulti','qtd_profissionais_emulti','qtd total de profissionais da emulti','quantidade de profissionais da emulti'],
      qtd_total_profissionais: ['qtd_total_profissionais','quantidade total de profissionais','total de profissionais','qtd_de_profissionais','qtd total de profissionais'],
      qtd_profissionais_envolvidos: ['qtd_profissionais_envolvidos','profissionais_envolvidos','quantidade de profissionais envolvidos','nº de profissionais envolvidos','numero de profissionais envolvidos','profissionais envolvidos'],
      // Variação de nome pra coluna de participantes da aba Resumo Reuniões.
      qtd_participantes: ['qtd_participantes','quantidade de participantes','participantes','qtd de participantes'],
      // Coluna "Temas da reunião" da aba Resumo Reuniões (pode trazer mais de um tema na mesma célula).
      temas_reuniao: ['temas_reuniao','temas da reuniao','temas_da_reuniao','temas','tema','tema_reuniao','tema da reuniao'],
      // Coluna "Tipo" da reunião na aba Resumo Reuniões (códigos 01-03:
      // Reunião de Equipe, Reunião com outras equipes de saúde, Reunião
      // intersetorial/Conselho local de saúde/Controle social).
      tipo_reuniao: ['tipo_reuniao','tipo de reuniao','tipo_da_reuniao','tipo']
    };
    var wanted = String(name||'').trim().toLowerCase();
    var candidates = aliases[wanted] || [wanted];
    function key(v){ return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[ºª]/g,'').replace(/[-\s]+/g,'_'); }
    for(var i=0;i<headerRow.length;i++){
      var actual = key(headerRow[i]);
      for(var j=0;j<candidates.length;j++){
        if(actual === key(candidates[j])) return i;
      }
    }
    return -1;
  }
  // Coluna do profissional "Responsável" na aba "Participantes Ativ.
  // Coletiva": SEMPRE a 4ª coluna (índice 3) da tabela — é onde esse
  // profissional fica registrado nessa aba (junto com Profissional 1 a
  // 5, na mesma linha). Não busca mais por nome de cabeçalho: a tentativa
  // anterior de achar por nome ("responsavel"/"Responsável"/"Responsavel
  // Atividade") não batia com o cabeçalho real da planilha e, pior,
  // podia achar por engano outra coluna antes de chegar no fallback
  // posicional — por isso a posição fixa é a fonte principal agora, com
  // busca por nome só como reforço se a tabela tiver 4 colunas ou menos
  // (não deveria acontecer nesta aba).
  function colRespParticipantes(headerRow){
    if(headerRow && headerRow.length > 3) return 3;
    return colIndex(headerRow, "responsavel");
  }
  function toInt(v){
    var n = parseInt(String(v===undefined||v===null?"":v).trim(), 10);
    return isNaN(n) ? 0 : n;
  }
  // Normaliza texto pra comparar tipo_atividade sem depender de acento,
  // maiúscula/minúscula ou espaço/barra diferente ("Avaliação/Procedimento
  // coletivo" vs "Avaliação / Procedimento Coletivo" etc.).
  function normalizarTexto(v){
    return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/\s+/g," ").replace(/\s*\/\s*/g,"/").trim();
  }

  var PONTOS_POR_CLASSE = {"Regular":0.25, "Suficiente":0.5, "Bom":0.75, "Ótimo":1};
  // Mesmas cores dos "pills" de classificação (ver :root), usadas pra
  // colorir a linha/rótulo de média de cada quadrimestre no gráfico de
  // Tendência conforme a faixa em que a média cai.
  var CLASS_COLOR = {"Regular":"#B5474B", "Suficiente":"#C68A3D", "Bom":"#6B8F71", "Ótimo":"#2F6F5E"};

  function classificarM1(v){
    if(v===null) return "—";
    if(v>3) return "Ótimo";
    if(v>2) return "Bom";
    if(v>1) return "Suficiente";
    return "Regular";
  }
  function classificarM2(v){
    if(v===null) return "—";
    if(v>5) return "Ótimo";
    if(v>2.5) return "Bom";
    if(v>1) return "Suficiente";
    return "Regular";
  }
  function classificarDesempenho(nota){
    if(nota===null) return "—";
    if(nota>7.5) return "Ótimo";
    if(nota>=5) return "Bom";
    if(nota>2.5) return "Suficiente";
    return "Regular";
  }

  var NOTAS_METODOLOGICAS = [
    "Cálculo feito pelo próprio painel, direto dos dados brutos extraídos do e-SUS PEC (Atendimentos + Registro Tardio + Atividade Coletiva + Reuniões) para esta equipe/EMULTI, seguindo as fórmulas das Notas Metodológicas M1 (NT 43/2026-CGIAD/DEAPS/SAPS/MS) e M2 (NT 44/2026-CGIAD/DEAPS/SAPS/MS), na janela dos últimos 4 meses (ver 'Período' no topo da página) — não um quadrimestre fixo do calendário.",
    "M1 usa NOME da pessoa (a nota oficial usa CPF/CNS) — pessoas diferentes com o mesmo nome seriam contadas como se fossem uma só.",
    "Atendimento individual (M1) só conta quando o profissional responsável (coluna 'profissional' da aba Atendimentos) está cadastrado na aba PROFISSIONAIS como sendo da eMulti — atendimentos de profissionais de fora da eMulti não entram no numerador.",
    "Participação coletiva (M1) só conta quando pelo menos um dos profissionais da atividade (coluna do Responsável — identificada pelo nome do cabeçalho ou, se não encontrada por nome, pela 4ª coluna da tabela — ou 'Profissional 1' a 'Profissional 5' da aba Participantes Ativ. Coletiva) está cadastrado na aba PROFISSIONAIS como sendo da eMulti — participações conduzidas só por profissionais de fora da eMulti não entram no numerador.",
    "M2 oficial soma 3 componentes: atendimentos individuais compartilhados, atividades coletivas compartilhadas e compartilhamento de cuidado (PEC). Esta extração só consegue aproximar as parcelas de 'atividades coletivas' e 'reuniões'. Regra de ação compartilhada aplicada: pelo menos 1 profissional identificado (CNS/CPF) da eMulti — seja como responsável ou como profissional envolvido, não precisa ser especificamente o responsável — e 2 ou mais profissionais distintos no total; compartilhamentos com eSB ou com qualquer profissional da APS contam igual, desde que identificados. Ainda não é possível checar CBO/CNS propriamente ditos (só o cadastro da aba PROFISSIONAIS), nem aplicar a regra de descartar ação específica duplicada quando a mesma pessoa/grupo também teve ação compartilhada registrada no mesmo dia.",
    "Atendimentos individuais compartilhados e compartilhamento de cuidado (PEC) NÃO entram no numerador do M2 aqui (a Lista de Atendimentos do e-SUS não indica se um atendimento individual teve mais de um profissional; e não há aba equivalente pra solicitações de compartilhamento de cuidado no PEC) — por isso o M2 calculado aqui tende a ficar ABAIXO do valor oficial do indicador. O denominador do M2 é o TOTAL de ações da eMulti no período: atendimentos individuais + atividades coletivas (todas, específicas e compartilhadas, incluindo reuniões) — sem contar solicitações de compartilhamento de cuidado no PEC, pelo mesmo motivo.",
    "Atividade Coletiva só conta como 'compartilhada' aqui quando tem pelo menos 1 profissional da eMulti (coluna 'Total de Profissionais da EMulti', de Participantes Ativ. Coletiva) e 2 ou mais profissionais no total ('Qtd total de profissionais') — sem restrição de tipo de atividade (todos os tipos contam).",
    "Reuniões (Resumo Reuniões) só contam pra M2 quando o 'Tipo' é Reunião de Equipe, Reunião com outras equipes de saúde ou Reunião intersetorial/Conselho local de saúde/Controle social (códigos 01-03) E têm 2+ participantes E o tema 'Discussão de caso / Projeto terapêutico singular' marcado na coluna 'Temas da reunião' (a célula pode ter vários temas). Reuniões que não batem essas condições aparecem no total de reuniões, mas não entram como 'compartilhadas'.",
    "'Desempenho quadrimestral' usa a fórmula oficial da Nota Final do Componente III (Qualidade) para eMulti — NT 8/2026-DEAPS/SAPS/MS, Quadro 4: Nota final = pontos M1 × 6 + pontos M2 × 4 (pontos por classificação: Regular=0,25, Suficiente=0,5, Bom=0,75, Ótimo=1), classificada conforme o Quadro 6 da mesma nota: Regular ≤ 2,5, Suficiente > 2,5 e < 5, Bom ≥ 5 e ≤ 7,5, Ótimo > 7,5. O que NÃO é oficial aqui é o DADO de entrada: o M1 e o M2 usados nessa conta são os calculados por este painel a partir dos dados brutos (ver notas acima), não os valores publicados pelo Siaps — por isso o resultado exibido é uma aproximação do Componente III oficial, não o valor de cofinanciamento em si.",
    "Abandono consumado: o paciente precisa ter pelo menos 2 consultas. O painel calcula a mediana histórica do intervalo entre a 1ª e a 2ª consulta dos pacientes analisados e mede os dias desde a última consulta de cada paciente. Quando esse intervalo é maior que 3 vezes a mediana histórica, o paciente é classificado como abandono consumado.",
    "Classificação do acompanhamento: Em dia = dias desde a última consulta ≤ mediana; Em risco = dias desde a última consulta > mediana e ≤ 3 × mediana; Abandono consumado = dias desde a última consulta > 3 × mediana. O painel não usa um número fixo de dias: o limite é calculado dinamicamente com base no comportamento histórico dos pacientes incluídos nos filtros da aba Análises.",
    "Na aba Análises, a classificação considera o histórico inteiro ou os quadrimestres selecionados na própria aba Análises, e não necessariamente o filtro global de período.",
    "Filtro 'Fluxo' (tabela Pessoas Atendidas): calculado sobre o histórico COMPLETO de cada pessoa (Atendimentos + Participantes Ativ. Coletiva, ignorando o filtro de Mês próprio dessa tabela), na janela móvel dos últimos 4 meses terminando no último dia do mês ATUAL real (não no mês filtrado no topo da página). 'Entrada' = o primeiro atendimento/participação de todo o histórico da pessoa caiu dentro dessa janela. 'Saída' = a pessoa não tem nenhum atendimento/participação dentro dessa janela (mesmo tendo histórico anterior). Quem já vinha de antes da janela e também tem evento dentro dela (segue ativa) fica sem rótulo nessa coluna."
  ];

  // ---------- "Total de Profissionais da EMulti" (coluna virtual) ----------
  // Coluna calculada aqui (não existe na planilha de origem de "Participantes
  // Ativ. Coletiva"): nº de profissionais DISTINTOS da eMulti (cadastrados na
  // aba PROFISSIONAIS) entre "Responsavel Atividade" + "Profissional 1..5" da
  // linha. Se a planilha um dia trouxer uma coluna real com esse nome, ela
  // tem prioridade. É a mesma fonte usada no M2 e nas listas exibidas (aba
  // Participantes Ativ. Coletiva e Resumo Atividade Coletiva).
  var TOTAL_PROF_EMULTI_HEADER = "Total de Profissionais da EMulti";
  // Acha a coluna "Total de Profissionais da EMulti" mesmo com variações de
  // grafia (a planilha tem "Profissionails" com erro de digitação): primeiro
  // pelos apelidos conhecidos, depois por um cabeçalho que contenha
  // "total" + "profission" + "emulti".
  function colTotalProfEmulti(headerRow){
    var i = colIndex(headerRow, "total_prof_emulti");
    if(i >= 0) return i;
    for(var j=0;j<headerRow.length;j++){
      var h = normalizeText(headerRow[j]);
      if(h.indexOf("TOTAL") !== -1 && h.indexOf("PROFISSION") !== -1 && h.indexOf("EMULTI") !== -1) return j;
    }
    return -1;
  }
  function criarCalculadoraTotalProfEmulti(partHeader){
    var iReal = colTotalProfEmulti(partHeader);
    var profCols = [colRespParticipantes(partHeader)].concat(
        ["profissional 1","profissional 2","profissional 3","profissional 4","profissional 5"]
          .map(function(n){ return colIndex(partHeader, n); })
      )
      .filter(function(i){ return i >= 0; });
    var podeVirtual = profissionaisRoster.length > 0 && profCols.length > 0;
    return {
      disponivel: iReal >= 0 || podeVirtual,
      calcular: function(r){
        if(iReal >= 0 && String(r[iReal]===undefined||r[iReal]===null?"":r[iReal]).trim() !== "") return toInt(r[iReal]);
        var vistos = {}, n = 0;
        for(var i=0;i<profCols.length;i++){
          var nomeP = r[profCols[i]];
          if(!nomeP || !nomeEhDaEmulti(nomeP)) continue;
          var k = normalizeText(nomeP);
          if(vistos[k]) continue;
          vistos[k] = true; n++;
        }
        return n;
      }
    };
  }
  // Liga cada linha de "Resumo Atividade Coletiva" às linhas de
  // "Participantes Ativ. Coletiva". Se as duas abas têm coluna de ID da
  // atividade, liga por ID; senão, pela combinação data + equipe +
  // responsável (+ tipo de atividade, quando as duas abas têm). Devolve
  // {total(linhaDoResumo) -> número | undefined, modo} ou null.
  function criarLigacaoAtividades(partRows, racHeader){
    if(!partRows || !partRows.length) return null;
    var partHeader = partRows[0];
    var calc = criarCalculadoraTotalProfEmulti(partHeader);
    if(!calc.disponivel) return null;
    function eqKey(v){
      var t = normalizeText(v);
      for(var i=0;i<EQUIPES.length;i++){ if(t.indexOf(EQUIPES[i].matchKeyword) !== -1) return EQUIPES[i].key; }
      return t.trim();
    }
    function dataKey(v){
      var d = parseBRDate(v);
      return d ? (d.getFullYear()+"-"+d.getMonth()+"-"+d.getDate()) : String(v||"").trim();
    }
    var idP = colIndex(partHeader, "id_atividade"), idR = colIndex(racHeader, "id_atividade");
    function limpa(v){ return normalizeText(v).replace(/\s+/g," ").trim(); }
    // Cada "nível" é uma forma de ligar Resumo -> Participantes, da mais
    // precisa pra mais frouxa. O primeiro nível que achar a atividade vence.
    var niveis = [];
    if(idP >= 0 && idR >= 0){
      niveis.push({nome:"id",
        kp:function(r){ return String(r[idP]||"").trim(); },
        kr:function(r){ return String(r[idR]||"").trim(); }});
    }
    var dP = colIndex(partHeader,"data"), dR = colIndex(racHeader,"data");
    var eP = colIndex(partHeader,"equipe_unidade"); if(eP<0) eP = equipeColIndex(partHeader);
    var eR = colIndex(racHeader,"equipe_unidade"); if(eR<0) eR = equipeColIndex(racHeader);
    var rP = colIndex(partHeader,"responsavel"), rR = colIndex(racHeader,"responsavel");
    var tP = colIndex(partHeader,"tipo_atividade"), tR = colIndex(racHeader,"tipo_atividade");
    if(dP>=0 && dR>=0 && rP>=0 && rR>=0){
      if(eP>=0 && eR>=0 && tP>=0 && tR>=0){
        niveis.push({nome:"data+equipe+responsavel+tipo",
          kp:function(r){ return [dataKey(r[dP]), eqKey(r[eP]), limpa(r[rP]), limpa(r[tP])].join("|"); },
          kr:function(r){ return [dataKey(r[dR]), eqKey(r[eR]), limpa(r[rR]), limpa(r[tR])].join("|"); }});
      }
      if(eP>=0 && eR>=0){
        niveis.push({nome:"data+equipe+responsavel",
          kp:function(r){ return [dataKey(r[dP]), eqKey(r[eP]), limpa(r[rP])].join("|"); },
          kr:function(r){ return [dataKey(r[dR]), eqKey(r[eR]), limpa(r[rR])].join("|"); }});
      }
      niveis.push({nome:"data+responsavel",
        kp:function(r){ return [dataKey(r[dP]), limpa(r[rP])].join("|"); },
        kr:function(r){ return [dataKey(r[dR]), limpa(r[rR])].join("|"); }});
    }
    if(!niveis.length) return null;
    niveis.forEach(function(nv){
      nv.mapa = {};
      partRows.slice(1).forEach(function(r){
        var k = nv.kp(r);
        if(!k || /^\|+$/.test(k)) return;
        var v = calc.calcular(r);
        if(!nv.mapa.hasOwnProperty(k) || v > nv.mapa[k]) nv.mapa[k] = v;
      });
    });
    return {
      modo: niveis.map(function(n){ return n.nome; }).join(" > "),
      total: function(racRow){
        for(var i=0;i<niveis.length;i++){
          var k = niveis[i].kr(racRow);
          if(k && niveis[i].mapa.hasOwnProperty(k)) return niveis[i].mapa[k];
        }
        return undefined;
      }
    };
  }

  // Motor de cálculo: recebe o "workbook" (abas já em formato de matriz de
  // linhas) e o período {inicio, fim} (objetos Date) e calcula M1, M2 e o
  // Desempenho quadrimestral direto dos dados brutos — replica a lógica do
  // extrair_esus_unificado.py (_calcular_indicadores_m1_m2), mas já
  // filtrando pela janela móvel de 4 meses.
  function calcularIndicadoresDoPeriodo(wb, periodo){
    function rowsOf(baseName){
      var ws = wb.Sheets[suffixedName(baseName)];
      return ws ? sheetToRows(ws) : [];
    }

    // nomeEhDaEmulti (checa se o nome está na aba PROFISSIONAIS) é uma
    // função global agora — ver declaração perto de profissionaisRoster —
    // usada aqui pro filtro de "Atendimentos individuais" e de
    // "Participações coletivas" (M1) logo abaixo, e também em
    // pessoasAtendidasParaMeses pra ordenar a coluna "Profissional".

    // ---------- Atendimentos ----------
    var atRows = rowsOf("Atendimentos");
    var atHeader = atRows[0] || [];
    var iData = colIndex(atHeader, "data_hora");
    var iNome = colIndex(atHeader, "nome");
    // Coluna do profissional que realizou o atendimento — usada pra só
    // contar como "Atendimento individual" (M1) quando esse profissional
    // está cadastrado na aba PROFISSIONAIS como sendo da eMulti. Mesma
    // regra de segurança do filtro de Participações coletivas abaixo: se
    // o roster ainda não carregou (vazio) ou a coluna "profissional" não
    // foi encontrada, o filtro fica DESLIGADO (conta tudo, comportamento
    // antigo) em vez de zerar o M1 silenciosamente.
    var iAtProf = colIndex(atHeader, "profissional");
    var filtroProfEmultiAtendAtivo = profissionaisRoster.length > 0 && iAtProf >= 0;
    if(!filtroProfEmultiAtendAtivo){
      console.warn('[Atendimentos] filtro de profissional eMulti desativado (roster PROFISSIONAIS vazio ou coluna "profissional" não encontrada no cabeçalho) — contando todos os atendimentos do período, sem checar profissional. cabeçalho real:', atHeader,
        '| iAtProf='+iAtProf, '| profissionaisRoster.length='+profissionaisRoster.length);
    }
    var atFiltradas = atRows.slice(1).filter(function(r){
      var nome = String(r[iNome]||"").trim();
      if(!nome || !withinPeriod(parseBRDate(r[iData]), periodo.inicio, periodo.fim)) return false;
      if(filtroProfEmultiAtendAtivo && !nomeEhDaEmulti(r[iAtProf])) return false;
      return true;
    });
    var atendimentosIndividuais = atFiltradas.length;

    // ---------- Participantes Ativ. Coletiva ----------
    var partRows = rowsOf("Participantes Ativ. Coletiva");
    var partHeader = partRows[0] || [];
    var iPData = colIndex(partHeader, "data");
    var iPNome = colIndex(partHeader, "participante");
    // Colunas de profissional da atividade (Responsavel Atividade +
    // Profissional 1 a 5) — usadas pra só contar a "Participação
    // coletiva" (M1) quando pelo menos um desses profissionais está
    // cadastrado na aba PROFISSIONAIS como sendo da eMulti. Sem isso, o
    // numerador do M1 contaria participações coletivas conduzidas só por
    // profissionais de fora da eMulti (outros programas/equipes).
    var iPResp = colRespParticipantes(partHeader);
    var iPProf1 = colIndex(partHeader, "profissional 1");
    var iPProf2 = colIndex(partHeader, "profissional 2");
    var iPProf3 = colIndex(partHeader, "profissional 3");
    var iPProf4 = colIndex(partHeader, "profissional 4");
    var iPProf5 = colIndex(partHeader, "profissional 5");
    var iPProfCols = [iPResp, iPProf1, iPProf2, iPProf3, iPProf4, iPProf5].filter(function(i){ return i>=0; });
    // Se o roster ainda não carregou (vazio) ou nenhuma das colunas de
    // profissional foi encontrada no cabeçalho real da aba, o filtro fica
    // DESLIGADO (conta todas as participações, comportamento antigo) em
    // vez de zerar tudo silenciosamente — avisa no console pra facilitar
    // diagnóstico.
    var filtroProfEmultiAtivo = profissionaisRoster.length > 0 && iPProfCols.length > 0;
    if(!filtroProfEmultiAtivo){
      console.warn('[Participantes Ativ. Coletiva] filtro de profissional eMulti desativado (roster PROFISSIONAIS vazio ou colunas "Responsavel Atividade"/"Profissional 1..5" não encontradas no cabeçalho) — contando todas as participações coletivas do período, sem checar profissional. cabeçalho real:', partHeader,
        '| iPProfCols='+JSON.stringify(iPProfCols), '| profissionaisRoster.length='+profissionaisRoster.length);
    }
    function linhaTemProfissionalEmulti(r){
      for(var i=0;i<iPProfCols.length;i++){
        if(nomeEhDaEmulti(r[iPProfCols[i]])) return true;
      }
      return false;
    }
    var partFiltradas = partRows.slice(1).filter(function(r){
      var nome = String(r[iPNome]||"").trim();
      if(!nome || nome.indexOf("(sem lista nominal") === 0) return false;
      if(!withinPeriod(parseBRDate(r[iPData]), periodo.inicio, periodo.fim)) return false;
      if(filtroProfEmultiAtivo && !linhaTemProfissionalEmulti(r)) return false;
      return true;
    });
    var participacoesColetivas = partFiltradas.length;

    // ---------- M1: numerador/denominador ----------
    var numeradorM1 = atendimentosIndividuais + participacoesColetivas;
    var pessoasSet = {}; // nome em maiúsculas -> {at, part}
    atFiltradas.forEach(function(r){
      var chave = String(r[iNome]).trim().toUpperCase();
      if(!pessoasSet[chave]) pessoasSet[chave] = {nome:String(r[iNome]).trim(), at:0, part:0};
      pessoasSet[chave].at++;
    });
    partFiltradas.forEach(function(r){
      var chave = String(r[iPNome]).trim().toUpperCase();
      if(!pessoasSet[chave]) pessoasSet[chave] = {nome:String(r[iPNome]).trim(), at:0, part:0};
      pessoasSet[chave].part++;
    });
    var pessoasLista = Object.keys(pessoasSet).map(function(k){ return pessoasSet[k]; })
      .sort(function(a,b){ return a.nome.localeCompare(b.nome,'pt-BR'); });
    var denominadorM1 = pessoasLista.length;
    var m1 = denominadorM1 ? (numeradorM1/denominadorM1) : null;
    var classificacaoM1 = classificarM1(m1);

    // ---------- Resumo Atividade Coletiva ----------
    var racRows = rowsOf("Resumo Atividade Coletiva");
    var racHeader = racRows[0] || [];
    var iRacData = colIndex(racHeader, "data");
    var iRacTipo = colIndex(racHeader, "tipo_atividade");
    var iRacTotalProf = colIndex(racHeader, "qtd_total_profissionais");
    var iRacProfEnv = colIndex(racHeader, "qtd_profissionais_envolvidos");
    // Nenhum tipo de atividade é excluído aqui — qualquer atividade desta
    // aba (junto com Participantes Ativ. Coletiva) conta como "Atividade
    // Coletiva Compartilhada" pra M2, desde que bata os critérios de
    // profissionais abaixo. A restrição de tipo só se aplica a reuniões
    // (aba Resumo Reuniões — ver TIPOS_REUNIAO_COMPARTILHADA mais abaixo).
    var racFiltradas = racRows.slice(1).filter(function(r){
      return withinPeriod(parseBRDate(r[iRacData]), periodo.inicio, periodo.fim);
    });
    // "Total de Profissionais da EMulti": passa a vir da aba Participantes
    // Ativ. Coletiva, ligada ao Resumo por ID da atividade (ou, sem ID, por
    // data + equipe + responsável + tipo) — ver criarLigacaoAtividades.
    var ligacaoAtiv = criarLigacaoAtividades(partRows, racHeader);
    if(!ligacaoAtiv){
      console.warn('[Participantes Ativ. Coletiva] não foi possível ligar "Total de Profissionais da EMulti" ao Resumo Atividade Coletiva — usando a coluna da própria aba Resumo. cabeçalho Resumo:', racHeader, '| cabeçalho Participantes:', partHeader);
    }
    // Se NENHUMA das duas colunas de profissionais for encontrada, o
    // painel não tem como saber quantos profissionais participaram de
    // cada atividade — "totalProf" abaixo sempre vira 1 e NENHUMA
    // atividade jamais é contada como compartilhada (sintoma: "Ativ.
    // coletivas compartilhadas" sempre 0, em qualquer período/mês).
    // Avisa no console com o cabeçalho real da aba pra facilitar achar o
    // nome exato da coluna na planilha.
    if(iRacTotalProf < 0 && iRacProfEnv < 0){
      console.warn('[Resumo Atividade Coletiva] nenhuma coluna de profissionais encontrada — cabeçalho real da aba:', racHeader,
        '| esperado "qtd_total_profissionais" ou "qtd_profissionais_envolvidos" (ou variações próximas)',
        '| iRacTotalProf='+iRacTotalProf, 'iRacProfEnv='+iRacProfEnv);
    }
    // ---------- TOTAL RELATÓRIO AC (janela móvel já consolidada) ----------
    // A tabela TOTAL RELATÓRIO AC já traz, em cada linha mensal, o total
    // correspondente à janela móvel de 4 meses terminada naquele mês.
    // Portanto, não se deve somar as linhas que caem dentro do período.
    // Selecionamos apenas o mês âncora DESTE período e filtramos as
    // equipes escolhidas; o valor só substitui a contagem detalhada
    // quando for maior.
    // IMPORTANTE: o mês-âncora aqui é o do PERÍODO recebido por esta
    // chamada (periodo.fim) — não o anchorMonthDate() global da seleção
    // do painel. Os pontos que chamam esta função sempre passam um
    // período cujo fim já cai no mês certo pra essa chamada específica:
    // - calcularJanelaComOverride(wb, refMonth) → calcularJanelaPeriodo
    //   termina no último dia de refMonth;
    // - os loops de resultadosMensais/resultadosJanela e a série de
    //   Tendência (calcularSerieTendencia) chamam isso uma vez por mês,
    //   cada vez com o refMonth/periodo daquele mês específico.
    // Usar o anchorMonthDate() global aqui faria o mesmo valor da AC se
    // repetir em todos os meses de uma série (ex.: gráfico de Tendência),
    // em vez de trazer o dado mês a mês como pedido.
    var acRows = rowsOf("TOTAL RELATÓRIO AC");
    var acHeader = acRows[0] || [];
    var iAcEquipe = colIndex(acHeader, "equipe");
    var iAcTotal = colIndex(acHeader, "total_de_atividades_coletivas");
    var iAcMesAno = colIndex(acHeader, "mes/ano");
    if(iAcEquipe < 0){ iAcEquipe = equipeColIndex(acHeader); }
    if(iAcTotal < 0){ iAcTotal = colIndex(acHeader, "total de atividades coletivas"); }
    if(iAcMesAno < 0){ iAcMesAno = colIndex(acHeader, "mes_ano"); }
    // Se nenhuma das variações de nome bateu com o cabeçalho real da aba,
    // totalRelatorioAc fica sempre 0 silenciosamente (o "return" logo
    // abaixo, dentro do forEach) e o Math.max nunca vai escolher a AC —
    // sintoma idêntico ao "27 em vez de pelo menos 89". Deixa um aviso no
    // console só nesse caso, pra não precisar adivinhar às cegas.
    if(iAcTotal < 0 || iAcMesAno < 0){
      console.warn('[TOTAL RELATÓRIO AC] coluna não encontrada — cabeçalho real da aba:', acHeader,
        '| esperado "total_de_atividades_coletivas" e "mes/ano" (ou "mes_ano")',
        '| iAcTotal='+iAcTotal, 'iAcMesAno='+iAcMesAno);
    }
    var anchorAc = periodo.fim;
    var anchorAcAno = anchorAc.getFullYear();
    var anchorAcMes = anchorAc.getMonth();
    var equipesSelecionadasAc = {};
    currentEquipes.forEach(function(eq){ equipesSelecionadasAc[eq.key] = true; });
    var totalRelatorioAc = 0;
    acRows.slice(1).forEach(function(r){
      if(iAcTotal < 0 || iAcMesAno < 0) return;
      var mesAc = parseMesAbrevPt(r[iAcMesAno]);
      if(!mesAc || mesAc.ano !== anchorAcAno || mesAc.mesIdx !== anchorAcMes) return;
      var equipeAc = iAcEquipe >= 0 ? equipeKeyFromNomeOficial(r[iAcEquipe]) : null;
      if(Object.keys(equipesSelecionadasAc).length && !equipesSelecionadasAc[equipeAc]) return;
      totalRelatorioAc += toInt(r[iAcTotal]);
    });
    var atividadesTotaisListas = racFiltradas.length;
    var atividadesTotais = Math.max(atividadesTotaisListas, totalRelatorioAc);
    var atividadesTotaisFonte = totalRelatorioAc > atividadesTotaisListas
      ? "TOTAL RELATÓRIO AC" : "Resumo Atividade Coletiva";
    // Atividade coletiva COMPARTILHADA (numerador do M2): tem pelo menos 1
    // profissional da eMulti ("Total de Profissionais da EMulti" >= 1, vindo
    // de Participantes Ativ. Coletiva) E 2 ou mais profissionais no total
    // ("Qtd total de profissionais" do Resumo Atividade Coletiva). NÃO há
    // restrição de tipo de atividade aqui — qualquer tipo, vindo de "Resumo
    // Atividade Coletiva"/"Participantes Ativ. Coletiva", conta desde que
    // bata essas duas condições. A restrição de tipo só existe pra reuniões
    // (aba "Resumo Reuniões", ver TIPOS_REUNIAO_COMPARTILHADA abaixo).
    var atividadesCompartilhadasListas = racFiltradas.filter(function(r){
      var totalEmultiPart = ligacaoAtiv ? ligacaoAtiv.total(r) : undefined;
      var totalProfGeral = (iRacTotalProf>=0 && r[iRacTotalProf]!=="" && r[iRacTotalProf]!==undefined)
        ? toInt(r[iRacTotalProf])
        : 1+toInt(r[iRacProfEnv]);
      // Sem ligação com Participantes não dá pra checar a eMulti: não
      // zera a atividade por isso (mantém só a regra de 2+ profissionais).
      var temEmulti = (totalEmultiPart === undefined) ? true : totalEmultiPart >= 1;
      return temEmulti && totalProfGeral >= 2;
    }).length;
    // Mesma regra do "atividadesTotais" acima, mas aplicada ao componente
    // que de fato alimenta o numerador do M2 (numeradorM2 → card "M2 —
    // Ações Interprofissionais", o "X compartilhadas" do gauge). Sem isso,
    // o card continuava mostrando só a contagem da lista detalhada mesmo
    // quando a aba TOTAL RELATÓRIO AC trazia um total mensal maior.
    var atividadesCompartilhadas = Math.max(atividadesCompartilhadasListas, totalRelatorioAc);
    var atividadesCompartilhadasFonte = totalRelatorioAc > atividadesCompartilhadasListas
      ? "TOTAL RELATÓRIO AC" : "Resumo Atividade Coletiva";

    // ---------- Resumo Reuniões ----------
    var rrRows = rowsOf("Resumo Reuniões");
    var rrHeader = rrRows[0] || [];
    var iRrData = colIndex(rrHeader, "data");
    var iRrQtd = colIndex(rrHeader, "qtd_participantes");
    var rrFiltradas = rrRows.slice(1).filter(function(r){
      return withinPeriod(parseBRDate(r[iRrData]), periodo.inicio, periodo.fim);
    });
    var reunioesTotais = rrFiltradas.length;
    // Regra oficial do M2: a reunião só conta como ação compartilhada se
    // (a) o "Tipo" da reunião for um dos 3 aceitos — "Reunião de Equipe",
    // "Reunião com outras equipes de saúde" ou "Reunião intersetorial /
    // Conselho local de saúde / Controle social" (com ou sem "CDS" no
    // final, daí a comparação por "contém" abaixo, igual à de tipo de
    // atividade coletiva) —, (b) tiver "Discussão de caso / Projeto
    // terapêutico singular" entre os "Temas da reunião" (a célula pode
    // listar vários temas) E (c) 2+ participantes. Se a coluna de tipo ou
    // de temas não existir na aba, essa parte da regra não é aplicada
    // (não zera a reunião por isso) e avisa no console.
    var iRrTema = colIndex(rrHeader, "temas_reuniao");
    var iRrTipo = colIndex(rrHeader, "tipo_reuniao");
    if(iRrTema < 0 && rrRows.length){
      console.warn('[painel] Coluna "Temas da reunião" não encontrada na aba Resumo Reuniões — contando toda reunião com 2+ participantes.');
    }
    if(iRrTipo < 0 && rrRows.length){
      console.warn('[painel] Coluna "Tipo" da reunião não encontrada na aba Resumo Reuniões — não filtrando reunião por tipo (só por tema + participantes).');
    }
    var TIPOS_REUNIAO_COMPARTILHADA = [
      "reuniao de equipe",
      "reuniao com outras equipes de saude",
      "reuniao intersetorial/conselho local de saude/controle social"
    ];
    function reuniaoTipoOk(r){
      if(iRrTipo < 0) return true;
      var t = normalizarTexto(r[iRrTipo]);
      return TIPOS_REUNIAO_COMPARTILHADA.some(function(tp){ return t.indexOf(tp) >= 0; });
    }
    function reuniaoTemDiscussaoCaso(r){
      if(iRrTema < 0) return true;
      var t = normalizarTexto(r[iRrTema]);
      return t.indexOf('discussao de caso') >= 0 || t.indexOf('projeto terapeutico singular') >= 0;
    }
    var reunioesCompartilhadas = rrFiltradas.filter(function(r){
      return toInt(r[iRrQtd]) >= 2 && reuniaoTipoOk(r) && reuniaoTemDiscussaoCaso(r);
    }).length;


    // ---------- M2 ----------
    // Quando a parcela de "atividades coletivas compartilhadas" veio da
    // aba TOTAL RELATÓRIO AC, esse número já É o total fechado do
    // relatório oficial (não é só a contagem detalhada da aba "Resumo
    // Atividade Coletiva") — reuniões compartilhadas NÃO entram por cima
    // nesse caso, senão duplica. Só quando a parcela vem da contagem
    // detalhada (Lista) é que reunioesCompartilhadas (vinda de "Resumo
    // Reuniões", uma aba à parte) soma normalmente ao numerador.
    var numeradorM2 = atividadesCompartilhadasFonte === "TOTAL RELATÓRIO AC"
      ? atividadesCompartilhadas
      : atividadesCompartilhadas + reunioesCompartilhadas;
    // Denominador M2, conforme a NT 44/2026-CGIAD/DEAPS/SAPS/MS: TOTAL de
    // ações da eMulti no período — atendimentos individuais (específicos
    // + compartilhados), atividades coletivas (específicas +
    // compartilhadas, incluindo reuniões) e solicitações respondidas de
    // compartilhamento de cuidado no PEC. Usa os TOTAIS de cada aba
    // (atendimentosIndividuais, atividadesTotais, reunioesTotais), não o
    // numerador — o numerador é só a parcela COMPARTILHADA, que já está
    // contida dentro desses totais (não deve ser somada de novo aqui).
    // Compartilhamento de cuidado no PEC não é rastreável nesta extração
    // (não existe aba equivalente), então o denominador calculado aqui
    // tende a ficar um pouco ABAIXO do valor oficial, na mesma direção do
    // numerador (ver nota metodológica sobre atendimentos compartilhados
    // e PEC).
    var denominadorM2 = atendimentosIndividuais + atividadesTotais + reunioesTotais;
    var m2 = denominadorM2 ? (numeradorM2/denominadorM2*100) : null;
    var classificacaoM2 = classificarM2(m2);
    // Parcela de reuniões que de fato ENTROU no numerador (0 nos meses em
    // que a fonte foi TOTAL RELATÓRIO AC, ver acima) — usada só pelos
    // cards de "Composição do numerador" (stackbar), pra o segmento de
    // reuniões não aparecer nesses meses como se tivesse contribuído.
    var reunioesCompartilhadasContrib = numeradorM2 - atividadesCompartilhadas;

    // ---------- Desempenho quadrimestral (síntese própria) ----------
    var pontosM1 = PONTOS_POR_CLASSE[classificacaoM1];
    var pontosM2 = PONTOS_POR_CLASSE[classificacaoM2];
    var pontosM1Pesados = pontosM1!==undefined ? pontosM1*6 : null;
    var pontosM2Pesados = pontosM2!==undefined ? pontosM2*4 : null;
    var notaFinal = (pontosM1Pesados!==null && pontosM2Pesados!==null) ? (pontosM1Pesados+pontosM2Pesados) : null;
    var desempenho = classificarDesempenho(notaFinal);

    // ---------- "Pessoas atendidas" (lista dinâmica, só do período) ----------
    var pessoasAtendidasHeaders = ["Nome","Atendimentos","Participantes Ativ. Coletiva","Total"];
    var pessoasAtendidasRows = pessoasLista.map(function(p){
      return [p.nome, p.at, p.part, p.at+p.part];
    });

    return {
      equipe: currentEquipes.map(function(e){ return e.label; }).join(' + '),
      data: {
        atendimentosIndividuais: atendimentosIndividuais,
        participacoesColetivas: participacoesColetivas,
        numeradorM1: numeradorM1,
        denominadorM1: denominadorM1,
        m1: m1,
        classificacaoM1: classificacaoM1,
        atividadesTotais: atividadesTotais,
        atividadesTotaisListas: atividadesTotaisListas,
        totalRelatorioAc: totalRelatorioAc,
        atividadesTotaisFonte: atividadesTotaisFonte,
        atividadesCompartilhadas: atividadesCompartilhadas,
        atividadesCompartilhadasListas: atividadesCompartilhadasListas,
        atividadesCompartilhadasFonte: atividadesCompartilhadasFonte,
        reunioesTotais: reunioesTotais,
        reunioesCompartilhadas: reunioesCompartilhadas,
        reunioesCompartilhadasContrib: reunioesCompartilhadasContrib,
        denominadorM2: denominadorM2,
        numeradorM2: numeradorM2,
        m2: m2,
        classificacaoM2: classificacaoM2,
        pontosM1: pontosM1Pesados,
        pontosM2: pontosM2Pesados,
        notaFinal: notaFinal,
        desempenho: desempenho
      },
      notes: NOTAS_METODOLOGICAS,
      pessoasAtendidas: {headers: pessoasAtendidasHeaders, rows: pessoasAtendidasRows}
    };
  }

