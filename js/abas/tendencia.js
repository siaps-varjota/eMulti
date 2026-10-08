// ======================================================================
// abas/tendencia.js
// Aba Tendência — barras empilhadas, sparkline e interatividade
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { escapeHtml, fmtDec, fmtInt } from '../nucleo/utils.js';
import { ovStatus } from '../visual/gauge.js';

// ---------- Composition bars ----------
export function stackbar(segments, total){
  var t = total || segments.reduce(function(s,x){return s+(x.value||0);},0);
  var bars = segments.map(function(s){
    var pct = t>0 ? (s.value/t*100) : 0;
    return '<div class="seg" style="width:'+pct+'%;background:'+s.color+'"></div>';
  }).join('');
  // Label e contagem em spans separados: o layout padrão (Visão geral)
  // continua mostrando "label (contagem)" numa linha só; as abas M1/M2
  // usam CSS escopado (.mm-comp-col) pra virar linha cheia com a
  // contagem em negrito alinhada à direita — modelo das imagens de
  // referência — sem duplicar esta função.
  // s.title (opcional): definição oficial do segmento (Nota Metodológica
  // M1/M2, NT 43/44-2026-CGIAD/DEAPS/SAPS/MS) — mostrada num popover ao
  // clicar/tocar no ícone "i" ao lado do rótulo (funciona igual no
  // desktop e no celular; ver legend-info-btn/abrirLegendInfoPopover).
  // Não altera o valor/percentual já exibidos, só esclarece o que cada
  // parcela representa.
  var legend = segments.map(function(s){
    var pct = t>0 ? (s.value/t*100) : 0;
    var infoBtnHtml = s.title
      ? '<button type="button" class="legend-info-btn" data-info-text="'+encodeURIComponent(s.title)+'" aria-label="O que é '+escapeHtml(s.label)+'?">i</button>'
      : '';
    return '<span class="legend-item"><i style="background:'+s.color+'"></i>'
      + '<span class="legend-label">'+s.label+infoBtnHtml+'</span>'
      + '<span class="legend-count">'+fmtInt(s.value)+'<span class="legend-pct">('+fmtDec(pct,1)+'%)</span></span></span>';
  }).join('');
  return '<div class="stackbar">'+bars+'</div><div class="legend">'+legend+'</div>';
}

