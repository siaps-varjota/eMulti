// ======================================================================
// abas/m1-m2.js
// Abas M1 / M2 — cards, metas e layout
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { evoTrackHTML } from './geral-cards.js';
import { mesesDosQuadsSelecionadosUniao } from '../nucleo/periodos.js';
import { escapeHtml, fmtDec, fmtInt, pillHex } from '../nucleo/utils.js';
import { CLASS_BANDS_M1, buildGauge, gaugeLegendHTML, ovIconHTML, ovStatus } from '../visual/gauge.js';
import { kpiPanelHTML, kpiPanelIcon } from '../visual/painel-kpi.js';

// ---------- Cards das abas M1/M2 no modelo de 3 colunas (imagem de
// referência): coluna 1 com o arco + resultado + Evolução do
// quadrimestre embutida no mesmo cartão, abaixo do gauge. ----------
var IP_TREND_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>';

// Conteúdo interno de "Evolução (Quadrimestre)" — sem o wrapper de card
// próprio, pra poder ser embutido dentro de outro cartão (o do gauge)
// ou, se algum dia precisar de novo isolado, envolvido por fora.
function ipEvoContentHTML(value, anterior, domainMax, decimals, suffix, bands, classLabel){
  suffix = suffix || '';
  if(anterior==null || value==null){
    return '<div class="ip-evo-head"><div class="ip-evo-head-left">'+IP_TREND_ICON_SVG+'<h4>Evolução (Quadrimestre)</h4></div></div>'
      + '<p class="ov-evo-empty">Sem histórico suficiente pra comparar com o quadrimestre anterior.</p>';
  }
  var delta = value - anterior;
  var dir = delta>0.0001 ? 'up' : (delta<-0.0001 ? 'down' : 'flat');
  var arrow = dir==='up' ? '↗' : (dir==='down' ? '↘' : '→');
  var color = dir==='up' ? '#15803d' : (dir==='down' ? '#b91c1c' : 'var(--ink-soft)');
  var deltaTxt = (delta>0?'+':'') + fmtDec(delta,decimals) + suffix;
  return '<div class="ip-evo-head">'
    +   '<div class="ip-evo-head-left">'+IP_TREND_ICON_SVG+'<h4>Evolução (Quadrimestre)</h4></div>'
    +   '<span class="ip-evo-delta" style="color:'+color+';">'+arrow+' '+deltaTxt+'</span>'
    + '</div>'
    + evoTrackHTML(value, anterior, domainMax, decimals, suffix, bands, classLabel);
}

// Cartão do gauge (coluna 1): arco + resultado no topo, legenda de
// faixas logo abaixo do arco, e a Evolução do quadrimestre embutida no
// final, dentro do mesmo cartão.
export function ipGaugeCardHTML(value, domainMax, bands, gaugeId, valueHtml, classLabel, capText, anterior, decimals, suffix, legend, iconKind){
  // Sem gauge: o resultado vira um número grande num painel na cor do
  // status (ver kpiPanelHTML). gaugeId/bands seguem na assinatura só por
  // compatibilidade — bands ainda é usado pela trilha de Evolução.
  var st = ovStatus(classLabel);
  iconKind = iconKind || 'pulse';
  return '<div class="card ip-gauge-card" style="border-top:4px solid '+st.accent+';">'
    + '<div class="kpi-head">'
    +   '<div class="ov-head-left">'+ovIconHTML(iconKind, st)+'<h3 class="kpi-head-title">Resultado do indicador</h3></div>'
    +   '<span class="ov-badge" style="background:'+st.badgeBg+';color:'+st.badgeText+';">'+st.icon+' '+(classLabel||'—')+'</span>'
    + '</div>'
    + kpiPanelHTML(st, kpiPanelIcon(iconKind), valueHtml, capText, value, domainMax)
    + (legend ? '<div class="ip-gauge-legend-row">'+gaugeLegendHTML(legend)+'</div>' : '')
    + '<div class="ip-evo-embed">'+ipEvoContentHTML(value, anterior, domainMax, decimals, suffix, bands, classLabel)+'</div>'
    + '</div>';
}

