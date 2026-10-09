// ======================================================================
// abas/analises/calculo.js
// Aba Frequência e Retorno — históricos, intervalos, funil e risco (cálculo)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../../nucleo/estado.js';
import { latestRawSheets } from '../../app/carga.js';
import { EQUIPES } from '../../nucleo/config.js';
import { colIndex, ehProfissionalComparativoEmulti, equipeColIndex, filtrarLinhasPorEquipe, nomeEhDaEmulti, normalizeText, parseBRDate, sheetToRows } from '../../nucleo/dados.js';
import { escapeHtml, fmtInt } from '../../nucleo/utils.js';

// ---------- Aba "Análises" (perfil de paciente / tempo entre consultas) ----------
// Diferente das outras abas, aqui NÃO se aplica o filtro de Quadrimestre/
// Mês do topo: intervalo entre consultas, funil de abandono etc. olham
// pro HISTÓRICO INTEIRO do paciente na equipe selecionada (wb.Sheets já
// vem filtrado por equipe — ver fetchAndLoad/filtrarLinhasPorEquipe —,
// só não filtramos mais por período aqui).
var DIA_MS;

function diffDias(a,b){ return Math.round((b-a)/DIA_MS); }

function mediana(arr){
  if(!arr || !arr.length) return null;
  var s = arr.slice().sort(function(a,b){ return a-b; });
  var mid = Math.floor(s.length/2);
  return s.length%2 ? s[mid] : (s[mid-1]+s[mid])/2;
}

function percentil(arr, p){
  if(!arr || !arr.length) return null;
  var s = arr.slice().sort(function(a,b){ return a-b; });
  var idx = (s.length-1)*p;
  var lo = Math.floor(idx), hi = Math.ceil(idx);
  if(lo===hi) return s[lo];
  return s[lo] + (s[hi]-s[lo])*(idx-lo);
}