// ---------- Sparkline ----------
// points: [{y, label, value}] — "value" (opcional) é o texto já formatado
// (ex.: "2,45" ou "5,20%") mostrado acima de cada ponto da linha.
export function sparkline(points, color, opts){
  opts = opts || {};
  if(points.length < 2) return '<p class="footnote">Ainda não há leituras suficientes para mostrar a tendência.</p>';
  var hasAvg = !!opts.quadAvg;
  var hideAxis = !!opts.hideAxis;
  // W maior porque agora o gráfico ocupa a largura inteira do card (antes
  // eram 2 cards lado a lado, metade da largura). Sem aumentar o viewBox
  // junto, o texto/pontos esticariam 2x — ficando enormes.
  var W=640, padX=16, padTop=20;
  // Com linha de média, reserva uma faixa a mais (avgLabelGap) entre o
  // fundo da área de plotagem e a linha de rótulos dos meses, só pro
  // valor da média caber embaixo da linha tracejada sem encostar em nada.
  var plotH = hasAvg ? 54 : 66;
  var plotBottom = padTop + plotH;
  var avgLabelGap = hasAvg ? 22 : 0;
  // Sem eixo de meses (gráfico de cima, empilhado, que compartilha o
  // eixo do gráfico de baixo): não reserva a faixa de rótulo dos meses,
  // só o respiro mínimo pro texto da média não cortar.
  var axisY = hideAxis ? null : plotBottom + avgLabelGap + 10;
  var H = hideAxis ? (plotBottom + avgLabelGap + 4) : (axisY + 4);

  var vals = points.map(function(p){return p.y;});
  // Quando existe a série "não oficial" (yAlt: valor calculado direto da
  // planilha, ANTES do override da aba Q2-26 — ver m1Calculado/m2Calculado
  // em calcularSerieTendencia/aplicarOverrideOficial), inclui esses
  // valores no min/max pra a linha preliminar caber na mesma escala sem
  // distorcer a proporção da linha oficial.
  var hasAlt = points.some(function(p){ return p.yAlt!=null; });
  if(hasAlt){
    points.forEach(function(p){ if(p.yAlt!=null) vals.push(p.yAlt); });
  }
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if(min===max){ min = min - 1; max = max + 1; }
  var stepX = (W-2*padX)/(points.length-1);
  var coords = points.map(function(p,i){
    var x = padX + i*stepX;
    var y = plotBottom - ((p.y-min)/(max-min))*(plotBottom-padTop);
    return {x:x,y:y};
  });
  // Meses "futuros" (ver isMesFuturo) são projeção, não dado real — a
  // linha principal ("oficial") vira tracejada a partir do primeiro
  // deles. Como a série é sempre cronológica, os futuros só aparecem
  // no fim; separa em dois trechos (sólido até o último mês real,
  // tracejado dali em diante) que se conectam no mesmo ponto pra não
  // deixar um buraco na linha.
  var firstFutureIdx = -1;
  for(var fi=0; fi<points.length; fi++){ if(points[fi].futuro){ firstFutureIdx = fi; break; } }
  var coordsSolid = firstFutureIdx === -1 ? coords : coords.slice(0, firstFutureIdx+1);
  var coordsProjecao = (firstFutureIdx > 0) ? coords.slice(firstFutureIdx) : [];
  var path = coordsSolid.map(function(c,i){ return (i===0?"M ":"L ")+c.x+" "+c.y; }).join(" ");
  var pathProjecao = coordsProjecao.length >= 2
    ? coordsProjecao.map(function(c,i){ return (i===0?"M ":"L ")+c.x+" "+c.y; }).join(" ")
    : '';
  // Pontos e rótulo numérico de cada mês: coloridos pela classificação
  // (Regular/Suficiente/Bom/Ótimo) DAQUELE valor específico — a linha
  // que os conecta continua na cor original do gráfico (só os valores
  // ganham a cor da faixa).
  // Cada mês vira um <g class="tp-point" data-month="..."> com um
  // círculo maior e invisível (área de toque/hover mais fácil de
  // acertar), o ponto, o valor e o rótulo do mês embaixo — tudo junto
  // pra dar/tirar destaque em bloco ao passar o mouse ou clicar (ver
  // setupTrendInteractivity), inclusive no card do outro indicador.
  var pointsSvg = points.map(function(p,i){
    var tone = opts.classify ? ovStatus(opts.classify(p.y)).accent : color;
    var ly = Math.max(9, coords[i].y - 8);
    var valTxt = (p.value!==undefined && p.value!==null && p.value!=='') ? '<text class="tp-val" x="'+coords[i].x+'" y="'+ly+'" font-size="9.5" font-weight="600" fill="'+tone+'" text-anchor="middle">'+escapeHtml(p.value)+'</text>' : '';
    return '<g class="tp-point" data-month="'+escapeHtml(p.label)+'">'
      + '<circle class="tp-hit" cx="'+coords[i].x+'" cy="'+coords[i].y+'" r="9" fill="transparent"/>'
      + '<circle class="tp-dot" cx="'+coords[i].x+'" cy="'+coords[i].y+'" r="3.2" fill="'+tone+'"/>'
      + valTxt
      + (hideAxis ? '' : '<text class="tp-axis" x="'+coords[i].x+'" y="'+axisY+'" font-size="9" fill="var(--ink-soft)" text-anchor="middle">'+p.label+'</text>')
      + '</g>';
  }).join("");

  // "Montanha" de média de cada quadrimestre (Jan–Abr / Mai–Ago /
  // Set–Dez): agrupa os pontos exibidos que pertencem ao mesmo
  // quadrimestre (cada ponto já traz p.quadKey/p.quadLabel) e desenha,
  // atrás da linha de dados, um bloco reto (sem cantos arredondados) do
  // fundo do gráfico até a altura da média DESSES pontos — 30% opaco
  // (70% transparente) — com uma linha tracejada marcando o topo e o
  // valor logo ABAIXO dela (dentro da faixa reservada em avgLabelGap,
  // longe da linha de dados, dos rótulos de valor e da linha de meses).
  // A cor (área + linha + texto) segue a classificação da média
  // (Regular/Suficiente/Bom/Ótimo), igual às outras faixas do painel.
  var avgAreaSvg = '', avgLineSvg = '';
  if(hasAvg){
    var groups = [];
    points.forEach(function(p,i){
      var last = groups[groups.length-1];
      if(last && last.key === p.quadKey){ last.idx.push(i); }
      else { groups.push({key:p.quadKey, label:p.quadLabel, idx:[i]}); }
    });
    groups.forEach(function(g){
      var ys = g.idx.map(function(i){ return points[i].y; });
      var avg = ys.reduce(function(a,b){ return a+b; }, 0)/ys.length;
      var avgY = plotBottom - ((avg-min)/(max-min))*(plotBottom-padTop);
      var x1 = coords[g.idx[0]].x, x2 = coords[g.idx[g.idx.length-1]].x;
      if(g.idx.length===1){ x1 -= 12; x2 += 12; }
      x1 = Math.max(padX-4, x1); x2 = Math.min(W-padX+4, x2);
      var midX = (x1+x2)/2;
      var textY = Math.min(avgY + 16, plotBottom + avgLabelGap - 4);
      var faixa = opts.classify ? opts.classify(avg) : null;
      var tone = faixa ? ovStatus(faixa).accent : '#7A5A2E';
      var valTxt = g.label+': '+fmtDec(avg,2)+(opts.suffix||'');
      var chipW = Math.max(34, valTxt.length*4.6+8);
      var chip = '<rect x="'+(midX-chipW/2)+'" y="'+(textY-9)+'" width="'+chipW+'" height="12" rx="3" fill="var(--surface)" opacity="0.92"/>';
      avgAreaSvg += '<polygon points="'+x1+','+plotBottom+' '+x1+','+avgY+' '+x2+','+avgY+' '+x2+','+plotBottom+'" fill="'+tone+'" opacity="0.3"/>';
      avgLineSvg += '<line x1="'+x1+'" y1="'+avgY+'" x2="'+x2+'" y2="'+avgY+'" stroke="'+tone+'" stroke-width="1.3" stroke-dasharray="3 3" opacity="0.9"/>'
        + chip
        + '<text x="'+midX+'" y="'+textY+'" font-size="8" font-weight="700" fill="'+tone+'" text-anchor="middle">'+escapeHtml(valTxt)+'</text>';
    });
  }

  // Linha "Preliminar": a MESMA linha de tendência (mesmo traçado que
  // liga os pontos), só que calculada com os valores da tabela nominal
  // (yAlt = m1Calculado/m2Calculado, direto da planilha), ignorando o
  // override da aba Q2-26. Nos meses sem override, yAlt é idêntico a y
  // (aplicarOverrideOficial só substitui quando há dado oficial), então
  // a linha só "se separa" da linha principal nos meses com selo
  // "Oficial". Fica invisível até o pill "Preliminar" (canto superior
  // direito do card) ser ativado (ver setupPreliminarToggle / CSS
  // .show-preliminar .tp-trendline).
  var trendLineSvg = '';
  if(hasAlt){
    var coordsAlt = points.map(function(p,i){
      var yv = p.yAlt!=null ? p.yAlt : p.y;
      return {x:coords[i].x, y: plotBottom - ((yv-min)/(max-min))*(plotBottom-padTop)};
    });
    var pathAlt = coordsAlt.map(function(c,i){ return (i===0?"M ":"L ")+c.x+" "+c.y; }).join(" ");
    // Marca com um pontinho só os meses onde a linha preliminar realmente
    // diverge da oficial (isto é, onde houve override — ver p.oficial)
    // pra destacar visualmente ONDE a planilha diverge da aba Q2-26.
    var dotsAlt = points.map(function(p,i){
      if(!p.oficial) return '';
      return '<circle cx="'+coordsAlt[i].x+'" cy="'+coordsAlt[i].y+'" r="2.6" fill="#6B6B6B"/>';
    }).join('');
    var lastAlt = coordsAlt[coordsAlt.length-1];
    trendLineSvg = '<g class="tp-trendline">'
      + '<path d="'+pathAlt+'" fill="none" stroke="#6B6B6B" stroke-width="1.8" stroke-dasharray="5 4" stroke-linecap="round"/>'
      + dotsAlt
      + '<text x="'+(lastAlt.x-2)+'" y="'+(lastAlt.y-8)+'" font-size="8.5" font-weight="700" fill="#6B6B6B" text-anchor="end">Preliminar (planilha)</text>'
      + '</g>';
  }

  var projecaoSvg = pathProjecao
    ? '<path d="'+pathProjecao+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-dasharray="7 5" stroke-linecap="round"/>'
    : '';

  return '<svg class="spark-svg trend-interactive" viewBox="0 0 '+W+' '+(H+14)+'">'
    + avgAreaSvg
    + '<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2"/>' + projecaoSvg + pointsSvg
    + avgLineSvg + trendLineSvg + '</svg>';
}

