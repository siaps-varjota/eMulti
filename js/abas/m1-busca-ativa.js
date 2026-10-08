// ======================================================================
// abas/m1-busca-ativa.js
// Aba M1 — Busca ativa
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../nucleo/estado.js';
import { TOTAL_PROF_EMULTI_HEADER, colTotalProfEmulti, criarCalculadoraTotalProfEmulti, criarLigacaoAtividades } from '../indicadores/calculo.js';
import { equipeLabelFromRaw } from '../listas/pessoas-atendidas.js';
import { calcularJanelaPeriodo, displayListName, suffixedName } from '../nucleo/config.js';
import { colIndex, equipeColIndex, fmtBRDate, normalizeText, parseBRDate, sheetToRows, withinPeriod } from '../nucleo/dados.js';

// Valor sentinela (não é um índice numérico de coluna) usado no <select>
// "Filtrar por coluna…" pra representar o filtro virtual "Profissional
// da eMulti", que substitui as 5 colunas "profissional 1".."profissional
// 5" por uma única opção — o valor list combina as 5 colunas (linha
// bate se QUALQUER uma delas tiver um profissional da eMulti marcado),
// em vez do filtro normal de 1 coluna só.
export var PROF_EMULTI_FILTER_VALUE = 'prof_emulti';

// Valor sentinela do filtro virtual "AÇÃO M2" (Compartilhada/Específica),
// da lista "Participantes Ativ. Coletiva" — não é índice de coluna, é
// calculado na hora a partir da classificação de cada linha (ver
// classificarAcaoM2Participacao) e comparado com o texto já renderizado
// no selo da célula (ver applyFilters).
export var ACAO_M2_FILTER_VALUE = 'acao_m2';

// Nome exato da coluna calculada de dias sem atendimento (Busca-Ativa) —
// usado tanto pro filtro de coluna (que agrupa em faixas, não valor a
// valor) quanto pro cálculo em applyFilters.
export var DIAS_SEM_ATENDIMENTO_HEADER = "Dias sem Atendimento";

export var FAIXAS_DIAS_SEM_ATENDIMENTO = ['31–60', '61–90', '> 90'];

export function diasBucketLabel(raw){
  var n = parseInt(String(raw||"").trim(), 10);
  if(isNaN(n)) return null;
  if(n <= 60) return '31–60';
  if(n <= 90) return '61–90';
  return '> 90';
}

