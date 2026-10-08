// ======================================================================
// nucleo/seletores-periodo.js
// Série de tendência e seletores de Ano / Quadrimestre / Mês
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from './estado.js';
import { aplicarMesReferencia } from '../app/carga.js';
import { addMonths, calcularJanelaPeriodo, monthOptionLabel, monthOptionValue } from './config.js';
import { calcularJanelaComOverride } from './dados.js';
import { createMultiSelect } from './multiselect.js';
import { QUAD_LABELS, mesesDosQuadsSelecionadosUniao } from './periodos.js';

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