// Monta, por paciente (nome em maiúsculas), a lista ORDENADA de datas de
// atendimento e o conjunto de profissionais que o atenderam — base pra
// todas as análises abaixo. Usa a aba Atendimentos BRUTA (todas as
// equipes, cache latestRawSheets), filtrada aqui mesmo pela Equipe e,
// se houver, pelo(s) Quadrimestre(s) marcados no filtro PRÓPRIO desta
// aba (analisesEquipes/analisesQuads) — independente do filtro global
// do topo e do filtro de Quadrimestre/Mês usado nas outras abas.
function construirHistoricosPacientes(){
  var rows = sheetToRows(latestRawSheets["Atendimentos"] || []);
  rows = filtrarLinhasPorEquipe(rows, estadoApp.analisesEquipes);
  var header = rows[0] || [];
  var iData = colIndex(header, "data_hora");
  var iNome = colIndex(header, "nome");
  var iProf = colIndex(header, "profissional");
  var iQtd = colIndex(header, "qtd_atendimentos");
  if(iData < 0 || iNome < 0) return [];
  // Com 2+ equipes selecionadas ao mesmo tempo neste filtro, um mesmo
  // paciente pode ter atendimentos vindos de equipes diferentes —
  // guarda qual(is) equipe(s) de fato atenderam cada paciente (coluna
  // "equipe_unidade"), usado só pra exibir a coluna "Equipe" na lista
  // de risco de abandono. Com 1 equipe só selecionada não precisa nem
  // olhar a coluna: já é a mesma pra todo mundo (ver risco.push, mais
  // abaixo).
  var precisaSepararPorEquipe = estadoApp.analisesEquipes.length > 1;
  var iEquipe = precisaSepararPorEquipe ? equipeColIndex(header) : -1;
  // Nenhum quadrimestre marcado (padrão) = sem restrição de período,
  // olha pro histórico inteiro. 1+ marcados: só datas dentro de algum
  // desses quadrimestres entram no cálculo.
  var faixasQuad = estadoApp.analisesQuads.map(function(q){
    var inicio = new Date(q.ano, q.qIndex*4, 1, 0,0,0,0);
    var fim = new Date(q.ano, q.qIndex*4+4, 0, 23,59,59,999);
    return {inicio:inicio, fim:fim};
  });
  function dataDentroDoFiltro(d){
    return !faixasQuad.length || faixasQuad.some(function(f){ return d >= f.inicio && d <= f.fim; });
  }
  var porPaciente = {};
  rows.slice(1).forEach(function(r){
    var nome = String(r[iNome]||"").trim();
    var d = parseBRDate(r[iData]);
    var prof = iProf >= 0 ? String(r[iProf]||"").trim() : "";
    if(!nome || !d) return;
    if(!dataDentroDoFiltro(d)) return;
    if(estadoApp.analisesProfissional && prof !== estadoApp.analisesProfissional) return;
    var chave = nome.toUpperCase();
    if(!porPaciente[chave]) porPaciente[chave] = {nome:nome, datas:[], profissionais:{}, consultasPorProf:{}, ultimaDataPorProf:{}, equipes:{}, ultimaData:null, ultimaProfissionais:{}, totalAtendimentos:0};
    var p = porPaciente[chave];
    var qtd = iQtd >= 0 ? Number(String(r[iQtd]||'').replace(',', '.')) : 1;
    if(!isFinite(qtd) || qtd < 0) qtd = 1;
    p.totalAtendimentos += qtd;
    p.datas.push(d);
    if(prof){
      p.profissionais[prof] = true;
      p.consultasPorProf[prof] = (p.consultasPorProf[prof] || 0) + 1;
      // Última data em que ESSE profissional específico atendeu o
      // paciente (independente de ser ou não quem fez a última consulta
      // geral) — usada pro popover "Também atendido por" na lista de
      // risco de abandono (ver risco.push, mais abaixo).
      if(!p.ultimaDataPorProf[prof] || d.getTime() > p.ultimaDataPorProf[prof].getTime()){
        p.ultimaDataPorProf[prof] = d;
      }
    }
    // Guarda o(s) profissional(is) da consulta MAIS RECENTE (por data) de
    // cada paciente, pra poder destacar quem de fato atendeu na última
    // consulta quando o paciente tem 2+ profissionais no histórico (ver
    // uso em "risco de abandono", mais abaixo).
    if(!p.ultimaData || d.getTime() > p.ultimaData.getTime()){
      p.ultimaData = d;
      p.ultimaProfissionais = {};
      if(prof) p.ultimaProfissionais[prof] = true;
    } else if(d.getTime() === p.ultimaData.getTime() && prof){
      p.ultimaProfissionais[prof] = true;
    }
    if(precisaSepararPorEquipe && iEquipe >= 0){
      var valorEquipe = normalizeText(r[iEquipe]);
      var equipeDaLinha = EQUIPES.filter(function(eq){
        return valorEquipe.indexOf(normalizeText(eq.matchKeyword)) !== -1;
      })[0];
      if(equipeDaLinha) porPaciente[chave].equipes[equipeDaLinha.label] = true;
    }
  });
  return Object.keys(porPaciente).map(function(k){
    var p = porPaciente[k];
    p.datas.sort(function(a,b){ return a-b; });
    return p;
  });
}

