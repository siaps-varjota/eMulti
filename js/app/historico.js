// ======================================================================
// app/historico.js
// Histórico salvo no navegador (storage)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../nucleo/estado.js';
import { latestWb } from './carga.js';
import { renderDashboard } from './render.js';
import { STORAGE_AVAILABLE, STORAGE_KEY } from '../nucleo/listas-estado.js';
import { TREND_MESES, anchorMonthDate } from '../nucleo/periodos.js';
import { calcularSerieTendencia } from '../nucleo/seletores-periodo.js';
import { escapeHtml, fmtDate, pillHex } from '../nucleo/utils.js';

// ---------- Storage ----------
export function loadHistoryArray(){
  return window.__historyCache || [];
}

export function refreshHistoryFromStorage(cb){
  if(!STORAGE_AVAILABLE){
    window.__historyCache = estadoApp.memoryHistory;
    if(cb) cb(estadoApp.memoryHistory);
    return;
  }
  window.storage.get(STORAGE_KEY, false).then(function(res){
    var arr = [];
    if(res && res.value){
      try{ arr = JSON.parse(res.value); }catch(e){ arr = []; }
    }
    window.__historyCache = arr;
    if(cb) cb(arr);
  }).catch(function(){
    window.__historyCache = [];
    if(cb) cb([]);
  });
}

export function saveHistoryArray(arr){
  window.__historyCache = arr;
  estadoApp.memoryHistory = arr;
  if(!STORAGE_AVAILABLE) return Promise.resolve();
  try{
    return window.storage.set(STORAGE_KEY, JSON.stringify(arr), false).catch(function(){});
  }catch(e){
    return Promise.resolve();
  }
}

export function renderHistoryList(){
  var arr = loadHistoryArray().slice().sort(function(a,b){ return b.timestamp-a.timestamp; });
  var el = document.getElementById('historyList');
  var clearBtn = document.getElementById('clearHistory');
  if(!arr.length){
    el.innerHTML = '<p class="history-empty">Nenhuma leitura ainda.</p>';
    clearBtn.style.display = 'none';
    return;
  }
  clearBtn.style.display = 'block';
  el.innerHTML = arr.map(function(h){
    var dotColor = h.error ? '#9AA69E' : pillHex(h.data && h.data.desempenho);
    return '<div class="history-item'+(h.id===estadoApp.currentRecordId?' active':'')+'" data-id="'+h.id+'">'
      + '<span class="history-dot" style="background:'+dotColor+'"></span>'
      + '<span class="history-text"><span class="eq">'+escapeHtml(h.equipe)+'</span><span class="dt">'+fmtDate(h.timestamp)+'</span></span>'
      + '<button class="history-del" data-del="'+h.id+'" title="Remover">×</button>'
      + '</div>';
  }).join('');

  el.querySelectorAll('.history-item').forEach(function(item){
    item.addEventListener('click', function(e){
      if(e.target.classList.contains('history-del')) return;
      var id = item.getAttribute('data-id');
      var rec = loadHistoryArray().find(function(h){ return h.id === id; });
      if(rec){
        estadoApp.currentRecordId = id;
        renderDashboard(rec, calcularSerieTendencia(latestWb, anchorMonthDate(), TREND_MESES));
      }
    });
  });
  el.querySelectorAll('.history-del').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var id = btn.getAttribute('data-del');
      var arr2 = loadHistoryArray().filter(function(h){ return h.id !== id; });
      saveHistoryArray(arr2).then(function(){
        if(id === estadoApp.currentRecordId && arr2.length){
          var latest = arr2.slice().sort(function(a,b){return b.timestamp-a.timestamp;})[0];
          estadoApp.currentRecordId = latest.id;
          renderDashboard(latest);
        } else {
          renderHistoryList();
        }
      });
    });
  });
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
document.getElementById('clearHistory').addEventListener('click', function(){
    if(!confirm('Remover todo o histórico de leituras deste navegador?')) return;
    saveHistoryArray([]).then(function(){
      estadoApp.currentRecordId = null;
      renderHistoryList();
    });
  });
}
