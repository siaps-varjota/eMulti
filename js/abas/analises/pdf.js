// ======================================================================
// abas/analises/pdf.js
// Aba Frequência e Retorno — PDFs (gráficos e lista de risco)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../../nucleo/estado.js';
import { fmtBRDate } from '../../nucleo/dados.js';
import { fmtDec, fmtInt } from '../../nucleo/utils.js';
import { pdfComNumeracao, pdfLinhaProfissional, slugifyFileName } from '../../pdf/pdf-listas.js';

// ---------- Exportar os gráficos da aba "Frequência e Retorno" em PDF ----------
// Mesma faixa de cabeçalho dos outros PDFs. Gráficos Chart.js entram como
// imagem (PNG do próprio canvas); a cascata de tempo entre consultas e o
// funil são desenhados direto no PDF a partir dos dados calculados.
export function gerarPdfGraficosAnalises(){
  var jspdfNs = window.jspdf;
  if(!jspdfNs || !jspdfNs.jsPDF){
    alert('Não foi possível carregar a biblioteca de geração de PDF (verifique a conexão com a internet) — tente novamente.');
    return;
  }
  var data = estadoApp.analisesDataAtual;
  if(!data || !data.totalPacientes){
    alert('Não há dados pra gerar o PDF com o filtro atual.');
    return;
  }
  var equipeLabel = estadoApp.analisesEquipes.map(function(e){ return e.label; }).join(' + ') + (estadoApp.analisesProfissional ? ' — ' + estadoApp.analisesProfissional : '');
  var doc = new jspdfNs.jsPDF({orientation:'landscape', unit:'pt', format:'a4'});
  var pageWidth = doc.internal.pageSize.getWidth();
  var pageHeight = doc.internal.pageSize.getHeight();
  var margin = 28, gap = 16;
  var colW = (pageWidth - margin*2 - gap) / 2;
  var fullW = pageWidth - margin*2;

  function cabecalho(){
    doc.setFillColor(21,63,53);
    doc.rect(0,0,pageWidth,64,'F');
    doc.setTextColor(238,243,234);
    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.text('Painel eMulti — Frequência e Retorno', margin, 26);
    doc.setFont('helvetica','normal');
    doc.setFontSize(10);
    doc.setTextColor(159,192,174);
    doc.text(equipeLabel, margin, 42);
    doc.setFontSize(8.5);
    doc.text('Gerado em '+new Date().toLocaleString('pt-BR'), pageWidth-margin, 26, {align:'right'});
    doc.text('Período: '+(data.intervaloSelecionado || 'Histórico completo'), margin, 55);
    doc.text(fmtInt(data.totalPacientes)+' pacientes · '+fmtInt(data.totalAtendimentos || 0)+' atendimentos', pageWidth-margin, 42, {align:'right'});
  }
  // Card branco com borda + título; devolve a Y onde o conteúdo começa.
  function card(x, y, w, h, titulo){
    doc.setFillColor(255,255,255);
    doc.setDrawColor(224,228,220);
    doc.roundedRect(x, y, w, h, 6, 6, 'FD');
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.setTextColor(21,63,53);
    doc.text(titulo, x+14, y+20, {maxWidth: w-28});
    return y + 34;
  }
  function imagemChart(canvasId, x, y, w, h){
    var inst = null;
    estadoApp.analisesChartInstances.forEach(function(c){ if(c && c.canvas && c.canvas.id === canvasId) inst = c; });
    if(!inst){
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(81,96,90);
      doc.text('Sem dados suficientes ainda.', x, y+14);
      return;
    }
    var img = inst.toBase64Image('image/png', 1);
    var cw = inst.canvas.width || 1, ch = inst.canvas.height || 1;
    var escala = Math.min(w/cw, h/ch);
    var iw = cw*escala, ih = ch*escala;
    doc.addImage(img, 'PNG', x + (w-iw)/2, y + (h-ih)/2, iw, ih);
  }

  // ---------- Página 1 ----------
  cabecalho();
  var y0 = 80;

  // Tempo entre consultas (cascata)
  var hCasc = 170;
  var yc = card(margin, y0, fullW, hCasc, 'Tempo entre consultas');
  var comDados = (data.intervalos || []).filter(function(it){ return it.stats; });
  if(!comDados.length){
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(81,96,90);
    doc.text('Ainda não há dados suficientes pra montar a cascata.', margin+14, yc+8);
  } else {
    var cum = 0;
    var steps = comDados.map(function(it){
      var inc = Math.round(it.stats.mediana), ini = cum; cum += inc;
      return {label: it.label, inc: inc, ini: ini, fim: cum, n: it.stats.n};
    });
    var maxTotal = cum || 1;
    var px = margin+24, pw = fullW-48, ptop = yc+14, ph = hCasc-34-14-30;
    var nBars = steps.length, bgap = 26, bw = (pw - bgap*(nBars-1))/nBars;
    var cores = ['#2F6F5E','#3E8571','#57A088','#7CB89F','#A3CFBB'];
    function yy(v){ return ptop + ph - (v/maxTotal)*ph; }
    doc.setDrawColor(120,130,125); doc.setLineWidth(0.6);
    doc.line(px, yy(0), px+pw, yy(0));
    steps.forEach(function(st, i){
      var bx = px + i*(bw+bgap), top = yy(st.fim), bh = Math.max(2, yy(st.ini)-top);
      if(i > 0){
        var prevX = px + (i-1)*(bw+bgap) + bw;
        doc.setLineDashPattern([3,3], 0); doc.line(prevX, yy(st.ini), bx, yy(st.ini)); doc.setLineDashPattern([], 0);
      }
      doc.setFillColor(cores[i % cores.length]);
      doc.roundedRect(bx, top, bw, bh, 3, 3, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(21,63,53);
      doc.text('+'+fmtInt(st.inc)+' dias', bx+bw/2, top-5, {align:'center'});
      doc.setFontSize(9);
      doc.text(st.label, bx+bw/2, yy(0)+13, {align:'center'});
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(81,96,90);
      doc.text('mediana · n='+st.n, bx+bw/2, yy(0)+23, {align:'center'});
    });
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(21,63,53);
    doc.text('Total acumulado: '+fmtInt(cum)+' dias', margin+fullW-14, y0+20, {align:'right'});
  }

  // Funil | Perfil de frequência
  var y1 = y0 + hCasc + gap, h1 = pageHeight - margin - y1;
  var yf = card(margin, y1, colW, h1, 'Funil de abandono');
  var funil = data.funil || [], base = (funil[0] && funil[0].n) || 0;
  var coresF = ['#2F6F5E','#6B8F71','#C68A3D','#B5474B'];
  var yb = yf + 10, bx0 = margin+14, bwTot = colW-28;
  funil.forEach(function(f, i){
    var pct = base ? Math.round(f.n/base*100) : 0;
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60,72,66);
    doc.text(f.label, bx0, yb);
    doc.setFont('helvetica','bold'); doc.setTextColor(21,63,53);
    doc.text(fmtInt(f.n)+' pacientes · '+pct+'%', bx0+bwTot, yb, {align:'right'});
    doc.setFillColor(234,234,227); doc.roundedRect(bx0, yb+5, bwTot, 10, 4, 4, 'F');
    if(pct > 0){ doc.setFillColor(coresF[i] || '#2F6F5E'); doc.roundedRect(bx0, yb+5, Math.max(6, bwTot*pct/100), 10, 4, 4, 'F'); }
    yb += 36;
  });

  var xp = margin + colW + gap;
  var yp = card(xp, y1, colW, h1, 'Perfil de frequência');
  var imgW = colW*0.5 - 14, imgH = h1 - 34 - 12;
  imagemChart('analisesFreqDonut', xp+10, yp, imgW, imgH);
  var f = data.perfilFreq, tot = f.unica+f.ocasional+f.consolidado;
  function pctF(n){ return tot ? Math.round(n/tot*100) : 0; }
  var linhasKpi = [
    ['Consulta única', fmtInt(f.unica)+' ('+pctF(f.unica)+'%)'],
    ['Retorno ocasional (2-3)', fmtInt(f.ocasional)+' ('+pctF(f.ocasional)+'%)'],
    ['Vínculo consolidado (4+)', fmtInt(f.consolidado)+' ('+pctF(f.consolidado)+'%)'],
    ['Média de atendimentos por paciente', fmtDec(f.mediaConsultas,1)],
    ['Total de atendimentos no período', fmtInt(data.totalAtendimentos || 0)]
  ];
  var kx = xp + colW*0.5 + 4, ky = yp + 6, kw = colW*0.5 - 18;
  doc.setFillColor(243,244,239); doc.roundedRect(kx, ky-6, kw, linhasKpi.length*30+6, 5, 5, 'F');
  linhasKpi.forEach(function(l, i){
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(81,96,90);
    doc.text(l[0], kx+kw/2, ky+6+i*30, {align:'center', maxWidth: kw-8});
    doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.setTextColor(21,63,53);
    doc.text(l[1], kx+kw/2, ky+19+i*30, {align:'center'});
  });

  // ---------- Página 2 ----------
  doc.addPage();
  cabecalho();
  var h2 = 250;
  var ys = card(margin, y0, colW, h2, 'Atendimentos por dia da semana');
  imagemChart('analisesDiaSemana', margin+10, ys, colW-20, h2-34-10);
  var ym = card(margin + colW + gap, y0, colW, h2, 'Média de atendimentos por dia da semana');
  imagemChart('analisesMediaDiaSemana', margin+colW+gap+10, ym, colW-20, h2-34-10);

  var y3 = y0 + h2 + gap, h3 = pageHeight - margin - y3;
  var yco = card(margin, y3, fullW, h3, 'Tempo até a 2ª e da 2ª até a 3ª consulta de acordo com o Profissional');
  imagemChart('analisesCompProf', margin+10, yco, fullW-20, h3-34-10);

  doc.save(slugifyFileName('Graficos_frequencia_retorno')+'__'+slugifyFileName(equipeLabel)+'__'+slugifyFileName(new Date().toLocaleDateString('pt-BR'))+'.pdf');
}

