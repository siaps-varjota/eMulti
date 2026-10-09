  // ---------- Gauge ----------
  function polar(cx,cy,r,angleDeg){
    var a = angleDeg * Math.PI/180;
    return {x: cx + r*Math.cos(a), y: cy - r*Math.sin(a)};
  }
  function arcPath(cx,cy,r,startAngle,endAngle){
    var p1 = polar(cx,cy,r,startAngle);
    var p2 = polar(cx,cy,r,endAngle);
    var large = Math.abs(startAngle-endAngle) > 180 ? 1 : 0;
    return "M "+p1.x+" "+p1.y+" A "+r+" "+r+" 0 "+large+" 1 "+p2.x+" "+p2.y;
  }
  function buildGauge(value, domainMax, bands, gaugeId){
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
  function animateGauges(){
    // Mantida como no-op por compatibilidade com as chamadas existentes em
    // renderDashboard(); a animação agora é 100% CSS (ver .gauge-needle).
  }

  var CLASS_BANDS_M1 = [
    {from:0,to:1,classe:"Regular",color:arcHex("Regular")},
    {from:1,to:2,classe:"Suficiente",color:arcHex("Suficiente")},
    {from:2,to:3,classe:"Bom",color:arcHex("Bom")},
    {from:3,to:4,classe:"Ótimo",color:arcHex("Ótimo")}
  ];
  var CLASS_BANDS_M2 = [
    {from:0,to:1,classe:"Regular",color:arcHex("Regular")},
    {from:1,to:2.5,classe:"Suficiente",color:arcHex("Suficiente")},
    {from:2.5,to:5,classe:"Bom",color:arcHex("Bom")},
    {from:5,to:8,classe:"Ótimo",color:arcHex("Ótimo")}
  ];
  var CLASS_BANDS_NOTA = [
    {from:0,to:2.5,classe:"Regular",color:arcHex("Regular")},
    {from:2.5,to:5,classe:"Suficiente",color:arcHex("Suficiente")},
    {from:5,to:7.5,classe:"Bom",color:arcHex("Bom")},
    {from:7.5,to:10,classe:"Ótimo",color:arcHex("Ótimo")}
  ];
  // Mesmas faixas, só que com a cor mais intensa (arcHexOv) — usadas
  // apenas nos anéis da Visão geral (overviewCardHTML/ovRingSVG).
  var CLASS_BANDS_M1_OV = [
    {from:0,to:1,classe:"Regular",color:arcHexOv("Regular")},
    {from:1,to:2,classe:"Suficiente",color:arcHexOv("Suficiente")},
    {from:2,to:3,classe:"Bom",color:arcHexOv("Bom")},
    {from:3,to:4,classe:"Ótimo",color:arcHexOv("Ótimo")}
  ];
  var CLASS_BANDS_M2_OV = [
    {from:0,to:1,classe:"Regular",color:arcHexOv("Regular")},
    {from:1,to:2.5,classe:"Suficiente",color:arcHexOv("Suficiente")},
    {from:2.5,to:5,classe:"Bom",color:arcHexOv("Bom")},
    {from:5,to:8,classe:"Ótimo",color:arcHexOv("Ótimo")}
  ];
  var CLASS_BANDS_NOTA_OV = [
    {from:0,to:2.5,classe:"Regular",color:arcHexOv("Regular")},
    {from:2.5,to:5,classe:"Suficiente",color:arcHexOv("Suficiente")},
    {from:5,to:7.5,classe:"Bom",color:arcHexOv("Bom")},
    {from:7.5,to:10,classe:"Ótimo",color:arcHexOv("Ótimo")}
  ];


  function gaugeLegendHTML(items){
    return '<div class="gauge-legend">' + items.map(function(it){
      return '<span><i style="background:'+it.color+'"></i>'+it.label+' '+it.cond+'</span>';
    }).join('') + '</div>';
  }
  var LEGEND_M1 = [
    {label:'Ótimo',      cond:'&gt; 3',           color:arcHex('Ótimo')},
    {label:'Bom',        cond:'&gt; 2 e ≤ 3',     color:arcHex('Bom')},
    {label:'Suficiente', cond:'&gt; 1 e ≤ 2',     color:arcHex('Suficiente')},
    {label:'Regular',    cond:'≤ 1',              color:arcHex('Regular')}
  ];
  var LEGEND_M2 = [
    {label:'Ótimo',      cond:'&gt; 5%',              color:arcHex('Ótimo')},
    {label:'Bom',        cond:'&gt; 2,5% e ≤ 5%',     color:arcHex('Bom')},
    {label:'Suficiente', cond:'&gt; 1% e ≤ 2,5%',     color:arcHex('Suficiente')},
    {label:'Regular',    cond:'≤ 1%',                 color:arcHex('Regular')}
  ];
  var LEGEND_NOTA = [
    {label:'Ótimo',      cond:'&gt; 7,5',            color:arcHex('Ótimo')},
    {label:'Bom',        cond:'≥ 5 e ≤ 7,5',         color:arcHex('Bom')},
    {label:'Suficiente', cond:'&gt; 2,5 e &lt; 5',   color:arcHex('Suficiente')},
    {label:'Regular',    cond:'≤ 2,5',               color:arcHex('Regular')}
  ];

  // ---------- Cartões da Visão geral (modelo "ícone + anel + evolução") ----------
  // Cor por STATUS (não mais por indicador): o ícone, o anel e o badge de
  // cada cartão seguem a classificação atual daquele indicador.
  var OV_STATUS = {
    'Ótimo':      {accent:arcHexOv('Ótimo'), badgeBg:'#eff6ff', badgeText:'#1e40af', icon:'★', barColor:arcHexOv('Ótimo')},
    'Bom':        {accent:arcHexOv('Bom'), badgeBg:'#dcfce7', badgeText:'#166534', icon:'↗', barColor:arcHexOv('Bom')},
    'Suficiente': {accent:arcHexOv('Suficiente'), badgeBg:'#ffedd5', badgeText:'#9a3412', icon:'→', barColor:arcHexOv('Suficiente')},
    'Regular':    {accent:arcHexOv('Regular'), badgeBg:'#fee2e2', badgeText:'#991b1b', icon:'↘', barColor:arcHexOv('Regular')}
  };
  var OV_STATUS_FALLBACK = {accent:'#6b7280', badgeBg:'#f3f4f6', badgeText:'#374151', icon:'•', barColor:'#d1d5db'};
  function ovStatus(classe){ return OV_STATUS[classe] || OV_STATUS_FALLBACK; }
  var OV_ICONS = {
    pulse: '<path d="M3 12h4l2-7 4 14 2-7h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    users: '<circle cx="8.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.3 13.6c2.6.3 4.7 2.3 4.7 5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    share: '<path d="M8.2 11l7.6-4.2M8.2 13l7.6 4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="5.5" r="3" fill="currentColor"/><circle cx="18" cy="18.5" r="3" fill="currentColor"/>',
    trophy: '<path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0V4z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 6H4.5v1.6A3 3 0 0 0 7.6 10.6M16.5 6h3v1.6a3 3 0 0 1-3.1 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 13.8V17M8.5 20h7M9.5 17h5v3h-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    speed: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12l4.5-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'
  };
  function ovIconHTML(kind, st){
    return '<div class="ov-icon" style="background:'+st.badgeBg+';color:'+st.accent+';">'
      + '<svg viewBox="0 0 24 24">'+OV_ICONS[kind]+'</svg></div>';
  }
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
  injectKpiStyles();
  // Legenda do painel sempre em UMA linha: se o texto não cabe na largura
  // do card, a fonte encolhe (de 14px até no mínimo 9px) até caber. Roda
  // sempre que o DOM muda (cards re-renderizados) e quando o painel muda
  // de tamanho (resize da janela, troca de aba que estava oculta).
  var kpiFitRO = window.ResizeObserver ? new ResizeObserver(debounce(function(){ fitKpiCaptions(true); }, 60)) : null;
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
  var kpiFitDebounced = debounce(function(){ fitKpiCaptions(false); }, 30);
  if(window.MutationObserver){
    new MutationObserver(kpiFitDebounced).observe(document.body, {childList:true, subtree:true});
  }
  window.addEventListener('resize', kpiFitDebounced);
  kpiFitDebounced();
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
  function kpiPanelIcon(kind){ return kind==='pulse' ? 'users' : (kind==='users' ? 'share' : 'trophy'); }
  function kpiPanelHTML(st, iconKind, valueHtml, caption, value, domainMax){
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
  function ovLegendHTML(items){
    var out = items.map(function(it){
      var st = ovStatus(it.classe);
      return '<div class="ov-legend-item">'
        + '<span class="ov-legend-swatch" style="background:'+st.barColor+';"></span>'
        + '<span class="ov-legend-text"><b>'+it.cond+'</b> '+it.classe+'</span>'
        + '</div>';
    }).join('');
    return '<div class="ov-legend">'+out+'</div>';
  }
  var OV_LEGEND_M1 = [
    {classe:'Regular',    cond:'≤ 1'},
    {classe:'Suficiente', cond:'&gt; 1 e ≤ 2'},
    {classe:'Bom',        cond:'&gt; 2 e ≤ 3'},
    {classe:'Ótimo',      cond:'&gt; 3'}
  ];
  var OV_LEGEND_M2 = [
    {classe:'Regular',    cond:'≤ 1%'},
    {classe:'Suficiente', cond:'&gt; 1% e ≤ 2,5%'},
    {classe:'Bom',        cond:'&gt; 2,5% e ≤ 5%'},
    {classe:'Ótimo',      cond:'&gt; 5%'}
  ];
  var OV_LEGEND_NOTA = [
    {classe:'Regular',    cond:'≤ 2,5'},
    {classe:'Suficiente', cond:'&gt; 2,5 e &lt; 5'},
    {classe:'Bom',        cond:'≥ 5 e ≤ 7,5'},
    {classe:'Ótimo',      cond:'&gt; 7,5'}
  ];
  // Quadrimestre imediatamente anterior ao selecionado, calculado com a
  // MESMA metodologia do quadrimestre atual (média do m1/m2 de cada um dos
  // 4 meses, cada um já com sua janela móvel oficial — ver mediaDeMeses) —
  // usado só pro bloco "Evolução - Quadrimestre" dos cartões da Visão
  // geral. Retorna null nos campos que não tiverem os 4 meses de dado
  // disponíveis (aí o cartão mostra "Sem histórico" pra aquele indicador).
  function calcularQuadrimestreAnterior(){
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
  function evoTrackHTML(atual, anterior, domainMax, decimals, suffix, bands, classLabel){
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
  function overviewCardHTML(opts){
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
  function ipGaugeCardHTML(value, domainMax, bands, gaugeId, valueHtml, classLabel, capText, anterior, decimals, suffix, legend, iconKind){
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
  function nextTierInfo(classLabel, bands){
    var idx = -1;
    for(var i=0;i<bands.length;i++){ if(bands[i].classe===classLabel){ idx=i; break; } }
    if(idx<0 || idx>=bands.length-1) return null;
    return {label: bands[idx+1].classe, threshold: bands[idx+1].from};
  }

  // Bloco "Leitura do M1/M2" (abaixo das 3 colunas): resume em texto o
  // valor atual, a variação em relação ao período anterior e o que falta
  // pra subir de faixa.
  function ipReadingHTML(title, value, classLabel, anterior, decimals, suffix, bands, unitLabel){
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
  var METAS_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'
    + '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.3"/><circle cx="12" cy="12" r="1"/></svg>';

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
  function metaQuadrimestreHTML(titulo, base, baseLabel, cardsCfg, preliminar, projecaoLabel){
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
  function metaQuadrimestreMiniHTML(base, baseLabel, cardsCfg, preliminar, projecaoLabel){
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

  function calcularMetasQuadrimestre(numerador, denominador, thresholds, unidade, unidadeFaltam){
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

  var M1_META_THRESHOLDS = [
    {value:2,   label:'Bom (M1 ≥ 2,00)',   color:'var(--arc-bom)'},
    {value:3,   label:'Ótimo (M1 ≥ 3,00)', color:'var(--arc-otimo)'}
  ];
  var M2_META_THRESHOLDS = [
    {value:0.025, label:'Bom (M2 ≥ 2,50%)',  color:'var(--arc-bom)'},
    {value:0.05,  label:'Ótimo (M2 ≥ 5,00%)', color:'var(--arc-otimo)'}
  ];

  // ---------- Composition bars ----------
  function stackbar(segments, total){
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
  function sparkline(points, color, opts){
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
  function setupTrendInteractivity(){
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
  function setupPreliminarToggle(){
    var btn = document.getElementById('trendPreliminarToggle');
    if(!btn) return;
    var card = btn.closest('.trend-card-combo');
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var active = btn.classList.toggle('active');
      if(card) card.classList.toggle('show-preliminar', active);
    });
  }