// ---------- Busca-Ativa (aba M1) ----------
// Lista, calculada aqui mesmo, das pessoas com ATENDIMENTO individual em
// atraso: mais de 30 dias desde a última consulta, mas ainda dentro da
// janela de 120 dias (a mesma janela usada pelo M1 — ver JANELA_MESES),
// sempre contando a partir do ÚLTIMO DIA DO MÊS ATUAL (não do dia de
// hoje, nem do mês filtrado no topo da página) — assim a lista mostra
// sempre quem vai "sair da janela" do indicador dentro do mês corrente.
// Critério de ordenação: 1º a data da última consulta, da mais antiga
// pra mais atual (quem está mais atrasado aparece primeiro); em caso de
// empate na data, 2º critério é a quantidade de consultas, crescente.
export function buscaAtivaCompute(){
  // Janela de referência da Busca-Ativa: os mesmos JANELA_MESES (4)
  // meses usados pelo M1/M2, terminando no mês ATUAL (não no mês
  // filtrado no topo da página — a Busca-Ativa não tem filtro de mês
  // próprio, é sempre "os últimos 4 meses a partir de hoje"). A coluna
  // "Atendimentos" mostrada na lista conta só os atendimentos DENTRO
  // dessa janela — não o total histórico da pessoa.
  var hoje = new Date();
  var mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  var janelaPeriodo = calcularJanelaPeriodo(mesAtual);
  var pessoasSet = {}; // nome em maiúsculas -> {nome, countPeriodo, ultima:Date, equipe, profissional}
  var atCached = estadoApp.latestSheets[suffixedName("Atendimentos")];
  if(atCached){
    var iData = colIndex(atCached.headers, "data_hora");
    var iNome = colIndex(atCached.headers, "nome");
    var iProf = colIndex(atCached.headers, "profissional");
    var iEquipe = equipeColIndex(atCached.headers);
    if(iData >= 0 && iNome >= 0){
      atCached.rows.forEach(function(r){
        var nome = String(r[iNome]||"").trim();
        var d = parseBRDate(r[iData]);
        if(!nome || !d) return;
        var chave = nome.toUpperCase();
        if(!pessoasSet[chave]) pessoasSet[chave] = {nome:nome, countPeriodo:0, ultima:null, equipe:'', profissional:''};
        // Só entra na contagem exibida se cair dentro da janela dos
        // últimos 4 meses — a "Última Consulta" (usada pra saber há
        // quantos dias a pessoa está sem atendimento) continua olhando
        // TODO o histórico, não só a janela.
        if(withinPeriod(d, janelaPeriodo.inicio, janelaPeriodo.fim)){
          pessoasSet[chave].countPeriodo++;
        }
        // Equipe/Profissional guardados são sempre os da ÚLTIMA consulta
        // (a mesma que aparece na coluna "Última Consulta"), não os do
        // primeiro atendimento encontrado.
        if(!pessoasSet[chave].ultima || d > pessoasSet[chave].ultima){
          pessoasSet[chave].ultima = d;
          pessoasSet[chave].equipe = iEquipe >= 0 ? equipeLabelFromRaw(r[iEquipe]) : '—';
          pessoasSet[chave].profissional = iProf >= 0 ? (String(r[iProf]||"").trim() || '—') : '—';
        }
      });
    }
  }
  // Fim do mês atual, zerado na hora (comparação só por dia) — usado só
  // pra decidir quem ENTRA na janela de busca ativa (a lista fica estável
  // o mês inteiro, ninguém entra/sai da janela de 30-120 dias no meio do
  // mês). Hoje, também zerado na hora, é usado à parte pra calcular o
  // valor REAL exibido na coluna "Dias sem Atendimento" — antes o mesmo
  // número (até fim do mês) era reaproveitado pra exibir, o que fazia a
  // coluna mostrar dias "do futuro" (ex.: última consulta 08/09 aparecia
  // como 53 dias em 07/10, quando o real era 29) — confundia "dias
  // projetados até o fim do mês" (critério de filtro) com "dias reais
  // desde a última consulta" (o que a coluna promete mostrar).
  var fimMes = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0);
  var hojeDiaZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  var MS_DIA = 24*60*60*1000;
  var lista = Object.keys(pessoasSet).map(function(k){ return pessoasSet[k]; })
    .map(function(p){
      var ultimaDiaZero = new Date(p.ultima.getFullYear(), p.ultima.getMonth(), p.ultima.getDate());
      var diasAteFimMes = Math.round((fimMes - ultimaDiaZero) / MS_DIA);
      var diasReais = Math.round((hojeDiaZero - ultimaDiaZero) / MS_DIA);
      return {nome:p.nome, count:p.countPeriodo, ultima:p.ultima, diasAteFimMes:diasAteFimMes, diasReais:diasReais, equipe:p.equipe, profissional:p.profissional};
    })
    // Janela: mais de 30 dias e no máximo 120 dias sem atendimento,
    // contados até o último dia do mês atual (critério de filtro — não é
    // o número exibido na coluna, ver diasReais acima).
    .filter(function(p){ return p.diasAteFimMes > 30 && p.diasAteFimMes <= 120; })
    .sort(function(a,b){
      var diffData = a.ultima - b.ultima;
      if(diffData !== 0) return diffData; // mais antiga primeiro
      return a.count - b.count; // 2º critério: menos consultas primeiro
    });
  return {
    headers: ["Nome","Equipe","Profissional","Última Consulta","Dias sem Atendimento","Atendimentos"],
    rows: lista.map(function(p){ return [p.nome, p.equipe, p.profissional, fmtBRDate(p.ultima), p.diasReais, p.count]; })
  };
}

