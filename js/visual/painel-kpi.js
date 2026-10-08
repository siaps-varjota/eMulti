// ======================================================================
// visual/painel-kpi.js
// Painel "número grande", legenda e cartões da Visão geral (anel)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { arcHexOvAtiva, debounce, fmtDec } from '../nucleo/utils.js';
import { OV_ICONS, arcPath, ovStatus, polar } from './gauge.js';

// ---------- Painel "número grande" (substitui os gauges/anéis) ----------
// Cada indicador agora mostra o resultado como um número grande dentro de
// um painel suave na cor do status (Ótimo/Bom/Suficiente/Regular), com o
// ícone em círculo ao lado e a legenda "X ÷ Y" logo abaixo. As cores vêm
// de ovStatus() — as mesmas do badge e da borda do cartão.
function injectKpiStyles(){
  if(document.getElementById('kpiPanelStyles')) return;
  var css = ''
    + '.kpi-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}'
    + '.kpi-head-title{margin:0;font-size:15px;font-weight:700;line-height:1.25}'
    + '.kpi-panel{border-radius:18px;padding:16px 14px 14px;margin:12px 0 14px;text-align:center;'
    +   'background:var(--kpi-bg);background:color-mix(in srgb,var(--kpi-bg) 45%,#fff)}'
    + '.kpi-main{display:flex;align-items:center;justify-content:center;gap:clamp(10px,2vw,18px)}'
    + '.kpi-icon{flex:none;width:clamp(38px,4vw,48px);height:clamp(38px,4vw,48px);border-radius:50%;'
    +   'display:grid;place-items:center;color:var(--kpi-accent);'
    +   'background:var(--kpi-bg);background:color-mix(in srgb,var(--kpi-accent) 14%,transparent)}'
    + '.kpi-icon svg{width:50%;height:50%}'
    + '.kpi-value{font-weight:800;font-size:clamp(30px,3.6vw,44px);line-height:1;letter-spacing:-.02em;'
    +   'color:var(--kpi-accent);font-variant-numeric:tabular-nums}'
    + '.kpi-value .unit{font-size:.45em;font-weight:700;letter-spacing:0;margin-left:.08em}'
    + '.kpi-donut{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px}'
    + '.kpi-donut svg{width:clamp(70px,6.8vw,86px);height:auto;display:block}'
    + '.kpi-donut-label{font-size:10.5px;line-height:1.1;font-weight:600;color:var(--kpi-accent);opacity:.85}'
    + '.kpi-caption{margin:12px 0 0;font-size:14px;line-height:1.35;color:var(--ink,#2b3a35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
  var el = document.createElement('style');
  el.id = 'kpiPanelStyles';
  el.textContent = css;
  document.head.appendChild(el);
}

// Legenda do painel sempre em UMA linha: se o texto não cabe na largura
// do card, a fonte encolhe (de 14px até no mínimo 9px) até caber. Roda
// sempre que o DOM muda (cards re-renderizados) e quando o painel muda
// de tamanho (resize da janela, troca de aba que estava oculta).
var kpiFitRO;

function fitKpiCaptions(fromRO){
  var caps = document.querySelectorAll('.kpi-caption');
  Array.prototype.forEach.call(caps, function(cap){
    if(kpiFitRO && !fromRO && cap.parentNode) kpiFitRO.observe(cap.parentNode);
    if(!cap.clientWidth) return; // aba oculta: reajusta quando ficar visível
    cap.style.fontSize = '';
    var size = parseFloat(getComputedStyle(cap).fontSize) || 14;
    while(cap.scrollWidth > cap.clientWidth + 0.5 && size > 9){
      size -= 0.5;
      cap.style.fontSize = size + 'px';
    }
  });
}

var kpiFitDebounced;

// Meta "Ótimo" de cada escala (o valor a partir do qual o indicador vira
// Ótimo — ver OV_LEGEND_*): M1 > 3 (escala 0–4), M2 > 5% (escala 0–8),
// Desempenho = nota 10 (máxima da escala 0–10). 100% do donut = esse valor atingido.
var KPI_META_OTIMA = {4:3, 8:5, 10:10};

