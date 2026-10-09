// ======================================================================
// pdf/pdf-listas.js
// PDF das listas e helpers de PDF
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../nucleo/estado.js';
import { displayListName, monthOptionLabel } from '../nucleo/config.js';
import { normalizeText } from '../nucleo/dados.js';
import { listModel, listMonthFilters } from '../nucleo/listas-estado.js';
import { fmtInt } from '../nucleo/utils.js';

// ---------- Exportar lista em PDF ----------
// Gera um PDF "elegante" (faixa de cabeçalho colorida + tabela) a partir
// do que está REALMENTE visível na tela: lê o <thead>/<tbody> do próprio
// card já filtrado (busca + filtros de coluna + filtro de mês), em vez
// de reconstruir a partir de latestSheets — assim o PDF bate 100% com o
// que os filtros ativos estão mostrando, sem duplicar a lógica deles.
function monthValueToLabel(v){
  var parts = String(v).split('-');
  return monthOptionLabel(new Date(+parts[0], +parts[1]-1, 1));
}

export function slugifyFileName(s){
  return normalizeText(s).replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}

// ---------- Helpers de PDF: alinhamento das colunas ----------
// Uma coluna é "numérica" quando TODOS os valores preenchidos têm
// dígitos e nenhuma letra (depois de tirar sufixos como "dias" e "%" e
// o "R$"): cobre inteiros, decimais com vírgula, percentuais, datas
// (12/03/2026), horas e códigos como CPF/CNS. Traços de "vazio" ("-",
// "—") são ignorados. Colunas de texto (nomes etc.) ficam à esquerda.
function pdfValorEhNumerico(v){
  var s = String(v == null ? '' : v).trim();
  if(!s || /^[-–—]+$/.test(s)) return null; // vazio: não decide nada
  var t = s.replace(/R\$/g,'').replace(/\s*(dias?|%)\s*$/i,'');
  return /\d/.test(t) && !/[A-Za-zÀ-ÿ]/.test(t);
}

// Devolve o columnStyles do autoTable ({indice:{halign:'center'}}) só
// pras colunas numéricas.
function pdfColunasNumericasCentralizadas(nCols, linhas){
  var estilos = {};
  for(var c = 0; c < nCols; c++){
    var temNumero = false, soNumeros = true;
    for(var r = 0; r < linhas.length; r++){
      var ehNum = pdfValorEhNumerico(linhas[r][c]);
      if(ehNum === null) continue;
      if(!ehNum){ soNumeros = false; break; }
      temNumero = true;
    }
    if(soNumeros && temNumero) estilos[c] = {halign:'center'};
  }
  return estilos;
}

// Acrescenta a coluna "Nº" (1, 2, 3...) na frente do cabeçalho e de cada
// linha, seguindo a ordem em que as linhas aparecem no PDF (a numeração
// continua entre as páginas). Devolve {head, body, columnStyles}, onde a
// coluna do número já sai estreita e centralizada.
export function pdfComNumeracao(head, linhas, larguraNum){
  var body = linhas.map(function(l, i){ return [String(i+1)].concat(l); });
  var estilos = pdfColunasNumericasCentralizadas(head.length+1, body);
  estilos[0] = {halign:'center', cellWidth: larguraNum || 30};
  return {head:['Nº'].concat(head), body:body, columnStyles:estilos};
}

// Escreve uma linha em destaque com o(s) profissional(is) selecionado(s),
// quebrando em várias linhas se a lista for longa. Devolve o novo y.
export function pdfLinhaProfissional(doc, rotulo, nomes, x, y, larguraMax){
  if(!nomes || !nomes.length) return y;
  doc.setFont('helvetica','bold');
  doc.setFontSize(10.5);
  doc.setTextColor(21,63,53);
  var linhas = doc.splitTextToSize(rotulo+': '+nomes.join(', '), larguraMax);
  doc.text(linhas, x, y);
  return y + 13*linhas.length;
}

