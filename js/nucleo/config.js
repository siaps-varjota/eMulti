// ======================================================================
// nucleo/config.js
// Planilhas, equipes, estado dos filtros e rótulos de mês
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from './estado.js';
import { JANELA_MESES } from './periodos.js';

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
export function init(){
  // Agora suporta seleção múltipla: quando mais de uma equipe está
  // marcada, as linhas de AMBAS entram no cálculo (resultado combinado/
  // somado das equipes selecionadas). Sempre fica pelo menos 1 marcada.
  estadoApp.currentEquipes = [EQUIPES[0]];

  // Filtro de Equipe da aba Análises — INDEPENDENTE do filtro global do
  // topo (currentEquipes): mudar um não muda o outro (a pedido). Mesmo
  // visual/comportamento do seletor do topo (single-select + "Todas"),
  // mas filtra client-side em cima do cache bruto (latestRawSheets), sem
  // disparar um novo fetch. Começa igual ao padrão do filtro do topo.
  estadoApp.analisesEquipes = [EQUIPES[0]];

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
