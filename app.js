// ======================================================================
// app.js
// Arquivo consolidado a partir dos módulos de js/ (ver MODULOS.md).
// Cada seção "=== módulo: ... ===" corresponde a um arquivo original.
// ======================================================================

import { CLASS_BANDS_M1, CLASS_BANDS_M1_OV, CLASS_BANDS_M2, CLASS_BANDS_M2_OV, CLASS_BANDS_NOTA_OV, CLASS_PILL_HEX, EQUIPES, JANELA_MESES, LEGEND_M1, LEGEND_M2, OV_LEGEND_M1, OV_LEGEND_M2, OV_LEGEND_NOTA, STORAGE_AVAILABLE, STORAGE_KEY, TREND_MESES, anchorMonthDate, animateGauges, anoMs, calcularIndicadoresDoPeriodo, calcularJanelaComOverride, calcularJanelaPeriodo, calcularSerieTendencia, classificarDesempenho, classificarM1, classificarM2, colIndex, compCardHeaderHTML, createMultiSelect, criarLigacaoAtividades, escapeHtml, estadoApp, fetchAllSheets, fetchOfficialOverridesSafe, fetchProfissionaisSafe, filtrarLinhasPorEquipe, fmtBRDate, fmtDate, fmtDec, fmtInt, init_nucleo_config, init_nucleo_dados, init_nucleo_listas_estado, init_nucleo_periodos, init_nucleo_popovers, init_visual_gauge, init_visual_painel_kpi, isMesFuturo, labelQuadsSelecionados, m1ListNames, m2ListNames, mediaDeMeses, mesMs, mesesDosQuadsSelecionadosUniao, mesesElapsedDosQuadsSelecionadosUniao, monthOptionValue, monthShortLabel, normalizeText, parseBRDate, parseCsv, periodoMesUnico, pillHex, populateAnoQuadSelects, profissionaisRoster, quadCode, quadKeyOfDate, quadMs, refMonthLabel, sheetToRows, suffixedName, temaEhDiscussaoCasoPts, tipoEhReuniao, toInt, valoresUnicosOrdenados, withinPeriod } from './nucleo.js';
import { M1_META_THRESHOLDS, M2_META_THRESHOLDS, calcularAnalises, calcularMetasQuadrimestre, calcularPerformanceProfissionais, calcularQuadrimestreAnterior, init_abas_analises_calculo, init_abas_analises_render, init_abas_m1_m2, init_abas_profissionais, ipGaugeCardHTML, ipReadingHTML, metaQuadrimestreHTML, metaQuadrimestreMiniHTML, overviewCardHTML, populateSheetsCache, profListaAtual, renderAnalises, renderPerformanceProfissionais, setupPreliminarToggle, setupTrendInteractivity, sparkline, stackbar } from './abas.js';
import { gerarPdfDivergenciaOficial, init_listas_atividade_coletiva, renderListsSection } from './listas.js';

// ===== módulo: js/app/render.js =====
// ======================================================================
// app/render.js
// Abas (tabs), barra de filtros e renderDashboard
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Tabs ----------
var FILTER_BAR_TABS = {geral:true, m1:true, m2:true, tendencia:true, profissionais:true};

