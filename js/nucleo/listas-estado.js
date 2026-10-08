// ======================================================================
// nucleo/listas-estado.js
// Estado das listas complementares e armazenamento local
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from './estado.js';
import { monthOptionLabel, monthOptionValue, suffixedName } from './config.js';
import { colIndex, parseBRDate } from './dados.js';

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
export function init(){
  estadoApp.latestSheets = {};

  estadoApp.currentRecordId = null;

  STORAGE_AVAILABLE = !!(window.storage && typeof window.storage.get === 'function'
    && typeof window.storage.set === 'function');

  estadoApp.memoryHistory = [];
}