// Próxima faixa acima da classificação atual (pra montar a frase "Para
// alcançar a faixa X, é necessário...") — usa as próprias bands do gauge.
export function nextTierInfo(classLabel, bands){
  var idx = -1;
  for(var i=0;i<bands.length;i++){ if(bands[i].classe===classLabel){ idx=i; break; } }
  if(idx<0 || idx>=bands.length-1) return null;
  return {label: bands[idx+1].classe, threshold: bands[idx+1].from};
}

// Bloco "Leitura do M1/M2" (abaixo das 3 colunas): resume em texto o
// valor atual, a variação em relação ao período anterior e o que falta
// pra subir de faixa.
export function ipReadingHTML(title, value, classLabel, anterior, decimals, suffix, bands, unitLabel){
  var valTxt = fmtDec(value,decimals)+suffix;
  var base = 'O indicador está em <b>'+valTxt+'</b>, classificado como <b>'+(classLabel||'—')+'</b>.';
  var deltaTxt = '';
  if(anterior!=null && value!=null){
    var delta = value - anterior;
    if(Math.abs(delta) > 0.0001){
      var dir = delta>0 ? 'aumento' : 'redução';
      deltaTxt = ' Houve '+dir+' de '+fmtDec(Math.abs(delta),decimals)+suffix+' em relação ao período anterior.';
    } else {
      deltaTxt = ' O valor se manteve estável em relação ao período anterior.';
    }
  }
  var nextTxt = '';
  var next = nextTierInfo(classLabel, bands);
  if(next){
    nextTxt = ' Para alcançar a faixa <b>'+next.label+'</b>, é necessário atingir pelo menos '+fmtDec(next.threshold,decimals)+suffix+' '+unitLabel+'.';
  } else if(classLabel==='Ótimo'){
    nextTxt = ' O indicador já está na faixa máxima (Ótimo).';
  }
  return '<div class="card ip-reading">'
    + '<span class="ip-reading-icon">💡</span>'
    + '<p class="ip-reading-text"><b>'+title+':</b> '+base+deltaTxt+nextTxt+'</p>'
    + '</div>';
}

// ---------- Meta do quadrimestre ----------
// Ícone simples de alvo/meta usado no cabeçalho de cada bloco.
export var METAS_ICON_SVG;

function fmtDecMeta(n){
  return (Math.round(n*10)/10).toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1});
}

// Um card de meta (ex.: "Bom" ou "Ótimo"): alvo a bater, ritmo médio
// necessário até o fim do quadrimestre e quanto ainda falta.
function metaCardHTML(cfg){
  var subLines =
      '<p class="meta-card-sub">Média/mês: '+fmtDecMeta(cfg.mediaMes)+'</p>'
    + '<p class="meta-card-sub">Média/semana: '+fmtDecMeta(cfg.mediaSemana)+'</p>';
  var faltamHtml;
  if(cfg.faltam<=0){
    faltamHtml = '<p class="meta-card-done">Meta já atingida ✓</p>';
  } else if(cfg.semanasRestantes<=0){
    faltamHtml = '<p class="meta-card-faltam">Faltam: '+fmtInt(cfg.faltam)+' '+cfg.unidadeFaltam+' (quadrimestre encerrado)</p>';
  } else {
    faltamHtml = '<p class="meta-card-faltam">Faltam: '+fmtInt(cfg.faltam)+' '+cfg.unidadeFaltam+'</p>'
      + '<p class="meta-card-sub">Média/semana: '+fmtDecMeta(cfg.mediaSemanaFaltam)+'</p>';
  }
  return '<div class="meta-card">'
    + '<h4 style="color:'+cfg.color+'">'+cfg.label+'</h4>'
    + '<div class="meta-card-value" style="color:'+cfg.color+'">'+fmtInt(cfg.alvo)+' <span>'+cfg.unidade+'</span></div>'
    + subLines + faltamHtml
    + '</div>';
}

