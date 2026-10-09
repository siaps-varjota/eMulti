// ======================================================================
// indicadores/calculo.js
// Cálculo dos indicadores M1 / M2 do período
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../nucleo/estado.js';
import { EQUIPES, suffixedName } from '../nucleo/config.js';
import { NOTAS_METODOLOGICAS, PONTOS_POR_CLASSE, classificarDesempenho, classificarM1, classificarM2, colIndex, colRespParticipantes, equipeColIndex, equipeKeyFromNomeOficial, nomeEhDaEmulti, temaEhDiscussaoCasoPts, tipoEhReuniao, normalizarTexto, normalizeText, parseBRDate, parseMesAbrevPt, profissionaisRoster, sheetToRows, toInt, withinPeriod } from '../nucleo/dados.js';

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