function kpiDonutHTML(value, domainMax, st){
  var meta = KPI_META_OTIMA[domainMax];
  if(value==null || isNaN(value) || !meta) return '';
  var pct = (value/meta)*100;
  var frac = Math.max(0, Math.min(1, value/meta));
  var r = 26, c = 2*Math.PI*r;
  // Anel também na cor da borda (st.accent), igual ao número grande —
  // st.badgeText ficou só pro texto do selo "→ Suficiente" etc.
  return '<div class="kpi-donut" title="'+fmtDec(pct,0)+'% '+(domainMax===10?'da nota máxima':'da meta Ótimo')+' (100% = '+fmtDec(meta,meta%1?1:0)+')">'
    + '<svg viewBox="0 0 64 64">'
    +   '<circle cx="32" cy="32" r="'+r+'" fill="none" stroke="'+st.accent+'" stroke-opacity=".16" stroke-width="8"/>'
    +   '<circle cx="32" cy="32" r="'+r+'" fill="none" stroke="'+st.accent+'" stroke-width="8" stroke-linecap="round"'
    +     ' stroke-dasharray="'+(frac*c).toFixed(2)+' '+c.toFixed(2)+'" transform="rotate(-90 32 32)"/>'
    +   '<text x="32" y="36.5" text-anchor="middle" font-size="13" font-weight="800" fill="'+st.accent+'">'+fmtDec(pct,0)+'%</text>'
    + '</svg>'
    + '<span class="kpi-donut-label">'+(domainMax===10?'da nota máxima':'da meta Ótimo')+'</span>'
    + '</div>';
}

// Ícone do painel por indicador: M1 (pulse) → pessoas, M2 (users) → compartilhamento, Desempenho → troféu.
export function kpiPanelIcon(kind){ return kind==='pulse' ? 'users' : (kind==='users' ? 'share' : 'trophy'); }

export function kpiPanelHTML(st, iconKind, valueHtml, caption, value, domainMax){
  // Número grande, ícone e "% da meta" usam a MESMA cor da borda do
  // cartão (st.accent) — antes usavam st.badgeText, que é uma cor à
  // parte (pensada pro contraste do badge "→ Suficiente" etc.) e por
  // isso destoava da borda em alguns status (ex.: Suficiente ficava
  // avermelhado enquanto a borda é laranja).
  return '<div class="kpi-panel" style="--kpi-accent:'+st.accent+';--kpi-bg:'+st.badgeBg+';">'
    +   '<div class="kpi-main">'
    +     '<div class="kpi-icon"><svg viewBox="0 0 24 24">'+OV_ICONS[iconKind]+'</svg></div>'
    +     '<div class="kpi-value">'+valueHtml+'</div>'
    +     kpiDonutHTML(value, domainMax, st)
    +   '</div>'
    +   (caption ? '<p class="kpi-caption">'+caption+'</p>' : '')
    + '</div>';
}

