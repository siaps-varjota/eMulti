// ======================================================================
// visual/gauge.js
// Gauge (meia-lua), faixas de classificação e ícones de status
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { arcHex, arcHexOv } from '../nucleo/utils.js';

// ---------- Gauge ----------
export function polar(cx,cy,r,angleDeg){
  var a = angleDeg * Math.PI/180;
  return {x: cx + r*Math.cos(a), y: cy - r*Math.sin(a)};
}

export function arcPath(cx,cy,r,startAngle,endAngle){
  var p1 = polar(cx,cy,r,startAngle);
  var p2 = polar(cx,cy,r,endAngle);
  var large = Math.abs(startAngle-endAngle) > 180 ? 1 : 0;
  return "M "+p1.x+" "+p1.y+" A "+r+" "+r+" 0 "+large+" 1 "+p2.x+" "+p2.y;
}

export function buildGauge(value, domainMax, bands, gaugeId){
  var cx=115,cy=100,r=92,thick=16;
  // Arco de 240° — mesma abertura usada nos mini-gauges da Visão geral
  // (ver ovRingSVG), aplicada aqui pros gauges grandes das abas M1/M2 (e
  // do card de desempenho individual, que reaproveita esta função). As
  // cores das faixas (b.color, vindas de arcHex/arcHexOv) continuam
  // exatamente as mesmas de antes.
  var GAUGE_SWEEP = 240;
  var GAUGE_START = 90 + GAUGE_SWEEP/2; // 210° (era 180°)
  var bandsSvg = bands.map(function(b){
    var a1 = GAUGE_START - (b.from/domainMax)*GAUGE_SWEEP;
    var a2 = GAUGE_START - (b.to/domainMax)*GAUGE_SWEEP;
    return '<path d="'+arcPath(cx,cy,r,a1,a2)+'" stroke="'+b.color+'" stroke-width="'+thick+'" fill="none" stroke-linecap="round"/>';
  }).join('');
  var frac = (value===null || value===undefined || isNaN(value)) ? 0 : Math.max(0, Math.min(1, value/domainMax));
  var targetAngle = GAUGE_START - frac*GAUGE_SWEEP;
  var needleRotation = 180 - targetAngle; // graus a girar o ponteiro (que nasce apontando p/ 0)
  var needleLen = r - thick/2 - 6;
  var tipBase = polar(cx,cy,needleLen,180);
  // Ponteiro é desenhado sempre apontando para "0" (esquerda) e a rotação até
  // o valor real é feita via CSS puro (animation + custom property), em vez
  // de depender de JS aplicar o transform depois — isso evita que o ponteiro
  // fique "zerado" caso a atualização via JS não rode a tempo/corretamente.
  var needleSvg = '<g id="'+gaugeId+'" class="gauge-needle" style="transform-origin:'+cx+'px '+cy+'px;--target-angle:'+needleRotation+'deg;">'
    + '<line x1="'+cx+'" y1="'+cy+'" x2="'+tipBase.x+'" y2="'+tipBase.y+'" stroke="#13241F" stroke-width="3" stroke-linecap="round"/>'
    + '<circle cx="'+cx+'" cy="'+cy+'" r="5.5" fill="#13241F"/></g>';
  // Altura do viewBox recalculada pra abertura de 240°: com cy=100 o topo
  // do arco (90°) encosta em y=0 e a ponta inferior das faixas (210°/-30°)
  // termina em y=154 — antes era um semicírculo puro (0 0 230 134); agora
  // as pontas descem abaixo do centro, então a caixa ficou mais alta pra
  // não cortar as bordas do arco (ver também .gauge-value no CSS, cujo
  // margin-top foi recalculado pra continuar "colado" no ponteiro).
  return '<svg class="gauge-svg" viewBox="0 0 230 154">'+bandsSvg+needleSvg+'</svg>';
}

export function animateGauges(){
  // Mantida como no-op por compatibilidade com as chamadas existentes em
  // renderDashboard(); a animação agora é 100% CSS (ver .gauge-needle).
}

export var CLASS_BANDS_M1;

export var CLASS_BANDS_M2;

var CLASS_BANDS_NOTA;

// Mesmas faixas, só que com a cor mais intensa (arcHexOv) — usadas
// apenas nos anéis da Visão geral (overviewCardHTML/ovRingSVG).
export var CLASS_BANDS_M1_OV;

export var CLASS_BANDS_M2_OV;

export var CLASS_BANDS_NOTA_OV;

export function gaugeLegendHTML(items){
  return '<div class="gauge-legend">' + items.map(function(it){
    return '<span><i style="background:'+it.color+'"></i>'+it.label+' '+it.cond+'</span>';
  }).join('') + '</div>';
}

export var LEGEND_M1;

export var LEGEND_M2;

var LEGEND_NOTA;

// ---------- Cartões da Visão geral (modelo "ícone + anel + evolução") ----------
// Cor por STATUS (não mais por indicador): o ícone, o anel e o badge de
// cada cartão seguem a classificação atual daquele indicador.
var OV_STATUS;

var OV_STATUS_FALLBACK = {accent:'#6b7280', badgeBg:'#f3f4f6', badgeText:'#374151', icon:'•', barColor:'#d1d5db'};

export function ovStatus(classe){ return OV_STATUS[classe] || OV_STATUS_FALLBACK; }