export function calcularAnalises(){
  var pacientes = construirHistoricosPacientes();
  if(!pacientes.length) return {totalPacientes:0, pacientes:[]};

  // Intervalo (em dias) entre 1ª→2ª, 2ª→3ª, 3ª→4ª, 4ª→5ª consulta de
  // cada paciente que já teve consultas suficientes pra cada transição.
  var brutos = {t12:[], t23:[], t34:[], t45:[]};
  pacientes.forEach(function(p){
    var d = p.datas;
    if(d.length>=2) brutos.t12.push(diffDias(d[0], d[1]));
    if(d.length>=3) brutos.t23.push(diffDias(d[1], d[2]));
    if(d.length>=4) brutos.t34.push(diffDias(d[2], d[3]));
    if(d.length>=5) brutos.t45.push(diffDias(d[3], d[4]));
  });
  function resumo(arr){
    if(!arr.length) return null;
    return {n:arr.length, min:Math.min.apply(null,arr), p25:percentil(arr,0.25), mediana:mediana(arr), p75:percentil(arr,0.75), max:Math.max.apply(null,arr)};
  }
  var intervalos = [
    {chave:'t12', label:'1ª → 2ª consulta', stats: resumo(brutos.t12)},
    {chave:'t23', label:'2ª → 3ª consulta', stats: resumo(brutos.t23)},
    {chave:'t34', label:'3ª → 4ª consulta', stats: resumo(brutos.t34)},
    {chave:'t45', label:'4ª → 5ª consulta', stats: resumo(brutos.t45)}
  ];

  // Funil de abandono: quantos pacientes chegam a cada "degrau".
  var funil = [
    {label:'1ª consulta', n: pacientes.length},
    {label:'2ª consulta', n: pacientes.filter(function(p){return p.datas.length>=2;}).length},
    {label:'3ª consulta', n: pacientes.filter(function(p){return p.datas.length>=3;}).length},
    {label:'4ª+ consulta', n: pacientes.filter(function(p){return p.datas.length>=4;}).length}
  ];

  // Perfil de frequência: única / ocasional (2-3) / consolidado (4+) —
  // e a média de consultas por paciente (total de consultas do
  // histórico ÷ nº de pacientes), pra dar uma leitura rápida do volume
  // médio de retorno ao lado da distribuição por faixa.
  var perfilFreq = {unica:0, ocasional:0, consolidado:0, mediaConsultas:0};
  var totalConsultasFreq = 0;
  var totalAtendimentos = 0;
  pacientes.forEach(function(p){
    var n = p.totalAtendimentos || p.datas.length;
    totalConsultasFreq += n;
    totalAtendimentos += n;
    if(n===1) perfilFreq.unica++;
    else if(n===2||n===3) perfilFreq.ocasional++;
    else perfilFreq.consolidado++;
  });
  perfilFreq.mediaConsultas = pacientes.length ? (totalConsultasFreq/pacientes.length) : 0;

  // Sazonalidade: nº de atendimentos por dia da semana (todas as datas,
  // não só a 1ª consulta).
  var DIAS_SEMANA = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  var porDiaSemana = [0,0,0,0,0,0,0];
  pacientes.forEach(function(p){ p.datas.forEach(function(d){ porDiaSemana[d.getDay()]++; }); });
  // Média de atendimentos por dia da semana: total do dia da semana ÷
  // nº de datas DISTINTAS daquele dia da semana com algum atendimento
  // no período (feriados/dias sem expediente não entram no divisor).
  var datasDistintasSemana = [{},{},{},{},{},{},{}];
  pacientes.forEach(function(p){ p.datas.forEach(function(d){
    datasDistintasSemana[d.getDay()][d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()] = 1;
  }); });
  var diasDistintosSemana = datasDistintasSemana.map(function(o){ return Object.keys(o).length; });
  var mediaPorDiaSemana = porDiaSemana.map(function(n,i){
    var qtd = diasDistintosSemana[i];
    return qtd ? n/qtd : 0;
  });

  // Comparativo por profissional: mediana de dias entre duas consultas
  // consecutivas, atribuída a cada profissional que atendeu o paciente
  // (aproximação — a aba não diz qual profissional fez qual consulta
  // específica). idxA/idxB são os índices (0-based) das duas consultas
  // na sequência do paciente (ex.: 0,1 = 1ª→2ª; 1,2 = 2ª→3ª).
  function calcularComparativoProf(idxA, idxB){
    var porProf = {};
    pacientes.forEach(function(p){
      if(p.datas.length <= idxB) return;
      var dias = diffDias(p.datas[idxA], p.datas[idxB]);
      Object.keys(p.profissionais).forEach(function(prof){
        if(!ehProfissionalComparativoEmulti(prof)) return;
        if(!porProf[prof]) porProf[prof] = [];
        porProf[prof].push(dias);
      });
    });
    return Object.keys(porProf).map(function(prof){
      return {profissional:prof, n:porProf[prof].length, medianaDias: mediana(porProf[prof])};
    }).sort(function(a,b){ return a.medianaDias - b.medianaDias; });
  }
  var comparativoProf = calcularComparativoProf(0, 1);
  var comparativoProf23 = calcularComparativoProf(1, 2);

  // Pacientes em risco de abandono: já romperam o "silêncio" normal (mais
  // tempo sem voltar do que a mediana histórica de 1ª→2ª consulta) mas
  // ainda dentro de uma janela em que o retorno é plausível (até 3x essa
  // mediana) — depois disso, tratamos como provável abandono já
  // consumado, não mais "risco".
  var medianaBase = intervalos[0].stats ? intervalos[0].stats.mediana : null;
  var hoje = new Date();
  var risco = [];
  var equipeLabelUnica = estadoApp.analisesEquipes.length === 1 ? estadoApp.analisesEquipes[0].label : null;
  // Classificação completa de quem já teve 2+ consultas (base de
  // comparação pra "Pacientes em risco de abandono" não ser lida contra
  // o total geral de pacientes, que inclui quem nunca voltou nem uma vez
  // — esses já aparecem em "Consulta única", no Perfil de frequência):
  // em dia (ainda dentro da mediana) / em risco (na janela) / abandono
  // consumado (já passou de 3x a mediana sem voltar).
  var comRetorno = 0, emDiaCount = 0, abandonoConsumadoCount = 0;
  // Registro "leve" com o mesmo formato usado pelo filtro da tabela de
  // risco (nome/profissional/equipe/consultas/última consulta/dias sem
  // voltar + ultimoProfissionais/todosProfissionais), mas pra TODO
  // paciente com pelo menos 1 consulta — não só os que estão na janela
  // de risco. É contra essa lista (kpiRegistros, abaixo) que os cards de
  // estatística (Total no histórico / Com 2+ consultas / Em dia / Em
  // risco / Abandono consumado) são recalculados a cada mudança nos
  // filtros da tabela (ver wireRiscoFiltros), em vez de ficarem fixos no
  // total geral independente do filtro.
  var kpiRegistros = [];
  var registrosTabela = [];
  // Última participação em atividade coletiva de cada paciente (nome em
  // maiúsculas -> Date), lida da aba Participantes Ativ. Coletiva. Só é
  // INFORMATIVA (coluna "Última participação coletiva"): NÃO entra na
  // "última consulta" nem na mediana, pra quem só vai a grupo não sumir
  // da lista de risco de acompanhamento individual.
  var ultimaColetivaPorNome = {};
  (function(){
    var pr = filtrarLinhasPorEquipe(sheetToRows(latestRawSheets["Participantes Ativ. Coletiva"] || []), estadoApp.analisesEquipes);
    var h = pr[0] || [];
    var iN = colIndex(h, "participante"), iD = colIndex(h, "data");
    if(iN < 0 || iD < 0) return;
    pr.slice(1).forEach(function(r){
      var nome = String(r[iN]||"").trim();
      if(!nome || nome.indexOf("(sem lista nominal") === 0) return;
      var d = parseBRDate(r[iD]);
      if(!d) return;
      var k = nome.toUpperCase();
      if(!ultimaColetivaPorNome[k] || d > ultimaColetivaPorNome[k]) ultimaColetivaPorNome[k] = d;
    });
  })();
  pacientes.forEach(function(p){
    if(!p.datas.length) return;
    var todosProfs = Object.keys(p.profissionais).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); });
    var ultimosProfsSet = p.ultimaProfissionais || {};
    // Ordena os profissionais da ÚLTIMA consulta com a MESMA prioridade
    // usada no resto do painel (profissional da eMulti primeiro, depois
    // alfabética) — o primeiro da lista vira o nome PRINCIPAL da célula;
    // os demais (inclusive co-profissional da MESMA última consulta,
    // quando há empate de data) entram no popover "+N" junto com os
    // profissionais de consultas mais antigas, em vez de ficarem
    // grudados no texto principal sem badge (ver outrosProfissionais
    // logo abaixo).
    var ultimoProfissionaisArrKpi = Object.keys(ultimosProfsSet).sort(function(a,b){
      var eA = nomeEhDaEmulti(a) ? 0 : 1, eB = nomeEhDaEmulti(b) ? 0 : 1;
      if(eA !== eB) return eA - eB;
      return a.localeCompare(b,'pt-BR');
    });
    var equipeTxtKpi = equipeLabelUnica || Object.keys(p.equipes||{}).sort().join(' + ');
    var ultima = p.datas[p.datas.length-1];
    var diasDesde = diffDias(ultima, hoje);
    var status = 'unica'; // 1 consulta só — entra em "Total no histórico", mas não nas demais contagens

    if(p.datas.length >= 2){
      comRetorno++;
      if(!medianaBase){
        status = 'semMediana'; // sem histórico suficiente ainda pra classificar
      } else if(diasDesde <= medianaBase){
        status = 'emDia'; emDiaCount++;
      } else if(diasDesde > medianaBase*3){
        status = 'abandono'; abandonoConsumadoCount++;
      } else {
        status = 'risco';
      }
    }

    kpiRegistros.push({
      nome: p.nome, status: status, diasDesde: diasDesde, ultima: ultima,
      totalConsultas: p.datas.length, equipe: equipeTxtKpi || '—',
      profissional: todosProfs.join(', ') || '—',
      ultimoProfissionais: ultimoProfissionaisArrKpi, todosProfissionais: todosProfs
    });

    // Com 2+ profissionais no histórico do paciente, destaca em
    // negrito quem de fato fez a ÚLTIMA consulta (profissionalHtml,
    // usado na tela). O PDF continua em texto puro (profissional).
    var profissionalHtml = todosProfs.map(function(nomeProf){
      var escapado = escapeHtml(nomeProf);
      return (todosProfs.length >= 2 && ultimosProfsSet[nomeProf]) ? '<b>'+escapado+'</b>' : escapado;
    }).join(', ');
    var ultimoProfissionaisArr = ultimoProfissionaisArrKpi;
    var profissionalTxt = todosProfs.join(', ');
    // Coluna "Profissional" da tabela: SEMPRE 1 nome principal (o
    // primeiro de ultimoProfissionaisArr, já com a prioridade
    // eMulti-primeiro acima) + badge "+N" com popover pros demais — em
    // TODOS os casos em que o paciente tem mais de 1 profissional no
    // histórico, mesmo quando os "outros" são só o(s) co-profissional(is)
    // da PRÓPRIA última consulta (empate de data), que antes ficavam
    // grudados no texto principal sem popover nenhum. Cada item do
    // popover leva a data em que ESSE profissional atendeu a pessoa pela
    // última vez (ultimaDataPorProf, ou a própria "ultima" quando é
    // co-profissional do último dia), do mais recente pro mais antigo.
    var principalNome = ultimoProfissionaisArr[0] || null;
    var extrasUltimaData = ultimoProfissionaisArr.slice(1).map(function(nomeProf){
      return {nome: nomeProf, data: ultima};
    });
    var outrosProfissionaisAntigos = todosProfs
      .filter(function(nomeProf){ return !ultimosProfsSet[nomeProf]; })
      .map(function(nomeProf){ return {nome: nomeProf, data: (p.ultimaDataPorProf||{})[nomeProf] || null}; });
    var outrosProfissionais = extrasUltimaData.concat(outrosProfissionaisAntigos)
      .sort(function(a,b){
        var ta = a.data ? a.data.getTime() : 0, tb = b.data ? b.data.getTime() : 0;
        return tb - ta;
      });
    var equipeTxt = equipeTxtKpi;
    var registroTabela = {
      nome:p.nome, status:status, diasDesde:diasDesde, ultima:ultima,
      totalConsultas:p.datas.length,
      consultasPorProf:p.consultasPorProf || {},
      profissional: profissionalTxt || '—',
      profissionalHtml: profissionalHtml || '—',
      profissionalUltimo: principalNome || '—',
      outrosProfissionais: outrosProfissionais,
      ultimoProfissionais: ultimoProfissionaisArr,
      todosProfissionais: todosProfs,
      equipe: equipeTxt || '—',
      // Estimativa: dias até cruzar 3x a mediana histórica (limite de
      // "abandono consumado"). Negativo = já ultrapassou. null = não se
      // aplica (em dia, consulta única ou sem mediana).
      diasRestantes: (status === 'risco' || status === 'abandono') && medianaBase
        ? (status === 'risco' ? Math.floor(medianaBase*3 - diasDesde) : -Math.ceil(diasDesde - medianaBase*3))
        : null,
      ultimaColetiva: ultimaColetivaPorNome[p.nome.toUpperCase()] || null
    };
    registrosTabela.push(registroTabela);
    if(status === 'risco') risco.push(registroTabela);
  });
  // Ordem padrão da tabela: mais dias sem voltar primeiro; no empate,
  // quem tem MENOS consultas primeiro; persistindo o empate, nome (A→Z).
  // Aplicada também a registrosTabela (a lista que de fato alimenta a
  // tabela) — antes só "risco" era ordenada, e a tabela saía na ordem em
  // que os pacientes aparecem na planilha.
  function ordemPadraoRisco(a, b){
    if(b.diasDesde !== a.diasDesde) return b.diasDesde - a.diasDesde;
    if(a.totalConsultas !== b.totalConsultas) return a.totalConsultas - b.totalConsultas;
    return String(a.nome).localeCompare(String(b.nome), 'pt-BR', {sensitivity:'base'});
  }
  risco.sort(ordemPadraoRisco);
  registrosTabela.sort(ordemPadraoRisco);

  return {
    totalPacientes: pacientes.length,
    totalAtendimentos: totalAtendimentos,
    intervaloSelecionado: estadoApp.analisesQuads.length ? estadoApp.analisesQuads.map(function(q){ return q.ano + ' — Q' + (q.qIndex+1); }).join(', ') : 'Histórico completo',
    intervalos: intervalos,
    funil: funil,
    perfilFreq: perfilFreq,
    diasSemanaLabels: DIAS_SEMANA,
    porDiaSemana: porDiaSemana,
    mediaPorDiaSemana: mediaPorDiaSemana,
    diasDistintosSemana: diasDistintosSemana,
    comparativoProf: comparativoProf,
    comparativoProf23: comparativoProf23,
    medianaBase: medianaBase,
    comRetorno: comRetorno,
    emDiaCount: emDiaCount,
    abandonoConsumadoCount: abandonoConsumadoCount,
    risco: risco,
    kpiRegistros: kpiRegistros,
    registrosTabela: registrosTabela
  };
}