// ---------- Render ----------
export function renderDashboard(record, serieTendencia, performanceProfissionais, analisesData){
  serieTendencia = serieTendencia || [];
  // Ao reabrir uma leitura antiga do histórico (sem recalcular a partir
  // do cache bruto), a aba de Desempenho Profissional fica vazia — só é
  // recalculada quando vem de aplicarMesReferencia (ver chamadas abaixo).
  renderPerformanceProfissionais(performanceProfissionais || []);
  renderAnalises(analisesData || null);
  document.getElementById('statusState').style.display = 'none';
  populateAnoQuadSelects();
  document.getElementById('topEquipe').textContent = record.equipe || '—';
  document.getElementById('topPeriodo').textContent = record.periodo
    ? 'Período: ' + record.periodo.inicio + ' a ' + record.periodo.fim
    : '';
  document.getElementById('topUpdated').textContent = record.error
    ? 'Falha na última leitura'
    : '';

  if(record.error){
    document.getElementById('gaugeRow').innerHTML =
      '<div class="card" style="flex:1;"><p style="color:var(--pill-regular);margin:0;">Não encontramos os indicadores M1 e M2 nesta planilha. Confira se o link publicado é o correto.</p></div>';
    document.getElementById('compRow').innerHTML = '';
    return;
  }

  var d = record.data;
  // Legenda do gauge (a linha "X atendimentos ÷ Y pessoas" embaixo do
  // ponteiro) e os cards de Composição precisam bater com o valor do
  // m1/m2 mostrado — que é calculado com a janela móvel oficial. Quando
  // existir a versão "Janela" (média do quadrimestre / vários meses
  // selecionados), usa ela; num mês único o próprio d.numeradorM1/
  // d.denominadorM1 JÁ é a janela (ver aplicarMesReferencia), então cai
  // nele direto. Meta do quadrimestre usa essas MESMAS variáveis (num/
  // denM1Gauge, num/denM2Gauge), pra bater com o valor do ponteiro do
  // gauge em vez dos totais reais do quadrimestre.
  var numM1Gauge = d.numeradorM1Janela!=null ? d.numeradorM1Janela : d.numeradorM1;
  var denM1Gauge = d.denominadorM1Janela!=null ? d.denominadorM1Janela : d.denominadorM1;
  var numM2Gauge = d.numeradorM2Janela!=null ? d.numeradorM2Janela : d.numeradorM2;
  var denM2Gauge = d.denominadorM2Janela!=null ? d.denominadorM2Janela : d.denominadorM2;
  var atendIndGauge = d.atendimentosIndividuaisJanela!=null ? d.atendimentosIndividuaisJanela : d.atendimentosIndividuais;
  var atendEspGauge = d.atendimentosEspecificosJanela!=null ? d.atendimentosEspecificosJanela : d.atendimentosEspecificos;
  var atendCompGauge = d.atendimentosCompartilhadosJanela!=null ? d.atendimentosCompartilhadosJanela : d.atendimentosCompartilhados;
  var participColGauge = d.participacoesColetivasJanela!=null ? d.participacoesColetivasJanela : d.participacoesColetivas;
  // Contagem REAL de "Pessoas atendidas" (calculada a partir das listas,
  // ANTES do override oficial) — mesmo padrão de atendIndGauge/
  // participColGauge acima: o total do card (denM1Gauge, mais abaixo)
  // pode vir substituído pelo valor oficial da aba Q2-26, mas o segmento
  // da barra mostra o dado calculado de verdade, com o percentual em
  // relação ao total oficial.
  var denM1CalcGauge = d.denominadorM1CalculadoJanela!=null ? d.denominadorM1CalculadoJanela
    : (d.denominadorM1Calculado!=null ? d.denominadorM1Calculado : d.denominadorM1);
  var atividadesCompGauge = d.atividadesCompartilhadasJanela!=null ? d.atividadesCompartilhadasJanela : d.atividadesCompartilhadas;
  var atividadesTotaisGauge = d.atividadesTotaisJanela!=null ? d.atividadesTotaisJanela : d.atividadesTotais;
  // Usa a parcela que de fato entrou no numerador (0 nos meses em que a
  // fonte foi TOTAL RELATÓRIO AC) — não o total bruto de reuniões — pra
  // os segmentos do stackbar baterem com numM2Gauge (ver
  // reunioesCompartilhadasContrib em calcularIndicadoresDoPeriodo).
  var reunioesCompGauge = d.reunioesCompartilhadasContribJanela!=null ? d.reunioesCompartilhadasContribJanela
    : (d.reunioesCompartilhadasContrib!=null ? d.reunioesCompartilhadasContrib : d.reunioesCompartilhadas);
  var reunioesTotaisGauge = d.reunioesTotaisJanela!=null ? d.reunioesTotaisJanela : d.reunioesTotais;

  // Textos das definições oficiais (Nota Metodológica M1 = NT 43/2026 e
  // M2 = NT 44/2026-CGIAD/DEAPS/SAPS/MS), mostrados como tooltip em cada
  // parcela das composições abaixo — pedido explícito: deixar claro,
  // tanto no Numerador do M1 quanto no Denominador do M2, que
  // "Atendimentos individuais" é o mesmo número/definição nos dois
  // lugares (é a mesma contagem entrando nas duas fórmulas).
  var DEF_ATEND_IND = 'Atendimento individual (presencial, domiciliar ou remoto) registrado por profissional da eMulti com CNS/CPF identificado — Modelo de Informação de Atendimento Individual (MIAI). Mesma contagem usada no Numerador do M1 (NT 43/2026) e no Denominador do M2 (NT 44/2026), que soma TODOS os atendimentos e atividades da eMulti no período.';
  var DEF_PARTIC_COLETIVA = 'Participações em atividade coletiva (códigos 04 a 07: Educação em saúde, Atendimento em grupo, Avaliação/Procedimento coletivo, Mobilização social), específica ou compartilhada — cada pessoa participante conta 1 vez por atividade (Modelo de Informação de Atividade Coletiva - MIAC). Entra no Numerador do M1 (NT 43/2026) junto com os atendimentos individuais.';
  var DEF_AC_ESPECIFICA = 'Atividade coletiva (Resumo Atividade Coletiva) que NÃO teve 2+ profissionais com CNS diferentes (sendo ao menos 1 da eMulti) — ou que é uma reunião sem o tema "Discussão de caso/Projeto terapêutico singular" — entra no Denominador do M2 como ação específica, mas NÃO no Numerador (não é compartilhada).';
  var DEF_AC_COMPARTILHADA = 'Atividade coletiva realizada de forma simultânea por 2 ou mais profissionais (CNS diferentes), com pelo menos 1 da eMulti — conta como ação compartilhada no Numerador do M2 (NT 44/2026). Reuniões (de equipe, com outras equipes ou intersetorial) só contam se o tema for "Discussão de caso/Projeto terapêutico singular".';
  var DEF_REUNIAO_ESPECIFICA = 'Reunião (Resumo Reuniões) que não é dos tipos 01-03 (Reunião de equipe/outras equipes de saúde/intersetorial) com tema "Discussão de caso/Projeto terapêutico singular", ou não teve 2+ participantes, ou a planilha não traz o tema — entra no Denominador do M2, mas NÃO no Numerador.';
  var DEF_REUNIAO_COMPARTILHADA = 'Reunião de equipe, com outras equipes de saúde ou intersetorial (códigos 01-03), registrada com o tema "Discussão de caso/Projeto terapêutico singular" e 2 ou mais participantes — conta como ação compartilhada no Numerador do M2 (NT 44/2026).';

  // Parcelas do numerador do M2 que esta extração não consegue medir
  // (não há aba com esses dados), mas que devem aparecer SEMPRE na
  // composição, mesmo zeradas — ver numM2Bar abaixo.
  var DEF_ATEND_COMPARTILHADO = 'Atendimento individual realizado em conjunto por 2 ou mais profissionais diferentes (CNS diferentes), com pelo menos 1 da eMulti — conta como ação compartilhada no Numerador e no Denominador do M2 (NT 44/2026). Aproximação desta extração: mesma pessoa, no mesmo dia, atendida por 2+ profissionais distintos (cada pessoa/dia conta 1 vez, e os registros específicos duplicados são desconsiderados).';
  var DEF_ATEND_ESPECIFICO = 'Atendimento individual registrado por apenas 1 profissional da eMulti (NT 44/2026) — entra no Denominador do M2, mas NÃO no Numerador. Não inclui pessoa/dia que já foi contada como atendimento compartilhado.';
  var DEF_COMPART_CUIDADO = 'Solicitações respondidas de compartilhamento de cuidado no PEC — conta como ação compartilhada no Numerador do M2 (NT 44/2026). Não existe aba equivalente nesta extração, então o valor aparece zerado.';

  // ---- Composição (4 cartões: Numerador/Denominador de M1 e M2) ----
  var numM1Bar = stackbar([
      {label:'Atendimentos individuais', value:atendIndGauge, color:'#153F35', title:DEF_ATEND_IND},
      {label:'Participações coletivas', value:participColGauge, color:'#C68A3D', title:DEF_PARTIC_COLETIVA}
    ], numM1Gauge);
  var denM1Bar = stackbar([
      {label:'Pessoas atendidas', value:denM1CalcGauge, color:'#153F35'}
    ], denM1Gauge);
  var numM2Bar = stackbar([
      {label:'Atendimentos compartilhados', value:atendCompGauge||0, color:'#3B7DDD', title:DEF_ATEND_COMPARTILHADO},
      {label:'Atividades coletivas compartilhadas', value:atividadesCompGauge, color:'#153F35', title:DEF_AC_COMPARTILHADA},
      {label:'Reuniões compartilhadas', value:reunioesCompGauge, color:'#C68A3D', title:DEF_REUNIAO_COMPARTILHADA},
      {label:'Compartilhamento de cuidado', value:0, color:'#7C5CBF', title:DEF_COMPART_CUIDADO}
    ], numM2Gauge);
  var denM2Bar = stackbar([
      {label:'Atendimentos individuais (específicos)', value:atendEspGauge||0, color:'#CBD3C4', title:DEF_ATEND_ESPECIFICO},
      {label:'Atendimentos individuais (compartilhados)', value:atendCompGauge||0, color:'#3B7DDD', title:DEF_ATEND_COMPARTILHADO},
      {label:'Atividades coletivas (específicas)', value:(atividadesTotaisGauge!=null && atividadesCompGauge!=null) ? Math.max(0, atividadesTotaisGauge-atividadesCompGauge) : 0, color:'#E7DFC9', title:DEF_AC_ESPECIFICA},
      {label:'Atividades coletivas compartilhadas', value:atividadesCompGauge||0, color:'#153F35', title:DEF_AC_COMPARTILHADA},
      {label:'Reuniões (específicas)', value:(reunioesTotaisGauge!=null && reunioesCompGauge!=null) ? Math.max(0, reunioesTotaisGauge-reunioesCompGauge) : 0, color:'#F1E6D2', title:DEF_REUNIAO_ESPECIFICA},
      {label:'Reuniões compartilhadas', value:reunioesCompGauge||0, color:'#C68A3D', title:DEF_REUNIAO_COMPARTILHADA}
    ], denM2Gauge);

  document.getElementById('compRow').innerHTML =
      '<div class="card comp-card">'+compCardHeaderHTML('Numerador do M1', numM1Gauge)+numM1Bar+'</div>'
    + '<div class="card comp-card">'+compCardHeaderHTML('Denominador do M1', denM1Gauge)+denM1Bar+'</div>'
    + '<div class="card comp-card">'+compCardHeaderHTML('Numerador do M2', numM2Gauge)+numM2Bar+'</div>'
    + '<div class="card comp-card">'+compCardHeaderHTML('Denominador do M2', denM2Gauge)+denM2Bar+'</div>';

  // ---- Visão geral: 3 cards no modelo "ícone + anel + evolução" ----
  var quadAnterior = calcularQuadrimestreAnterior();
  document.getElementById('gaugeRow').innerHTML =
      overviewCardHTML({
        iconKind:'pulse', title:'M1 — Média de Atendimentos por Pessoa', classe:d.classificacaoM1,
        value:d.m1, domainMax:4, decimals:2, suffix:'', bands:CLASS_BANDS_M1_OV, gaugeId:'ovGaugeM1',
        valueTxt:fmtDec(d.m1,2), valueCap:fmtInt(numM1Gauge)+' atendimentos ÷ '+fmtInt(denM1Gauge)+' pessoas',
        ringTxt:fmtDec(d.m1,2),
        anterior:quadAnterior.m1, legend:OV_LEGEND_M1
      })
    + overviewCardHTML({
        iconKind:'users', title:'M2 — Ações Interprofissionais', classe:d.classificacaoM2,
        value:d.m2, domainMax:8, decimals:1, suffix:'%', bands:CLASS_BANDS_M2_OV, gaugeId:'ovGaugeM2',
        valueTxt:fmtDec(d.m2,1)+'%', valueCap:fmtInt(numM2Gauge)+' compartilhadas ÷ '+fmtInt(denM2Gauge)+' ações',
        ringTxt:fmtDec(d.m2,1),
        anterior:quadAnterior.m2, legend:OV_LEGEND_M2
      })
    + overviewCardHTML({
        iconKind:'speed', title:'Desempenho Quadrimestral', classe:d.desempenho,
        value:d.notaFinal, domainMax:10, decimals:1, suffix:'', bands:CLASS_BANDS_NOTA_OV, gaugeId:'ovGaugeNota',
        valueTxt:fmtDec(d.notaFinal,1), valueCap:'M1: '+fmtDec(d.pontosM1,1)+' ('+(d.classificacaoM1||'—')+') · M2: '+fmtDec(d.pontosM2,1)+' ('+(d.classificacaoM2||'—')+') | Pesos: 6 + 4',
        ringTxt:fmtDec(d.notaFinal,1),
        anterior:quadAnterior.notaFinal, legend:OV_LEGEND_NOTA
      });

  // ---- Meta do quadrimestre: alvo de atendimentos/ações compartilhadas
  // pra bater "Bom" e "Ótimo" em M1 e M2, com ritmo médio necessário. ----
  var metaM1 = calcularMetasQuadrimestre(numM1Gauge, denM1Gauge, M1_META_THRESHOLDS, 'atendimentos',
    'atendimentos (retornos) de pessoas que foram atendidas nos últimos 4 meses');
  var metaM2 = calcularMetasQuadrimestre(numM2Gauge, denM2Gauge, M2_META_THRESHOLDS, 'ações');
  document.getElementById('metaQuadRow').innerHTML =
      metaQuadrimestreHTML('Meta do quadrimestre — M1', denM1Gauge, 'pessoas atendidas', metaM1.cards, metaM1.preliminar, d.mesesProjecaoLabel)
    + metaQuadrimestreHTML('Meta do quadrimestre — M2', denM2Gauge, 'ações realizadas', metaM2.cards, metaM2.preliminar, d.mesesProjecaoLabel);

  // ---- Aba M1: layout de 3 colunas (gauge + evolução | composição |
  // meta), igual ao modelo de referência, + leitura textual + listas ----
  document.getElementById('gaugeRowM1').innerHTML =
    ipGaugeCardHTML(d.m1, 4, CLASS_BANDS_M1, 'needle-m1tab-m1', fmtDec(d.m1,2), d.classificacaoM1,
      fmtInt(numM1Gauge)+' atendimentos ÷ '+fmtInt(denM1Gauge)+' pessoas',
      quadAnterior.m1, 2, '', LEGEND_M1, 'pulse');
  document.getElementById('compRowM1').innerHTML =
      '<div class="card comp-card">'+compCardHeaderHTML('Composição do numerador', numM1Gauge)+numM1Bar+'</div>'
    + '<div class="card comp-card">'+compCardHeaderHTML('Denominador do M1', denM1Gauge)+denM1Bar+'</div>';
  document.getElementById('sideRowM1').innerHTML =
    metaQuadrimestreMiniHTML(denM1Gauge, 'pessoas atendidas', metaM1.cards, metaM1.preliminar, d.mesesProjecaoLabel);
  document.getElementById('readingM1').innerHTML =
    ipReadingHTML('Leitura do M1', d.m1, d.classificacaoM1, quadAnterior.m1, 2, '', CLASS_BANDS_M1, 'atendimentos por pessoa');
  renderListsSection('listsM1', m1ListNames());

  // ---- Aba M2: mesmo layout de 3 colunas + leitura + listas ----
  document.getElementById('gaugeRowM2').innerHTML =
    ipGaugeCardHTML(d.m2, 8, CLASS_BANDS_M2, 'needle-m2tab-m2', fmtDec(d.m2,2)+'<span class="unit">%</span>', d.classificacaoM2,
      fmtInt(numM2Gauge)+' compartilhadas ÷ '+fmtInt(denM2Gauge)+' ações',
      quadAnterior.m2, 2, '%', LEGEND_M2, 'users');
  document.getElementById('compRowM2').innerHTML =
      '<div class="card comp-card">'+compCardHeaderHTML('Composição do numerador', numM2Gauge)+numM2Bar+'</div>'
    + '<div class="card comp-card">'+compCardHeaderHTML('Denominador do M2', denM2Gauge)+denM2Bar+'</div>';
  document.getElementById('sideRowM2').innerHTML =
    metaQuadrimestreMiniHTML(denM2Gauge, 'ações realizadas', metaM2.cards, metaM2.preliminar, d.mesesProjecaoLabel);
  document.getElementById('readingM2').innerHTML =
    ipReadingHTML('Leitura do M2', d.m2, d.classificacaoM2, quadAnterior.m2, 2, '%', CLASS_BANDS_M2, 'de ações compartilhadas');
  renderListsSection('listsM2', m2ListNames());

  // Tendência mês a mês: cada ponto é o M1/M2 calculado com sua própria
  // janela móvel de JANELA_MESES meses terminando naquele mês (ver
  // calcularSerieTendencia) — não é mais o histórico de vezes que a
  // página foi atualizada.
  var trend = '<div class="card trend-card-combo">'
    + '<button type="button" id="trendPreliminarToggle" class="trend-preliminar-toggle" title="Mostrar a linha calculada só com os dados da planilha (tabela nominal), sem o override da aba Q2-26"><i></i>Preliminar</button>'
    + '<div class="trend-sub"><h4>M1 mês a mês</h4>'
      + '<p class="cur">Mês de referência ('+refMonthLabel()+'): '+fmtDec(d.m1,2)+'</p>'
      + sparkline(serieTendencia.map(function(p){ return {y:p.m1, label:monthShortLabel(p.mes), value:fmtDec(p.m1,2), quadKey:quadKeyOfDate(p.mes), quadLabel:quadCode(p.mes), oficial:!!p.m1Oficial, yAlt:p.m1Calculado, futuro:isMesFuturo(p.mes)}; }).filter(function(p){return p.y!=null;}), '#153F35', {quadAvg:true, classify:classificarM1, hideAxis:true})
      + '</div>'
    + '<div class="trend-sub"><h4>M2 (%) mês a mês</h4>'
      + '<p class="cur">Mês de referência ('+refMonthLabel()+'): '+fmtDec(d.m2,2)+'%</p>'
      + sparkline(serieTendencia.map(function(p){ return {y:p.m2, label:monthShortLabel(p.mes), value:fmtDec(p.m2,2)+'%', quadKey:quadKeyOfDate(p.mes), quadLabel:quadCode(p.mes), oficial:!!p.m2Oficial, yAlt:p.m2Calculado, futuro:isMesFuturo(p.mes)}; }).filter(function(p){return p.y!=null;}), '#C68A3D', {quadAvg:true, suffix:'%', classify:classificarM2})
      + '</div>'
    + '<p class="footnote">Cada ponto já é a janela de '+JANELA_MESES+' meses terminando naquele mês. Linha tracejada fina = média do quadrimestre no período exibido; o trecho tracejado mais grosso no final da linha principal = meses que ainda não terminaram (projeção). O pill "Preliminar" (canto superior direito) mostra/esconde a linha calculada só com os dados da planilha (tabela nominal), sem o override da aba Q2-26 — os pontinhos marcam os meses em que ela diverge da linha oficial.</p>'
    + '</div>';
  document.getElementById('trendRow').innerHTML = trend;
  setupTrendInteractivity();
  setupPreliminarToggle();

  // Série histórica (tabela): um mês por linha, cada um já calculado com
  // sua própria janela móvel de JANELA_MESES meses (mesmos pontos do
  // sparkline acima) — mostra numerador/denominador/classificação de
  // M1 e M2 e o "Desempenho quadrimestral" (síntese M1×6 + M2×4) mês a
  // mês, pra dar visibilidade à composição por trás de cada ponto do
  // gráfico. Ordem: mês mais recente primeiro (slice().reverse() —
  // serieTendencia em si continua do mais antigo pro mais novo, ordem
  // usada pelos gráficos de Tendência acima).
  var serieRecenteParaAntigo = serieTendencia.slice().reverse();
  var trendHistoryRows = serieRecenteParaAntigo.map(function(p){
    var classeM1 = classificarM1(p.m1);
    var classeM2 = classificarM2(p.m2);
    var desemp = classificarDesempenho(p.notaFinal);
    function pill(txt){ return '<span class="pill" style="background:'+(CLASS_PILL_HEX[txt]||'#7A8A82')+'">'+escapeHtml(txt)+'</span>'; }
    // Pequeno selo "Oficial" na célula do M1/M2 quando aquele mês usou
    // o dado da aba Q2-26 em vez do calculado pelo painel (ver
    // aplicarOverrideOficial) — só um lembrete visual, não muda o valor.
    function oficialTag(ehOficial){ return ehOficial ? ' <span class="pill" style="background:#3B7DDD;font-size:9.5px;">Oficial</span>' : ''; }
    // Etiqueta de depuração: de onde veio o número de "atividades
    // coletivas compartilhadas" (SÓ essa parcela — não o Numerador M2
    // inteiro, que ainda soma reuniões compartilhadas por cima) — da
    // contagem detalhada (Resumo Atividade Coletiva) ou do total
    // mensal já consolidado (TOTAL RELATÓRIO AC). Fica colado na
    // própria célula "Ativ. compartilhadas" pra não passar a impressão
    // de que o Numerador M2 todo veio da AC.
    var fonteAc = p.atividadesCompartilhadasFonte;
    var fonteAcCurta = fonteAc === 'TOTAL RELATÓRIO AC' ? 'AC' : 'Lista';
    var fonteAcCor = fonteAc === 'TOTAL RELATÓRIO AC' ? '#3B7DDD' : '#7A8A82';
    var fonteAcTitle = 'Lista (Resumo Atividade Coletiva): '+fmtInt(p.atividadesCompartilhadasListas)
      +' · TOTAL RELATÓRIO AC (mês âncora): '+fmtInt(p.totalRelatorioAc);
    var fonteAcTag = fonteAc
      ? ' <span class="pill" style="background:'+fonteAcCor+';font-size:9.5px;" title="'+escapeHtml(fonteAcTitle)+'">'+fonteAcCurta+'</span>'
      : '';
    // Quando a fonte é AC, o total já vem fechado do relatório oficial
    // e reuniões NÃO entram na soma (ver numeradorM2 em
    // calcularIndicadoresDoPeriodo) — mostra o valor de reuniões
    // esmaecido, com "(não somada)", pra bater com Numerador M2 =
    // Ativ. compartilhadas nesses meses.
    var reunioesNaoSomada = fonteAc === 'TOTAL RELATÓRIO AC';
    var reunioesCell = reunioesNaoSomada
      ? '<span style="color:#A9B3A5;" title="Não entra no Numerador M2 este mês: a parcela de atividades já veio como total fechado da aba TOTAL RELATÓRIO AC.">'+fmtInt(p.reunioesCompartilhadas)+' (não somada)</span>'
      : fmtInt(p.reunioesCompartilhadas);
    return '<tr>'
      + '<td>'+escapeHtml(monthShortLabel(p.mes))+'</td>'
      + '<td>'+fmtInt(p.numeradorM1)+'</td>'
      + '<td>'+fmtInt(p.denominadorM1)+'</td>'
      + '<td>'+(p.m1!=null ? fmtDec(p.m1,2) : '—')+oficialTag(p.m1Oficial)+'</td>'
      + '<td>'+pill(classeM1)+'</td>'
      + '<td>'+fmtInt(p.atividadesCompartilhadas)+fonteAcTag+'</td>'
      + '<td>'+reunioesCell+'</td>'
      + '<td>'+fmtInt(p.numeradorM2)+'</td>'
      + '<td>'+fmtInt(p.denominadorM2)+'</td>'
      + '<td>'+(p.m2!=null ? fmtDec(p.m2,2)+'%' : '—')+oficialTag(p.m2Oficial)+'</td>'
      + '<td>'+pill(classeM2)+'</td>'
      + '<td>'+(p.notaFinal!=null ? fmtDec(p.notaFinal,2) : '—')+'</td>'
      + '<td>'+pill(desemp)+'</td>'
      + '</tr>';
  }).join('');
  var temAlgumOficial = serieTendencia.some(function(p){ return p.m1Oficial || p.m2Oficial; });
  var divergenciaBtnHtml = temAlgumOficial
    ? '<button type="button" class="pdf-btn" id="btnDivergenciaOficial">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h1a1.5 1.5 0 0 0 0-3H9v5"/><path d="M13 12v5h1a2 2 0 0 0 0-5z"/><path d="M18.5 12H17v5"/><path d="M17 14.5h1.3"/></svg>'
      + '<span>PDF de divergência</span></button>'
    : '';
  document.getElementById('trendHistoryWrap').innerHTML =
      '<div class="card"><div class="list-card-head"><h4 style="margin:0;font-size:14.5px;font-weight:500;">Série histórica — numerador, denominador e desempenho quadrimestral</h4>'+divergenciaBtnHtml+'</div>'
    + '<p class="footnote" style="margin:4px 0 12px;">Um mês por linha (mais recente primeiro), cada um com sua própria janela móvel de '+JANELA_MESES+' meses terminando naquele mês (mesmos pontos dos gráficos acima). "Desempenho quadrimestral" é a síntese própria M1×6 + M2×4 — ver Notas Metodológicas. O selo "Oficial" marca meses em que o valor veio da aba Q2-26 em vez do cálculo do painel. O selo "AC"/"Lista" fica na coluna "Ativ. coletivas compartilhadas" e mostra a origem daquela parcela. Quando a origem é "AC", o total já vem fechado da aba TOTAL RELATÓRIO AC e Reuniões compartilhadas não entra na soma (fica marcada "não somada"); quando é "Lista", Numerador M2 = Ativ. coletivas compartilhadas + Reuniões compartilhadas.</p>'
    + '<div class="table-wrap"><table class="data-table"><thead><tr>'
    +   '<th>Mês</th><th>Numerador M1</th><th>Denominador M1</th><th>M1</th><th>Classe M1</th>'
    +   '<th>Ativ. coletivas compartilhadas</th><th>Reuniões compartilhadas</th><th>Numerador M2</th><th>Denominador M2</th><th>M2 (%)</th><th>Classe M2</th><th>Nota do desempenho</th><th>Desempenho quadrimestral</th>'
    + '</tr></thead><tbody>'+trendHistoryRows+'</tbody></table></div></div>';
  var btnDivergencia = document.getElementById('btnDivergenciaOficial');
  if(btnDivergencia){
    btnDivergencia.addEventListener('click', function(){ gerarPdfDivergenciaOficial(serieTendencia); });
  }

  var notesList = document.getElementById('notesList');
  if(record.notes && record.notes.length){
    notesList.innerHTML = record.notes.map(function(n){ return '<li>'+escapeHtml(n)+'</li>'; }).join('');
  } else {
    notesList.innerHTML = '<li style="list-style:none;margin-left:-20px;">Nenhuma nota disponível para esta leitura.</li>';
  }

  animateGauges();
  renderHistoryList();
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_app_render(){
document.querySelectorAll('.tab').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.tab').forEach(function(b){ b.classList.toggle('active', b===btn); });
      var target = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-panel').forEach(function(p){
        p.classList.toggle('active', p.id === 'tab'+target.charAt(0).toUpperCase()+target.slice(1));
      });
      document.getElementById('filterBar').classList.toggle('hidden', !FILTER_BAR_TABS[target]);
      // Gráficos Chart.js criados enquanto a aba estava escondida (display:none)
      // ficam com tamanho zero e não se redesenham sozinhos ao trocar de aba —
      // re-renderiza na hora em que o painel de Desempenho Profissional fica visível.
      if(target === 'profissionais'){
        renderPerformanceProfissionais(profListaAtual);
      }
      if(target === 'analises'){
        renderAnalises(estadoApp.analisesDataAtual);
      }
    });
  });
}

