// ======================================================================
// nucleo.js
// Arquivo consolidado a partir dos módulos de js/ (ver MODULOS.md).
// Cada seção "=== módulo: ... ===" corresponde a um arquivo original.
// ======================================================================

import { aplicarMesReferencia } from './app.js';

// ===== módulo: js/nucleo/estado.js =====
// Estado compartilhado entre módulos.
// ES modules não permitem reatribuir uma variável importada; estas 13 variáveis
// eram reatribuídas em mais de um arquivo, então vivem aqui como propriedades.
// Leia/escreva sempre como estadoApp.nome
//   chaves: analisesChartInstances, analisesDataAtual, analisesEquipes, analisesProfissional, analisesProfissionalMs, analisesQuads, currentEquipes, currentRecordId, latestSheets, memoryHistory, officialOverrides, quadsSelecionados, refMonthDates
export const estadoApp = {};

// ===== módulo: js/nucleo/config.js =====
// ======================================================================
// nucleo/config.js
// Planilhas, equipes, estado dos filtros e rótulos de mês
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


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
export var EQUIPES = [
  {key:"centro", label:"EMULTI Centro", suffix:"Centro", matchKeyword:"CENTRO"},
  {key:"croata", label:"EMULTI Croatá", suffix:"Croatá", matchKeyword:"CROATA"}
];

// Indicadores de resultado (Composição do numerador, denominador etc.)
// sempre mostram a MÉDIA quando o período combina mais de um mês (ver
// mediaDeMeses) — antes havia um filtro "Tipo de Cálculo" (Soma/Média)
// na tela; foi removido a pedido, então o comportamento agora é fixo
// em "média" (cada mês entra com seu M1/M2 já calculado pela janela
// móvel de JANELA_MESES meses terminando nele, e os meses selecionados
// são combinados pela média dessas janelas — mesma lógica oficial
// usada na Tendência).
export var tipoCalculo = 'media';

export function suffixedName(baseName){
  return baseName + " — " + estadoApp.currentEquipes.map(function(e){ return e.suffix; }).join('+');
}

export function displayListName(name){
  // remove o sufixo " — Centro"/" — Croatá" só pra exibição (o título da
  // equipe já aparece no topo da página). Esse sufixo agora é só uma
  // CHAVE INTERNA de cache (ver wb.Sheets) — não é mais o nome real da
  // aba buscada no Google.
  return name.replace(/ — .+$/, '');
}

export function requiredSheetNames(){
  // Nomes REAIS das abas — sem sufixo de equipe (ver comentário acima
  // de BASE_SHEET_NAMES).
  return BASE_SHEET_NAMES.slice();
}

export function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }

export function addMonths(d, n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }

export function monthOptionValue(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0'); }

export function monthOptionLabel(d){
  var s = d.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// refMonthDates vazio: usuário está vendo a MÉDIA do quadrimestre
// (nenhum mês específico marcado). Com 1+ meses marcados, mostra o(s)
// mês(es) escolhido(s) — este helper monta o rótulo certo pros dois
// casos (usado nos lugares que exibem "Mês de referência (...)").
export function refMonthLabel(){
  if(!estadoApp.refMonthDates.length) return 'Média do quadrimestre';
  if(estadoApp.refMonthDates.length === 1) return monthOptionLabel(estadoApp.refMonthDates[0]);
  return estadoApp.refMonthDates.map(monthShortLabel).join(' + ');
}

export function monthShortLabel(d){
  var s = d.toLocaleDateString('pt-BR', {month:'short'}).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1) + '/' + String(d.getFullYear()).slice(2);
}

// Janela móvel de 4 meses (JANELA_MESES) TERMINANDO no mês de referência
// informado (ex.: referência = maio → janela = fev a maio, incluindo os
// dois extremos). "refMonth" é sempre o dia 1 do mês.
export function calcularJanelaPeriodo(refMonth){
  var fim = new Date(refMonth.getFullYear(), refMonth.getMonth()+1, 0, 23,59,59,999); // último dia do mês de referência
  var inicioMes = addMonths(refMonth, -(JANELA_MESES-1));
  var inicio = new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 1, 0,0,0,0);
  return {inicio: inicio, fim: fim};
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_nucleo_config(){
  // Agora suporta seleção múltipla: quando mais de uma equipe está
  // marcada, as linhas de AMBAS entram no cálculo (resultado combinado/
  // somado das equipes selecionadas). Sempre fica pelo menos 1 marcada.
  estadoApp.currentEquipes = EQUIPES.slice(); // padrão: Todas as equipes

  // Filtro de Equipe da aba Análises — INDEPENDENTE do filtro global do
  // topo (currentEquipes): mudar um não muda o outro (a pedido). Mesmo
  // visual/comportamento do seletor do topo (single-select + "Todas"),
  // mas filtra client-side em cima do cache bruto (latestRawSheets), sem
  // disparar um novo fetch. Começa igual ao padrão do filtro do topo.
  estadoApp.analisesEquipes = EQUIPES.slice(); // padrão: Todas as equipes

  // Quadrimestre(s) marcados no multisselect da aba Análises (array de
  // {ano, qIndex}). Vazio = comportamento padrão de sempre: histórico
  // COMPLETO, sem restringir por período. 1+ marcados: as análises
  // passam a considerar só as consultas dentro desses quadrimestres.
  estadoApp.analisesQuads = [];

  // Filtro de profissional exclusivo da aba Frequência e Retorno.
  // Vazio = todos; uma chave selecionada = apenas esse profissional.
  estadoApp.analisesProfissional = "";

  estadoApp.analisesProfissionalMs = null;
}

// ===== módulo: js/nucleo/periodos.js =====
// ======================================================================
// nucleo/periodos.js
// Constantes e helpers de período (quadrimestre / mês)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


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
export function init_nucleo_periodos(){
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

// ===== módulo: js/indicadores/calculo.js =====
// ======================================================================
// indicadores/calculo.js
// Cálculo dos indicadores M1 / M2 do período
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- "Total de Profissionais da EMulti" (coluna virtual) ----------
// Coluna calculada aqui (não existe na planilha de origem de "Participantes
// Ativ. Coletiva"): nº de profissionais DISTINTOS da eMulti (cadastrados na
// aba PROFISSIONAIS) entre "Responsavel Atividade" + "Profissional 1..5" da
// linha. Se a planilha um dia trouxer uma coluna real com esse nome, ela
// tem prioridade. É a mesma fonte usada no M2 e nas listas exibidas (aba
// Participantes Ativ. Coletiva e Resumo Atividade Coletiva).
export var TOTAL_PROF_EMULTI_HEADER = "Total de Profissionais da EMulti";

// Acha a coluna "Total de Profissionais da EMulti" mesmo com variações de
// grafia (a planilha tem "Profissionails" com erro de digitação): primeiro
// pelos apelidos conhecidos, depois por um cabeçalho que contenha
// "total" + "profission" + "emulti".
export function colTotalProfEmulti(headerRow){
  var i = colIndex(headerRow, "total_prof_emulti");
  if(i >= 0) return i;
  for(var j=0;j<headerRow.length;j++){
    var h = normalizeText(headerRow[j]);
    if(h.indexOf("TOTAL") !== -1 && h.indexOf("PROFISSION") !== -1 && h.indexOf("EMULTI") !== -1) return j;
  }
  return -1;
}

export function criarCalculadoraTotalProfEmulti(partHeader){
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
export function criarLigacaoAtividades(partRows, racHeader){
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
export function calcularIndicadoresDoPeriodo(wb, periodo){
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

  // ---- Atendimentos individuais: específicos x compartilhados (M2) ----
  // NT 44/2026: específico = registrado por apenas 1 profissional;
  // compartilhado = 2+ profissionais diferentes (CNS diferentes) com
  // pelo menos 1 da eMulti. Esta extração não traz a lista de
  // profissionais secundários do atendimento, então a detecção usa a
  // mesma aproximação da lista "Atendimentos interprofissionais": mesma
  // pessoa (CNS/CPF, ou nome) no mesmo dia atendida por 2+ profissionais
  // distintos. Cada grupo pessoa+dia compartilhado conta como 1 ação
  // compartilhada (as linhas duplicadas de ação específica são
  // desconsideradas, como manda a NT); grupos com 1 só profissional
  // contam 1 por linha, como ação específica. Só afeta o M2 — o M1
  // continua usando atendimentosIndividuais (todas as linhas).
  var iAtId = -1;
  atHeader.forEach(function(h, i){
    var key = normalizeText(h).replace(/[^A-Z0-9]/g, '');
    if(iAtId < 0 && (key === 'CNS' || key === 'CPF' || key.indexOf('CARTAONACIONALDESAUDE') >= 0 || key.indexOf('CPF') >= 0)) iAtId = i;
  });
  var gruposAtend = {};
  function chaveAtend(r){
    var d = parseBRDate(r[iData]);
    var nm = String(r[iNome]||'').trim();
    var id = iAtId >= 0 ? String(r[iAtId]||'').trim() : '';
    var pac = id ? 'ID:'+normalizeText(id).replace(/[^A-Z0-9]/g,'') : 'NOME:'+normalizeText(nm).trim();
    var dia = d ? (d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()) : '';
    return pac+'|'+dia;
  }
  // Os profissionais do grupo vêm de TODAS as linhas do período (inclui
  // profissionais fora da eMulti, ex.: eSF/eSB); só entram grupos que
  // têm ao menos 1 linha de profissional da eMulti (atFiltradas).
  atRows.slice(1).forEach(function(r){
    var nm = String(r[iNome]||'').trim();
    if(!nm || !withinPeriod(parseBRDate(r[iData]), periodo.inicio, periodo.fim)) return;
    var prof = iAtProf >= 0 ? normalizeText(String(r[iAtProf]||'')).trim() : '';
    if(!prof) return;
    var k = chaveAtend(r);
    if(!gruposAtend[k]) gruposAtend[k] = {profs:{}};
    gruposAtend[k].profs[prof] = 1;
  });
  var atendimentosEspecificos = 0;
  var gruposCompartilhados = {};
  atFiltradas.forEach(function(r){
    var k = chaveAtend(r);
    var g = gruposAtend[k];
    if(g && Object.keys(g.profs).length >= 2) gruposCompartilhados[k] = 1;
    else atendimentosEspecificos++;
  });
  var atendimentosCompartilhados = Object.keys(gruposCompartilhados).length;

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
  estadoApp.currentEquipes.forEach(function(eq){ equipesSelecionadasAc[eq.key] = true; });
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
  // EXCEÇÃO — reuniões: uma atividade do tipo "Reunião de equipe" (ou com
  // outras equipes / intersetorial) só conta como compartilhada quando o tema
  // for "Discussão de caso / Projeto terapêutico singular". Se a aba não
  // tiver coluna de temas, o tema não pode ser confirmado e ela NÃO conta.
  var iRacTema = colIndex(racHeader, "temas_reuniao");
  var atividadesCompartilhadasListas = racFiltradas.filter(function(r){
    if(iRacTipo >= 0 && tipoEhReuniao(r[iRacTipo])){
      if(iRacTema < 0 || !temaEhDiscussaoCasoPts(r[iRacTema])) return false;
    }
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
  // listar vários temas) E (c) 2+ participantes. Sem a coluna de temas
  // o tema não pode ser confirmado e a reunião NÃO conta (avisa no
  // console). Se só a coluna de tipo faltar, o filtro de tipo é ignorado.
  var iRrTema = colIndex(rrHeader, "temas_reuniao");
  var iRrTipo = colIndex(rrHeader, "tipo_reuniao");
  if(iRrTema < 0 && rrRows.length){
    console.warn('[painel] Coluna "Temas da reunião" não encontrada na aba Resumo Reuniões — o tema "Discussão de caso / Projeto terapêutico singular" não pode ser confirmado, então NENHUMA reunião entra no numerador do M2.');
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
    // Sem coluna de temas não há como confirmar o tema → não conta.
    if(iRrTema < 0) return false;
    return temaEhDiscussaoCasoPts(r[iRrTema]);
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
  var numeradorM2 = (atividadesCompartilhadasFonte === "TOTAL RELATÓRIO AC"
    ? atividadesCompartilhadas
    : atividadesCompartilhadas + reunioesCompartilhadas) + atendimentosCompartilhados;
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
  var denominadorM2 = atendimentosEspecificos + atendimentosCompartilhados + atividadesTotais + reunioesTotais;
  var m2 = denominadorM2 ? (numeradorM2/denominadorM2*100) : null;
  var classificacaoM2 = classificarM2(m2);
  // Parcela de reuniões que de fato ENTROU no numerador (0 nos meses em
  // que a fonte foi TOTAL RELATÓRIO AC, ver acima) — usada só pelos
  // cards de "Composição do numerador" (stackbar), pra o segmento de
  // reuniões não aparecer nesses meses como se tivesse contribuído.
  var reunioesCompartilhadasContrib = numeradorM2 - atendimentosCompartilhados - atividadesCompartilhadas;

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
    equipe: estadoApp.currentEquipes.map(function(e){ return e.label; }).join(' + '),
    data: {
      atendimentosIndividuais: atendimentosIndividuais,
      atendimentosEspecificos: atendimentosEspecificos,
      atendimentosCompartilhados: atendimentosCompartilhados,
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

// ===== módulo: js/nucleo/fetch-csv.js =====
// ======================================================================
// nucleo/fetch-csv.js
// Busca das abas (Apps Script) e paletas de cor por classe
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// Busca o CSV de uma aba pelo backend (Apps Script), autenticado pelo
// token da sessão. Devolve uma Promise com o texto CSV.
export function fetchSheetCsv(sheetName){
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

export function fetchAllSheets(){
  return Promise.all(requiredSheetNames().map(function(name){
    return fetchSheetCsv(name)
      .then(function(csvText){ return {name:name, csvText:csvText, ok:true}; })
      .catch(function(err){ return {name:name, error:err, ok:false}; });
  }));
}

export var CLASS_PILL_HEX = {"Ótimo":"#2F6F5E","Bom":"#6B8F71","Suficiente":"#C68A3D","Regular":"#B5474B"};

export var CLASS_ARC_HEX = {"Regular":"#E63737","Suficiente":"#F4A734","Bom":"#2BB659","Ótimo":"#2775E7"};

// Versão só um pouco mais intensa/saturada, usada apenas nos anéis da
// Visão geral (ovRingSVG) — não afeta os gauges grandes das abas M1/M2,
// que continuam usando CLASS_ARC_HEX normalmente.
export var CLASS_ARC_HEX_OV = {"Regular":"#BF2929","Suficiente":"#CF7E09","Bom":"#2A894A","Ótimo":"#1B59B5"};

// Ainda mais saturada que CLASS_ARC_HEX_OV — usada só na faixa ATIVA
// (o intervalo onde o resultado atual do gauge cai) dos anéis da Visão
// geral, pra destacar mais o intervalo certo; as demais faixas (fora do
// intervalo) continuam com CLASS_ARC_HEX_OV, só que com opacidade menor
// (ver ovRingSVG) pra ficarem ainda mais esmaecidas.
export var CLASS_ARC_HEX_OV_ATIVA = {"Regular":"#C61010","Suficiente":"#D67D00","Bom":"#15933F","Ótimo":"#0553C7"};

// ===== módulo: js/nucleo/dados.js =====
// ======================================================================
// nucleo/dados.js
// Parsing, filtro por equipe, dados oficiais, cadastro de profissionais e classificações
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Parsing ----------
export function sheetToRows(ws){
  if(Array.isArray(ws)) return ws; // já é uma matriz de linhas (vindo do parseCsv)
  return XLSX.utils.sheet_to_json(ws, {header:1, defval:""});
}

// ---------- Filtro por equipe (linha a linha) ----------
// Não existem abas separadas por equipe — cada linha da aba tem uma
// coluna "equipe_unidade" (ou similar) que identifica a equipe. Aqui a
// gente acha essa coluna e mantém só as linhas da equipe selecionada.
export function normalizeText(s){
  return String(s||"").toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

// Profissionais que de fato são da eMulti — usado só pra filtrar o
// gráfico "Comparativo por profissional" (a aba de atendimentos traz
// profissionais de fora da equipe também, ex. de outros programas que
// atenderam o mesmo paciente, e esses não devem entrar nesse
// comparativo). Comparação ignora acento/maiúscula (normalizeText).
var PROFISSIONAIS_COMPARATIVO_EMULTI;

export function ehProfissionalComparativoEmulti(nome){
  return PROFISSIONAIS_COMPARATIVO_EMULTI.indexOf(normalizeText(nome)) >= 0;
}

export function equipeColIndex(headerRow){
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

export function parseMesAbrevPt(raw){
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
export function equipeKeyFromNomeOficial(nome){
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
export function fetchOfficialOverridesSafe(){
  return fetchSheetCsv(OFFICIAL_SHEET_NAME)
    .then(function(csvText){ estadoApp.officialOverrides = parseOfficialSheetCsv(csvText); })
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
export var profissionaisRoster = [];

// Diz se um nome está cadastrado na aba PROFISSIONAIS (roster da
// eMulti). Usado em vários lugares (filtro de M1, "Pessoas atendidas",
// debug) — fica num único lugar pra não duplicar a lógica de
// normalização. O cache é reconstruído sozinho sempre que
// profissionaisRoster muda de referência (recarregou a planilha).
var rosterNomesEmultiCache = null;

var rosterNomesEmultiCacheFor = null;

export function nomeEhDaEmulti(nome){
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
export function fetchProfissionaisSafe(){
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
    var entradas = estadoApp.currentEquipes.map(function(eq){
      return estadoApp.officialOverrides[officialOverrideKey(eq.key, ano, mesIdx, indicador)];
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
export function calcularJanelaComOverride(wb, refMonth){
  var res = calcularIndicadoresDoPeriodo(wb, calcularJanelaPeriodo(refMonth));
  aplicarOverrideOficial(res.data, refMonth.getFullYear(), refMonth.getMonth());
  return res;
}

export function filtrarLinhasPorEquipe(matrix, equipes){
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
export function parseCsv(text){
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
export function parseBRDate(raw){
  var s = String(raw||"").trim();
  if(!s) return null;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return new Date(+m[3], +m[2]-1, +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return new Date(+m[1], +m[2]-1, +m[3]);
  return null;
}

export function fmtBRDate(d){
  if(!d) return "—";
  return String(d.getDate()).padStart(2,'0') + "/" + String(d.getMonth()+1).padStart(2,'0') + "/" + d.getFullYear();
}

export function withinPeriod(dateVal, inicio, fim){
  return dateVal && dateVal >= inicio && dateVal <= fim;
}

export function colIndex(headerRow, name){
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
export function colRespParticipantes(headerRow){
  if(headerRow && headerRow.length > 3) return 3;
  return colIndex(headerRow, "responsavel");
}

export function toInt(v){
  var n = parseInt(String(v===undefined||v===null?"":v).trim(), 10);
  return isNaN(n) ? 0 : n;
}

// Normaliza texto pra comparar tipo_atividade sem depender de acento,
// maiúscula/minúscula ou espaço/barra diferente ("Avaliação/Procedimento
// coletivo" vs "Avaliação / Procedimento Coletivo" etc.).
export function normalizarTexto(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/\s+/g," ").replace(/\s*\/\s*/g,"/").trim();
}

// Regra do M2 para REUNIÕES (Reunião de equipe, com outras equipes de saúde ou
// intersetorial — códigos 01-03): só entram no numerador como ação compartilhada
// quando o tema registrado é "Discussão de caso / Projeto terapêutico singular".
// A célula pode listar vários temas; basta um deles ser esse.
export function temaEhDiscussaoCasoPts(valor){
  var t = normalizarTexto(valor);
  return t.indexOf('discussao de caso') >= 0 || t.indexOf('projeto terapeutico singular') >= 0;
}
// "Reunião de equipe", "Reunião com outras equipes de saúde", "Reunião
// intersetorial…" — qualquer tipo de atividade que seja uma reunião.
export function tipoEhReuniao(valor){
  return normalizarTexto(valor).indexOf('reuniao') >= 0;
}

export var PONTOS_POR_CLASSE = {"Regular":0.25, "Suficiente":0.5, "Bom":0.75, "Ótimo":1};

// Mesmas cores dos "pills" de classificação (ver :root), usadas pra
// colorir a linha/rótulo de média de cada quadrimestre no gráfico de
// Tendência conforme a faixa em que a média cai.
var CLASS_COLOR = {"Regular":"#B5474B", "Suficiente":"#C68A3D", "Bom":"#6B8F71", "Ótimo":"#2F6F5E"};

export function classificarM1(v){
  if(v===null) return "—";
  if(v>3) return "Ótimo";
  if(v>2) return "Bom";
  if(v>1) return "Suficiente";
  return "Regular";
}

export function classificarM2(v){
  if(v===null) return "—";
  if(v>5) return "Ótimo";
  if(v>2.5) return "Bom";
  if(v>1) return "Suficiente";
  return "Regular";
}

export function classificarDesempenho(nota){
  if(nota===null) return "—";
  if(nota>7.5) return "Ótimo";
  if(nota>=5) return "Bom";
  if(nota>2.5) return "Suficiente";
  return "Regular";
}

export var NOTAS_METODOLOGICAS = [
  "Cálculo feito pelo próprio painel, direto dos dados brutos extraídos do e-SUS PEC (Atendimentos + Registro Tardio + Atividade Coletiva + Reuniões) para esta equipe/EMULTI, seguindo as fórmulas das Notas Metodológicas M1 (NT 43/2026-CGIAD/DEAPS/SAPS/MS) e M2 (NT 44/2026-CGIAD/DEAPS/SAPS/MS), na janela dos últimos 4 meses (ver 'Período' no topo da página) — não um quadrimestre fixo do calendário.",
  "M1 usa NOME da pessoa (a nota oficial usa CPF/CNS) — pessoas diferentes com o mesmo nome seriam contadas como se fossem uma só.",
  "Atendimento individual (M1) só conta quando o profissional responsável (coluna 'profissional' da aba Atendimentos) está cadastrado na aba PROFISSIONAIS como sendo da eMulti — atendimentos de profissionais de fora da eMulti não entram no numerador.",
  "Participação coletiva (M1) só conta quando pelo menos um dos profissionais da atividade (coluna do Responsável — identificada pelo nome do cabeçalho ou, se não encontrada por nome, pela 4ª coluna da tabela — ou 'Profissional 1' a 'Profissional 5' da aba Participantes Ativ. Coletiva) está cadastrado na aba PROFISSIONAIS como sendo da eMulti — participações conduzidas só por profissionais de fora da eMulti não entram no numerador.",
  "M2 oficial soma 3 componentes: atendimentos individuais compartilhados, atividades coletivas compartilhadas e compartilhamento de cuidado (PEC). Esta extração só consegue aproximar as parcelas de 'atividades coletivas' e 'reuniões'. Regra de ação compartilhada aplicada: pelo menos 1 profissional identificado (CNS/CPF) da eMulti — seja como responsável ou como profissional envolvido, não precisa ser especificamente o responsável — e 2 ou mais profissionais distintos no total; compartilhamentos com eSB ou com qualquer profissional da APS contam igual, desde que identificados. Ainda não é possível checar CBO/CNS propriamente ditos (só o cadastro da aba PROFISSIONAIS), nem aplicar a regra de descartar ação específica duplicada quando a mesma pessoa/grupo também teve ação compartilhada registrada no mesmo dia.",
  "Atendimentos individuais compartilhados são APROXIMADOS aqui (mesma pessoa, mesmo dia, 2+ profissionais distintos na lista de Atendimentos — a lista não traz os profissionais secundários nem o horário simultâneo); cada pessoa/dia compartilhado conta 1 ação e os registros específicos duplicados são desconsiderados. O compartilhamento de cuidado (PEC) NÃO entra aqui (não há aba equivalente) — por isso o M2 calculado tende a ficar ABAIXO do valor oficial. O denominador do M2 é o TOTAL de ações da eMulti no período: atendimentos individuais (específicos + compartilhados) + atividades coletivas (todas, específicas e compartilhadas, incluindo reuniões) — sem contar solicitações de compartilhamento de cuidado no PEC, pelo mesmo motivo.",
  "Atividade Coletiva só conta como 'compartilhada' aqui quando tem pelo menos 1 profissional da eMulti (coluna 'Total de Profissionais da EMulti', de Participantes Ativ. Coletiva) e 2 ou mais profissionais no total ('Qtd total de profissionais') — sem restrição de tipo de atividade, EXCETO reuniões (tipo 'Reunião de equipe' etc.): essas só contam quando o tema é 'Discussão de caso / Projeto terapêutico singular'; se a aba não trouxer coluna de temas, a reunião não entra no numerador.",
  "Reuniões (Resumo Reuniões) só contam pra M2 quando o 'Tipo' é Reunião de Equipe, Reunião com outras equipes de saúde ou Reunião intersetorial/Conselho local de saúde/Controle social (códigos 01-03) E têm 2+ participantes E o tema 'Discussão de caso / Projeto terapêutico singular' marcado na coluna 'Temas da reunião' (a célula pode ter vários temas). Reuniões que não batem essas condições aparecem no total de reuniões, mas não entram como 'compartilhadas'. Se a coluna de temas não existir na aba, NENHUMA reunião entra no numerador (o tema não pode ser confirmado). O total anual 'TOTAL RELATÓRIO AC', quando maior que a contagem detalhada, é um número fechado do relatório e não pode ser filtrado por tema.",
  "'Desempenho quadrimestral' usa a fórmula oficial da Nota Final do Componente III (Qualidade) para eMulti — NT 8/2026-DEAPS/SAPS/MS, Quadro 4: Nota final = pontos M1 × 6 + pontos M2 × 4 (pontos por classificação: Regular=0,25, Suficiente=0,5, Bom=0,75, Ótimo=1), classificada conforme o Quadro 6 da mesma nota: Regular ≤ 2,5, Suficiente > 2,5 e < 5, Bom ≥ 5 e ≤ 7,5, Ótimo > 7,5. O que NÃO é oficial aqui é o DADO de entrada: o M1 e o M2 usados nessa conta são os calculados por este painel a partir dos dados brutos (ver notas acima), não os valores publicados pelo Siaps — por isso o resultado exibido é uma aproximação do Componente III oficial, não o valor de cofinanciamento em si.",
  "Abandono consumado: o paciente precisa ter pelo menos 2 consultas. O painel calcula a mediana histórica do intervalo entre a 1ª e a 2ª consulta dos pacientes analisados e mede os dias desde a última consulta de cada paciente. Quando esse intervalo é maior que 3 vezes a mediana histórica, o paciente é classificado como abandono consumado.",
  "Classificação do acompanhamento: Em dia = dias desde a última consulta ≤ mediana; Em risco = dias desde a última consulta > mediana e ≤ 3 × mediana; Abandono consumado = dias desde a última consulta > 3 × mediana. O painel não usa um número fixo de dias: o limite é calculado dinamicamente com base no comportamento histórico dos pacientes incluídos nos filtros da aba Análises.",
  "Na aba Análises, a classificação considera o histórico inteiro ou os quadrimestres selecionados na própria aba Análises, e não necessariamente o filtro global de período.",
  "Filtro 'Fluxo' (tabela Pessoas Atendidas): calculado sobre o histórico COMPLETO de cada pessoa (Atendimentos + Participantes Ativ. Coletiva, ignorando o filtro de Mês próprio dessa tabela), na janela móvel dos últimos 4 meses terminando no último dia do mês ATUAL real (não no mês filtrado no topo da página). 'Entrada' = o primeiro atendimento/participação de todo o histórico da pessoa caiu dentro dessa janela. 'Saída' = a pessoa não tem nenhum atendimento/participação dentro dessa janela (mesmo tendo histórico anterior). Quem já vinha de antes da janela e também tem evento dentro dela (segue ativa) fica sem rótulo nessa coluna."
];

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_nucleo_dados(){
  PROFISSIONAIS_COMPARATIVO_EMULTI = [
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
}

// ===== módulo: js/nucleo/listas-estado.js =====
// ======================================================================
// nucleo/listas-estado.js
// Estado das listas complementares e armazenamento local
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Listas complementares ----------
// As abas M1 e M2 mostram as MESMAS 7 tabelas, na mesma ordem.
function listasComplementaresNomes(){ return ["Atendimentos", "Atendimentos interprofissionais", "Participantes Ativ. Coletiva", "Pessoas atendidas", "Busca-Ativa", "Resumo Reuniões", "Resumo Atividade Coletiva"].map(suffixedName); }

export function m1ListNames(){ return listasComplementaresNomes(); }

export function m2ListNames(){ return listasComplementaresNomes(); }

 // nome da aba -> {headers, rows} | {error}
// Filtro de mês (multisseleção) das listas das abas M1/M2: por lista
// (chave = nome sufixado da aba), guarda o índice da coluna de data
// encontrada e os meses atualmente marcados (["" ] vazio = todos os
// meses). Persistem entre re-renders pra não perder a seleção do
// usuário a cada atualização dos dados.
export var listDateColIdx = {};

export var listMonthFilters = {};

// "Pessoas atendidas": true quando as colunas Data 4+ estão expandidas (por container+lista).
export var listDatasExpandidas = {};

// Modelo de dados de cada lista (M1/M2): {rows, view, sortCol, sortDir}.
// Só as linhas da página atual vão pro DOM (mesmo modelo de paginação da
// tabela "Pacientes em risco de abandono"); filtro/busca/ordenação/PDF
// trabalham sobre este modelo, não sobre <tr> escondidos.
export var listModel = {};

// Acha a coluna de data de uma lista bruta, testando os nomes usados
// nas abas de origem ("data" na maioria, "data_hora" em Atendimentos).
export function dateColIndexForList(headers){
  var idx = colIndex(headers, "data_hora");
  if(idx >= 0) return idx;
  return colIndex(headers, "data");
}

// Monta as opções de mês (mais recente primeiro) a partir dos valores
// de data realmente presentes nas linhas da lista.
export function monthOptionsForList(cached, dateColIdx){
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

export var STORAGE_KEY = "uploads";

export var STORAGE_AVAILABLE;

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_nucleo_listas_estado(){
  estadoApp.latestSheets = {};

  estadoApp.currentRecordId = null;

  STORAGE_AVAILABLE = !!(window.storage && typeof window.storage.get === 'function'
    && typeof window.storage.set === 'function');

  estadoApp.memoryHistory = [];
}

// ===== módulo: js/visual/gauge.js =====
// ======================================================================
// visual/gauge.js
// Gauge (meia-lua), faixas de classificação e ícones de status
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Gauge ----------
export function polar(cx,cy,r,angleDeg){
  var a = angleDeg * Math.PI/180;
  return {x: cx + r*Math.cos(a), y: cy - r*Math.sin(a)};
}

export function arcPath(cx,cy,r,startAngle,endAngle){
  var p1 = polar(cx,cy,r,startAngle);
  var p2 = polar(cx,cy,r,endAngle);
  var large = Math.abs(startAngle-endAngle) > 180 ? 1 : 0;
  return "M "+p1.x+" "+p1.y+" A "+r+" "+r+" 0 "+large+" 1 "+p2.x+" "+p2.y;
}

export function buildGauge(value, domainMax, bands, gaugeId){
  var cx=115,cy=100,r=92,thick=16;
  // Arco de 240° — mesma abertura usada nos mini-gauges da Visão geral
  // (ver ovRingSVG), aplicada aqui pros gauges grandes das abas M1/M2 (e
  // do card de desempenho individual, que reaproveita esta função). As
  // cores das faixas (b.color, vindas de arcHex/arcHexOv) continuam
  // exatamente as mesmas de antes.
  var GAUGE_SWEEP = 240;
  var GAUGE_START = 90 + GAUGE_SWEEP/2; // 210° (era 180°)
  var bandsSvg = bands.map(function(b){
    var a1 = GAUGE_START - (b.from/domainMax)*GAUGE_SWEEP;
    var a2 = GAUGE_START - (b.to/domainMax)*GAUGE_SWEEP;
    return '<path d="'+arcPath(cx,cy,r,a1,a2)+'" stroke="'+b.color+'" stroke-width="'+thick+'" fill="none" stroke-linecap="round"/>';
  }).join('');
  var frac = (value===null || value===undefined || isNaN(value)) ? 0 : Math.max(0, Math.min(1, value/domainMax));
  var targetAngle = GAUGE_START - frac*GAUGE_SWEEP;
  var needleRotation = 180 - targetAngle; // graus a girar o ponteiro (que nasce apontando p/ 0)
  var needleLen = r - thick/2 - 6;
  var tipBase = polar(cx,cy,needleLen,180);
  // Ponteiro é desenhado sempre apontando para "0" (esquerda) e a rotação até
  // o valor real é feita via CSS puro (animation + custom property), em vez
  // de depender de JS aplicar o transform depois — isso evita que o ponteiro
  // fique "zerado" caso a atualização via JS não rode a tempo/corretamente.
  var needleSvg = '<g id="'+gaugeId+'" class="gauge-needle" style="transform-origin:'+cx+'px '+cy+'px;--target-angle:'+needleRotation+'deg;">'
    + '<line x1="'+cx+'" y1="'+cy+'" x2="'+tipBase.x+'" y2="'+tipBase.y+'" stroke="#13241F" stroke-width="3" stroke-linecap="round"/>'
    + '<circle cx="'+cx+'" cy="'+cy+'" r="5.5" fill="#13241F"/></g>';
  // Altura do viewBox recalculada pra abertura de 240°: com cy=100 o topo
  // do arco (90°) encosta em y=0 e a ponta inferior das faixas (210°/-30°)
  // termina em y=154 — antes era um semicírculo puro (0 0 230 134); agora
  // as pontas descem abaixo do centro, então a caixa ficou mais alta pra
  // não cortar as bordas do arco (ver também .gauge-value no CSS, cujo
  // margin-top foi recalculado pra continuar "colado" no ponteiro).
  return '<svg class="gauge-svg" viewBox="0 0 230 154">'+bandsSvg+needleSvg+'</svg>';
}

export function animateGauges(){
  // Mantida como no-op por compatibilidade com as chamadas existentes em
  // renderDashboard(); a animação agora é 100% CSS (ver .gauge-needle).
}

export var CLASS_BANDS_M1;

export var CLASS_BANDS_M2;

var CLASS_BANDS_NOTA;

// Mesmas faixas, só que com a cor mais intensa (arcHexOv) — usadas
// apenas nos anéis da Visão geral (overviewCardHTML/ovRingSVG).
export var CLASS_BANDS_M1_OV;

export var CLASS_BANDS_M2_OV;

export var CLASS_BANDS_NOTA_OV;

export function gaugeLegendHTML(items){
  return '<div class="gauge-legend">' + items.map(function(it){
    return '<span><i style="background:'+it.color+'"></i>'+it.label+' '+it.cond+'</span>';
  }).join('') + '</div>';
}

export var LEGEND_M1;

export var LEGEND_M2;

var LEGEND_NOTA;

// ---------- Cartões da Visão geral (modelo "ícone + anel + evolução") ----------
// Cor por STATUS (não mais por indicador): o ícone, o anel e o badge de
// cada cartão seguem a classificação atual daquele indicador.
var OV_STATUS;

var OV_STATUS_FALLBACK = {accent:'#6b7280', badgeBg:'#f3f4f6', badgeText:'#374151', icon:'•', barColor:'#d1d5db'};

export function ovStatus(classe){ return OV_STATUS[classe] || OV_STATUS_FALLBACK; }

export var OV_ICONS = {
  pulse: '<path d="M3 12h4l2-7 4 14 2-7h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  users: '<circle cx="8.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.3 13.6c2.6.3 4.7 2.3 4.7 5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  share: '<path d="M8.2 11l7.6-4.2M8.2 13l7.6 4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="5.5" r="3" fill="currentColor"/><circle cx="18" cy="18.5" r="3" fill="currentColor"/>',
  trophy: '<path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0V4z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 6H4.5v1.6A3 3 0 0 0 7.6 10.6M16.5 6h3v1.6a3 3 0 0 1-3.1 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 13.8V17M8.5 20h7M9.5 17h5v3h-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  speed: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12l4.5-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'
};

export function ovIconHTML(kind, st){
  return '<div class="ov-icon" style="background:'+st.badgeBg+';color:'+st.accent+';">'
    + '<svg viewBox="0 0 24 24">'+OV_ICONS[kind]+'</svg></div>';
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_visual_gauge(){
  CLASS_BANDS_M1 = [
    {from:0,to:1,classe:"Regular",color:arcHex("Regular")},
    {from:1,to:2,classe:"Suficiente",color:arcHex("Suficiente")},
    {from:2,to:3,classe:"Bom",color:arcHex("Bom")},
    {from:3,to:4,classe:"Ótimo",color:arcHex("Ótimo")}
  ];

  CLASS_BANDS_M2 = [
    {from:0,to:1,classe:"Regular",color:arcHex("Regular")},
    {from:1,to:2.5,classe:"Suficiente",color:arcHex("Suficiente")},
    {from:2.5,to:5,classe:"Bom",color:arcHex("Bom")},
    {from:5,to:8,classe:"Ótimo",color:arcHex("Ótimo")}
  ];

  CLASS_BANDS_NOTA = [
    {from:0,to:2.5,classe:"Regular",color:arcHex("Regular")},
    {from:2.5,to:5,classe:"Suficiente",color:arcHex("Suficiente")},
    {from:5,to:7.5,classe:"Bom",color:arcHex("Bom")},
    {from:7.5,to:10,classe:"Ótimo",color:arcHex("Ótimo")}
  ];

  CLASS_BANDS_M1_OV = [
    {from:0,to:1,classe:"Regular",color:arcHexOv("Regular")},
    {from:1,to:2,classe:"Suficiente",color:arcHexOv("Suficiente")},
    {from:2,to:3,classe:"Bom",color:arcHexOv("Bom")},
    {from:3,to:4,classe:"Ótimo",color:arcHexOv("Ótimo")}
  ];

  CLASS_BANDS_M2_OV = [
    {from:0,to:1,classe:"Regular",color:arcHexOv("Regular")},
    {from:1,to:2.5,classe:"Suficiente",color:arcHexOv("Suficiente")},
    {from:2.5,to:5,classe:"Bom",color:arcHexOv("Bom")},
    {from:5,to:8,classe:"Ótimo",color:arcHexOv("Ótimo")}
  ];

  CLASS_BANDS_NOTA_OV = [
    {from:0,to:2.5,classe:"Regular",color:arcHexOv("Regular")},
    {from:2.5,to:5,classe:"Suficiente",color:arcHexOv("Suficiente")},
    {from:5,to:7.5,classe:"Bom",color:arcHexOv("Bom")},
    {from:7.5,to:10,classe:"Ótimo",color:arcHexOv("Ótimo")}
  ];

  LEGEND_M1 = [
    {label:'Ótimo',      cond:'&gt; 3',           color:arcHex('Ótimo')},
    {label:'Bom',        cond:'&gt; 2 e ≤ 3',     color:arcHex('Bom')},
    {label:'Suficiente', cond:'&gt; 1 e ≤ 2',     color:arcHex('Suficiente')},
    {label:'Regular',    cond:'≤ 1',              color:arcHex('Regular')}
  ];

  LEGEND_M2 = [
    {label:'Ótimo',      cond:'&gt; 5%',              color:arcHex('Ótimo')},
    {label:'Bom',        cond:'&gt; 2,5% e ≤ 5%',     color:arcHex('Bom')},
    {label:'Suficiente', cond:'&gt; 1% e ≤ 2,5%',     color:arcHex('Suficiente')},
    {label:'Regular',    cond:'≤ 1%',                 color:arcHex('Regular')}
  ];

  LEGEND_NOTA = [
    {label:'Ótimo',      cond:'&gt; 7,5',            color:arcHex('Ótimo')},
    {label:'Bom',        cond:'≥ 5 e ≤ 7,5',         color:arcHex('Bom')},
    {label:'Suficiente', cond:'&gt; 2,5 e &lt; 5',   color:arcHex('Suficiente')},
    {label:'Regular',    cond:'≤ 2,5',               color:arcHex('Regular')}
  ];

  OV_STATUS = {
    'Ótimo':      {accent:arcHexOv('Ótimo'), badgeBg:'#eff6ff', badgeText:'#1e40af', icon:'★', barColor:arcHexOv('Ótimo')},
    'Bom':        {accent:arcHexOv('Bom'), badgeBg:'#dcfce7', badgeText:'#166534', icon:'↗', barColor:arcHexOv('Bom')},
    'Suficiente': {accent:arcHexOv('Suficiente'), badgeBg:'#ffedd5', badgeText:'#9a3412', icon:'→', barColor:arcHexOv('Suficiente')},
    'Regular':    {accent:arcHexOv('Regular'), badgeBg:'#fee2e2', badgeText:'#991b1b', icon:'↘', barColor:arcHexOv('Regular')}
  };
}

// ===== módulo: js/nucleo/utils.js =====
// ======================================================================
// nucleo/utils.js
// Formatação, escape, cores e textos de interpretação
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Helpers ----------
export function fmtInt(v){
  if(v===null||v===undefined||isNaN(v)) return "—";
  return Number(v).toLocaleString('pt-BR');
}

export function fmtDec(v,d){
  if(v===null||v===undefined||isNaN(v)) return "—";
  return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
}

export function fmtDate(ts){
  var d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + " às " + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function shortDate(ts){
  var d = new Date(ts);
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}

export function escapeHtml(s){
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
export function debounce(fn, ms){
  var timer = null;
  return function(){
    var args = arguments, ctx = this;
    clearTimeout(timer);
    timer = setTimeout(function(){ fn.apply(ctx, args); }, ms);
  };
}

export function pillHex(c){ return CLASS_PILL_HEX[c] || "#9AA69E"; }

export function arcHex(c){ return CLASS_ARC_HEX[c] || "#9AA69E"; }

export function arcHexOv(c){ return CLASS_ARC_HEX_OV[c] || "#9AA69E"; }

export function arcHexOvAtiva(c){ return CLASS_ARC_HEX_OV_ATIVA[c] || "#9AA69E"; }

// Texto descritivo da caixa "Interpretação" do card de gauge das abas
// M1/M2, de acordo com a classificação atual do indicador.
var GAUGE_INTERPRETATION = {
  'Regular':    'indicando necessidade de atenção nas ações do programa.',
  'Suficiente': 'mostrando um desempenho satisfatório das ações do programa.',
  'Bom':        'mostrando um desempenho positivo das ações do programa.',
  'Ótimo':      'mostrando um desempenho excelente das ações do programa.'
};

export function gaugeInterpretationHTML(classLabel){
  var txt = GAUGE_INTERPRETATION[classLabel] || 'refletindo o desempenho atual das ações do programa.';
  return 'O indicador está em nível <b>'+(classLabel||'—')+'</b>, '+txt;
}

// Cabeçalho dos cards de Numerador/Denominador: ícone de pessoas +
// título + badge com o valor total, no modelo das imagens de referência.
export function compCardHeaderHTML(title, totalValue){
  return '<div class="comp-card-head">'
    + '<div class="comp-card-icon"><svg viewBox="0 0 24 24">'+OV_ICONS.users+'</svg></div>'
    + '<h4>'+title+'</h4>'
    + '<span class="comp-card-total">'+fmtInt(totalValue)+'</span>'
    + '</div>';
}

// ===== módulo: js/nucleo/multiselect.js =====
// ======================================================================
// nucleo/multiselect.js
// Componente createMultiSelect (Equipe / Quadrimestre / Mês)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Multi-select arredondado (Equipe / Quadrimestre / Mês) ----------
// Componente genérico: em modo multi:true permite marcar vários valores
// (com "Selecionar tudo"/"Limpar" e tags abaixo do botão); em modo
// multi:false funciona como um "select" de valor único, mas com o
// mesmo visual arredondado — clicar numa opção troca a seleção e fecha.
export function createMultiSelect(container, cfg){
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

// ===== módulo: js/visual/painel-kpi.js =====
// ======================================================================
// visual/painel-kpi.js
// Painel "número grande", legenda e cartões da Visão geral (anel)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Painel "número grande" (substitui os gauges/anéis) ----------
// Cada indicador agora mostra o resultado como um número grande dentro de
// um painel suave na cor do status (Ótimo/Bom/Suficiente/Regular), com o
// ícone em círculo ao lado e a legenda "X ÷ Y" logo abaixo. As cores vêm
// de ovStatus() — as mesmas do badge e da borda do cartão.
function injectKpiStyles(){
  if(document.getElementById('kpiPanelStyles')) return;
  var css = ''
    + '.kpi-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}'
    + '.kpi-head-title{margin:0;font-size:15px;font-weight:700;line-height:1.25}'
    + '.kpi-panel{border-radius:18px;padding:16px 14px 14px;margin:12px 0 14px;text-align:center;'
    +   'background:var(--kpi-bg);background:color-mix(in srgb,var(--kpi-bg) 45%,#fff)}'
    + '.kpi-main{display:flex;align-items:center;justify-content:center;gap:clamp(10px,2vw,18px)}'
    + '.kpi-icon{flex:none;width:clamp(38px,4vw,48px);height:clamp(38px,4vw,48px);border-radius:50%;'
    +   'display:grid;place-items:center;color:var(--kpi-accent);'
    +   'background:var(--kpi-bg);background:color-mix(in srgb,var(--kpi-accent) 14%,transparent)}'
    + '.kpi-icon svg{width:50%;height:50%}'
    + '.kpi-value{font-weight:800;font-size:clamp(30px,3.6vw,44px);line-height:1;letter-spacing:-.02em;'
    +   'color:var(--kpi-accent);font-variant-numeric:tabular-nums}'
    + '.kpi-value .unit{font-size:.45em;font-weight:700;letter-spacing:0;margin-left:.08em}'
    + '.kpi-donut{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px}'
    + '.kpi-donut svg{width:clamp(70px,6.8vw,86px);height:auto;display:block}'
    + '.kpi-donut-label{font-size:10.5px;line-height:1.1;font-weight:600;color:var(--kpi-accent);opacity:.85}'
    + '.kpi-caption{margin:12px 0 0;font-size:14px;line-height:1.35;color:var(--ink,#2b3a35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
  var el = document.createElement('style');
  el.id = 'kpiPanelStyles';
  el.textContent = css;
  document.head.appendChild(el);
}

// Legenda do painel sempre em UMA linha: se o texto não cabe na largura
// do card, a fonte encolhe (de 14px até no mínimo 9px) até caber. Roda
// sempre que o DOM muda (cards re-renderizados) e quando o painel muda
// de tamanho (resize da janela, troca de aba que estava oculta).
var kpiFitRO;

function fitKpiCaptions(fromRO){
  var caps = document.querySelectorAll('.kpi-caption');
  Array.prototype.forEach.call(caps, function(cap){
    if(kpiFitRO && !fromRO && cap.parentNode) kpiFitRO.observe(cap.parentNode);
    if(!cap.clientWidth) return; // aba oculta: reajusta quando ficar visível
    cap.style.fontSize = '';
    var size = parseFloat(getComputedStyle(cap).fontSize) || 14;
    while(cap.scrollWidth > cap.clientWidth + 0.5 && size > 9){
      size -= 0.5;
      cap.style.fontSize = size + 'px';
    }
  });
}

var kpiFitDebounced;

// Meta "Ótimo" de cada escala (o valor a partir do qual o indicador vira
// Ótimo — ver OV_LEGEND_*): M1 > 3 (escala 0–4), M2 > 5% (escala 0–8),
// Desempenho = nota 10 (máxima da escala 0–10). 100% do donut = esse valor atingido.
var KPI_META_OTIMA = {4:3, 8:5, 10:10};

function kpiDonutHTML(value, domainMax, st){
  var meta = KPI_META_OTIMA[domainMax];
  if(value==null || isNaN(value) || !meta) return '';
  var pct = (value/meta)*100;
  var frac = Math.max(0, Math.min(1, value/meta));
  var r = 26, c = 2*Math.PI*r;
  // Anel também na cor da borda (st.accent), igual ao número grande —
  // st.badgeText ficou só pro texto do selo "→ Suficiente" etc.
  return '<div class="kpi-donut" title="'+fmtDec(pct,0)+'% '+(domainMax===10?'da nota máxima':'da meta Ótimo')+' (100% = '+fmtDec(meta,meta%1?1:0)+')">'
    + '<svg viewBox="0 0 64 64">'
    +   '<circle cx="32" cy="32" r="'+r+'" fill="none" stroke="'+st.accent+'" stroke-opacity=".16" stroke-width="8"/>'
    +   '<circle cx="32" cy="32" r="'+r+'" fill="none" stroke="'+st.accent+'" stroke-width="8" stroke-linecap="round"'
    +     ' stroke-dasharray="'+(frac*c).toFixed(2)+' '+c.toFixed(2)+'" transform="rotate(-90 32 32)"/>'
    +   '<text x="32" y="36.5" text-anchor="middle" font-size="13" font-weight="800" fill="'+st.accent+'">'+fmtDec(pct,0)+'%</text>'
    + '</svg>'
    + '<span class="kpi-donut-label">'+(domainMax===10?'da nota máxima':'da meta Ótimo')+'</span>'
    + '</div>';
}

// Ícone do painel por indicador: M1 (pulse) → pessoas, M2 (users) → compartilhamento, Desempenho → troféu.
export function kpiPanelIcon(kind){ return kind==='pulse' ? 'users' : (kind==='users' ? 'share' : 'trophy'); }

export function kpiPanelHTML(st, iconKind, valueHtml, caption, value, domainMax){
  // Número grande, ícone e "% da meta" usam a MESMA cor da borda do
  // cartão (st.accent) — antes usavam st.badgeText, que é uma cor à
  // parte (pensada pro contraste do badge "→ Suficiente" etc.) e por
  // isso destoava da borda em alguns status (ex.: Suficiente ficava
  // avermelhado enquanto a borda é laranja).
  return '<div class="kpi-panel" style="--kpi-accent:'+st.accent+';--kpi-bg:'+st.badgeBg+';">'
    +   '<div class="kpi-main">'
    +     '<div class="kpi-icon"><svg viewBox="0 0 24 24">'+OV_ICONS[iconKind]+'</svg></div>'
    +     '<div class="kpi-value">'+valueHtml+'</div>'
    +     kpiDonutHTML(value, domainMax, st)
    +   '</div>'
    +   (caption ? '<p class="kpi-caption">'+caption+'</p>' : '')
    + '</div>';
}

// Anel de progresso (valor ÷ domainMax) — usado no lugar do arco meia-lua
// nos cartões da Visão geral.
function ovRingSVG(value, domainMax, bands, classeAtual, st, gaugeId){
  // Arco de 240° (era meia lua de 180°): faixas proporcionais ao
  // domainMax, só a faixa do valor atual em cor cheia, as demais
  // esmaecidas, e um ponteiro indicando a posição exata do valor.
  // GAUGE_SWEEP/GAUGE_START controlam a abertura — as cores das faixas
  // continuam exatamente as mesmas de antes (vêm de b.color/st.accent).
  // cy foi recalculado pra o topo do arco (90°) encostar em y=0, e h
  // aumentado pra caber as pontas do arco (que agora descem abaixo do
  // centro) mais os mesmos 24px de "vão" reservados na base pro número
  // grande (.ov-value) continuar mordendo o mesmo espaço via margin-top
  // negativo (ver .ov-value no CSS) — nada mudou nesse comportamento.
  var GAUGE_SWEEP = 240;
  var GAUGE_START = 90 + GAUGE_SWEEP/2; // 210° (era 180°)
  var w=140, h=125, cx=70, cy=65, r=58, thick=14;
  if(!bands || !bands.length){
    // fallback: se não vier bands, desenha só uma faixa cheia até o valor
    // (mesma lógica de antes, agora em formato de 240°).
    var frac0 = (value==null || !domainMax) ? 0 : Math.max(0, Math.min(1, value/domainMax));
    var a0 = GAUGE_START - frac0*GAUGE_SWEEP;
    return '<svg class="gauge-svg ov-ring-svg" viewBox="0 0 '+w+' '+h+'">'
      + '<path d="'+arcPath(cx,cy,r,GAUGE_START,GAUGE_START-GAUGE_SWEEP)+'" stroke="'+st.badgeBg+'" stroke-width="'+thick+'" fill="none"/>'
      + '<path d="'+arcPath(cx,cy,r,GAUGE_START,a0)+'" stroke="'+st.accent+'" stroke-width="'+thick+'" fill="none" stroke-linecap="round"/>'
      + '</svg>';
  }
  var bandsSvg = bands.map(function(b){
    var a1 = GAUGE_START - (b.from/domainMax)*GAUGE_SWEEP;
    var a2 = GAUGE_START - (b.to/domainMax)*GAUGE_SWEEP;
    var ativa = (b.classe === classeAtual);
    // Faixa do resultado atual: cor mais saturada (arcHexOvAtiva) e
    // opacidade cheia. Demais faixas (fora do intervalo): cor normal
    // (b.color/arcHexOv), bem mais esmaecidas (opacidade baixa).
    var cor = ativa ? arcHexOvAtiva(b.classe) : b.color;
    return '<path d="'+arcPath(cx,cy,r,a1,a2)+'" stroke="'+cor+'" stroke-width="'+thick+'" fill="none" stroke-opacity="'+(ativa?1:0.28)+'"/>';
  }).join('');
  var frac = (value===null || value===undefined || isNaN(value)) ? 0 : Math.max(0, Math.min(1, value/domainMax));
  var targetAngle = GAUGE_START - frac*GAUGE_SWEEP;
  var needleRotation = 180 - targetAngle; // graus a girar o ponteiro (que nasce apontando p/ 0)
  var needleLen = r - thick/2 - 5;
  var tipBase = polar(cx,cy,needleLen,180);
  // Ponteiro sempre desenhado apontando pra "0" (esquerda) e girado até o
  // valor real via CSS (.gauge-needle + --target-angle) — mesma técnica
  // usada no gauge de 240° das abas M1/M2, pra ter o mesmo efeito de
  // movimento em vez de aparecer já na posição final.
  var needleSvg = '<g id="'+gaugeId+'" class="gauge-needle" style="transform-origin:'+cx+'px '+cy+'px;--target-angle:'+needleRotation+'deg;">'
    + '<line x1="'+cx+'" y1="'+cy+'" x2="'+tipBase.x+'" y2="'+tipBase.y+'" stroke="#13241F" stroke-width="2.5" stroke-linecap="round"/>'
    + '<circle cx="'+cx+'" cy="'+cy+'" r="4.5" fill="#13241F"/></g>';
  return '<svg class="gauge-svg ov-ring-svg" viewBox="0 0 '+w+' '+h+'">'+bandsSvg+needleSvg+'</svg>';
}

// Régua de faixas (Regular → Ótimo) no rodapé do card, cada chip com a
// cor do respectivo status.
export function ovLegendHTML(items){
  var out = items.map(function(it){
    var st = ovStatus(it.classe);
    return '<div class="ov-legend-item">'
      + '<span class="ov-legend-swatch" style="background:'+st.barColor+';"></span>'
      + '<span class="ov-legend-text"><b>'+it.cond+'</b> '+it.classe+'</span>'
      + '</div>';
  }).join('');
  return '<div class="ov-legend">'+out+'</div>';
}

export var OV_LEGEND_M1 = [
  {classe:'Regular',    cond:'≤ 1'},
  {classe:'Suficiente', cond:'&gt; 1 e ≤ 2'},
  {classe:'Bom',        cond:'&gt; 2 e ≤ 3'},
  {classe:'Ótimo',      cond:'&gt; 3'}
];

export var OV_LEGEND_M2 = [
  {classe:'Regular',    cond:'≤ 1%'},
  {classe:'Suficiente', cond:'&gt; 1% e ≤ 2,5%'},
  {classe:'Bom',        cond:'&gt; 2,5% e ≤ 5%'},
  {classe:'Ótimo',      cond:'&gt; 5%'}
];

export var OV_LEGEND_NOTA = [
  {classe:'Regular',    cond:'≤ 2,5'},
  {classe:'Suficiente', cond:'&gt; 2,5 e &lt; 5'},
  {classe:'Bom',        cond:'≥ 5 e ≤ 7,5'},
  {classe:'Ótimo',      cond:'&gt; 7,5'}
];

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_visual_painel_kpi(){
injectKpiStyles();

  kpiFitRO = window.ResizeObserver ? new ResizeObserver(debounce(function(){ fitKpiCaptions(true); }, 60)) : null;

  kpiFitDebounced = debounce(function(){ fitKpiCaptions(false); }, 30);

if(window.MutationObserver){
    new MutationObserver(kpiFitDebounced).observe(document.body, {childList:true, subtree:true});
  }

window.addEventListener('resize', kpiFitDebounced);

kpiFitDebounced();
}

// ===== módulo: js/nucleo/seletores-periodo.js =====
// ======================================================================
// nucleo/seletores-periodo.js
// Série de tendência e seletores de Ano / Quadrimestre / Mês
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// Série pra tendência: um ponto por mês (os últimos TREND_MESES meses,
// terminando no mês de referência selecionado), cada um com sua PRÓPRIA
// janela móvel de JANELA_MESES meses (não é o mesmo período repetido).
export function calcularSerieTendencia(wb, refMonth, n){
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
export var quadMs = null;
export var anoMs = null;
export var mesMs = null;

// Remove duplicatas de um array de strings e ordena — usado só pra
// sincronizar os widgets anoMs/quadMs com quadsSelecionados.
export function valoresUnicosOrdenados(arr){
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
    if(anoMs) anoMs.setSelected(valoresUnicosOrdenados(estadoApp.quadsSelecionados.map(function(c){ return String(c.ano); })));
    if(quadMs) quadMs.setSelected(valoresUnicosOrdenados(estadoApp.quadsSelecionados.map(function(c){ return String(c.qIndex); })));
    return;
  }
  var combos = [];
  anos.forEach(function(ano){
    qIdxs.forEach(function(qIndex){ combos.push({ano:ano, qIndex:qIndex}); });
  });
  combos.sort(function(a,b){ return (a.ano-b.ano) || (a.qIndex-b.qIndex); });
  estadoApp.quadsSelecionados = combos;
  estadoApp.refMonthDates = []; // volta a mostrar a média do(s) quadrimestre(s) escolhido(s)
  populateMonthSelectForQuad();
  aplicarMesReferencia(false);
}

export function populateAnoQuadSelects(){
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

  anoMs.setSelected(valoresUnicosOrdenados(estadoApp.quadsSelecionados.map(function(c){ return String(c.ano); })));
  quadMs.setSelected(valoresUnicosOrdenados(estadoApp.quadsSelecionados.map(function(c){ return String(c.qIndex); })));
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
        estadoApp.refMonthDates = keys.map(function(v){
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
  estadoApp.refMonthDates = estadoApp.refMonthDates.filter(function(d){ return mesesValidos.indexOf(monthOptionValue(d)) >= 0; });
  mesMs.setOptions(opts);
  mesMs.setSelected(estadoApp.refMonthDates.map(monthOptionValue));
}

// ===== módulo: js/indicadores/media-meses.js =====
// ======================================================================
// indicadores/media-meses.js
// Média de indicadores por meses
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


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
export function mediaDeMeses(resultadosMensais, resultadosJanela, mesesProjecaoLabel){
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
    equipe: estadoApp.currentEquipes.map(function(e){ return e.label; }).join(' + '),
    data: {
      atendimentosIndividuais: soma('atendimentosIndividuais'),
      atendimentosEspecificos: soma('atendimentosEspecificos'),
      atendimentosCompartilhados: soma('atendimentosCompartilhados'),
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
      atendimentosEspecificosJanela: campoExibicao('atendimentosEspecificos'),
      atendimentosCompartilhadosJanela: campoExibicao('atendimentosCompartilhados'),
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

// ===== módulo: js/nucleo/popovers.js =====
// ======================================================================
// nucleo/popovers.js
// Popovers "Também atendido por…" e de informação (ícone i)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Popover "Também atendido por…" (coluna Profissional, lista
// de risco de abandono) ----------
// Um único elemento reaproveitado pra todos os botões "+N" (criado sob
// demanda no primeiro clique), posicionado perto do botão clicado via
// getBoundingClientRect. Fecha ao clicar fora, rolar a página ou
// redimensionar a janela.
var profPopEl = null;

function profPopGarantirEl(){
  if(profPopEl) return profPopEl;
  var el = document.createElement('div');
  el.className = 'prof-pop';
  document.body.appendChild(el);
  profPopEl = el;
  document.addEventListener('click', function(ev){
    if(!profPopEl || !profPopEl.classList.contains('is-open')) return;
    if(profPopEl.contains(ev.target)) return;
    if(ev.target.closest && ev.target.closest('.prof-mais-btn')) return;
    fecharProfPopover();
  });
  window.addEventListener('scroll', fecharProfPopover, true);
  window.addEventListener('resize', fecharProfPopover);
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape') fecharProfPopover(); });
  return el;
}

function fecharProfPopover(){
  if(profPopEl) profPopEl.classList.remove('is-open');
}

// itens: [{nome, data}] já com "data" como TEXTO formatado (fmtBRDate já
// aplicado por quem chamou) — ver profissionalCelulaHtml.
function abrirProfPopover(btnEl, itens){
  var el = profPopGarantirEl();
  el.innerHTML = '<div class="prof-pop-title">Também atendido por</div>'
    + (itens.length
        ? itens.map(function(it){
            var tipoHtml = it.tipo ? '<div class="prof-pop-tipo">'+escapeHtml(it.tipo)+'</div>' : '';
            return '<div class="prof-pop-item"><div class="prof-pop-item-row"><span>'+escapeHtml(it.nome)+'</span><span>'+escapeHtml(it.data||'—')+'</span></div>'+tipoHtml+'</div>';
          }).join('')
        : '<div class="prof-pop-item"><span>—</span></div>');
  el.classList.add('is-open');
  // Reseta a posição antes de medir (garante que a largura/altura
  // calculadas sejam as do conteúdo novo, não de um popover anterior
  // maior/menor ainda no DOM).
  el.style.left = '0px';
  el.style.top = '0px';
  var r = btnEl.getBoundingClientRect();
  var rect = el.getBoundingClientRect();
  var left = Math.min(r.left, window.innerWidth - rect.width - 10);
  left = Math.max(8, left);
  var top = r.bottom + 6;
  if(top + rect.height > window.innerHeight - 8){ top = r.top - rect.height - 6; }
  if(top < 8) top = 8;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

// ---------- Popover de informação (ícone "i" nas legendas dos cards de
// Composição — Numerador/Denominador M1 e M2) ----------
// Mesmo padrão do popover de profissionais acima (elemento único
// reaproveitado, fecha ao clicar fora/rolar/redimensionar/Esc), só que
// com texto simples em vez de lista — usado pra mostrar a definição
// oficial (Nota Metodológica M1/M2) de cada parcela ao TOCAR/CLICAR no
// ícone "i" (funciona no celular, diferente de tooltip por hover).
var legendInfoPopEl = null;

function legendInfoPopGarantirEl(){
  if(legendInfoPopEl) return legendInfoPopEl;
  var el = document.createElement('div');
  el.className = 'prof-pop legend-info-pop';
  document.body.appendChild(el);
  legendInfoPopEl = el;
  document.addEventListener('click', function(ev){
    if(!legendInfoPopEl || !legendInfoPopEl.classList.contains('is-open')) return;
    if(legendInfoPopEl.contains(ev.target)) return;
    if(ev.target.closest && ev.target.closest('.legend-info-btn')) return;
    fecharLegendInfoPopover();
  });
  window.addEventListener('scroll', fecharLegendInfoPopover, true);
  window.addEventListener('resize', fecharLegendInfoPopover);
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape') fecharLegendInfoPopover(); });
  return el;
}

function fecharLegendInfoPopover(){
  if(legendInfoPopEl) legendInfoPopEl.classList.remove('is-open');
}

function abrirLegendInfoPopover(btnEl, texto){
  var el = legendInfoPopGarantirEl();
  el.innerHTML = escapeHtml(texto);
  el.classList.add('is-open');
  // Reseta a posição antes de medir (garante que a largura/altura
  // calculadas sejam as do conteúdo novo, não de um popover anterior
  // maior/menor ainda no DOM).
  el.style.left = '0px';
  el.style.top = '0px';
  var r = btnEl.getBoundingClientRect();
  var rect = el.getBoundingClientRect();
  var left = Math.min(r.left, window.innerWidth - rect.width - 10);
  left = Math.max(8, left);
  var top = r.bottom + 6;
  if(top + rect.height > window.innerHeight - 8){ top = r.top - rect.height - 6; }
  if(top < 8) top = 8;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_nucleo_popovers(){
  // Listener delegado ÚNICO (no document, sobrevive a qualquer re-render)
  // pro botão "+N" da coluna Profissional — usado tanto pela tabela
  // "Pacientes em risco de abandono" quanto por "Pessoas Atendidas" (e
  // qualquer outra lista futura que use profissionalBadgeHtml).
document.addEventListener('click', function(ev){
    var btn = ev.target.closest ? ev.target.closest('.prof-mais-btn') : null;
    if(!btn) return;
    ev.stopPropagation();
    var raw = btn.getAttribute('data-prof-extra') || '';
    var itens = [];
    try{
      itens = (JSON.parse(decodeURIComponent(raw)) || []).map(function(it){
        return {nome: it.n, data: it.d, tipo: it.t};
      });
    }catch(e){}
    abrirProfPopover(btn, itens);
  });

document.addEventListener('click', function(ev){
    var btn = ev.target.closest ? ev.target.closest('.legend-info-btn') : null;
    if(!btn) return;
    ev.stopPropagation();
    var raw = btn.getAttribute('data-info-text') || '';
    var texto = '';
    try{ texto = decodeURIComponent(raw); }catch(e){}
    abrirLegendInfoPopover(btn, texto);
  });
}