export var OV_ICONS = {
  pulse: '<path d="M3 12h4l2-7 4 14 2-7h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  users: '<circle cx="8.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.3 13.6c2.6.3 4.7 2.3 4.7 5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  share: '<path d="M8.2 11l7.6-4.2M8.2 13l7.6 4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="5.5" r="3" fill="currentColor"/><circle cx="18" cy="18.5" r="3" fill="currentColor"/>',
  trophy: '<path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0V4z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 6H4.5v1.6A3 3 0 0 0 7.6 10.6M16.5 6h3v1.6a3 3 0 0 1-3.1 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 13.8V17M8.5 20h7M9.5 17h5v3h-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  speed: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12l4.5-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'
};

export function ovIconHTML(kind, st){
  return '<div class="ov-icon" style="background:'+st.badgeBg+';color:'+st.accent+';">'
    + '<svg viewBox="0 0 24 24">'+OV_ICONS[kind]+'</svg></div>';
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
  CLASS_BANDS_M1 = [
    {from:0,to:1,classe:"Regular",color:arcHex("Regular")},
    {from:1,to:2,classe:"Suficiente",color:arcHex("Suficiente")},
    {from:2,to:3,classe:"Bom",color:arcHex("Bom")},
    {from:3,to:4,classe:"Ótimo",color:arcHex("Ótimo")}
  ];

  CLASS_BANDS_M2 = [
    {from:0,to:1,classe:"Regular",color:arcHex("Regular")},
    {from:1,to:2.5,classe:"Suficiente",color:arcHex("Suficiente")},
    {from:2.5,to:5,classe:"Bom",color:arcHex("Bom")},
    {from:5,to:8,classe:"Ótimo",color:arcHex("Ótimo")}
  ];

  CLASS_BANDS_NOTA = [
    {from:0,to:2.5,classe:"Regular",color:arcHex("Regular")},
    {from:2.5,to:5,classe:"Suficiente",color:arcHex("Suficiente")},
    {from:5,to:7.5,classe:"Bom",color:arcHex("Bom")},
    {from:7.5,to:10,classe:"Ótimo",color:arcHex("Ótimo")}
  ];

  CLASS_BANDS_M1_OV = [
    {from:0,to:1,classe:"Regular",color:arcHexOv("Regular")},
    {from:1,to:2,classe:"Suficiente",color:arcHexOv("Suficiente")},
    {from:2,to:3,classe:"Bom",color:arcHexOv("Bom")},
    {from:3,to:4,classe:"Ótimo",color:arcHexOv("Ótimo")}
  ];

  CLASS_BANDS_M2_OV = [
    {from:0,to:1,classe:"Regular",color:arcHexOv("Regular")},
    {from:1,to:2.5,classe:"Suficiente",color:arcHexOv("Suficiente")},
    {from:2.5,to:5,classe:"Bom",color:arcHexOv("Bom")},
    {from:5,to:8,classe:"Ótimo",color:arcHexOv("Ótimo")}
  ];

  CLASS_BANDS_NOTA_OV = [
    {from:0,to:2.5,classe:"Regular",color:arcHexOv("Regular")},
    {from:2.5,to:5,classe:"Suficiente",color:arcHexOv("Suficiente")},
    {from:5,to:7.5,classe:"Bom",color:arcHexOv("Bom")},
    {from:7.5,to:10,classe:"Ótimo",color:arcHexOv("Ótimo")}
  ];

  LEGEND_M1 = [
    {label:'Ótimo',      cond:'&gt; 3',           color:arcHex('Ótimo')},
    {label:'Bom',        cond:'&gt; 2 e ≤ 3',     color:arcHex('Bom')},
    {label:'Suficiente', cond:'&gt; 1 e ≤ 2',     color:arcHex('Suficiente')},
    {label:'Regular',    cond:'≤ 1',              color:arcHex('Regular')}
  ];

  LEGEND_M2 = [
    {label:'Ótimo',      cond:'&gt; 5%',              color:arcHex('Ótimo')},
    {label:'Bom',        cond:'&gt; 2,5% e ≤ 5%',     color:arcHex('Bom')},
    {label:'Suficiente', cond:'&gt; 1% e ≤ 2,5%',     color:arcHex('Suficiente')},
    {label:'Regular',    cond:'≤ 1%',                 color:arcHex('Regular')}
  ];

  LEGEND_NOTA = [
    {label:'Ótimo',      cond:'&gt; 7,5',            color:arcHex('Ótimo')},
    {label:'Bom',        cond:'≥ 5 e ≤ 7,5',         color:arcHex('Bom')},
    {label:'Suficiente', cond:'&gt; 2,5 e &lt; 5',   color:arcHex('Suficiente')},
    {label:'Regular',    cond:'≤ 2,5',               color:arcHex('Regular')}
  ];

  OV_STATUS = {
    'Ótimo':      {accent:arcHexOv('Ótimo'), badgeBg:'#eff6ff', badgeText:'#1e40af', icon:'★', barColor:arcHexOv('Ótimo')},
    'Bom':        {accent:arcHexOv('Bom'), badgeBg:'#dcfce7', badgeText:'#166534', icon:'↗', barColor:arcHexOv('Bom')},
    'Suficiente': {accent:arcHexOv('Suficiente'), badgeBg:'#ffedd5', badgeText:'#9a3412', icon:'→', barColor:arcHexOv('Suficiente')},
    'Regular':    {accent:arcHexOv('Regular'), badgeBg:'#fee2e2', badgeText:'#991b1b', icon:'↘', barColor:arcHexOv('Regular')}
  };
}
