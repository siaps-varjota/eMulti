// ======================================================================
// pdf/pdf-divergencia.js
// PDF de divergência: calculado (painel) vs. oficial
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../nucleo/estado.js';
import { monthShortLabel } from '../nucleo/config.js';
import { fmtDec, fmtInt } from '../nucleo/utils.js';
import { slugifyFileName } from './pdf-listas.js';

// ---------- PDF de divergência: calculado (painel) vs. oficial (Q2-26) ----------
// Compara, mês a mês, o valor que o painel calcularia a partir dos
// dados brutos (numeradorXCalculado/denominadorXCalculado/xCalculado —
// guardados em aplicarOverrideOficial ANTES da substituição) com o
// valor oficial que efetivamente está sendo exibido (numeradorX/
// denominadorX/x, já com o override aplicado). Só entram no relatório
// os meses/indicadores em que existe dado oficial (m1Oficial/m2Oficial).
export function gerarPdfDivergenciaOficial(serieTendencia){
  var jspdfNs = window.jspdf;
  if(!jspdfNs || !jspdfNs.jsPDF){
    alert('Não foi possível carregar a biblioteca de geração de PDF (verifique a conexão com a internet) — tente novamente.');
    return;
  }
  var linhas = [];
  // Estatísticas de divergência por indicador — usadas no comentário
  // logo abaixo da tabela (qual indicador diverge mais vezes, a
  // divergência média de cada um, e o detalhamento de quantas dessas
  // divergências foram "para mais" — oficial acima do calculado — e
  // quantas foram "para menos"). Um mês só conta como "divergente" se a
  // diferença (oficial - calculado), já arredondada nas 2 casas
  // exibidas na tabela, for diferente de zero — assim o comentário bate
  // exatamente com o que a coluna "Diferença" mostra.
  function novoStat(){ return {meses:0, divergentes:0, somaAbs:0, paraMais:{n:0,soma:0}, paraMenos:{n:0,soma:0}, itensPareto:[]}; }
  var statM1 = novoStat();
  var statM2 = novoStat();
  function registrarDivergencia(stat, dif, mesLabel){
    if(dif==null) return;
    stat.meses++;
    stat.somaAbs += Math.abs(dif);
    if(fmtDec(Math.abs(dif),2) === fmtDec(0,2)) return; // sem divergência (bateu na 2ª casa exibida)
    stat.divergentes++;
    stat.itensPareto.push({label:mesLabel, valor:Math.abs(dif)});
    if(dif > 0){ stat.paraMais.n++; stat.paraMais.soma += dif; }
    else { stat.paraMenos.n++; stat.paraMenos.soma += Math.abs(dif); }
  }
  // Mais recente primeiro, mesma ordem da tabela de Série histórica.
  serieTendencia.slice().reverse().forEach(function(p){
    var mesLabel = monthShortLabel(p.mes);
    // Diferença de numerador/denominador (oficial - calculado): mostra
    // ONDE está a divergência de valor (M1/M2), não só o tamanho dela.
    function fmtDif(v){ return v!=null ? (v>=0?'+':'')+fmtInt(v) : '—'; }
    if(p.m1Oficial){
      var difM1 = (p.m1!=null && p.m1Calculado!=null) ? (p.m1 - p.m1Calculado) : null;
      registrarDivergencia(statM1, difM1, mesLabel);
      var difNumM1 = (p.numeradorM1!=null && p.numeradorM1Calculado!=null) ? (p.numeradorM1 - p.numeradorM1Calculado) : null;
      var difDenM1 = (p.denominadorM1!=null && p.denominadorM1Calculado!=null) ? (p.denominadorM1 - p.denominadorM1Calculado) : null;
      linhas.push([
        mesLabel, 'M1',
        fmtInt(p.numeradorM1Calculado)+' / '+fmtInt(p.denominadorM1Calculado), p.m1Calculado!=null ? fmtDec(p.m1Calculado,2) : '—',
        fmtInt(p.numeradorM1)+' / '+fmtInt(p.denominadorM1), p.m1!=null ? fmtDec(p.m1,2) : '—',
        fmtDif(difNumM1), fmtDif(difDenM1),
        difM1!=null ? (difM1>=0?'+':'')+fmtDec(difM1,2) : '—'
      ]);
    }
    if(p.m2Oficial){
      var difM2 = (p.m2!=null && p.m2Calculado!=null) ? (p.m2 - p.m2Calculado) : null;
      registrarDivergencia(statM2, difM2, mesLabel);
      var difNumM2 = (p.numeradorM2!=null && p.numeradorM2Calculado!=null) ? (p.numeradorM2 - p.numeradorM2Calculado) : null;
      var difDenM2 = (p.denominadorM2!=null && p.denominadorM2Calculado!=null) ? (p.denominadorM2 - p.denominadorM2Calculado) : null;
      linhas.push([
        mesLabel, 'M2',
        fmtInt(p.numeradorM2Calculado)+' / '+fmtInt(p.denominadorM2Calculado), p.m2Calculado!=null ? fmtDec(p.m2Calculado,2)+'%' : '—',
        fmtInt(p.numeradorM2)+' / '+fmtInt(p.denominadorM2), p.m2!=null ? fmtDec(p.m2,2)+'%' : '—',
        fmtDif(difNumM2), fmtDif(difDenM2),
        difM2!=null ? (difM2>=0?'+':'')+fmtDec(difM2,2)+'%' : '—'
      ]);
    }
  });
  if(!linhas.length){
    alert('Não há meses com dado oficial (aba Q2-26) carregado pra esta equipe — nada pra comparar.');
    return;
  }

  var equipeLabel = estadoApp.currentEquipes.map(function(e){ return e.label; }).join(' + ');
  var doc = new jspdfNs.jsPDF({orientation:'landscape', unit:'pt', format:'a4'});
  var pageWidth = doc.internal.pageSize.getWidth();
  var pageHeight = doc.internal.pageSize.getHeight();
  var margin = 28;

  doc.setFillColor(21,63,53);
  doc.rect(0,0,pageWidth,64,'F');
  doc.setTextColor(238,243,234);
  doc.setFont('helvetica','bold');
  doc.setFontSize(15);
  doc.text('Painel eMulti — Divergência: calculado × oficial', margin, 26);
  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.setTextColor(159,192,174);
  doc.text(equipeLabel, margin, 42);
  doc.setFontSize(8.5);
  doc.text('Gerado em '+new Date().toLocaleString('pt-BR'), pageWidth-margin, 26, {align:'right'});

  var y = 84;
  doc.setTextColor(21,63,53);
  doc.setFont('helvetica','bold');
  doc.setFontSize(13);
  doc.text('Calculado pelo painel × Oficial (aba Q2-26)', margin, y);
  y += 16;
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(81,96,90);
  doc.text('M1 = atendimentos por pessoa (numerador ÷ denominador). M2 = % de ações compartilhadas (numerador ÷ denominador × 100). Todas as diferenças = oficial - calculado.', margin, y);
  y += 14;

  doc.autoTable({
    startY: y,
    head: [['Mês','Indicador','Numerador/Denominador (calculado)','Valor (calculado)','Numerador/Denominador (oficial)','Valor (oficial)','Dif. numerador','Dif. denominador','Diferença']],
    body: linhas,
    theme: 'grid',
    margin: {left:margin, right:margin, bottom:34},
    styles: {font:'helvetica', fontSize:8.6, cellPadding:4, overflow:'linebreak', textColor:[19,36,31], lineColor:[220,228,214], lineWidth:0.5},
    headStyles: {fillColor:[21,63,53], textColor:255, fontStyle:'bold'},
    alternateRowStyles: {fillColor:[241,244,238]},
    didDrawPage: function(){
      doc.setFontSize(8);
      doc.setTextColor(150,158,152);
      doc.text('Página '+doc.internal.getCurrentPageInfo().pageNumber, pageWidth-margin, pageHeight-14, {align:'right'});
    }
  });

  // ---- Comentário: indicador com mais divergência + médias + detalhe "para mais"/"para menos" ----
  var mediaM1 = statM1.meses ? (statM1.somaAbs/statM1.meses) : null;
  var mediaM2 = statM2.meses ? (statM2.somaAbs/statM2.meses) : null;
  var comentario;
  if(statM1.divergentes === 0 && statM2.divergentes === 0){
    comentario = 'Nenhum mês apresentou divergência entre o valor calculado pelo painel e o valor oficial — M1 e M2 bateram em todos os meses comparados.';
  } else if(statM1.divergentes > statM2.divergentes){
    comentario = 'M1 é o indicador com maior número de divergências ('+statM1.divergentes+' de '+statM1.meses+' meses, contra '+statM2.divergentes+' de '+statM2.meses+' em M2).';
  } else if(statM2.divergentes > statM1.divergentes){
    comentario = 'M2 é o indicador com maior número de divergências ('+statM2.divergentes+' de '+statM2.meses+' meses, contra '+statM1.divergentes+' de '+statM1.meses+' em M1).';
  } else {
    comentario = 'M1 e M2 empatam no número de meses com divergência ('+statM1.divergentes+' de '+statM1.meses+' meses cada).';
  }
  comentario += ' Divergência média (oficial - calculado, em módulo) — M1: '+(mediaM1!=null ? fmtDec(mediaM1,2) : '—')
    +' | M2: '+(mediaM2!=null ? fmtDec(mediaM2,2)+'%' : '—')+'.';

  // "Para mais" = valor oficial ACIMA do calculado pelo painel (oficial
  // > calculado); "para menos" = oficial ABAIXO do calculado. A média
  // de cada lado usa só os meses daquele lado (não conta os meses sem
  // divergência).
  function detalheDirecao(stat, sufixo){
    var mediaMais = stat.paraMais.n ? (stat.paraMais.soma/stat.paraMais.n) : null;
    var mediaMenos = stat.paraMenos.n ? (stat.paraMenos.soma/stat.paraMenos.n) : null;
    return 'para mais: '+stat.paraMais.n+' mês(es)'+(mediaMais!=null ? ' (média +'+fmtDec(mediaMais,2)+sufixo+')' : '')
      +'; para menos: '+stat.paraMenos.n+' mês(es)'+(mediaMenos!=null ? ' (média -'+fmtDec(mediaMenos,2)+sufixo+')' : '');
  }
  comentario += ' Detalhamento M1 — '+detalheDirecao(statM1, '')+'.';
  comentario += ' Detalhamento M2 — '+detalheDirecao(statM2, '%')+'.';

  var yComentario = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 22;
  var linhasComentario = doc.splitTextToSize(comentario, pageWidth-margin*2);
  var alturaComentario = 14 + 12*linhasComentario.length;
  if(yComentario + alturaComentario > pageHeight - margin){
    doc.addPage();
    yComentario = margin + 10;
  }
  doc.setFont('helvetica','bold');
  doc.setFontSize(9.5);
  doc.setTextColor(21,63,53);
  doc.text('Resumo da divergência', margin, yComentario);
  yComentario += 14;
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.8);
  doc.setTextColor(81,96,90);
  doc.text(linhasComentario, margin, yComentario);

  // ---- Gráfico de Pareto: uma página por indicador, com todos os meses ----
  // divergentes ordenados do maior pro menor desvio, mais a curva de %
  // acumulado (regra 80/20). Só desenha a página do indicador que teve
  // pelo menos 1 mês divergente.
  function desenharPareto(doc, opts){
    var x = opts.x, yTop = opts.y, w = opts.w, h = opts.h;
    var itens = opts.itens.slice().sort(function(a,b){ return b.valor - a.valor; });
    var total = itens.reduce(function(s,it){ return s + it.valor; }, 0);
    var n = itens.length;

    var labelH = 26;   // espaço pro rótulo do mês, abaixo do eixo
    var topPad = 16;   // espaço acima da maior barra pro rótulo do valor
    var plotY = yTop + topPad;
    var plotH = h - labelH - topPad;
    var baseY = plotY + plotH;

    var maxValor = itens[0] ? itens[0].valor : 0;
    if(maxValor <= 0) maxValor = 1;

    doc.setDrawColor(150,158,152);
    doc.setLineWidth(0.75);
    doc.line(x, plotY, x, baseY);
    doc.line(x, baseY, x+w, baseY);
    doc.line(x+w, plotY, x+w, baseY);

    doc.setFontSize(7.5);
    [0,20,40,60,80,100].forEach(function(p){
      var gy = baseY - plotH*(p/100);
      if(p===80){ doc.setDrawColor(200,120,60); doc.setLineWidth(0.9); doc.setLineDashPattern([3,2],0); }
      else { doc.setDrawColor(230,232,228); doc.setLineWidth(0.5); doc.setLineDashPattern([],0); }
      doc.line(x, gy, x+w, gy);
      doc.setLineDashPattern([],0);
      if(p===80) doc.setTextColor(200,120,60); else doc.setTextColor(150,158,152);
      doc.text(p+'%', x+w+4, gy+2);
    });

    var slot = w / n;
    var barW = Math.min(slot*0.55, 34);
    var pontos = [];
    var acumulado = 0;
    itens.forEach(function(it, i){
      var cx = x + slot*i + slot/2;
      var barH = plotH * (it.valor / maxValor);
      var by = baseY - barH;
      doc.setFillColor(opts.corBarra[0], opts.corBarra[1], opts.corBarra[2]);
      doc.rect(cx - barW/2, by, barW, barH, 'F');

      doc.setFontSize(7.6);
      doc.setTextColor(81,96,90);
      doc.text(it.label, cx, baseY + 12, {align:'center'});

      acumulado += it.valor;
      var pct = total>0 ? (acumulado/total*100) : 0;
      pontos.push({x:cx, y: baseY - plotH*(pct/100), valorLabel: opts.fmtValor(it.valor), yTopoBarra: by});
    });

    doc.setDrawColor(190,70,50);
    doc.setLineWidth(1.1);
    for(var i=0;i<pontos.length-1;i++){
      doc.line(pontos[i].x, pontos[i].y, pontos[i+1].x, pontos[i+1].y);
    }
    doc.setFillColor(190,70,50);
    pontos.forEach(function(p){ doc.circle(p.x, p.y, 1.9, 'F'); });

    // Rótulos de valor no topo de cada barra — desenhados por último pra
    // ficarem por cima da linha/marcador do acumulado (evita que o ponto
    // vermelho cubra o número quando a curva passa perto do topo da barra).
    doc.setFontSize(7.2);
    pontos.forEach(function(p){
      // "respiro" branco atrás do texto, só o suficiente pra não ficar
      // ilegível em cima da linha vermelha.
      var tw = doc.getTextWidth(p.valorLabel);
      doc.setFillColor(255,255,255);
      doc.rect(p.x - tw/2 - 1.5, p.yTopoBarra - 4 - 6.5, tw+3, 8, 'F');
      doc.setTextColor(60,70,66);
      doc.text(p.valorLabel, p.x, p.yTopoBarra - 4, {align:'center'});
    });

    return baseY;
  }

  function paginaParetoIndicador(indicadorNome, stat, corBarra, fmtValor){
    if(!stat.itensPareto.length) return;
    doc.addPage();
    doc.setFillColor(21,63,53);
    doc.rect(0,0,pageWidth,64,'F');
    doc.setTextColor(238,243,234);
    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.text('Painel eMulti — Pareto de divergências ('+indicadorNome+')', margin, 26);
    doc.setFont('helvetica','normal');
    doc.setFontSize(10);
    doc.setTextColor(159,192,174);
    doc.text(equipeLabel, margin, 42);
    doc.setFontSize(8.5);
    doc.text('Gerado em '+new Date().toLocaleString('pt-BR'), pageWidth-margin, 26, {align:'right'});

    var yy = 92;
    doc.setFont('helvetica','bold');
    doc.setFontSize(11.5);
    doc.setTextColor(21,63,53);
    doc.text('Meses ordenados da maior pra menor divergência, com % acumulado (linha) e referência de 80% (regra 80/20)', margin, yy);

    desenharPareto(doc, {
      x: margin, y: yy+18, w: pageWidth-margin*2, h: pageHeight-yy-18-margin-16,
      itens: stat.itensPareto, corBarra: corBarra, fmtValor: fmtValor
    });

    doc.setFontSize(8);
    doc.setTextColor(150,158,152);
    doc.text('Página '+doc.internal.getCurrentPageInfo().pageNumber, pageWidth-margin, pageHeight-14, {align:'right'});
  }

  paginaParetoIndicador('M1', statM1, [58,120,102], function(v){ return fmtDec(v,2); });
  paginaParetoIndicador('M2', statM2, [58,120,102], function(v){ return fmtDec(v,2)+'%'; });

  var arquivo = 'divergencia_oficial__'+slugifyFileName(equipeLabel)+'__'+slugifyFileName(new Date().toLocaleDateString('pt-BR'))+'.pdf';
  doc.save(arquivo);
}
