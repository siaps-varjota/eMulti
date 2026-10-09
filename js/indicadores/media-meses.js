// ======================================================================
// indicadores/media-meses.js
// Média de indicadores por meses
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../nucleo/estado.js';
import { tipoCalculo } from '../nucleo/config.js';
import { NOTAS_METODOLOGICAS, PONTOS_POR_CLASSE, classificarDesempenho, classificarM1, classificarM2 } from '../nucleo/dados.js';

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
