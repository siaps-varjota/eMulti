// ======================================================================
// abas/geral-cards.js
// Aba Visão geral — cartões, evolução e quadrimestre anterior
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { METAS_ICON_SVG, nextTierInfo } from './m1-m2.js';
import { latestWb } from '../app/carga.js';
import { addMonths } from '../nucleo/config.js';
import { PONTOS_POR_CLASSE, classificarM1, classificarM2 } from '../nucleo/dados.js';
import { quadShortLabel, ultimoMesDosQuadsSelecionados } from '../nucleo/periodos.js';
import { calcularSerieTendencia } from '../nucleo/seletores-periodo.js';
import { escapeHtml, fmtDec, gaugeInterpretationHTML, pillHex } from '../nucleo/utils.js';
import { OV_ICONS, buildGauge, gaugeLegendHTML, ovIconHTML, ovStatus } from '../visual/gauge.js';
import { kpiPanelHTML, kpiPanelIcon, ovLegendHTML } from '../visual/painel-kpi.js';

// Quadrimestre imediatamente anterior ao selecionado, calculado com a
// MESMA metodologia do quadrimestre atual (média do m1/m2 de cada um dos
// 4 meses, cada um já com sua janela móvel oficial — ver mediaDeMeses) —
// usado só pro bloco "Evolução - Quadrimestre" dos cartões da Visão
// geral. Retorna null nos campos que não tiverem os 4 meses de dado
// disponíveis (aí o cartão mostra "Sem histórico" pra aquele indicador).
export function calcularQuadrimestreAnterior(){
  if(!latestWb) return {m1:null, m2:null, notaFinal:null};
  var anchorAtual = ultimoMesDosQuadsSelecionados();
  var anchorAnterior = addMonths(anchorAtual, -4);
  var pontos = calcularSerieTendencia(latestWb, anchorAnterior, 4);
  function media(campo){
    var vals = pontos.map(function(p){ return p[campo]; }).filter(function(v){ return v!=null; });
    if(vals.length < 4) return null; // só conta como quadrimestre completo com os 4 meses
    return vals.reduce(function(a,b){ return a+b; }, 0) / vals.length;
  }
  var m1 = media('m1');
  var m2 = media('m2');
  var classificacaoM1 = m1!=null ? classificarM1(m1) : null;
  var classificacaoM2 = m2!=null ? classificarM2(m2) : null;
  var p1 = classificacaoM1 ? PONTOS_POR_CLASSE[classificacaoM1]*6 : null;
  var p2 = classificacaoM2 ? PONTOS_POR_CLASSE[classificacaoM2]*4 : null;
  var notaFinal = (p1!=null && p2!=null) ? (p1+p2) : null;
  return {m1:m1, m2:m2, notaFinal:notaFinal, label:quadShortLabel(anchorAnterior)};
}

// Trilha compartilhada da "Evolução (Quadrimestre)": fundo esmaecido
// (50% de opacidade) com o gradiente das faixas reais do indicador
// (mesmas cores do arco/legenda, alinhadas aos limiares de classificação
// — ver evoTrackGradient), com uma barra sólida por cima preenchendo até
// o valor atual e um traço marcando onde estava o valor do quadrimestre
// anterior.
function evoTrackGradient(bands, domainMax){
  var stops = bands.map(function(b){
    var mid = (b.from + b.to) / 2;
    var pct = Math.max(0, Math.min(100, (mid/domainMax)*100));
    return b.color + ' ' + pct.toFixed(1) + '%';
  });
  return 'linear-gradient(90deg,' + stops.join(',') + ')';
}