// ---------- Exportar "Pacientes em risco de abandono" em PDF ----------
// Mesma linha visual dos outros PDFs do painel (faixa de cabeçalho +
// tabela), mas usa a lista COMPLETA de risco (não só os 40 primeiros
// mostrados na tela).
export function gerarPdfRisco(risco, totalGeral, profSel){
  var jspdfNs = window.jspdf;
  if(!jspdfNs || !jspdfNs.jsPDF){
    alert('Não foi possível carregar a biblioteca de geração de PDF (verifique a conexão com a internet) — tente novamente.');
    return;
  }
  if(!risco.length){
    alert('Não há pacientes pra exportar (nenhum paciente na janela de risco com o filtro atual).');
    return;
  }
  var filtroAtivo = typeof totalGeral === 'number' && totalGeral > risco.length;
  var equipeLabel = estadoApp.analisesEquipes.map(function(e){ return e.label; }).join(' + ') + (estadoApp.analisesProfissional ? ' — ' + estadoApp.analisesProfissional : '');
  var doc = new jspdfNs.jsPDF({orientation:'landscape', unit:'pt', format:'a4'});
  var pageWidth = doc.internal.pageSize.getWidth();
  var pageHeight = doc.internal.pageSize.getHeight();
  var margin = 28;

  doc.setFillColor(21,63,53);
  doc.rect(0,0,pageWidth,64,'F');
  doc.setTextColor(238,243,234);
  doc.setFont('helvetica','bold');
  doc.setFontSize(15);
  doc.text('Painel eMulti — Indicadores M1 e M2', margin, 26);
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
  doc.text('Pacientes em risco de abandono', margin, y);
  y += 16;
  y = pdfLinhaProfissional(doc, 'Profissional (última consulta)', profSel && profSel.ultima, margin, y, pageWidth-margin*2);
  y = pdfLinhaProfissional(doc, 'Profissional (qualquer consulta)', profSel && profSel.qualquer, margin, y, pageWidth-margin*2);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(81,96,90);
  doc.text('Pacientes com 2+ consultas cujo último atendimento já passou da mediana histórica de retorno da equipe, mas ainda dentro de uma janela em que voltar é plausível.', margin, y, {maxWidth: pageWidth-margin*2});
  y += 22;
  doc.text(fmtInt(risco.length)+(risco.length===1?' paciente no total':' pacientes no total')+(filtroAtivo ? ' (filtro de profissional/busca aplicado — total geral sem filtro: '+fmtInt(totalGeral)+')' : '')+'.', margin, y, {maxWidth: pageWidth-margin*2});
  y += 10;

  var linhasRisco = risco.map(function(r){
    return [r.nome, r.profissional, r.equipe, fmtInt(r.totalConsultas), fmtBRDate(r.ultima), fmtInt(r.diasDesde)+' dias'];
  });
  var tabelaRisco = pdfComNumeracao(['Paciente','Profissional','Equipe','Consultas','Última consulta','Dias sem voltar'], linhasRisco, linhasRisco.length > 999 ? 36 : 30);
  doc.autoTable({
    startY: y+6,
    head: [tabelaRisco.head],
    body: tabelaRisco.body,
    theme: 'grid',
    columnStyles: tabelaRisco.columnStyles,
    margin: {left:margin, right:margin, bottom:34},
    styles: {font:'helvetica', fontSize:8.6, cellPadding:4, overflow:'linebreak', textColor:[19,36,31], lineColor:[220,228,214], lineWidth:0.5},
    headStyles: {fillColor:[21,63,53], textColor:255, fontStyle:'bold', halign:'center', valign:'middle'},
    alternateRowStyles: {fillColor:[241,244,238]},
    didDrawPage: function(){
      doc.setFontSize(8);
      doc.setTextColor(150,158,152);
      doc.text('Página '+doc.internal.getCurrentPageInfo().pageNumber, pageWidth-margin, pageHeight-14, {align:'right'});
    }
  });

  var arquivo = slugifyFileName('Pacientes_risco_abandono')+'__'+slugifyFileName(equipeLabel)+'__'+slugifyFileName(new Date().toLocaleDateString('pt-BR'))+'.pdf';
  doc.save(arquivo);
}