// Bloco completo de meta do quadrimestre para um indicador (M1 ou M2):
// cabeçalho com a base de cálculo + selo "Preliminar"/"Projeção"
// (enquanto o quadrimestre ainda não terminou) e os cards de cada
// faixa-alvo. projecaoLabel (opcional): quando a média usada é uma
// projeção baseada só nos meses já decorridos (ver
// mesesElapsedDoQuadrimestre), mostra "Projeção (base: <meses>)" em
// vez do "Preliminar" genérico.
export function metaQuadrimestreHTML(titulo, base, baseLabel, cardsCfg, preliminar, projecaoLabel){
  var cardsHtml = cardsCfg.map(metaCardHTML).join('');
  var selo = projecaoLabel
    ? '<span class="pill-preliminar" title="Meses ainda sem dado real são projetados pelo ritmo de '+escapeHtml(projecaoLabel)+'"><i></i>Projeção (base: '+escapeHtml(projecaoLabel)+')</span>'
    : (preliminar ? '<span class="pill-preliminar"><i></i>Preliminar</span>' : '');
  return '<div class="meta-quad-wrap">'
    + '<div class="meta-quad-head">'
    +   '<span class="meta-icon">'+METAS_ICON_SVG+'</span>'
    +   '<div class="meta-quad-titles"><h3>'+titulo+'</h3><p>de <b>'+fmtInt(base)+'</b> '+baseLabel+'</p></div>'
    +   selo
    + '</div>'
    + '<div class="meta-cards">'+cardsHtml+'</div>'
    + '</div>';
}

// Calcula os cards de meta (Bom/Ótimo) de um indicador para o
// quadrimestre selecionado: alvo = limiar × base (denominador), ritmo
// médio necessário (mês/semana) pra bater o alvo ao longo do
// quadrimestre inteiro, e quanto falta + ritmo pro tempo que resta.
// Versão compacta do bloco de Meta do quadrimestre, no formato de
// comp-card — usada empilhada junto com Numerador/Denominador nas
// abas M1/M2 (ver mm-comp-col). Mostra só o essencial: alvo de cada
// faixa (Bom/Ótimo) e quanto falta, sem os detalhes de ritmo médio
// (que só aparecem no bloco completo da Visão geral).
export function metaQuadrimestreMiniHTML(base, baseLabel, cardsCfg, preliminar, projecaoLabel){
  // Cada faixa (Bom/Ótimo) agora é uma "caixa" própria — ponto colorido +
  // rótulo/alvo à esquerda, badge de status (faltam X / meta atingida) à
  // direita — no modelo das imagens de referência.
  var CHECK_SVG = '<svg class="meta-mini-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" opacity=".15"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>';
  var rows = cardsCfg.map(function(c){
    // "Quase lá" (faltam menos que o ritmo médio de uma semana): mostra
    // em verde, com check, mas ainda informando quanto falta — em vez do
    // alerta vermelho, reservado pra metas mais distantes.
    var quaseLa = c.faltam>0 && c.mediaSemana>0 && c.faltam <= c.mediaSemana;
    var status;
    if(c.faltam<=0){
      status = '<span class="meta-mini-status meta-mini-status-ok">'+CHECK_SVG+'Meta atingida</span>';
    } else if(quaseLa){
      status = '<span class="meta-mini-status meta-mini-status-ok">'+CHECK_SVG+'Faltam '+fmtInt(c.faltam)+' '+c.unidadeFaltam+'</span>';
    } else {
      status = '';
    }
    var alertHtml = (c.faltam>0 && !quaseLa)
      ? '<div class="meta-mini-alert"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 8v5"/><circle cx="12" cy="15.8" r=".9" fill="currentColor" stroke="none"/></svg>'
        + '<span>Faltam '+fmtInt(c.faltam)+' '+c.unidadeFaltam+'.</span></div>'
      : '';
    return '<div class="meta-mini-row" style="background:color-mix(in srgb,'+c.color+' 10%,white);border-color:color-mix(in srgb,'+c.color+' 30%,white);">'
      + '<div class="meta-mini-row-left">'
      +   '<span class="meta-mini-dot" style="background:'+c.color+'"></span>'
      +   '<div><p class="meta-mini-label" style="color:'+c.color+';">'+c.label+'</p>'
      +     '<p class="meta-mini-sub">Alvo: '+fmtInt(c.alvo)+' '+c.unidade+'</p>'
      +     '<p class="meta-mini-basenote">(base de '+fmtInt(base)+' '+baseLabel+')</p></div>'
      + '</div>'
      + status
      + '</div>'
      + alertHtml;
  }).join('');
  return '<div class="card comp-card meta-mini-card">'
    + '<div class="meta-mini-head"><span class="meta-mini-head-icon">'+METAS_ICON_SVG+'</span>'
    +   '<h4>Meta do quadrimestre'+(projecaoLabel
          ? ' <span class="pill-preliminar-mini" title="Meses ainda sem dado real são projetados pelo ritmo de '+escapeHtml(projecaoLabel)+'">Projeção</span>'
          : (preliminar ? ' <span class="pill-preliminar-mini">Preliminar</span>' : ''))+'</h4></div>'
    + '<div class="meta-mini-rows">'+rows+'</div>'
    + '</div>';
}

