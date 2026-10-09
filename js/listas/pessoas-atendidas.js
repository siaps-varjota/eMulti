// ======================================================================
// listas/pessoas-atendidas.js
// Listas — pessoas atendidas
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../nucleo/estado.js';
import { profissionalBadgeHtml } from '../abas/analises/risco.js';
import { colsProfissionaisParticipantes } from './atividade-coletiva.js';
import { EQUIPES, calcularJanelaPeriodo, monthOptionLabel, monthOptionValue, suffixedName } from '../nucleo/config.js';
import { colIndex, fmtBRDate, nomeEhDaEmulti, normalizeText, parseBRDate, withinPeriod } from '../nucleo/dados.js';

// ---------- Listas ----------
// "Pessoas atendidas" com filtro de mês PRÓPRIO (independente do filtro
// de Mês do topo): deduplica direto de Atendimentos + Participantes
// Ativ. Coletiva (já filtradas por equipe no fetch), sem depender de
// nenhum link/aba externa. monthValues vazio = todos os meses
// disponíveis (sem filtro); com meses marcados, só entram atendimentos/
// participações daqueles meses.
// Rótulo do tipo de evento, usado tanto pra decidir o "responsável" do
// último evento quanto pro texto exibido no popover "Também atendido por"
// (ver abrirProfPopover).
var TIPO_EVENTO_ATENDIMENTO = 'Atendimento';

var TIPO_EVENTO_PARTICIPACAO = 'Participação em Atividade Coletiva';

// Classificação de Fluxo ("Entrada"/"Saída") da tabela "Pessoas
// Atendidas": SEMPRE calculada sobre o HISTÓRICO COMPLETO da pessoa
// (Atendimentos + Participantes Ativ. Coletiva — TODAS as datas, sem o
// filtro de Mês próprio dessa tabela) e sobre a janela móvel de
// JANELA_MESES (4) meses terminando no ÚLTIMO DIA do mês ATUAL real
// (hoje), não no mês filtrado no topo da página — mesmo critério de
// referência temporal já usado pela Busca-Ativa (ver
// buscaAtivaCompute/calcularJanelaPeriodo).
// - "Entrada": o PRIMEIRO atendimento/participação de TODO o histórico
//   da pessoa caiu dentro dessa janela (pessoa nova no indicador).
// - "Saída": a pessoa NÃO tem nenhum atendimento/participação dentro
//   dessa janela (mesmo tendo histórico anterior a ela).
// - Qualquer outro caso (já vinha de antes da janela E também tem
//   evento dentro dela — segue ativa/estável) fica sem rótulo (célula
//   vazia) — assim a lista de valores do filtro "Fluxo" mostra só as
//   duas opções pedidas (Entrada/Saída), sem um 3º valor "no meio".
function calcularFluxoPorPessoa(){
  var hoje = new Date();
  var mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  var janela = calcularJanelaPeriodo(mesAtual);
  var mapa = {}; // nome maiúsculo -> {primeira:Date|null, temNaJanela:bool}
  function registrar(nome, d){
    if(!nome || !d) return;
    var chave = nome.toUpperCase();
    if(!mapa[chave]) mapa[chave] = {primeira:null, temNaJanela:false};
    var info = mapa[chave];
    if(!info.primeira || d < info.primeira) info.primeira = d;
    if(withinPeriod(d, janela.inicio, janela.fim)) info.temNaJanela = true;
  }
  var atCachedFluxo = estadoApp.latestSheets[suffixedName("Atendimentos")];
  if(atCachedFluxo){
    var iDataFluxo = colIndex(atCachedFluxo.headers, "data_hora");
    var iNomeFluxo = colIndex(atCachedFluxo.headers, "nome");
    if(iDataFluxo >= 0 && iNomeFluxo >= 0){
      atCachedFluxo.rows.forEach(function(r){
        registrar(String(r[iNomeFluxo]||"").trim(), parseBRDate(r[iDataFluxo]));
      });
    }
  }
  var partCachedFluxo = estadoApp.latestSheets[suffixedName("Participantes Ativ. Coletiva")];
  if(partCachedFluxo){
    var iPDataFluxo = colIndex(partCachedFluxo.headers, "data");
    var iPNomeFluxo = colIndex(partCachedFluxo.headers, "participante");
    if(iPDataFluxo >= 0 && iPNomeFluxo >= 0){
      partCachedFluxo.rows.forEach(function(r){
        var nome = String(r[iPNomeFluxo]||"").trim();
        if(!nome || nome.indexOf("(sem lista nominal") === 0) return;
        registrar(nome, parseBRDate(r[iPDataFluxo]));
      });
    }
  }
  return {mapa: mapa, janela: janela};
}

