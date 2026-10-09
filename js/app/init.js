// ======================================================================
// app/init.js
// Ponto de entrada: window.iniciarPainelEmulti
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../nucleo/estado.js';
import { fetchAndLoad } from './carga.js';
import { refreshHistoryFromStorage } from './historico.js';
import { renderDashboard } from './render.js';

// ---------- Init ----------
// Só roda DEPOIS do login: o auth.js (mostrarApp) chama
// window.iniciarPainelEmulti. Antes disso nenhum dado é buscado.
var painelIniciado = false;

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
window.iniciarPainelEmulti = function(){
    if(painelIniciado) return;
    painelIniciado = true;
    refreshHistoryFromStorage(function(arr){
      if(arr.length){
        var latest = arr.slice().sort(function(a,b){ return b.timestamp-a.timestamp; })[0];
        estadoApp.currentRecordId = latest.id;
        renderDashboard(latest);
      }
      fetchAndLoad();
    });
  };
}