export function evoTrackHTML(atual, anterior, domainMax, decimals, suffix, bands, classLabel){
  var delta = atual - anterior;
  var dir = delta > 0.0001 ? 'up' : (delta < -0.0001 ? 'down' : 'flat');
  var fracAtual = Math.max(0, Math.min(1, atual/domainMax));
  var fracAnterior = Math.max(0, Math.min(1, anterior/domainMax));
  var fillColor = dir==='down' ? '#A84747' : (dir==='up' ? '#15803d' : '#51605A');
  var bandStyle = bands ? ' style="background:'+evoTrackGradient(bands, domainMax)+';"' : '';
  // Próxima meta: limiar (bands[].from) da faixa de classificação
  // seguinte à atual (mesma lógica de nextTierInfo, usada também no
  // bloco "Leitura do M1/M2") — marcada na trilha com um traço azul,
  // igual ao traço cinza do "Anterior", mas com estilo/posição
  // sempre via inline style (não depende de CSS externo já existir pra
  // essa classe nova) pra garantir que apareça mesmo sem CSS
  // específico. Quando já está na faixa máxima (Ótimo), não há
  // "próxima" — mostra um aviso nesse sentido em vez do traço.
  var next = (bands && classLabel) ? nextTierInfo(classLabel, bands) : null;
  var metaMarkHTML = '';
  var metaLineHTML = '';
  if(next){
    var fracMeta = Math.max(0, Math.min(1, next.threshold/domainMax));
    metaMarkHTML = '<div class="ov-evo-mark ov-evo-mark-meta" style="position:absolute;top:0;bottom:0;left:'
      +(fracMeta*100).toFixed(1)+'%;width:2px;background:#2563EB;z-index:2;" title="Próxima meta ('+escapeHtml(next.label)+'): '
      +fmtDec(next.threshold,decimals)+suffix+'"></div>';
    metaLineHTML = '<div class="ov-evo-meta-line" style="text-align:center;font-size:11px;color:var(--ink-soft,#6b7a72);margin-top:6px;">'
      + '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2563EB;margin-right:5px;vertical-align:middle;"></span>'
      + 'Próxima meta ('+escapeHtml(next.label)+'): <b>'+fmtDec(next.threshold,decimals)+suffix+'</b></div>';
  } else if(classLabel==='Ótimo'){
    metaLineHTML = '<div class="ov-evo-meta-line" style="text-align:center;font-size:11px;color:var(--ink-soft,#6b7a72);margin-top:6px;">Já na faixa máxima (Ótimo) — sem próxima meta.</div>';
  }
  // Percentual em relação ao quadrimestre anterior (delta/anterior),
  // mostrado centralizado abaixo da barra, entre ela e a linha
  // Anterior/Atual — só quando dá pra calcular (anterior != 0).
  var pctHTML = '';
  if(anterior){
    var pct = (delta/Math.abs(anterior))*100;
    var pctColor = dir==='up' ? '#15803d' : (dir==='down' ? '#b91c1c' : 'var(--ink-soft)');
    var pctSign = dir==='up' ? '+ ' : (dir==='down' ? '- ' : '');
    pctHTML = '<div class="ov-evo-percent-wrap">'
      +   '<span class="ov-evo-percent" style="color:'+pctColor+';">'+pctSign+fmtDec(Math.abs(pct),1)+'%</span>'
      + '</div>';
  }
  return '<div class="ov-evo-track" style="position:relative;">'
    +   '<div class="ov-evo-band"'+bandStyle+'></div>'
    +   '<div class="ov-evo-fill" style="width:'+(fracAtual*100).toFixed(1)+'%;background:'+fillColor+';"></div>'
    +   '<div class="ov-evo-mark" style="left:'+(fracAnterior*100).toFixed(1)+'%;"></div>'
    +   metaMarkHTML
    + '</div>'
    + '<div class="ov-evo-row">'
    +   '<div class="ov-evo-labels"><span>Anterior<br><b>'+fmtDec(anterior,decimals)+suffix+'</b></span>'
    +     '<span style="text-align:right;">Atual<br><b>'+fmtDec(atual,decimals)+suffix+'</b></span></div>'
    +   pctHTML
    + '</div>'
    + metaLineHTML;
}

// Bloco "Evolução - Quadrimestre": compara o valor atual com o do
// quadrimestre anterior (calcularQuadrimestreAnterior). Sem dado
// suficiente pra reconstruir o período anterior, mostra um aviso em vez
// da barra de comparação.
function ovEvoHTML(atual, anterior, domainMax, decimals, suffix, bands, classLabel){
  suffix = suffix || '';
  if(anterior==null || atual==null){
    return '<div class="ov-evo">'
      + '<p class="ov-evo-title">Evolução (quadrimestre)</p>'
      + '<p class="ov-evo-empty">Sem histórico suficiente pra comparar com o quadrimestre anterior.</p>'
      + '</div>';
  }
  var delta = atual - anterior;
  var dir = delta > 0.0001 ? 'up' : (delta < -0.0001 ? 'down' : 'flat');
  var arrow = dir==='up' ? '↗' : (dir==='down' ? '↘' : '→');
  var deltaColor = dir==='up' ? '#15803d' : (dir==='down' ? '#b91c1c' : 'var(--ink-soft)');
  var deltaTxt = (delta>0?'+':'')+fmtDec(delta,decimals)+suffix;
  return '<div class="ov-evo">'
    + '<div class="ov-evo-head">'
    +   '<p class="ov-evo-title">Evolução (quadrimestre)</p>'
    +   '<span class="ov-evo-delta" style="color:'+deltaColor+';">'+arrow+' '+deltaTxt+'</span>'
    + '</div>'
    + evoTrackHTML(atual, anterior, domainMax, decimals, suffix, bands, classLabel)
    + '</div>';
}

