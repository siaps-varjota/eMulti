// ======================================================================
// nucleo/fetch-csv.js
// Busca das abas (Apps Script) e paletas de cor por classe
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { requiredSheetNames } from './config.js';

// Busca o CSV de uma aba pelo backend (Apps Script), autenticado pelo
// token da sessão. Devolve uma Promise com o texto CSV.
export function fetchSheetCsv(sheetName){
  var api = window.PAINEL_API;
  var token = window.painelToken && window.painelToken();
  if(!api || !token) return Promise.reject(new Error('Sessão não iniciada — faça login.'));
  return fetch(api.url, {
    method:'POST', headers:{'Content-Type':'text/plain'}, cache:'no-store',
    body: JSON.stringify({chave:api.chave, acao:'dados', token:token, aba:sheetName})
  })
    .then(function(res){ if(!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function(r){
      if(r.status === 'sessao_expirada'){
        if(window.logoutPainelEmulti) window.logoutPainelEmulti();
        throw new Error('Sessão expirada — faça login novamente.');
      }
      if(r.status !== 'ok') throw new Error(r.mensagem || 'Falha ao ler a aba');
      return r.csv;
    });
}

export function fetchAllSheets(){
  return Promise.all(requiredSheetNames().map(function(name){
    return fetchSheetCsv(name)
      .then(function(csvText){ return {name:name, csvText:csvText, ok:true}; })
      .catch(function(err){ return {name:name, error:err, ok:false}; });
  }));
}

export var CLASS_PILL_HEX = {"Ótimo":"#2F6F5E","Bom":"#6B8F71","Suficiente":"#C68A3D","Regular":"#B5474B"};

export var CLASS_ARC_HEX = {"Regular":"#E63737","Suficiente":"#F4A734","Bom":"#2BB659","Ótimo":"#2775E7"};

// Versão só um pouco mais intensa/saturada, usada apenas nos anéis da
// Visão geral (ovRingSVG) — não afeta os gauges grandes das abas M1/M2,
// que continuam usando CLASS_ARC_HEX normalmente.
export var CLASS_ARC_HEX_OV = {"Regular":"#BF2929","Suficiente":"#CF7E09","Bom":"#2A894A","Ótimo":"#1B59B5"};

// Ainda mais saturada que CLASS_ARC_HEX_OV — usada só na faixa ATIVA
// (o intervalo onde o resultado atual do gauge cai) dos anéis da Visão
// geral, pra destacar mais o intervalo certo; as demais faixas (fora do
// intervalo) continuam com CLASS_ARC_HEX_OV, só que com opacidade menor
// (ver ovRingSVG) pra ficarem ainda mais esmaecidas.
export var CLASS_ARC_HEX_OV_ATIVA = {"Regular":"#C61010","Suficiente":"#D67D00","Bom":"#15933F","Ótimo":"#0553C7"};