export function populateSheetsCache(wb){
  estadoApp.latestSheets = {};
  // Mapa ID da atividade -> total de profissionais da eMulti (calculado a
  // partir de Participantes Ativ. Coletiva) pra exibir a coluna "Total de
  // Profissionais da EMulti" nas duas listas.
  var nomePartAba = suffixedName("Participantes Ativ. Coletiva");
  var wsPart = wb.Sheets[nomePartAba];
  var partRowsBrutas = wsPart ? sheetToRows(wsPart).filter(function(r){
    return r.some(function(c){ return String(c).trim() !== ""; });
  }) : [];
  var totalEmultiCalc = partRowsBrutas.length ? criarCalculadoraTotalProfEmulti(partRowsBrutas[0]) : null;
  wb.SheetNames.forEach(function(name){
    var rows = sheetToRows(wb.Sheets[name]).filter(function(r){
      return r.some(function(c){ return String(c).trim() !== ""; });
    });
    if(!rows.length) return;
    var headers = rows[0].map(function(h){ return String(h||"").trim() || "—"; });
    var dataRows = rows.slice(1);
    // A coluna "Status" da lista "Atendimentos" não deve aparecer nas
    // tabelas das abas M1 e M2 (pedido explícito) — removida aqui, só
    // deste cache de EXIBIÇÃO das listas, então nenhum cálculo (que lê
    // direto de wb.Sheets/latestWb) é afetado.
    if(displayListName(name) === "Atendimentos"){
      var statusIdx = colIndex(headers, "status");
      if(statusIdx >= 0){
        headers.splice(statusIdx, 1);
        dataRows = dataRows.map(function(r){
          var novaLinha = r.slice();
          novaLinha.splice(statusIdx, 1);
          return novaLinha;
        });
      }
    }
    // Se a planilha trouxer MAIS DE UMA coluna "Total de Profissionais da
    // EMulti" (inclusive com grafias diferentes, ex. "Profissionails" e
    // "Profissionais"), mantém só a PRIMEIRA e remove as demais da
    // EXIBIÇÃO — evita coluna duplicada com valores conflitantes.
    (function(){
      var idxs = [];
      headers.forEach(function(h, i){
        var t = normalizeText(h);
        if(t.indexOf("TOTAL") !== -1 && t.indexOf("PROFISSION") !== -1 && t.indexOf("EMULTI") !== -1) idxs.push(i);
      });
      if(idxs.length > 1){
        var remover = idxs.slice(1);
        headers = headers.filter(function(h, i){ return remover.indexOf(i) === -1; });
        dataRows = dataRows.map(function(r){
          return r.filter(function(c, i){ return remover.indexOf(i) === -1; });
        });
      }
    })();
    // Coluna virtual "Total de Profissionais da EMulti" (só na EXIBIÇÃO):
    // - Participantes Ativ. Coletiva: calculada linha a linha (Responsável
    //   + Profissional 1..5 que são da eMulti); se a planilha já trouxer
    //   uma coluna com esse nome, ela é mantida.
    // - Resumo Atividade Coletiva: a coluna de total de profissionais é
    //   SUBSTITUÍDA pelo valor de Participantes (ligação pelo ID da
    //   atividade); se não existir, é acrescentada no fim.
    var nomeExib = displayListName(name);
    if(nomeExib === "Participantes Ativ. Coletiva" && totalEmultiCalc && totalEmultiCalc.disponivel
       && colTotalProfEmulti(headers) < 0){
      var calcLinha = totalEmultiCalc.calcular;
      headers = headers.concat([TOTAL_PROF_EMULTI_HEADER]);
      dataRows = dataRows.map(function(r){ return r.concat([calcLinha(r)]); });
    } else if(nomeExib === "Resumo Atividade Coletiva" && partRowsBrutas.length){
      var ligacao = criarLigacaoAtividades(partRowsBrutas, headers);
      if(ligacao){
        var iTot = colTotalProfEmulti(headers);
        var acrescentar = iTot < 0;
        if(acrescentar){ headers = headers.concat([TOTAL_PROF_EMULTI_HEADER]); iTot = headers.length-1; }
        dataRows = dataRows.map(function(r){
          var nova = r.slice();
          var v = ligacao.total(r);
          if(v !== undefined) nova[iTot] = v;
          else if(acrescentar) nova[iTot] = "";
          return nova;
        });
      } else {
        console.warn('[Resumo Atividade Coletiva] não foi possível ligar às linhas de Participantes Ativ. Coletiva (sem ID em comum e sem data/equipe/responsável nas duas abas). cabeçalho Resumo:', headers, '| cabeçalho Participantes:', partRowsBrutas[0]);
      }
    }
    estadoApp.latestSheets[name] = {headers: headers, rows: dataRows};
  });
}