export function gerarPdfLista(listName, card, btn){
  if(!card) return;
  var jspdfNs = window.jspdf;
  if(!jspdfNs || !jspdfNs.jsPDF){
    alert('Não foi possível carregar a biblioteca de geração de PDF (verifique a conexão com a internet) — tente novamente.');
    return;
  }
  // Colunas ocultas na tela (ex.: "profissional 1".."5" da lista
  // "Participantes Ativ. Coletiva", resumidas no selo "AÇÃO M2" — ver
  // renderListCard) também ficam fora do PDF. headersOriginal preserva a
  // posição/nome de TODAS as colunas (mesmos índices usados pelos
  // seletores de filtro, ver filtrosAtivos abaixo); headers/linhasVisiveis
  // (usados na tabela do PDF) já saem sem essas colunas.
  var thEls = Array.prototype.slice.call(card.querySelectorAll('thead th'));
  var headersOriginal = thEls.map(function(th){ return th.textContent.trim(); });
  var idxsPdfOcultos = [];
  thEls.forEach(function(th, i){ if(th.classList.contains('part-col-oculta')) idxsPdfOcultos.push(i); });
  var headers = idxsPdfOcultos.length
    ? headersOriginal.filter(function(h,i){ return idxsPdfOcultos.indexOf(i) === -1; })
    : headersOriginal;
  var listKeyPdf = card.getAttribute('data-state-key') || listName;
  var mPdf = listModel[listKeyPdf];
  var todasLinhas = mPdf ? mPdf.rows : [];
  var linhasVisiveis = (mPdf ? mPdf.view : []).map(function(row){
      var celulas = row.t.slice();
      return idxsPdfOcultos.length ? celulas.filter(function(c,i){ return idxsPdfOcultos.indexOf(i) === -1; }) : celulas;
    });
  if(!linhasVisiveis.length){
    alert('Nenhuma linha visível com os filtros atuais dessa lista — ajuste os filtros antes de gerar o PDF.');
    return;
  }

  // Monta o resumo dos filtros ativos nesta lista, pra registrar no
  // cabeçalho do PDF exatamente o que foi aplicado.
  var filtrosAtivos = [];
  var profissionaisSel = [];
  var searchInput = card.querySelector('.list-search');
  if(searchInput && searchInput.value.trim()) filtrosAtivos.push('Busca: "'+searchInput.value.trim()+'"');
  var mesesSelecionados = listMonthFilters[listKeyPdf] || [];
  if(mesesSelecionados.length){
    filtrosAtivos.push('Mês: '+mesesSelecionados.map(monthValueToLabel).join(', '));
  }
  card.querySelectorAll('.filter-pair').forEach(function(pair){
    var colSelect = pair.querySelector('.filter-col');
    var valWrap = pair.querySelector('.filter-val-ms');
    var vals = (valWrap && valWrap._msInstance) ? valWrap._msInstance.getSelected() : [];
    if(colSelect && colSelect.value !== '' && vals.length){
      var rotuloColuna = colSelect.options[colSelect.selectedIndex]
        ? colSelect.options[colSelect.selectedIndex].text
        : colSelect.value;
      // Filtro em coluna de profissional ("Profissional", "Profissional da
      // eMulti", "Profissional 1"...) vira uma linha em destaque logo
      // abaixo do título, em vez de só mais um item da lista de filtros.
      if(/PROFISSIONAL/.test(normalizeText(rotuloColuna))){
        vals.forEach(function(v){ if(profissionaisSel.indexOf(v) === -1) profissionaisSel.push(v); });
      } else {
        filtrosAtivos.push(rotuloColuna+': '+vals.join(', '));
      }
    }
  });

  var totalLinhas = todasLinhas.length;
  var nomeExibicao = displayListName(listName);
  var equipeLabel = estadoApp.currentEquipes.map(function(e){ return e.label; }).join(' + ');

  var doc = new jspdfNs.jsPDF({orientation: headers.length > 6 ? 'landscape' : 'portrait', unit:'pt', format:'a4'});
  var pageWidth = doc.internal.pageSize.getWidth();
  var pageHeight = doc.internal.pageSize.getHeight();
  var margin = 28;

  // ---- Faixa de cabeçalho ----
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

  // ---- Título da lista + resumo dos filtros ----
  var y = 84;
  doc.setTextColor(21,63,53);
  doc.setFont('helvetica','bold');
  doc.setFontSize(13);
  doc.text(nomeExibicao, margin, y);
  y += 16;
  y = pdfLinhaProfissional(doc, profissionaisSel.length > 1 ? 'Profissionais' : 'Profissional', profissionaisSel, margin, y, pageWidth-margin*2);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(81,96,90);
  if(filtrosAtivos.length){
    filtrosAtivos.forEach(function(linha){
      var quebradas = doc.splitTextToSize('• '+linha, pageWidth-margin*2);
      doc.text(quebradas, margin, y);
      y += 12*quebradas.length;
    });
  } else {
    doc.text('Sem filtros aplicados — exibindo todos os registros.', margin, y);
    y += 12;
  }
  doc.text(fmtInt(linhasVisiveis.length)+' de '+fmtInt(totalLinhas)+(totalLinhas===1?' linha no total.':' linhas no total.'), margin, y);
  y += 10;

  var tabelaPdf = pdfComNumeracao(headers, linhasVisiveis, linhasVisiveis.length > 999 ? 36 : 30);
  doc.autoTable({
    startY: y+6,
    head: [tabelaPdf.head],
    body: tabelaPdf.body,
    theme: 'grid',
    columnStyles: tabelaPdf.columnStyles,
    margin: {left:margin, right:margin, bottom:34},
    styles: {font:'helvetica', fontSize: headers.length > 9 ? 7 : (headers.length > 6 ? 7.8 : 8.6), cellPadding:4, overflow:'linebreak', textColor:[19,36,31], lineColor:[220,228,214], lineWidth:0.5},
    headStyles: {fillColor:[21,63,53], textColor:255, fontStyle:'bold', halign:'center', valign:'middle'},
    alternateRowStyles: {fillColor:[241,244,238]},
    didDrawPage: function(){
      doc.setFontSize(8);
      doc.setTextColor(150,158,152);
      doc.text('Página '+doc.internal.getCurrentPageInfo().pageNumber, pageWidth-margin, pageHeight-14, {align:'right'});
    }
  });

  var arquivo = slugifyFileName(nomeExibicao)+'__'+slugifyFileName(equipeLabel)+'__'+slugifyFileName(new Date().toLocaleDateString('pt-BR'))+'.pdf';
  doc.save(arquivo);
}