// ---------- Aba M1: novo layout (gauge + composição + metas num único card) ----------
// Card da esquerda: badge de status + gauge (reaproveita buildGauge/CLASS_BANDS_M1,
// o mesmo gauge usado em todo o resto do painel) + fórmula + régua de faixas.
function m1GaugeCardHTML(m1Value, classificacaoM1, numM1, denM1){
  var st = ovStatus(classificacaoM1);
  return '<div class="m1-card">'
    + '<div>'
    +   '<div class="m1-gauge-top">'
    +     '<span class="m1-gauge-top-title">Resultado do indicador</span>'
    +     '<span class="m1-badge-status" style="background:'+st.badgeBg+';color:'+st.badgeText+';">'+st.icon+' '+(classificacaoM1||'—')+'</span>'
    +   '</div>'
    +   '<div class="m1-gauge-wrapper">'+buildGauge(m1Value, 4, CLASS_BANDS_M1, 'needle-m1tab-m1')+'</div>'
    +   '<div class="m1-gauge-value-row">'
    +     '<div class="m1-gauge-value" style="color:'+pillHex(classificacaoM1)+';">'+fmtDec(m1Value,2)+'</div>'
    +     '<div class="m1-gauge-subtext">escala de 0 a 4</div>'
    +   '</div>'
    +   '<div class="m1-formula-box">'+fmtInt(numM1)+' atendimentos ÷ '+fmtInt(denM1)+' pessoas</div>'
    + '</div>'
    + '<div class="m1-meta-rule">'
    +   '<div class="m1-rule-item m1-rule-regular">≤1<br>Regular</div>'
    +   '<div class="m1-rule-item m1-rule-suficiente">&gt;1 e ≤2<br>Suficiente</div>'
    +   '<div class="m1-rule-item m1-rule-bom">&gt;2 e ≤3<br>Bom</div>'
    +   '<div class="m1-rule-item m1-rule-otimo">&gt;3<br>Ótimo</div>'
    + '</div>'
    + '</div>';
}