// Cartão no modelo "ícone + anel + evolução" (só na Visão geral).
// Valor grande fica embaixo do arco (não mais ao lado), centralizado
// com ele, puxado por cima com margin-top negativo pra formar um
// bloco visualmente único — ver .ov-main/.ov-value no CSS. A legenda
// "X atendimentos ÷ Y pessoas" vira uma barra de linha única entre
// esse bloco e a Evolução do quadrimestre.
export function overviewCardHTML(opts){
  var st = ovStatus(opts.classe);
  return '<div class="card ov-card" style="border-top:4px solid '+st.accent+';">'
    + '<div class="ov-head">'
    +   '<div class="ov-head-left">'+ovIconHTML(opts.iconKind, st)+'<h3 class="ov-title" title="'+opts.title+'">'+opts.title+'</h3></div>'
    +   '<span class="ov-badge" style="background:'+st.badgeBg+';color:'+st.badgeText+';">'+st.icon+' '+(opts.classe||'—')+'</span>'
    + '</div>'
    + kpiPanelHTML(st, kpiPanelIcon(opts.iconKind), opts.valueTxt, opts.valueCap, opts.value, opts.domainMax)
    + ovEvoHTML(opts.value, opts.anterior, opts.domainMax, opts.decimals, opts.suffix||'', opts.bands, opts.classe)
    + ovLegendHTML(opts.legend)
    + '</div>';
}

function gaugeCardHTML(title, formula, value, domainMax, bands, gaugeId, valueHtml, classLabel, note, legend, anterior, decimals, suffix, metaLabel){
  // title/formula já aparecem no cabeçalho da aba (.indicator-tab-head)
  // logo acima do mm-layout — aqui, dentro do card, mostramos um cabeçalho
  // próprio com ícone + "Resultado do indicador" (usando "formula" como
  // subtítulo) e, ao lado do gauge, uma caixa de "Interpretação" com o
  // texto descritivo da classificação atual e a meta do período.
  return '<div class="card gauge-card">'
    + '<div class="gi-row">'
    +   '<div class="gi-left">'
    +     '<div class="gi-header">'
    +       '<div class="gi-icon"><svg viewBox="0 0 24 24">'+OV_ICONS.speed+'</svg></div>'
    +       '<div class="gi-header-text"><h3 class="gauge-top-title">Resultado do indicador</h3>'
    +         (formula ? '<p class="gi-subtitle">'+formula+'</p>' : '')
    +       '</div>'
    +     '</div>'
    +     buildGauge(value, domainMax, bands, gaugeId)
    +     '<div class="gauge-value">'+valueHtml+'</div>'
    +     '<span class="pill" style="background:'+pillHex(classLabel)+'">'+(classLabel||'—')+'</span>'
    +     (note ? '<p class="gauge-note">'+note+'</p>' : '')
    +   '</div>'
    +   '<div class="gi-right">'
    +     '<div class="gi-interp-header">'
    +       '<div class="gi-interp-icon">'+METAS_ICON_SVG+'</div>'
    +       '<h4>Interpretação</h4>'
    +     '</div>'
    +     '<p class="gi-interp-text">'+gaugeInterpretationHTML(classLabel)+'</p>'
    +     (metaLabel ? (
            '<hr class="gi-divider"/>'
          + '<div class="gi-meta-row">'
          +   '<span class="gi-meta-icon">💡</span>'
          +   '<div><div class="gi-meta-label">Meta do período</div>'
          +     '<div class="gi-meta-value">'+metaLabel+'</div></div>'
          + '</div>'
        ) : '')
    +   '</div>'
    + '</div>'
    + ovEvoHTML(value, anterior, domainMax, decimals!=null?decimals:2, suffix||'', bands, classLabel)
    + (legend ? gaugeLegendHTML(legend) : '')
    + '</div>';
}