// Anel de progresso (valor ÷ domainMax) — usado no lugar do arco meia-lua
// nos cartões da Visão geral.
function ovRingSVG(value, domainMax, bands, classeAtual, st, gaugeId){
  // Arco de 240° (era meia lua de 180°): faixas proporcionais ao
  // domainMax, só a faixa do valor atual em cor cheia, as demais
  // esmaecidas, e um ponteiro indicando a posição exata do valor.
  // GAUGE_SWEEP/GAUGE_START controlam a abertura — as cores das faixas
  // continuam exatamente as mesmas de antes (vêm de b.color/st.accent).
  // cy foi recalculado pra o topo do arco (90°) encostar em y=0, e h
  // aumentado pra caber as pontas do arco (que agora descem abaixo do
  // centro) mais os mesmos 24px de "vão" reservados na base pro número
  // grande (.ov-value) continuar mordendo o mesmo espaço via margin-top
  // negativo (ver .ov-value no CSS) — nada mudou nesse comportamento.
  var GAUGE_SWEEP = 240;
  var GAUGE_START = 90 + GAUGE_SWEEP/2; // 210° (era 180°)
  var w=140, h=125, cx=70, cy=65, r=58, thick=14;
  if(!bands || !bands.length){
    // fallback: se não vier bands, desenha só uma faixa cheia até o valor
    // (mesma lógica de antes, agora em formato de 240°).
    var frac0 = (value==null || !domainMax) ? 0 : Math.max(0, Math.min(1, value/domainMax));
    var a0 = GAUGE_START - frac0*GAUGE_SWEEP;
    return '<svg class="gauge-svg ov-ring-svg" viewBox="0 0 '+w+' '+h+'">'
      + '<path d="'+arcPath(cx,cy,r,GAUGE_START,GAUGE_START-GAUGE_SWEEP)+'" stroke="'+st.badgeBg+'" stroke-width="'+thick+'" fill="none"/>'
      + '<path d="'+arcPath(cx,cy,r,GAUGE_START,a0)+'" stroke="'+st.accent+'" stroke-width="'+thick+'" fill="none" stroke-linecap="round"/>'
      + '</svg>';
  }
  var bandsSvg = bands.map(function(b){
    var a1 = GAUGE_START - (b.from/domainMax)*GAUGE_SWEEP;
    var a2 = GAUGE_START - (b.to/domainMax)*GAUGE_SWEEP;
    var ativa = (b.classe === classeAtual);
    // Faixa do resultado atual: cor mais saturada (arcHexOvAtiva) e
    // opacidade cheia. Demais faixas (fora do intervalo): cor normal
    // (b.color/arcHexOv), bem mais esmaecidas (opacidade baixa).
    var cor = ativa ? arcHexOvAtiva(b.classe) : b.color;
    return '<path d="'+arcPath(cx,cy,r,a1,a2)+'" stroke="'+cor+'" stroke-width="'+thick+'" fill="none" stroke-opacity="'+(ativa?1:0.28)+'"/>';
  }).join('');
  var frac = (value===null || value===undefined || isNaN(value)) ? 0 : Math.max(0, Math.min(1, value/domainMax));
  var targetAngle = GAUGE_START - frac*GAUGE_SWEEP;
  var needleRotation = 180 - targetAngle; // graus a girar o ponteiro (que nasce apontando p/ 0)
  var needleLen = r - thick/2 - 5;
  var tipBase = polar(cx,cy,needleLen,180);
  // Ponteiro sempre desenhado apontando pra "0" (esquerda) e girado até o
  // valor real via CSS (.gauge-needle + --target-angle) — mesma técnica
  // usada no gauge de 240° das abas M1/M2, pra ter o mesmo efeito de
  // movimento em vez de aparecer já na posição final.
  var needleSvg = '<g id="'+gaugeId+'" class="gauge-needle" style="transform-origin:'+cx+'px '+cy+'px;--target-angle:'+needleRotation+'deg;">'
    + '<line x1="'+cx+'" y1="'+cy+'" x2="'+tipBase.x+'" y2="'+tipBase.y+'" stroke="#13241F" stroke-width="2.5" stroke-linecap="round"/>'
    + '<circle cx="'+cx+'" cy="'+cy+'" r="4.5" fill="#13241F"/></g>';
  return '<svg class="gauge-svg ov-ring-svg" viewBox="0 0 '+w+' '+h+'">'+bandsSvg+needleSvg+'</svg>';
}

// Régua de faixas (Regular → Ótimo) no rodapé do card, cada chip com a
// cor do respectivo status.
export function ovLegendHTML(items){
  var out = items.map(function(it){
    var st = ovStatus(it.classe);
    return '<div class="ov-legend-item">'
      + '<span class="ov-legend-swatch" style="background:'+st.barColor+';"></span>'
      + '<span class="ov-legend-text"><b>'+it.cond+'</b> '+it.classe+'</span>'
      + '</div>';
  }).join('');
  return '<div class="ov-legend">'+out+'</div>';
}

export var OV_LEGEND_M1 = [
  {classe:'Regular',    cond:'≤ 1'},
  {classe:'Suficiente', cond:'&gt; 1 e ≤ 2'},
  {classe:'Bom',        cond:'&gt; 2 e ≤ 3'},
  {classe:'Ótimo',      cond:'&gt; 3'}
];

export var OV_LEGEND_M2 = [
  {classe:'Regular',    cond:'≤ 1%'},
  {classe:'Suficiente', cond:'&gt; 1% e ≤ 2,5%'},
  {classe:'Bom',        cond:'&gt; 2,5% e ≤ 5%'},
  {classe:'Ótimo',      cond:'&gt; 5%'}
];

export var OV_LEGEND_NOTA = [
  {classe:'Regular',    cond:'≤ 2,5'},
  {classe:'Suficiente', cond:'&gt; 2,5 e &lt; 5'},
  {classe:'Bom',        cond:'≥ 5 e ≤ 7,5'},
  {classe:'Ótimo',      cond:'&gt; 7,5'}
];

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
injectKpiStyles();

  kpiFitRO = window.ResizeObserver ? new ResizeObserver(debounce(function(){ fitKpiCaptions(true); }, 60)) : null;

  kpiFitDebounced = debounce(function(){ fitKpiCaptions(false); }, 30);

if(window.MutationObserver){
    new MutationObserver(kpiFitDebounced).observe(document.body, {childList:true, subtree:true});
  }

window.addEventListener('resize', kpiFitDebounced);

kpiFitDebounced();
}