// "Boxplot" simplificado em SVG (min/p25/mediana/p75/max) pros
// intervalos — sem depender de nenhuma lib de gráfico nova. Layout em
// grade (2 colunas) pra caber os 4 intervalos (1ª→2ª, 2ª→3ª, 3ª→4ª,
// 4ª→5ª) em 4 quadrantes, em vez de 4 linhas empilhadas ocupando altura
// desnecessária.
// Waterfall (cascata incremental) do tempo entre consultas: cada barra
// "flutua" a partir de onde a anterior parou, representando quantos dias
// aquele intervalo ACRESCENTA ao tempo acumulado desde a 1ª consulta.
// Só entram no acumulado os intervalos com dados suficientes (it.stats);
// os que ainda não têm dado aparecem como aviso, sem quebrar a cascata.
export function waterfallDiasSvg(intervalos){
  var comDados = intervalos.filter(function(it){ return it.stats; });
  if(!comDados.length){
    return '<p class="footnote">Ainda não há dados suficientes pra montar a cascata.</p>';
  }

  var W = 640, H = 250;
  var padLeft = 14, padRight = 14, padTop = 40, padBottom = 44;
  var plotW = W - padLeft - padRight;
  var plotH = H - padTop - padBottom;
  var n = comDados.length;
  var gap = 26;
  var barW = (plotW - gap*(n-1)) / n;

  var cumulative = 0;
  var steps = comDados.map(function(it){
    var incremento = Math.round(it.stats.mediana);
    var inicio = cumulative;
    cumulative += incremento;
    return {label: it.label, incremento: incremento, inicio: inicio, fim: cumulative, n: it.stats.n};
  });

  var maxTotal = cumulative || 1;
  function y(v){ return padTop + plotH - (v/maxTotal)*plotH; }

  var cores = ['#2F6F5E','#3E8571','#57A088','#7CB89F','#A3CFBB'];
  var baseline = '<line x1="'+padLeft+'" y1="'+y(0)+'" x2="'+(padLeft+plotW)+'" y2="'+y(0)+'" stroke="var(--ink-soft)" stroke-width="1"/>';

  var bars = steps.map(function(s, i){
    var xPos = padLeft + i*(barW+gap);
    var yTop = y(s.fim), yBottom = y(s.inicio);
    var barH = Math.max(2, yBottom - yTop);
    var cor = cores[i % cores.length];

    var connector = '';
    if(i > 0){
      var prevX = padLeft + (i-1)*(barW+gap) + barW;
      var yLevel = y(s.inicio);
      connector = '<line x1="'+prevX+'" y1="'+yLevel+'" x2="'+xPos+'" y2="'+yLevel+'" stroke="var(--ink-soft)" stroke-width="1" stroke-dasharray="3,3"/>';
    }

    var barRect = '<rect x="'+xPos+'" y="'+yTop+'" width="'+barW+'" height="'+barH+'" fill="'+cor+'" rx="4"/>';
    var incLabel = '<text x="'+(xPos+barW/2)+'" y="'+(yTop-8)+'" font-size="11" font-weight="700" fill="var(--ink)" text-anchor="middle">+'+fmtInt(s.incremento)+' dias</text>';
    var catLabel = '<text x="'+(xPos+barW/2)+'" y="'+(padTop+plotH+18)+'" font-size="10.5" font-weight="700" fill="var(--ink)" text-anchor="middle">'+escapeHtml(s.label)+'</text>';
    var nSub = '<text x="'+(xPos+barW/2)+'" y="'+(padTop+plotH+31)+'" font-size="8.5" fill="var(--ink-soft)" text-anchor="middle">mediana · n='+s.n+'</text>';

    return connector + barRect + incLabel + catLabel + nSub;
  }).join('');

  var totalLabel = '<text x="'+(padLeft+plotW)+'" y="18" font-size="11" font-weight="700" fill="var(--ink)" text-anchor="end">Total acumulado: '+fmtInt(cumulative)+' dias</text>';

  return '<svg class="spark-svg" viewBox="0 0 '+W+' '+H+'">'+baseline+bars+totalLabel+'</svg>';
}

// Funil de abandono: barras horizontais de largura proporcional ao 1º
// degrau (1ª consulta = 100%).
export function funnelHtml(funil){
  var base = (funil[0] && funil[0].n) || 0;
  var cores = ['#2F6F5E','#6B8F71','#C68A3D','#B5474B'];
  return '<div>' + funil.map(function(f,i){
    var pct = base ? Math.round(f.n/base*100) : 0;
    return '<div style="margin-bottom:11px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">'
      +   '<span>'+escapeHtml(f.label)+'</span><span><b>'+fmtInt(f.n)+'</b> pacientes · '+pct+'%</span>'
      + '</div>'
      + '<div style="background:#EAEAE3;border-radius:6px;height:14px;overflow:hidden;">'
      +   '<div style="width:'+pct+'%;height:100%;background:'+(cores[i]||'#2F6F5E')+';"></div>'
      + '</div>'
      + '</div>';
  }).join('') + '</div>';
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
  DIA_MS = 24*60*60*1000;

  estadoApp.analisesChartInstances = [];

  estadoApp.analisesDataAtual = null;
}