function fluxoLabelPara(fluxoInfo, nome){
  var info = fluxoInfo.mapa[String(nome||"").toUpperCase()];
  if(!info) return "";
  if(info.primeira && withinPeriod(info.primeira, fluxoInfo.janela.inicio, fluxoInfo.janela.fim)) return "Entrada";
  if(!info.temNaJanela) return "Saída";
  return "";
}

export function pessoasAtendidasParaMeses(monthValues){
  // nome em maiúsculas -> {nome, at, part, datas:[Date,...],
  // profissionais:{nome:true} (todo mundo que já atendeu, histórico
  // completo — usado só em profissionalCol/busca/PDF),
  // infoPorProf:{nome:{data:Date,tipo:string}} (última ocorrência DE
  // CADA profissional, com o tipo do evento — alimenta o popover),
  // ultimaData:Date|null (data do evento mais recente da pessoa, De
  // QUALQUER tipo), ultimoTipo:string|null, ultimoProfissionalPrincipal:
  // string|null (o ÚNICO nome que aparece na coluna "Profissional")}
  var pessoasSet = {};
  function dentroDoFiltro(d){
    if(!monthValues || !monthValues.length) return true;
    return !!d && monthValues.indexOf(monthOptionValue(d)) >= 0;
  }
  // Critério de desempate/priorização de nome: profissional da eMulti
  // primeiro, depois ordem alfabética — mesmo padrão já usado em
  // listaProf/ultimoArr antes desta função existir.
  function prioridadeMenor(a, b){
    var eA = nomeEhDaEmulti(a) ? 0 : 1, eB = nomeEhDaEmulti(b) ? 0 : 1;
    if(eA !== eB) return eA - eB;
    return a.localeCompare(b, 'pt-BR');
  }
  // Decide QUEM é o profissional responsável pelo evento mais recente da
  // pessoa (Atendimento ou Participação em Atividade Coletiva) — é esse
  // único nome (nunca uma lista) que a coluna "Profissional" mostra sem
  // badge. "principal" já vem escolhido por quem chamou (o profissional
  // do atendimento, ou o Responsável da atividade coletiva — ver
  // chamadas abaixo); em caso de empate exato de data entre dois
  // eventos diferentes, desempata pela mesma prioridade usada no resto
  // da tela, em vez de juntar os dois nomes.
  function atualizarUltimoGeral(p, d, tipo, principal){
    if(!d || !principal) return;
    if(!p.ultimaData || d.getTime() > p.ultimaData.getTime()){
      p.ultimaData = d;
      p.ultimoTipo = tipo;
      p.ultimoProfissionalPrincipal = principal;
    } else if(d.getTime() === p.ultimaData.getTime()
        && prioridadeMenor(principal, p.ultimoProfissionalPrincipal) < 0){
      p.ultimoTipo = tipo;
      p.ultimoProfissionalPrincipal = principal;
    }
  }
  // Guarda, POR PROFISSIONAL, a data e o tipo (Atendimento/Participação)
  // da ocorrência mais recente dele com esta pessoa — alimenta só o
  // popover "Também atendido por" (histórico completo, além do
  // responsável do último evento).
  function registrarProf(p, prof, d, tipo){
    p.profissionais[prof] = true;
    if(d && (!p.infoPorProf[prof] || d.getTime() > p.infoPorProf[prof].data.getTime())){
      p.infoPorProf[prof] = {data:d, tipo:tipo};
    }
  }
  function novaPessoa(nome){
    return {nome:nome, at:0, part:0, datas:[], profissionais:{}, infoPorProf:{}, ultimaData:null, ultimoTipo:null, ultimoProfissionalPrincipal:null};
  }
  var atCached = estadoApp.latestSheets[suffixedName("Atendimentos")];
  if(atCached){
    var iData = colIndex(atCached.headers, "data_hora");
    var iNome = colIndex(atCached.headers, "nome");
    var iProfAt = profissionalColIndex(atCached.headers);
    if(iData >= 0 && iNome >= 0){
      atCached.rows.forEach(function(r){
        var nome = String(r[iNome]||"").trim();
        var d = parseBRDate(r[iData]);
        if(!nome || !dentroDoFiltro(d)) return;
        var chave = nome.toUpperCase();
        if(!pessoasSet[chave]) pessoasSet[chave] = novaPessoa(nome);
        var p = pessoasSet[chave];
        p.at++;
        if(d) p.datas.push(d);
        var prof = iProfAt >= 0 ? String(r[iProfAt]||"").trim() : '';
        if(prof){
          registrarProf(p, prof, d, TIPO_EVENTO_ATENDIMENTO);
          atualizarUltimoGeral(p, d, TIPO_EVENTO_ATENDIMENTO, prof);
        }
      });
    }
  }
  var partCached = estadoApp.latestSheets[suffixedName("Participantes Ativ. Coletiva")];
  if(partCached){
    var iPData = colIndex(partCached.headers, "data");
    var iPNome = colIndex(partCached.headers, "participante");
    // colsProfissionaisParticipantes traz o Responsável primeiro (quando
    // preenchido), seguido de profissional 1..5 — profsDoEvento[0] abaixo
    // é sempre o primeiro NOME NÃO VAZIO nessa ordem, então já é o
    // Responsável da atividade sempre que a coluna dele estiver
    // preenchida (mesma prioridade usada em nomesEnvolvidosParticipacao).
    var iProfPartCols = colsProfissionaisParticipantes(partCached.headers);
    if(iPData >= 0 && iPNome >= 0){
      partCached.rows.forEach(function(r){
        var nome = String(r[iPNome]||"").trim();
        var d = parseBRDate(r[iPData]);
        if(!nome || nome.indexOf("(sem lista nominal") === 0 || !dentroDoFiltro(d)) return;
        var chave = nome.toUpperCase();
        if(!pessoasSet[chave]) pessoasSet[chave] = novaPessoa(nome);
        var p = pessoasSet[chave];
        p.part++;
        if(d) p.datas.push(d);
        var profsDoEvento = [];
        iProfPartCols.forEach(function(idx){
          var prof = String(r[idx]||"").trim();
          if(prof){ registrarProf(p, prof, d, TIPO_EVENTO_PARTICIPACAO); profsDoEvento.push(prof); }
        });
        if(profsDoEvento.length) atualizarUltimoGeral(p, d, TIPO_EVENTO_PARTICIPACAO, profsDoEvento[0]);
      });
    }
  }
  var pessoasLista = Object.keys(pessoasSet).map(function(k){ return pessoasSet[k]; })
    .sort(function(a,b){ return a.nome.localeCompare(b.nome,'pt-BR'); });
  // Ordena as datas de cada pessoa em ordem cronológica e descobre o
  // maior número de datas entre todas as pessoas, pra saber quantas
  // colunas "Data N" a tabela precisa ter (colunas sobrando ficam "—"),
  // limitado a no máximo 10 colunas (MAX_DATAS_PESSOA_ATENDIDA) — quem
  // tiver mais de 10 eventos no período só mostra os 10 primeiros.
  var MAX_DATAS_PESSOA_ATENDIDA = 10;
  var maxDatas = 0;
  pessoasLista.forEach(function(p){
    p.datas.sort(function(a,b){ return a-b; });
    if(p.datas.length > maxDatas) maxDatas = p.datas.length;
  });
  maxDatas = Math.min(maxDatas, MAX_DATAS_PESSOA_ATENDIDA);
  var dataHeaders = [];
  for(var i=1;i<=maxDatas;i++){ dataHeaders.push("Data "+i); }
  // Fluxo: calculado sobre o histórico COMPLETO (não limitado por
  // monthValues) — ver calcularFluxoPorPessoa acima.
  var fluxoInfo = calcularFluxoPorPessoa();
  return {
    headers: ["Nome","Atendimentos","Participantes Ativ. Coletiva","Total","Fluxo","Profissional"].concat(dataHeaders),
    rows: pessoasLista.map(function(p){
      // profissionalCol: lista completa (todo mundo que já atendeu essa
      // pessoa, histórico inteiro) — continua igual a antes, usada só
      // por busca/filtro/PDF (ver data-cell-text em
      // renderListCard/cellFullText), NÃO é o que aparece na tela.
      // Profissional(is) da eMulti aparece(m) primeiro, resto em ordem
      // alfabética.
      var listaProf = Object.keys(p.profissionais).sort(prioridadeMenor);
      var profissionalCol = listaProf.length ? listaProf.join(', ') : '—';
      var row = [p.nome, p.at, p.part, p.at+p.part, fluxoLabelPara(fluxoInfo, p.nome), profissionalCol];
      for(var i=0;i<maxDatas;i++){
        row.push(p.datas[i] ? fmtBRDate(p.datas[i]) : "—");
      }
      // Célula "Profissional" exibida na tela: SEMPRE um único nome — o
      // profissional responsável pelo evento mais recente da pessoa
      // (Atendimento ou Participação em Atividade Coletiva; ver
      // atualizarUltimoGeral) — mais um badge "+N" (só quando há outros
      // profissionais no histórico) cujo popover mostra cada um deles
      // com nome, data e o tipo (Atendimento / Participação em
      // Atividade Coletiva) da última vez em que atendeu essa pessoa
      // (ver profissionalBadgeHtml/abrirProfPopover).
      var nomePrincipal = p.ultimoProfissionalPrincipal || listaProf[0] || '—';
      var extras = listaProf
        .filter(function(nome){ return nome !== nomePrincipal; })
        .map(function(nome){
          var info = p.infoPorProf[nome];
          return {nome:nome, data: info ? info.data : null, tipo: info ? info.tipo : null};
        })
        .sort(function(a,b){
          var ta = a.data ? a.data.getTime() : 0, tb = b.data ? b.data.getTime() : 0;
          return tb - ta;
        });
      row.profissionalHtml = profissionalBadgeHtml(nomePrincipal, extras);
      return row;
    })
  };
}

