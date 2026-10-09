// ======================================================================
// nucleo/utils.js
// Formatação, escape, cores e textos de interpretação
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { CLASS_ARC_HEX, CLASS_ARC_HEX_OV, CLASS_ARC_HEX_OV_ATIVA, CLASS_PILL_HEX } from './fetch-csv.js';
import { OV_ICONS } from '../visual/gauge.js';

// ---------- Helpers ----------
export function fmtInt(v){
  if(v===null||v===undefined||isNaN(v)) return "—";
  return Number(v).toLocaleString('pt-BR');
}

export function fmtDec(v,d){
  if(v===null||v===undefined||isNaN(v)) return "—";
  return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
}

export function fmtDate(ts){
  var d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + " às " + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function shortDate(ts){
  var d = new Date(ts);
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}

export function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Texto "completo" de uma célula pra busca/filtro-por-coluna/PDF: normalmente
// é só o texto renderizado (cell.textContent), mas algumas células (ex.: a
// coluna "Profissional" de "Pessoas Atendidas", que exibe só o profissional
// responsável + um badge "+N") guardam o valor original completo em
// data-cell-text (URI-encoded) — ver renderListCard — porque o texto
// renderizado na tela não é mais igual ao dado bruto usado pra filtrar.
function cellFullText(cell){
  if(!cell) return '';
  var raw = cell.getAttribute ? cell.getAttribute('data-cell-text') : null;
  if(raw === null || raw === undefined) return cell.textContent.trim();
  try{ return decodeURIComponent(raw); }catch(e){ return cell.textContent.trim(); }
}

// Debounce simples: só executa fn depois que o usuário parou de disparar
// o evento por `ms` milissegundos (ex.: parar de digitar). Evita
// recalcular uma lista inteira (potencialmente 1000+ linhas) a cada tecla.
export function debounce(fn, ms){
  var timer = null;
  return function(){
    var args = arguments, ctx = this;
    clearTimeout(timer);
    timer = setTimeout(function(){ fn.apply(ctx, args); }, ms);
  };
}

export function pillHex(c){ return CLASS_PILL_HEX[c] || "#9AA69E"; }

export function arcHex(c){ return CLASS_ARC_HEX[c] || "#9AA69E"; }

export function arcHexOv(c){ return CLASS_ARC_HEX_OV[c] || "#9AA69E"; }

export function arcHexOvAtiva(c){ return CLASS_ARC_HEX_OV_ATIVA[c] || "#9AA69E"; }

// Texto descritivo da caixa "Interpretação" do card de gauge das abas
// M1/M2, de acordo com a classificação atual do indicador.
var GAUGE_INTERPRETATION = {
  'Regular':    'indicando necessidade de atenção nas ações do programa.',
  'Suficiente': 'mostrando um desempenho satisfatório das ações do programa.',
  'Bom':        'mostrando um desempenho positivo das ações do programa.',
  'Ótimo':      'mostrando um desempenho excelente das ações do programa.'
};

export function gaugeInterpretationHTML(classLabel){
  var txt = GAUGE_INTERPRETATION[classLabel] || 'refletindo o desempenho atual das ações do programa.';
  return 'O indicador está em nível <b>'+(classLabel||'—')+'</b>, '+txt;
}

// Cabeçalho dos cards de Numerador/Denominador: ícone de pessoas +
// título + badge com o valor total, no modelo das imagens de referência.
export function compCardHeaderHTML(title, totalValue){
  return '<div class="comp-card-head">'
    + '<div class="comp-card-icon"><svg viewBox="0 0 24 24">'+OV_ICONS.users+'</svg></div>'
    + '<h4>'+title+'</h4>'
    + '<span class="comp-card-total">'+fmtInt(totalValue)+'</span>'
    + '</div>';
}