// Cards da direita: Numerador/Denominador do M1, no novo visual de barra
// empilhada + lista de itens (mesmos dados de sempre: atendIndGauge/
// participColGauge/denM1Gauge — só muda a apresentação).
function m1CompCardHTML(title, totalLabel, total, segments){
  var bars = segments.map(function(s){
    var pct = total>0 ? (s.value/total*100) : 0;
    return '<div class="m1-bar-segment" style="width:'+pct+'%;background:'+s.color+';"></div>';
  }).join('');
  var rows = segments.map(function(s){
    return '<div class="m1-item-row">'
      + '<span class="m1-item-label"><span class="m1-dot" style="background:'+s.color+';"></span>'+s.label+'</span>'
      + '<span style="font-weight:700;">'+fmtInt(s.value)+'</span>'
      + '</div>';
  }).join('');
  return '<div class="m1-card" style="padding:18px 20px;">'
    + '<div class="m1-section-title"><span>'+title+'</span><span style="font-size:.8125rem;font-weight:700;color:var(--ink);">'+totalLabel+'</span></div>'
    + '<div class="m1-stacked-bar">'+bars+'</div>'
    + '<div class="m1-item-list">'+rows+'</div>'
    + '</div>';
}

// Diagnóstico de metas do M1 no novo visual (caixa por faixa + tag de
// "faltam X"), usando os mesmos números já calculados em
// calcularMetasQuadrimestre (alvo com Math.ceil, faltam reais).
function m1DiagnosticoHTML(base, metaM1){
  var rows = metaM1.cards.map(function(c){
    var ok = c.faltam<=0;
    return '<div class="m1-meta-target-item">'
      + '<div><div class="m1-mt-lbl" style="color:'+c.color+';">• '+c.label+'</div>'
      +   '<div class="m1-mt-sub">Alvo: '+fmtInt(c.alvo)+' '+c.unidade+' (base: '+fmtInt(base)+' pessoas)</div></div>'
      + '<div class="m1-missing-tag'+(ok?' ok':'')+'">'+(ok?'Meta atingida ✓':'faltam '+fmtInt(c.faltam)+' '+c.unidade)+'</div>'
      + '</div>';
  }).join('');
  return '<div class="m1-diagnostic-card">'
    + '<div class="m1-section-title" style="margin-bottom:6px;"><span>Meta do Quadrimestre</span>'+(metaM1.preliminar ? '<span class="m1-pill-preliminar">Preliminar</span>' : '')+'</div>'
    + rows
    + '</div>';
}

export function calcularMetasQuadrimestre(numerador, denominador, thresholds, unidade, unidadeFaltam){
  var meses = mesesDosQuadsSelecionadosUniao();
  var inicioQuad = new Date(meses[0].getFullYear(), meses[0].getMonth(), 1, 0,0,0,0);
  var fimQuad = new Date(meses[meses.length-1].getFullYear(), meses[meses.length-1].getMonth()+1, 0, 23,59,59,999);
  var hoje = new Date();
  var diasQuad = Math.round((fimQuad-inicioQuad)/86400000)+1;
  var semanasQuad = diasQuad/7;
  var diasRestantes = Math.max(0, Math.round((fimQuad-hoje)/86400000));
  var semanasRestantes = diasRestantes/7;
  var cards = thresholds.map(function(t){
    var alvo = Math.ceil(t.value*denominador);
    var faltam = Math.max(0, alvo-(numerador||0));
    return {
      label: t.label, color: t.color, unidade: unidade, unidadeFaltam: unidadeFaltam || unidade,
      alvo: alvo,
      mediaMes: alvo/meses.length,
      mediaSemana: alvo/semanasQuad,
      faltam: faltam,
      semanasRestantes: semanasRestantes,
      mediaSemanaFaltam: semanasRestantes>0 ? faltam/semanasRestantes : 0
    };
  });
  return {cards: cards, preliminar: hoje < fimQuad};
}

export var M1_META_THRESHOLDS = [
  {value:2,   label:'Bom (M1 ≥ 2,00)',   color:'var(--arc-bom)'},
  {value:3,   label:'Ótimo (M1 ≥ 3,00)', color:'var(--arc-otimo)'}
];

export var M2_META_THRESHOLDS = [
  {value:0.025, label:'Bom (M2 ≥ 2,50%)',  color:'var(--arc-bom)'},
  {value:0.05,  label:'Ótimo (M2 ≥ 5,00%)', color:'var(--arc-otimo)'}
];

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
  METAS_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'
    + '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.3"/><circle cx="12" cy="12" r="1"/></svg>';
}