// Meses disponíveis pro filtro de "Pessoas atendidas": união dos meses
// com dado em Atendimentos e em Participantes Ativ. Coletiva (mais
// recente primeiro).
export function monthOptionsParaPessoasAtendidas(){
  var seen = {}, months = [];
  function coletar(name, dateHeader){
    var cached = estadoApp.latestSheets[name];
    if(!cached) return;
    var idx = colIndex(cached.headers, dateHeader);
    if(idx < 0) return;
    cached.rows.forEach(function(r){
      var d = parseBRDate(r[idx]);
      if(!d) return;
      var v = monthOptionValue(d);
      if(!seen[v]){ seen[v] = true; months.push(new Date(d.getFullYear(), d.getMonth(), 1)); }
    });
  }
  coletar(suffixedName("Atendimentos"), "data_hora");
  coletar(suffixedName("Participantes Ativ. Coletiva"), "data");
  months.sort(function(a,b){ return b-a; });
  return months.map(function(d){ return {value: monthOptionValue(d), label: monthOptionLabel(d)}; });
}

// Traduz o valor bruto da coluna "equipe_unidade" (ex.: "EMULTI CENTRO
// DA CIDADE - Centro") pro rótulo curto da equipe (ex.: "Centro"),
// usando o mesmo matchKeyword de EQUIPES/filtrarLinhasPorEquipe. Usado
// pra exibir a equipe na lista de Busca-Ativa quando "Todas" as equipes
// estão selecionadas ao mesmo tempo.
export function equipeLabelFromRaw(raw){
  var valor = normalizeText(raw);
  for(var i=0;i<EQUIPES.length;i++){
    var kw = normalizeText(EQUIPES[i].matchKeyword || EQUIPES[i].suffix);
    if(valor.indexOf(kw) !== -1) return EQUIPES[i].suffix;
  }
  return String(raw||"").trim() || "—";
}

// Acha a coluna de profissional de uma aba bruta, tentando o nome exato
// "profissional" primeiro e, se não achar, qualquer cabeçalho que
// contenha "PROFISSIONAL" (mesma estratégia de equipeColIndex).
export function profissionalColIndex(headerRow){
  var idx = colIndex(headerRow, "profissional");
  if(idx >= 0) return idx;
  for(var i=0;i<headerRow.length;i++){
    if(normalizeText(headerRow[i]).indexOf("PROFISSIONAL") !== -1) return i;
  }
  return -1;
}