// ---------- Interatividade da aba Tendência ----------
// Ao passar o mouse (ou clicar/tocar, no celular) em cima de um ponto de
// qualquer um dos dois gráficos (M1 ou M2), destaca em AMBOS os
// containers só o ponto daquele mês: apaga (opacidade 0) o número dos
// demais pontos e deixa o ponto/rótulo dos outros meses esmaecido, nos
// dois gráficos ao mesmo tempo — permitindo comparar M1 e M2 do mesmo
// mês lado a lado. Clique/toque "fixa" o destaque (pra quem não tem
// hover); clicar de novo no mesmo ponto, ou fora dos gráficos, desfaz.
export function setupTrendInteractivity(){
  var svgs = document.querySelectorAll('.trend-interactive');
  if(!svgs.length) return;
  var pinnedMonth = null;

  function applyHighlight(month){
    svgs.forEach(function(svg){
      svg.classList.toggle('tp-hover-active', !!month);
      svg.querySelectorAll('.tp-point').forEach(function(pt){
        pt.classList.toggle('tp-active', !!month && pt.getAttribute('data-month') === month);
      });
    });
  }

  svgs.forEach(function(svg){
    svg.querySelectorAll('.tp-point').forEach(function(pt){
      var month = pt.getAttribute('data-month');
      pt.addEventListener('mouseenter', function(){
        if(!pinnedMonth) applyHighlight(month);
      });
      pt.addEventListener('mouseleave', function(){
        if(!pinnedMonth) applyHighlight(null);
      });
      pt.addEventListener('click', function(e){
        e.stopPropagation();
        pinnedMonth = (pinnedMonth === month) ? null : month;
        applyHighlight(pinnedMonth);
      });
    });
  });

  document.addEventListener('click', function(){
    if(pinnedMonth){
      pinnedMonth = null;
      applyHighlight(null);
    }
  });
}

// Pill "Preliminar" no canto superior direito do card de tendência:
// ao clicar, alterna a classe "show-preliminar" no card, que via CSS
// revela (opacity) a linha de tendência preliminar (.tp-trendline) já
// desenhada dentro dos dois gráficos SVG (ver sparkline/points[].yAlt)
// — evita ter que re-renderizar os gráficos a cada clique.
export function setupPreliminarToggle(){
  var btn = document.getElementById('trendPreliminarToggle');
  if(!btn) return;
  var card = btn.closest('.trend-card-combo');
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    var active = btn.classList.toggle('active');
    if(card) card.classList.toggle('show-preliminar', active);
  });
}