// ===== módulo: js/app/historico.js =====
// ======================================================================
// app/historico.js
// Histórico salvo no navegador (storage)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Storage ----------
export function loadHistoryArray(){
  return window.__historyCache || [];
}

export function refreshHistoryFromStorage(cb){
  if(!STORAGE_AVAILABLE){
    window.__historyCache = estadoApp.memoryHistory;
    if(cb) cb(estadoApp.memoryHistory);
    return;
  }
  window.storage.get(STORAGE_KEY, false).then(function(res){
    var arr = [];
    if(res && res.value){
      try{ arr = JSON.parse(res.value); }catch(e){ arr = []; }
    }
    window.__historyCache = arr;
    if(cb) cb(arr);
  }).catch(function(){
    window.__historyCache = [];
    if(cb) cb([]);
  });
}

export function saveHistoryArray(arr){
  window.__historyCache = arr;
  estadoApp.memoryHistory = arr;
  if(!STORAGE_AVAILABLE) return Promise.resolve();
  try{
    return window.storage.set(STORAGE_KEY, JSON.stringify(arr), false).catch(function(){});
  }catch(e){
    return Promise.resolve();
  }
}

export function renderHistoryList(){
  var arr = loadHistoryArray().slice().sort(function(a,b){ return b.timestamp-a.timestamp; });
  var el = document.getElementById('historyList');
  var clearBtn = document.getElementById('clearHistory');
  if(!arr.length){
    el.innerHTML = '<p class="history-empty">Nenhuma leitura ainda.</p>';
    clearBtn.style.display = 'none';
    return;
  }
  clearBtn.style.display = 'block';
  el.innerHTML = arr.map(function(h){
    var dotColor = h.error ? '#9AA69E' : pillHex(h.data && h.data.desempenho);
    return '<div class="history-item'+(h.id===estadoApp.currentRecordId?' active':'')+'" data-id="'+h.id+'">'
      + '<span class="history-dot" style="background:'+dotColor+'"></span>'
      + '<span class="history-text"><span class="eq">'+escapeHtml(h.equipe)+'</span><span class="dt">'+fmtDate(h.timestamp)+'</span></span>'
      + '<button class="history-del" data-del="'+h.id+'" title="Remover">×</button>'
      + '</div>';
  }).join('');

  el.querySelectorAll('.history-item').forEach(function(item){
    item.addEventListener('click', function(e){
      if(e.target.classList.contains('history-del')) return;
      var id = item.getAttribute('data-id');
      var rec = loadHistoryArray().find(function(h){ return h.id === id; });
      if(rec){
        estadoApp.currentRecordId = id;
        renderDashboard(rec, calcularSerieTendencia(latestWb, anchorMonthDate(), TREND_MESES));
      }
    });
  });
  el.querySelectorAll('.history-del').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var id = btn.getAttribute('data-del');
      var arr2 = loadHistoryArray().filter(function(h){ return h.id !== id; });
      saveHistoryArray(arr2).then(function(){
        if(id === estadoApp.currentRecordId && arr2.length){
          var latest = arr2.slice().sort(function(a,b){return b.timestamp-a.timestamp;})[0];
          estadoApp.currentRecordId = latest.id;
          renderDashboard(latest);
        } else {
          renderHistoryList();
        }
      });
    });
  });
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_app_historico(){
document.getElementById('clearHistory').addEventListener('click', function(){
    if(!confirm('Remover todo o histórico de leituras deste navegador?')) return;
    saveHistoryArray([]).then(function(){
      estadoApp.currentRecordId = null;
      renderHistoryList();
    });
  });
}

