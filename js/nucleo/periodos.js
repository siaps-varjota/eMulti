// ======================================================================
// nucleo/periodos.js
// Constantes e helpers de período (quadrimestre / mês)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from './estado.js';
import { monthOptionValue, startOfMonth } from './config.js';

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
export var JANELA_MESES = 4;

// ---- Override com dados OFICIAIS (aba "Q2-26" da mesma planilha) ----
// Pra mai/jun/jul de 2026, a Secretaria já tem o resultado oficial do
// SIAPS/Ministério da Saúde (M1 e M2, por equipe e por mês), publicado
// numa aba separada da mesma planilha. Sempre que esses dados oficiais
// existirem pra um mês/equipe/indicador, eles SUBSTITUEM o valor
// calculado pelo painel a partir dos dados brutos (ver
// aplicarOverrideOficial, mais abaixo) — o cálculo próprio continua
// valendo só pros meses/indicadores sem dado oficial disponível.
export var OFFICIAL_SHEET_NAME = "SIAPS-OFICIAL";

// Quantos pontos (meses) mostrar nos gráficos de tendência — cada ponto
// é o M1/M2 daquele mês, já calculado com sua própria janela de
// JANELA_MESES meses terminando naquele mês.
export var TREND_MESES = 16;

// ---- Filtro principal da Visão geral: Quadrimestre + Mês (opcional) ----
// Quadrimestres fixos do ano civil: Q1 Jan–Abr, Q2 Mai–Ago, Q3 Set–Dez.
export var QUAD_LABELS = ['Jan–Abr (Q1)', 'Mai–Ago (Q2)', 'Set–Dez (Q3)'];

function quadrimestreDoMes(d){
  return {ano: d.getFullYear(), qIndex: Math.floor(d.getMonth()/4)};
}

// Chave/rótulo do quadrimestre de um mês, usados pra agrupar os pontos
// do gráfico de Tendência e desenhar a linha de média de cada
// quadrimestre (ver sparkline).
export function quadKeyOfDate(d){
  var q = quadrimestreDoMes(d);
  return q.ano + '-' + q.qIndex;
}

export function quadShortLabel(d){
  var q = quadrimestreDoMes(d);
  var base = QUAD_LABELS[q.qIndex].replace(/\s*\(Q\d\)/, '');
  return base + '/' + String(q.ano).slice(2);
}

// Código curto (Q1/Q2/Q3) usado só dentro do gráfico de tendência, onde
// o espaço é pequeno — o rótulo completo (quadShortLabel) fica só como
// referência textual fora do SVG.
export function quadCode(d){
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
export function mesesDosQuadsSelecionadosUniao(){
  var vistos = {}, meses = [];
  estadoApp.quadsSelecionados.forEach(function(c){
    mesesDoQuadrimestre(c.ano, c.qIndex).forEach(function(m){
      var v = monthOptionValue(m);
      if(!vistos[v]){ vistos[v] = true; meses.push(m); }
    });
  });
  meses.sort(function(a,b){ return a-b; });
  return meses;
}

export function mesesElapsedDosQuadsSelecionadosUniao(){
  var vistos = {}, meses = [];
  estadoApp.quadsSelecionados.forEach(function(c){
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
export function ultimoMesDosQuadsSelecionados(){
  var max = null;
  estadoApp.quadsSelecionados.forEach(function(c){
    var d = new Date(c.ano, c.qIndex*4+3, 1);
    if(!max || d.getTime() > max.getTime()) max = d;
  });
  return max || startOfMonth(new Date());
}

// Rótulo textual combinando todos os combos marcados, ex.: "Set–Dez
// (Q3)/2026" (1 combo) ou "Jan–Abr (Q1)/2025 + Set–Dez (Q3)/2026" (2+
// combos) — usado no texto "Média de …" ao lado dos filtros.
export function labelQuadsSelecionados(){
  return estadoApp.quadsSelecionados.slice()
    .sort(function(a,b){ return (a.ano-b.ano) || (a.qIndex-b.qIndex); })
    .map(function(c){ return QUAD_LABELS[c.qIndex]+'/'+c.ano; })
    .join(' + ');
}

// Período de um único mês (do dia 1 ao último dia do mesmo mês).
export function periodoMesUnico(d){
  var inicio = new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
  var fim = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
  return {inicio: inicio, fim: fim};
}

// Um mês é "futuro" (ainda não fechou) quando seu último dia ainda não
// chegou — usado pra marcar, no gráfico de Tendência, os pontos que na
// verdade são projeção (o mês âncora pode ir até o fim do quadrimestre
// selecionado, mesmo que ele ainda não tenha terminado — ver
// anchorMonthDate logo abaixo).
export function isMesFuturo(d){
  var fimMes = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
  return fimMes > new Date();
}

// Mês "âncora" usado pela aba Tendência: o mais recente dos meses
// escolhidos, se houver algum, ou o último mês do quadrimestre
// selecionado.
export function anchorMonthDate(){
  if(estadoApp.refMonthDates.length) return estadoApp.refMonthDates[estadoApp.refMonthDates.length-1];
  return ultimoMesDosQuadsSelecionados();
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
  // chave "centro|2026-05|M1" -> {numerador, denominador}
  estadoApp.officialOverrides = {};

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
  estadoApp.quadsSelecionados = [quadrimestreDoMes(new Date())];

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
  estadoApp.refMonthDates = [startOfMonth(new Date())];
}