// ===== módulo: js/app/carga.js =====
// ======================================================================
// app/carga.js
// Carga de dados, mês de referência, debug e seletor de equipe
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Fetch ----------
var fetchStatusEl;

var refreshBtn;

var refreshLabel;

function sameData(a,b){
  if(!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// Dados brutos (já filtrados pela equipe atual, mas SEM filtro de
// período — o período é aplicado depois, em calcularIndicadoresDoPeriodo)
// guardados aqui após o último fetch bem-sucedido. Trocar o "Mês de
// referência" no seletor reusa este cache e recalcula tudo na hora, sem
// precisar buscar a planilha de novo na rede.
export var latestWb = null;

// Igual latestWb, mas SEM o filtro por equipe (todas juntas, uma linha
// por atendimento, por nome real da aba) — usado só pelo filtro de
// Equipe INDEPENDENTE da aba Análises (analisesEquipes), pra poder
// trocar de equipe ali sem precisar buscar a planilha de novo (ver
// fetchAndLoad e construirHistoricosPacientes).
export var latestRawSheets = {};

// Recalcula M1/M2/pontos/nota + a série de tendência pro mês de
// referência atual (refMonthDates), a partir do cache latestWb.
// saveHistory=true (usado logo após um fetch): grava uma nova "leitura"
// no histórico se os dados mudaram desde a última do mesmo período/equipe.
// saveHistory=false (usado ao trocar o seletor de mês): só recalcula e
// renderiza na hora, sem criar entrada nova no histórico de leituras.
export function aplicarMesReferencia(saveHistory){
  if(!latestWb) return;

  var extracted, periodo, periodoDatas;
  if(estadoApp.refMonthDates.length === 1){
    // Um único mês escolhido: NÃO é só aquele mês isolado — é a janela
    // móvel de JANELA_MESES meses TERMINANDO nesse mês (ex.: maio →
    // fev, mar, abr e maio, incluindo os dois extremos), a mesma janela
    // usada pela série de tendência (ver calcularJanelaPeriodo).
    var janelaMes = calcularJanelaPeriodo(estadoApp.refMonthDates[0]);
    extracted = calcularJanelaComOverride(latestWb, estadoApp.refMonthDates[0]);
    periodo = {inicio: fmtBRDate(janelaMes.inicio), fim: fmtBRDate(janelaMes.fim)};
    periodoDatas = {inicio: janelaMes.inicio, fim: janelaMes.fim};
  } else if(estadoApp.refMonthDates.length > 1){
    // Vários meses escolhidos: o M1/M2 de CADA mês marcado já é o valor
    // com a janela móvel de JANELA_MESES meses terminando naquele mês
    // (mesma regra do mês único, acima) — os resultados dos meses
    // marcados entram na MÉDIA (mesmo princípio da média do
    // quadrimestre, ver mediaDeMeses), e os totais de contexto/"Pessoas
    // atendidas" somam o mês isolado (sem janela) de cada um, pra não
    // sobrepor dados de meses vizinhos quando as janelas se cruzam.
    var resultadosMensaisSel = estadoApp.refMonthDates.map(function(m){
      return calcularIndicadoresDoPeriodo(latestWb, periodoMesUnico(m));
    });
    var resultadosJanelaSel = estadoApp.refMonthDates.map(function(m){
      return calcularJanelaComOverride(latestWb, m);
    });
    extracted = mediaDeMeses(resultadosMensaisSel, resultadosJanelaSel);
    periodo = {
      inicio: fmtBRDate(periodoMesUnico(estadoApp.refMonthDates[0]).inicio),
      fim: fmtBRDate(periodoMesUnico(estadoApp.refMonthDates[estadoApp.refMonthDates.length-1]).fim)
    };
    periodoDatas = {
      inicio: periodoMesUnico(estadoApp.refMonthDates[0]).inicio,
      fim: periodoMesUnico(estadoApp.refMonthDates[estadoApp.refMonthDates.length-1]).fim
    };
  } else {
    // Nenhum mês escolhido: média dos meses do quadrimestre selecionado
    // que JÁ TERMINARAM (mesesElapsedDoQuadrimestre) — os meses futuros
    // (ainda sem nenhum atendimento/atividade real na planilha) NÃO
    // entram na média, pra não diluir o resultado com dado inexistente.
    // Isso equivale, na prática, a projetar os meses que faltam pelo
    // ritmo médio dos meses já decorridos (preencher um mês futuro com
    // a própria média dos já decorridos não muda essa média — só
    // filtrar já dá o mesmo resultado, sem precisar simular nada).
    // O M1/M2 de CADA mês usado na média já é o valor com a janela móvel
    // de JANELA_MESES meses terminando naquele mês (mesma regra oficial
    // usada na seleção de mês individual e no gráfico de tendência) —
    // por isso calculamos cada mês duas vezes: uma com a janela (pra
    // entrar na média de M1/M2) e outra isolada, só o mês em si (pra
    // somar contagens de contexto e montar "Pessoas atendidas" sem
    // sobrepor dados de meses vizinhos).
    var meses = mesesDosQuadsSelecionadosUniao();
    var mesesUsados = mesesElapsedDosQuadsSelecionadosUniao();
    var mesesProjecaoLabel = mesesUsados.length < meses.length
      ? mesesUsados.map(monthShortLabel).join('+')
      : null;
    var resultadosMensais = mesesUsados.map(function(m){
      return calcularIndicadoresDoPeriodo(latestWb, periodoMesUnico(m));
    });
    var resultadosJanela = mesesUsados.map(function(m){
      return calcularJanelaComOverride(latestWb, m);
    });
    extracted = mediaDeMeses(resultadosMensais, resultadosJanela, mesesProjecaoLabel);
    periodo = {
      inicio: fmtBRDate(periodoMesUnico(meses[0]).inicio),
      fim: fmtBRDate(periodoMesUnico(meses[meses.length-1]).fim)
    };
    periodoDatas = {inicio: periodoMesUnico(meses[0]).inicio, fim: periodoMesUnico(meses[meses.length-1]).fim};
  }

  var performanceProfissionais = calcularPerformanceProfissionais(latestWb, periodoDatas);
  var analisesData = calcularAnalises();

  populateSheetsCache(latestWb);
  // "Pessoas atendidas" agora NÃO usa mais extracted.pessoasAtendidas
  // (ligado ao filtro de Mês do topo) — a lista, na aba Listas, é
  // recalculada direto por renderListCard/pessoasAtendidasParaMeses,
  // com o próprio filtro de mês (ver renderListsSection).

  var serie = calcularSerieTendencia(latestWb, anchorMonthDate(), TREND_MESES);

  if(anoMs) anoMs.setSelected(valoresUnicosOrdenados(estadoApp.quadsSelecionados.map(function(c){ return String(c.ano); })));
  if(quadMs) quadMs.setSelected(valoresUnicosOrdenados(estadoApp.quadsSelecionados.map(function(c){ return String(c.qIndex); })));
  if(mesMs) mesMs.setSelected(estadoApp.refMonthDates.map(monthOptionValue));
  var winEl = document.getElementById('refWindowLabel');
  if(winEl){
    winEl.innerHTML = estadoApp.refMonthDates.length
      ? 'Resultado de <b>'+refMonthLabel()+'</b> — janela de '+JANELA_MESES+' meses cada ('+periodo.inicio+' a '+periodo.fim+')'
      : 'Média de <b>'+labelQuadsSelecionados()+'</b> ('+periodo.inicio+' a '+periodo.fim+')';
  }

  if(!saveHistory){
    var base = estadoApp.currentRecordId ? loadHistoryArray().find(function(h){ return h.id === estadoApp.currentRecordId; }) : null;
    var record = {
      id: base ? base.id : 'tmp',
      timestamp: base ? base.timestamp : Date.now(),
      equipe: extracted.equipe,
      data: extracted.data,
      notes: extracted.notes,
      periodo: periodo
    };
    renderDashboard(record, serie, performanceProfissionais, analisesData);
    return;
  }

  var now = Date.now();
  var history = loadHistoryArray();
  var lastForEquipe = history.filter(function(h){
    return !h.error && h.equipe === extracted.equipe
      && h.periodo && h.periodo.inicio === periodo.inicio && h.periodo.fim === periodo.fim;
  }).sort(function(a,b){ return b.timestamp-a.timestamp; })[0];

  if(lastForEquipe && sameData(lastForEquipe.data, extracted.data)){
    estadoApp.currentRecordId = lastForEquipe.id;
    fetchStatusEl.textContent = 'Dados sem alterações desde a última leitura.';
    renderDashboard(lastForEquipe, serie, performanceProfissionais, analisesData);
    return;
  }

  var record = {
    id: 'u'+now+Math.random().toString(36).slice(2,7),
    timestamp: now,
    equipe: extracted.equipe,
    data: extracted.data,
    notes: extracted.notes,
    periodo: periodo
  };
  var arr = loadHistoryArray();
  arr.push(record);
  saveHistoryArray(arr).then(function(){
    estadoApp.currentRecordId = record.id;
    fetchStatusEl.textContent = 'Planilha lida e calculada com sucesso.';
    renderDashboard(record, serie, performanceProfissionais, analisesData);
  });
}

// ---------- Debug manual (console) ----------
// window.debugAtendimentosEmulti(): imprime UMA tabela só, pro período
// EXATO que está selecionado agora no painel (mesma regra usada por
// aplicarMesReferencia — mês único = janela de 4 meses terminando
// nele; vários meses = intervalo entre o primeiro e o último; nenhum
// mês = quadrimestre selecionado inteiro), com a contagem de
// atendimentos por profissional e se cada um é considerado "da eMulti"
// (roster da aba PROFISSIONAIS). Chame direto no console do navegador
// (F12 → Console → digite "debugAtendimentosEmulti()" e Enter) — não
// fica rodando sozinho a cada recálculo (evita a poluição de outras
// janelas, como a do gráfico de Tendência), então o período mostrado é
// sempre exatamente o que está no card "Composição do numerador" no
// momento em que você chamar.
function periodoEfetivoAtual(){
  if(estadoApp.refMonthDates.length === 1){
    return calcularJanelaPeriodo(estadoApp.refMonthDates[0]);
  } else if(estadoApp.refMonthDates.length > 1){
    return {
      inicio: periodoMesUnico(estadoApp.refMonthDates[0]).inicio,
      fim: periodoMesUnico(estadoApp.refMonthDates[estadoApp.refMonthDates.length-1]).fim
    };
  }
  var meses = mesesDosQuadsSelecionadosUniao();
  return {inicio: periodoMesUnico(meses[0]).inicio, fim: periodoMesUnico(meses[meses.length-1]).fim};
}

export function fetchAndLoad(){
  refreshBtn.classList.add('loading');
  refreshBtn.disabled = true;
  refreshLabel.textContent = 'Atualizando…';
  fetchStatusEl.textContent = 'Buscando dados…';
  fetchStatusEl.className = 'fetch-status';

  Promise.all([fetchAllSheets(), fetchOfficialOverridesSafe(), fetchProfissionaisSafe()])
    .then(function(arr){
      var results = arr[0];
      var faltando = results.filter(function(r){ return !r.ok; });
      if(faltando.length){
        // Mostra o motivo REAL devolvido pelo Apps Script (ou pelo navegador)
        // para cada aba, em vez de só a mensagem genérica.
        var motivos = [];
        faltando.forEach(function(r){
          var m = (r.error && r.error.message) ? r.error.message : 'erro desconhecido';
          var linha = r.name + ': ' + m;
          if(motivos.indexOf(linha) < 0) motivos.push(linha);
          try{ console.error('[painel] falha ao ler a aba "' + r.name + '":', r.error); }catch(e){}
        });
        throw new Error('Não foi possível ler a(s) aba(s) "' + faltando.map(function(r){return r.name;}).join('", "')
          + '". Motivo: ' + motivos.join(' | ') + '.');
      }

      var wb = {SheetNames:[], Sheets:{}};
      results.forEach(function(r){
        var parsedRows = parseCsv(r.csvText);
        if(!parsedRows.length) return;
        latestRawSheets[r.name] = parsedRows;
        // r.name é o nome REAL da aba (sem sufixo). Filtra as linhas pela
        // equipe selecionada e guarda no workbook sob a chave "sufixada"
        // — o resto do painel (cálculo, listas) continua lendo por essa
        // chave, sem precisar saber que a aba é compartilhada entre
        // equipes. Note: SEM filtro de período aqui — cada mês de
        // referência filtra por data na hora, em aplicarMesReferencia().
        var filtradas = filtrarLinhasPorEquipe(parsedRows, estadoApp.currentEquipes);
        var key = suffixedName(r.name);
        wb.Sheets[key] = filtradas;
        wb.SheetNames.push(key);
      });

      latestWb = wb;
      aplicarMesReferencia(true);
    })
    .catch(function(err){
      var msg = (err && err.message) ? err.message : 'verifique sua conexão e o link publicado.';
      fetchStatusEl.textContent = 'Não foi possível ler a planilha: ' + msg;
      fetchStatusEl.className = 'fetch-status err';
      var history = loadHistoryArray();
      if(!history.length){
        document.getElementById('statusState').innerHTML =
          '<h2>Não foi possível carregar</h2><p>' + escapeHtml(msg) + '</p>'
          + '<div class="ficha"><b>Verifique:</b> se a planilha continua publicada em "Arquivo → Compartilhar → Publicar na web" (incluindo todas as abas) e se o link ainda é válido.</div>'
          + '<button class="retry-btn" id="retryBtn">Tentar de novo</button>';
        var retry = document.getElementById('retryBtn');
        if(retry) retry.addEventListener('click', fetchAndLoad);
      }
    })
    .finally(function(){
      refreshBtn.classList.remove('loading');
      refreshBtn.disabled = false;
      refreshLabel.textContent = 'Atualizar';
    });
}

function renderEquipeSwitcher(){
  var TODAS_KEY = 'todas';
  var equipeMs = createMultiSelect(document.getElementById('equipeMs'), {
    placeholder: 'Selecione',
    multi: false,
    search: false,
    onChange: function(keys){
      estadoApp.currentEquipes = keys[0] === TODAS_KEY ? EQUIPES.slice()
        : EQUIPES.filter(function(eq){ return eq.key === keys[0]; });
      document.getElementById('statusState').style.display = '';
      fetchAndLoad();
    }
  });
  equipeMs.setOptions(
    EQUIPES.map(function(eq){ return {value: eq.key, label: eq.label}; })
      .concat([{value: TODAS_KEY, label: 'Todas'}])
  );
  equipeMs.setSelected([estadoApp.currentEquipes.length > 1 ? TODAS_KEY : estadoApp.currentEquipes[0].key]);
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_app_carga(){
  fetchStatusEl = document.getElementById('fetchStatus');

  refreshBtn = document.getElementById('refreshBtn');

  refreshLabel = document.getElementById('refreshLabel');

window.debugAtendimentosEmulti = function(){
    if(!latestWb){
      console.warn('[debugAtendimentosEmulti] o painel ainda não carregou nenhuma planilha.');
      return;
    }
    var periodo = periodoEfetivoAtual();
    var ws = latestWb.Sheets[suffixedName("Atendimentos")];
    var rows = ws ? sheetToRows(ws) : [];
    var header = rows[0] || [];
    var iData = colIndex(header, "data_hora");
    var iNome = colIndex(header, "nome");
    var iProf = colIndex(header, "profissional");
    var contagem = {};
    rows.slice(1).forEach(function(r){
      var nome = String(r[iNome]||"").trim();
      if(!nome || !withinPeriod(parseBRDate(r[iData]), periodo.inicio, periodo.fim)) return;
      var prof = String(r[iProf]||"").trim() || '(profissional em branco)';
      if(!contagem[prof]){
        var ehEmulti = profissionaisRoster.some(function(p){ return normalizeText(p.nome) === normalizeText(prof); });
        contagem[prof] = {atendimentos: 0, "é da eMulti (aba PROFISSIONAIS)": ehEmulti};
      }
      contagem[prof].atendimentos++;
    });
    var totalEmulti = Object.keys(contagem)
      .filter(function(k){ return contagem[k]["é da eMulti (aba PROFISSIONAIS)"]; })
      .reduce(function(s,k){ return s + contagem[k].atendimentos; }, 0);
    console.log('[debugAtendimentosEmulti] equipe(s): '+estadoApp.currentEquipes.map(function(e){ return e.label; }).join(' + ')
      +' | período: '+fmtBRDate(periodo.inicio)+' a '+fmtBRDate(periodo.fim)
      +' | TOTAL "Atendimentos individuais" (só eMulti): '+totalEmulti);
    console.table(contagem);
    return contagem;
  };

  // window.debugAtividadesCompartilhadas(): imprime, linha a linha, TODAS
  // as atividades de "Resumo Atividade Coletiva" dentro do período
  // efetivo atual (mesma janela usada pelo card "Composição do
  // numerador"), com o motivo exato pelo qual cada uma ENTROU ou NÃO
  // entrou na contagem de "Atividades coletivas compartilhadas". Não há
  // filtro de tipo de atividade aqui (nenhum tipo é excluído nessa aba) —
  // só entram em jogo "Qtd total de profissionais" >= 2 e a ligação com
  // Participantes Ativ. Coletiva ("Total de Profissionais da EMulti" >= 1).
  // Chame no console: debugAtividadesCompartilhadas()
window.debugAtividadesCompartilhadas = function(){
    if(!latestWb){
      console.warn('[debugAtividadesCompartilhadas] o painel ainda não carregou nenhuma planilha.');
      return;
    }
    var periodo = periodoEfetivoAtual();
    var racWs = latestWb.Sheets[suffixedName("Resumo Atividade Coletiva")];
    var racRows = racWs ? sheetToRows(racWs) : [];
    var racHeader = racRows[0] || [];
    var iRacData = colIndex(racHeader, "data");
    var iRacTipo = colIndex(racHeader, "tipo_atividade");
    var iRacTotalProf = colIndex(racHeader, "qtd_total_profissionais");
    var iRacProfEnv = colIndex(racHeader, "qtd_profissionais_envolvidos");
    var partWs = latestWb.Sheets[suffixedName("Participantes Ativ. Coletiva")];
    var partRows = partWs ? sheetToRows(partWs) : [];
    var ligacaoAtiv = criarLigacaoAtividades(partRows, racHeader);
    if(!ligacaoAtiv){
      console.warn('[debugAtividadesCompartilhadas] não foi possível ligar "Total de Profissionais da EMulti" (aba Participantes Ativ. Coletiva) — coluna "Qtd total de profissionais" ainda é checada normalmente, mas a checagem "temEmulti" fica sempre true (não exclui nenhuma linha por isso).');
    } else {
      console.log('[debugAtividadesCompartilhadas] ligação Resumo → Participantes usando: ' + ligacaoAtiv.modo);
    }
    var linhas = racRows.slice(1)
      .filter(function(r){ return withinPeriod(parseBRDate(r[iRacData]), periodo.inicio, periodo.fim); })
      .map(function(r){
        var totalEmultiPart = ligacaoAtiv ? ligacaoAtiv.total(r) : undefined;
        var totalProfGeral = (iRacTotalProf>=0 && r[iRacTotalProf]!=="" && r[iRacTotalProf]!==undefined)
          ? toInt(r[iRacTotalProf])
          : 1+toInt(r[iRacProfEnv]);
        var temEmulti = (totalEmultiPart === undefined) ? true : totalEmultiPart >= 1;
        var tipoRaw = iRacTipo>=0 ? String(r[iRacTipo]||"").trim() : "";
        var iRacTemaDbg = colIndex(racHeader, "temas_reuniao");
        var reuniaoSemTema = tipoRaw !== "" && tipoEhReuniao(tipoRaw)
          && (iRacTemaDbg < 0 || !temaEhDiscussaoCasoPts(r[iRacTemaDbg]));
        var conta = temEmulti && totalProfGeral >= 2 && !reuniaoSemTema;
        var motivoExclusao = conta ? "" :
          (reuniaoSemTema ? 'reunião sem o tema "Discussão de caso / Projeto terapêutico singular"'
          : totalProfGeral < 2 ? 'qtd_total_profissionais < 2 (' + totalProfGeral + ')'
          : 'Total de Profissionais da EMulti = 0 (não achou ligação com Participantes)');
        return {
          data: iRacData>=0 ? String(r[iRacData]) : "",
          tipo_atividade: tipoRaw,
          qtd_total_profissionais: totalProfGeral,
          "Total Prof. EMulti (ligação)": totalEmultiPart===undefined ? "(sem ligação)" : totalEmultiPart,
          "CONTA como compartilhada?": conta ? "SIM" : "não",
          "motivo se não contou": motivoExclusao
        };
      });
    var totalLinhas = linhas.length;
    var totalCompartilhadas = linhas.filter(function(l){ return l["CONTA como compartilhada?"] === "SIM"; }).length;
    console.log('[debugAtividadesCompartilhadas] equipe(s): '+estadoApp.currentEquipes.map(function(e){ return e.label; }).join(' + ')
      +' | período: '+fmtBRDate(periodo.inicio)+' a '+fmtBRDate(periodo.fim)
      +' | linhas no período: '+totalLinhas+' | contam como compartilhada: '+totalCompartilhadas);
    console.table(linhas);
    return linhas;

  };

refreshBtn.addEventListener('click', fetchAndLoad);

renderEquipeSwitcher();
}

// ===== módulo: js/app/alinhamento-tabelas.js =====
// ======================================================================
// app/alinhamento-tabelas.js
// Alinhamento uniforme das tabelas
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================




// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_app_alinhamento_tabelas(){
  // ---------- Alinhamento uniforme das tabelas ----------
  // Centraliza cabeçalhos e células; mantém à esquerda apenas os valores
  // das colunas cujo cabeçalho contém um dos termos metodologicamente definidos.
(function aplicarAlinhamentoUniformeTabelas(){
    if(document.getElementById('alinhamentoUniformeTabelasStyles')) return;
    var style = document.createElement('style');
    style.id = 'alinhamentoUniformeTabelasStyles';
    style.textContent =
      'table th,table td{text-align:center !important;}' +
      'table thead th{text-align:center !important;}' +
      'table td[data-align-left="true"]{text-align:left !important;}';
    document.head.appendChild(style);

    var excecoes = ['profissional','nome','paciente','equipe','responsavel','participante','tipo de atividade'];
    function normalizarTitulo(texto){
      return String(texto || '').toLowerCase()
        .normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')
        .replace(/\\s+/g,' ').trim();
    }
    function alinharTabelas(root){
      var tabelas = [];
      if(root && root.matches && root.matches('table')) tabelas.push(root);
      if(root && root.querySelectorAll){
        Array.prototype.forEach.call(root.querySelectorAll('table'), function(t){ tabelas.push(t); });
      }
      tabelas.forEach(function(table){
        var headers = Array.prototype.slice.call(table.querySelectorAll('thead th'));
        if(!headers.length) return;
        var indicesEsquerda = {};
        headers.forEach(function(th){
          var titulo = normalizarTitulo(th.textContent);
          if(excecoes.some(function(termo){ return titulo.indexOf(termo) >= 0; })){
            indicesEsquerda[th.cellIndex] = true;
          }
        });
        Array.prototype.forEach.call(table.querySelectorAll('tbody td'), function(td){
          if(indicesEsquerda[td.cellIndex]) td.setAttribute('data-align-left','true');
          else td.removeAttribute('data-align-left');
        });
      });
    }
    alinharTabelas(document);
    if(document.body && typeof MutationObserver !== 'undefined'){
      var observer = new MutationObserver(function(mutations){
        mutations.forEach(function(m){
          Array.prototype.forEach.call(m.addedNodes, function(node){
            if(node.nodeType === 1) alinharTabelas(node);
          });
        });
      });
      observer.observe(document.body, {childList:true,subtree:true});
    }
  })();
}

// ===== módulo: js/app/init.js =====
// ======================================================================
// app/init.js
// Ponto de entrada: window.iniciarPainelEmulti
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Init ----------
// Só roda DEPOIS do login: o auth.js (mostrarApp) chama
// window.iniciarPainelEmulti. Antes disso nenhum dado é buscado.
var painelIniciado = false;

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_app_init(){
window.iniciarPainelEmulti = function(){
    if(painelIniciado) return;
    painelIniciado = true;
    refreshHistoryFromStorage(function(arr){
      if(arr.length){
        var latest = arr.slice().sort(function(a,b){ return b.timestamp-a.timestamp; })[0];
        estadoApp.currentRecordId = latest.id;
        renderDashboard(latest);
      }
      fetchAndLoad();
    });
  };
}

// ===== módulo: js/app/main.js =====
// ======================================================================
// app/main.js — liga tudo
// Executa o "init" de cada módulo na MESMA ordem em que o código rodava no
// app.js original (isso preserva o comportamento). Carregado por app.js.
// ======================================================================
init_nucleo_periodos();
init_nucleo_config();
init_nucleo_listas_estado();
init_nucleo_dados();
init_abas_profissionais();
init_abas_analises_calculo();
init_abas_analises_render();
init_listas_atividade_coletiva();
init_nucleo_popovers();
init_visual_gauge();
init_visual_painel_kpi();
init_abas_m1_m2();
init_app_render();
init_app_historico();
init_app_carga();
init_app_alinhamento_tabelas();
init_app_init();

// ===== ponte com o auth.js =====
// O index.html define um stub de window.iniciarPainelEmulti que só marca a chamada
// como pendente (caso o login/sessão válida aconteça antes deste módulo carregar).
// Aqui a função real (init_app_init) já foi instalada; refaz a chamada pendente.
if (window.__emultiPendente) {
  window.__emultiPendente = false;
  window.iniciarPainelEmulti();
}
