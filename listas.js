// ======================================================================
// listas.js
// Arquivo consolidado a partir dos módulos de js/ (ver MODULOS.md).
// Cada seção "=== módulo: ... ===" corresponde a um arquivo original.
// ======================================================================

import { profissionaisRoster, ehProfissionalComparativoEmulti, EQUIPES, TOTAL_PROF_EMULTI_HEADER, calcularJanelaPeriodo, colIndex, colRespParticipantes, colTotalProfEmulti, createMultiSelect, dateColIndexForList, debounce, displayListName, equipeColIndex, escapeHtml, estadoApp, fmtBRDate, fmtDec, fmtInt, listDatasExpandidas, listDateColIdx, listModel, listMonthFilters, monthOptionLabel, monthOptionValue, monthOptionsForList, monthShortLabel, nomeEhDaEmulti, normalizeText, parseBRDate, suffixedName, temaEhDiscussaoCasoPts, tipoEhReuniao, toInt, withinPeriod } from './nucleo.js';
import { ACAO_M2_FILTER_VALUE, DIAS_SEM_ATENDIMENTO_HEADER, FAIXAS_DIAS_SEM_ATENDIMENTO, PROF_EMULTI_FILTER_VALUE, RISCO_CFG_BUSCA, buscaAtivaCompute, diasBucketLabel, profissionalBadgeHtml, riscoTableHtml, wireRiscoFiltros } from './abas.js';
import { latestWb } from './app.js';

// ===== módulo: js/pdf/pdf-listas.js =====
// ======================================================================
// pdf/pdf-listas.js
// PDF das listas e helpers de PDF
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


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

// ===== módulo: js/listas/atividade-coletiva.js =====
// ======================================================================
// listas/atividade-coletiva.js
// Listas — participantes e resumo de atividade coletiva (AÇÃO M2 + modal)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// "Participantes Ativ. Coletiva" não tem uma única coluna "profissional"
// — tem "Responsavel Atividade" + "profissional 1" a "profissional 5"
// (até 6 pessoas podem estar envolvidas na mesma atividade; ver
// iPProfCols em calcularSinteseParaPeriodo, que já usa essas 6 colunas
// pra filtrar M1). A coluna "Profissional" da tabela "Pessoas
// atendidas" precisa juntar o valor de TODAS elas — antes usava só
// profissionalColIndex, que por buscar "PROFISSIONAL" por substring
// parava na primeira batida ("profissional 1"), então ignorava o
// Responsável e as colunas 2 a 5.
export function colsProfissionaisParticipantes(headerRow){
  var idxs = [colRespParticipantes(headerRow)].concat(
      ["profissional 1","profissional 2","profissional 3","profissional 4","profissional 5"]
        .map(function(n){ return colIndex(headerRow, n); })
    )
    .filter(function(i){ return i>=0; });
  if(idxs.length) return idxs;
  var single = profissionalColIndex(headerRow);
  return single >= 0 ? [single] : [];
}

// Só as colunas numeradas ("profissional 1" a "profissional 5"), SEM
// "Responsavel Atividade" — usado pelo filtro virtual "Profissional da
// eMulti" da lista "Participantes Ativ. Coletiva" (ver PROF_EMULTI_FILTER_VALUE
// logo abaixo): o que importa pro indicador é se ALGUM dos profissionais
// envolvidos na atividade (não necessariamente o responsável) é da
// eMulti — mesmo quando o responsável não é, a atividade ainda conta
// como coletiva da eMulti (só não é "compartilhada").
export function colsProfissionaisNumerados(headerRow){
  var nomes = ["profissional 1","profissional 2","profissional 3","profissional 4","profissional 5"];
  return nomes.map(function(n){ return colIndex(headerRow, n); }).filter(function(i){ return i>=0; });
}

// ---------- "Participantes Ativ. Coletiva": selo AÇÃO M2 + modal Detalhes ----------
// Em vez de mostrar "Responsavel Atividade" + "profissional 1" a
// "profissional 5" como 5 colunas soltas, a lista resume tudo num selo
// "AÇÃO M2" (Compartilhada quando 2+ profissionais estão envolvidos na
// mesma participação, Específica quando só 1) e um botão "Detalhes" que
// abre a ficha completa da linha. As colunas originais continuam no DOM
// (só ficam ocultas via CSS — classe .part-col-oculta), então os filtros
// já existentes ("Profissional da eMulti", busca, exportar PDF) seguem
// funcionando sem duplicar lógica (ver ajuste em gerarPdfLista).
function nomesEnvolvidosParticipacao(headers, row){
  var envolvidos = [];
  var iResp = colRespParticipantes(headers);
  if(iResp >= 0){
    var vResp = String(row[iResp]||"").trim();
    if(vResp){
      var respEhEmulti = nomeEhDaEmulti(vResp);
      envolvidos.push({rotulo: respEhEmulti ? "Responsável (eMulti)" : "Responsável", nome:vResp});
    }
  }
  var secundarios = [];
  colsProfissionaisNumerados(headers).forEach(function(ci){
    var v = String(row[ci]||"").trim();
    if(v) secundarios.push(v);
  });
  secundarios.forEach(function(nome, i){
    envolvidos.push({
      rotulo: "Profissional envolvido (secundário)" + (secundarios.length > 1 ? " "+(i+1) : ""),
      nome: nome
    });
  });
  return envolvidos;
}

function classificarAcaoM2Participacao(headers, row){
  var qtd = nomesEnvolvidosParticipacao(headers, row).length;
  if(qtd >= 2) return {classe:"compartilhada", label:"Compartilhada", qtd:qtd};
  if(qtd === 1) return {classe:"especifica", label:"Específica", qtd:qtd};
  return {classe:"semregistro", label:"Sem registro", qtd:qtd};
}

// ---------- "Resumo Atividade Coletiva": AÇÃO M2 + Detalhes ----------
// Cada linha desta lista é UMA atividade coletiva. O enquadramento segue
// a mesma regra que alimenta o numerador do M2 (ver "atividadesCompartilhadasListas"):
// Compartilhada = pelo menos 1 profissional da eMulti (coluna "Total de
// Profissionais da EMulti", ligada a Participantes Ativ. Coletiva) E 2 ou
// mais profissionais no total ("Qtd total de profissionais"). Sem a coluna
// da eMulti para aquela linha, vale só a regra de 2+ profissionais.
export function ehListaResumoAtividadeColetiva(name){
  return displayListName(name) === "Resumo Atividade Coletiva";
}

function textoCelulaLista(row, idx){
  if(idx < 0) return '';
  var v = row[idx];
  return (v===undefined||v===null) ? '' : String(v).trim();
}

function classificarAcaoM2Atividade(headers, row){
  // Reunião (de equipe / outras equipes / intersetorial): só é Compartilhada
  // quando o tema é "Discussão de caso / Projeto terapêutico singular" — mesma
  // regra do numerador do M2 (ver calcularIndicadoresDoPeriodo).
  var iTipoReun = colIndex(headers, "tipo_atividade");
  if(iTipoReun >= 0 && tipoEhReuniao(textoCelulaLista(row, iTipoReun))){
    var iTemaReun = colIndex(headers, "temas_reuniao");
    if(iTemaReun < 0 || !temaEhDiscussaoCasoPts(textoCelulaLista(row, iTemaReun))){
      return {classe:"especifica", label:"Específica", qtd:0, totalEmulti:null, motivo:"reuniaosemtema"};
    }
  }
  var iTot = colIndex(headers, "qtd_total_profissionais");
  var iEnv = colIndex(headers, "qtd_profissionais_envolvidos");
  var iEm = colTotalProfEmulti(headers);
  if(iTot < 0 && iEnv < 0) return {classe:"semregistro", label:"Sem registro", qtd:0, totalEmulti:null, motivo:"semcolunas"};
  var vTot = textoCelulaLista(row, iTot);
  var totalGeral = (vTot !== '') ? toInt(vTot) : 1 + toInt(textoCelulaLista(row, iEnv));
  var vEm = textoCelulaLista(row, iEm);
  var totalEmulti = (vEm !== '') ? toInt(vEm) : null;
  var temEmulti = (totalEmulti === null) ? true : totalEmulti >= 1;
  if(totalGeral >= 2 && temEmulti) return {classe:"compartilhada", label:"Compartilhada", qtd:totalGeral, totalEmulti:totalEmulti, motivo:"ok"};
  return {classe:"especifica", label:"Específica", qtd:totalGeral, totalEmulti:totalEmulti,
          motivo: (totalGeral >= 2 && !temEmulti) ? "sememulti" : "umprofissional"};
}

// Escolhe o classificador certo conforme a lista (Participantes x Resumo).
export function classificarAcaoM2Lista(name, headers, row){
  return ehListaResumoAtividadeColetiva(name)
    ? classificarAcaoM2Atividade(headers, row)
    : classificarAcaoM2Participacao(headers, row);
}

function montarDetalhesAtividadeHTML(headers, row){
  var classificacao = classificarAcaoM2Atividade(headers, row);
  var iData = colIndex(headers, "data");
  var iTipo = colIndex(headers, "tipo_atividade");
  var iEquipe = colIndex(headers, "equipe_unidade");
  if(iEquipe < 0 && typeof equipeColIndex === 'function') iEquipe = equipeColIndex(headers);
  var iTot = colIndex(headers, "qtd_total_profissionais");
  var iEm = colTotalProfEmulti(headers);
  var data = textoCelulaLista(row, iData);
  var tipo = textoCelulaLista(row, iTipo);
  var equipe = textoCelulaLista(row, iEquipe);
  var totalGeralTxt = textoCelulaLista(row, iTot);
  var totalEmultiTxt = textoCelulaLista(row, iEm);

  var camposGrid = [
    equipe ? {label:'Equipe / Unidade', valor:equipe} : null,
    tipo ? {label:'Tipo de Atividade', valor:tipo} : null,
    totalGeralTxt ? {label:'Total de profissionais', valor:totalGeralTxt} : null,
    totalEmultiTxt ? {label:'Profissionais da eMulti', valor:totalEmultiTxt} : null
  ].filter(Boolean);
  var infoBoxes = camposGrid.length
    ? '<div class="part-modal-grid">' + camposGrid.map(function(c){
        return '<div><div class="part-modal-label">'+escapeHtml(c.label)+'</div><div class="part-modal-value">'+escapeHtml(c.valor)+'</div></div>';
      }).join('') + '</div>'
    : '';

  // Demais colunas da linha (as que ainda não apareceram acima), para a
  // ficha mostrar a atividade completa sem depender do nome de cada coluna.
  var jaMostradas = {};
  [iData, iTipo, iEquipe, iTot, iEm].forEach(function(i){ if(i >= 0) jaMostradas[i] = true; });
  var outros = [];
  headers.forEach(function(h, i){
    if(jaMostradas[i]) return;
    var v = textoCelulaLista(row, i);
    if(v !== '') outros.push({label:String(h), valor:v});
  });
  var outrosHtml = outros.length
    ? '<div class="part-modal-section"><div class="part-modal-section-title">Demais informações</div>'
      + '<div class="part-modal-grid">' + outros.map(function(c){
          return '<div><div class="part-modal-label">'+escapeHtml(c.label)+'</div><div class="part-modal-value">'+escapeHtml(c.valor)+'</div></div>';
        }).join('') + '</div></div>'
    : '';

  var notaClassificacao;
  if(classificacao.classe === 'compartilhada'){
    notaClassificacao = classificacao.qtd+' profissionais na atividade, com participação da eMulti — conta como Ação Compartilhada (M2).';
  } else if(classificacao.motivo === 'reuniaosemtema'){
    notaClassificacao = 'Reunião sem o tema "Discussão de caso / Projeto terapêutico singular" — não conta como Ação Compartilhada (M2).';
  } else if(classificacao.motivo === 'sememulti'){
    notaClassificacao = classificacao.qtd+' profissionais na atividade, mas nenhum da eMulti — não conta como Ação Compartilhada (M2).';
  } else if(classificacao.classe === 'especifica'){
    notaClassificacao = 'Apenas 1 profissional na atividade — conta como Ação Específica (individual).';
  } else {
    notaClassificacao = 'Não há coluna de quantidade de profissionais nesta lista para classificar a ação.';
  }

  return '<div class="part-modal-head"><span class="part-modal-eyebrow">Detalhes da Atividade Coletiva</span></div>'
    + '<h3 class="part-modal-title">'+escapeHtml(tipo || 'Atividade coletiva')+'</h3>'
    + (data ? '<div class="part-modal-sub">Data: '+escapeHtml(data)+'</div>' : '')
    + infoBoxes
    + outrosHtml
    + '<div class="part-modal-section part-modal-enquadramento">'
      + '<div class="part-modal-section-title">Enquadramento (AÇÃO M2)</div>'
      + acaoM2BadgeHTML(classificacao)
      + '<div class="part-modal-nota">'+escapeHtml(notaClassificacao)+'</div>'
    + '</div>';
}

export function acaoM2BadgeHTML(classificacao){
  var icone = classificacao.classe === "compartilhada"
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M8.2 10.8l6.6-3.6M8.2 13.2l6.6 3.6"/></svg>'
    : classificacao.classe === "especifica"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  return '<span class="acao-m2-badge acao-m2-'+classificacao.classe+'">'+icone+'<span>'+escapeHtml(classificacao.label)+'</span></span>';
}

export function detalhesBtnHTML(listName, rowIdx){
  return '<button type="button" class="detalhes-part-btn" data-detalhes-part-list="'+escapeHtml(listName)+'" data-detalhes-part-idx="'+rowIdx+'">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>'
    + '<span>Detalhes</span></button>';
}

function valorColunaParticipacao(headers, row, nomeCol){
  var idx = colIndex(headers, nomeCol);
  if(idx < 0) return '';
  var v = row[idx];
  return String(v===undefined||v===null?'':v).trim();
}

function montarDetalhesParticipacaoHTML(headers, row){
  var participante = valorColunaParticipacao(headers, row, 'participante') || valorColunaParticipacao(headers, row, 'nome');
  var data = valorColunaParticipacao(headers, row, 'data_hora') || valorColunaParticipacao(headers, row, 'data');
  var equipe = valorColunaParticipacao(headers, row, 'equipe_unidade');
  var tipoAtividade = valorColunaParticipacao(headers, row, 'tipo_atividade');
  var totalProfEmulti = colTotalProfEmulti(headers) >= 0 ? valorColunaParticipacao(headers, row, TOTAL_PROF_EMULTI_HEADER) : '';
  var classificacao = classificarAcaoM2Participacao(headers, row);
  var envolvidos = nomesEnvolvidosParticipacao(headers, row);

  var envolvidosHtml = envolvidos.length
    ? envolvidos.map(function(p){
        return '<div class="part-modal-prof"><b>'+escapeHtml(p.rotulo)+':</b> '+escapeHtml(p.nome)+'</div>';
      }).join('')
    : '<div class="part-modal-prof part-modal-prof-vazio">Nenhum profissional registrado nesta linha.</div>';

  var camposGrid = [
    equipe ? {label:'Equipe / Unidade', valor:equipe} : null,
    tipoAtividade ? {label:'Tipo de Atividade', valor:tipoAtividade} : null
  ].filter(Boolean);
  var infoBoxes = camposGrid.length
    ? '<div class="part-modal-grid">' + camposGrid.map(function(c){
        return '<div><div class="part-modal-label">'+escapeHtml(c.label)+'</div><div class="part-modal-value">'+escapeHtml(c.valor)+'</div></div>';
      }).join('') + '</div>'
    : '';

  var notaClassificacao = classificacao.classe === 'compartilhada'
    ? classificacao.qtd+' profissionais envolvidos — conta como Ação Compartilhada (M2).'
    : classificacao.classe === 'especifica'
      ? 'Apenas 1 profissional envolvido — conta como Ação Específica (individual).'
      : 'Nenhum profissional identificado nesta linha para classificar a ação.';

  return '<div class="part-modal-head"><span class="part-modal-eyebrow">Detalhes da Participação</span></div>'
    + '<h3 class="part-modal-title">'+escapeHtml(participante || 'Participação em atividade coletiva')+'</h3>'
    + (data ? '<div class="part-modal-sub">Data: '+escapeHtml(data)+'</div>' : '')
    + infoBoxes
    + '<div class="part-modal-section"><div class="part-modal-section-title">Profissionais Envolvidos</div>'+envolvidosHtml+'</div>'
    + '<div class="part-modal-section part-modal-enquadramento">'
      + '<div class="part-modal-section-title">Enquadramento (AÇÃO M2)</div>'
      + acaoM2BadgeHTML(classificacao)
      + '<div class="part-modal-nota">'+escapeHtml(notaClassificacao)+'</div>'
      + (totalProfEmulti ? '<div class="part-modal-nota">Total de profissionais da eMulti nesta atividade: '+escapeHtml(totalProfEmulti)+'</div>' : '')
    + '</div>';
}

var partModalEl = null;

function partModalGarantirEl(){
  if(partModalEl) return partModalEl;
  var el = document.createElement('div');
  el.className = 'part-modal-overlay';
  el.id = 'partDetalhesOverlay';
  el.innerHTML = '<div class="part-modal-card"><button type="button" class="part-modal-close" aria-label="Fechar">&times;</button><div class="part-modal-body"></div></div>';
  document.body.appendChild(el);
  el.addEventListener('click', function(ev){ if(ev.target === el) fecharDetalhesParticipacao(); });
  el.querySelector('.part-modal-close').addEventListener('click', fecharDetalhesParticipacao);
  partModalEl = el;
  return el;
}

function fecharDetalhesParticipacao(){
  if(partModalEl) partModalEl.classList.remove('is-open');
}

export function abrirDetalhesParticipacao(headers, row, listName){
  var el = partModalGarantirEl();
  el.querySelector('.part-modal-body').innerHTML = (listName && ehListaResumoAtividadeColetiva(listName))
    ? montarDetalhesAtividadeHTML(headers, row)
    : montarDetalhesParticipacaoHTML(headers, row);
  el.classList.add('is-open');
}

function injectPartModalStyles(){
  if(document.getElementById('partModalStyles')) return;
  var css = ''
    + '.part-col-oculta{display:none}'
    + '.list-card:not(.pa-datas-expandidas) .pa-data-extra{display:none}'
    + '.pa-datas-bar{display:flex;justify-content:flex-end;margin:0 0 8px}'
    + '.pa-toggle-datas{font:inherit;font-size:12.5px;font-weight:600;color:#1C6D53;background:#EAF3EE;border:1px solid #CFE3D8;border-radius:999px;padding:5px 12px;cursor:pointer}'
    + '.pa-toggle-datas:hover{background:#DCEBE3}'
    + '.list-card .data-table td.cell-trunc{max-width:var(--cell-max,220px);overflow:hidden;text-overflow:ellipsis}'
    + '.sortable-th{cursor:pointer;user-select:none;white-space:nowrap}'
    + '.sortable-th:hover{background:#EEF3EA}'
    + '.sort-ind{display:inline-block;width:10px;margin-left:3px;opacity:.35;font-size:10px}'
    + '.sortable-th.sort-asc .sort-ind,.sortable-th.sort-desc .sort-ind{opacity:1}'
    + '.sortable-th.sort-asc .sort-ind::after{content:"▲"}'
    + '.sortable-th.sort-desc .sort-ind::after{content:"▼"}'
    + '.acao-m2-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12.5px;font-weight:700;white-space:nowrap}'
    + '.acao-m2-badge svg{width:14px;height:14px;flex:none}'
    + '.acao-m2-compartilhada{background:#E7EEFB;color:#2F5FCB}'
    + '.acao-m2-especifica{background:#E3F3E8;color:#1F7A45}'
    + '.acao-m2-semregistro{background:#F1F1EF;color:#7A7A72}'
    + '.detalhes-part-btn{display:inline-flex;align-items:center;gap:5px;border:none;background:none;color:#1F8A57;font-weight:700;font-size:12.5px;cursor:pointer;padding:4px 2px;white-space:nowrap}'
    + '.detalhes-part-btn svg{width:15px;height:15px;flex:none}'
    + '.detalhes-part-btn:hover{text-decoration:underline}'
    + '.part-modal-overlay{position:fixed;inset:0;background:rgba(15,25,20,.55);display:flex;align-items:center;justify-content:center;padding:16px;z-index:9999;opacity:0;pointer-events:none;transition:opacity .15s}'
    + '.part-modal-overlay.is-open{opacity:1;pointer-events:auto}'
    + '.part-modal-card{position:relative;background:#fff;border-radius:16px;max-width:480px;width:100%;max-height:88vh;overflow:auto;padding:20px 20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.25)}'
    + '.part-modal-close{position:absolute;top:10px;right:12px;border:none;background:none;font-size:24px;line-height:1;color:#8B978F;cursor:pointer}'
    + '.part-modal-eyebrow{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#153F35;background:#EEF3EA;padding:4px 9px;border-radius:8px}'
    + '.part-modal-title{margin:10px 0 2px;font-size:18px;font-weight:800;color:#1B2E27}'
    + '.part-modal-sub{font-size:13px;color:#8B978F;margin-bottom:12px}'
    + '.part-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#F7F9F6;border-radius:12px;padding:12px;margin:10px 0}'
    + '.part-modal-label{font-size:11px;font-weight:700;text-transform:uppercase;color:#8B978F;margin-bottom:2px}'
    + '.part-modal-value{font-size:13.5px;font-weight:700;color:#1B2E27}'
    + '.part-modal-section{margin-top:14px}'
    + '.part-modal-section-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#153F35;margin-bottom:6px}'
    + '.part-modal-prof{font-size:13.5px;color:#1B2E27;padding:4px 0;border-bottom:1px dashed #E3E8E1}'
    + '.part-modal-prof:last-child{border-bottom:none}'
    + '.part-modal-prof-vazio{color:#8B978F;font-style:italic}'
    + '.part-modal-enquadramento{background:#F2F7F3;border-radius:12px;padding:12px}'
    + '.part-modal-nota{font-size:12.5px;color:#4B5850;margin-top:6px;font-style:italic}'
    + '.prof-mais-btn{display:inline-flex;align-items:center;justify-content:center;margin-left:6px;padding:1px 7px;border-radius:999px;border:1px solid #CFE0D6;background:#EEF3EA;color:#1F7A45;font-size:11px;font-weight:800;cursor:pointer;line-height:1.6;vertical-align:middle}'
    + '.prof-mais-btn:hover{background:#E3F0E7}'
    + '.prof-pop{position:fixed;z-index:10000;background:#fff;border:1px solid #E3E8E1;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.18);padding:10px 12px;min-width:220px;max-width:300px;display:none}'
    + '.prof-pop.is-open{display:block}'
    + '.prof-pop-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#8B978F;margin-bottom:6px}'
    + '.prof-pop-item{font-size:13px;color:#1B2E27;padding:3px 0;border-bottom:1px dashed #E3E8E1}'
    + '.prof-pop-item:last-child{border-bottom:none}'
    + '.prof-pop-item-row{display:flex;justify-content:space-between;gap:10px}'
    + '.prof-pop-item-row span:last-child{color:#5B6B62;white-space:nowrap;font-weight:600}'
    + '.prof-pop-tipo{margin-top:2px;font-size:11px;color:#5B6B62;font-style:italic}'
    + '.legend-info-btn{display:inline-flex;align-items:center;justify-content:center;margin-left:5px;width:15px;height:15px;border-radius:999px;border:1px solid #CFE0D6;background:#EEF3EA;color:#1F7A45;font-size:10px;font-weight:800;font-style:normal;cursor:pointer;line-height:1;vertical-align:middle;flex:none;padding:0}'
    + '.legend-info-btn:hover{background:#E3F0E7}'
    + '.legend-info-pop{max-width:280px;font-size:12.5px;line-height:1.4;color:#3C4A42}';
  var el = document.createElement('style');
  el.id = 'partModalStyles';
  el.textContent = css;
  document.head.appendChild(el);
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_listas_atividade_coletiva(){
injectPartModalStyles();
}

// ===== módulo: js/listas/pessoas-atendidas.js =====
// ======================================================================
// listas/pessoas-atendidas.js
// Listas — pessoas atendidas
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Listas ----------
// "Pessoas atendidas" com filtro de mês PRÓPRIO (independente do filtro
// de Mês do topo): deduplica direto de Atendimentos + Participantes
// Ativ. Coletiva (já filtradas por equipe no fetch), sem depender de
// nenhum link/aba externa. monthValues vazio = todos os meses
// disponíveis (sem filtro); com meses marcados, só entram atendimentos/
// participações daqueles meses.
// Rótulo do tipo de evento, usado tanto pra decidir o "responsável" do
// último evento quanto pro texto exibido no popover "Também atendido por"
// (ver abrirProfPopover).
var TIPO_EVENTO_ATENDIMENTO = 'Atendimento';

var TIPO_EVENTO_PARTICIPACAO = 'Participação em Atividade Coletiva';

// Classificação de Fluxo ("Entrada"/"Saída") da tabela "Pessoas
// Atendidas": SEMPRE calculada sobre o HISTÓRICO COMPLETO da pessoa
// (Atendimentos + Participantes Ativ. Coletiva — TODAS as datas, sem o
// filtro de Mês próprio dessa tabela) e sobre a janela móvel de
// JANELA_MESES (4) meses terminando no ÚLTIMO DIA do mês ATUAL real
// (hoje), não no mês filtrado no topo da página — mesmo critério de
// referência temporal já usado pela Busca-Ativa (ver
// buscaAtivaCompute/calcularJanelaPeriodo).
// - "Entrada": o PRIMEIRO atendimento/participação de TODO o histórico
//   da pessoa caiu dentro dessa janela (pessoa nova no indicador).
// - "Saída": a pessoa NÃO tem nenhum atendimento/participação dentro
//   dessa janela (mesmo tendo histórico anterior a ela).
// - Qualquer outro caso (já vinha de antes da janela E também tem
//   evento dentro dela — segue ativa/estável) fica sem rótulo (célula
//   vazia) — assim a lista de valores do filtro "Fluxo" mostra só as
//   duas opções pedidas (Entrada/Saída), sem um 3º valor "no meio".
function calcularFluxoPorPessoa(){
  var hoje = new Date();
  var mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  var janela = calcularJanelaPeriodo(mesAtual);
  var mapa = {}; // nome maiúsculo -> {primeira:Date|null, temNaJanela:bool}
  function registrar(nome, d){
    if(!nome || !d) return;
    var chave = nome.toUpperCase();
    if(!mapa[chave]) mapa[chave] = {primeira:null, temNaJanela:false};
    var info = mapa[chave];
    if(!info.primeira || d < info.primeira) info.primeira = d;
    if(withinPeriod(d, janela.inicio, janela.fim)) info.temNaJanela = true;
  }
  var atCachedFluxo = estadoApp.latestSheets[suffixedName("Atendimentos")];
  if(atCachedFluxo){
    var iDataFluxo = colIndex(atCachedFluxo.headers, "data_hora");
    var iNomeFluxo = colIndex(atCachedFluxo.headers, "nome");
    if(iDataFluxo >= 0 && iNomeFluxo >= 0){
      atCachedFluxo.rows.forEach(function(r){
        registrar(String(r[iNomeFluxo]||"").trim(), parseBRDate(r[iDataFluxo]));
      });
    }
  }
  var partCachedFluxo = estadoApp.latestSheets[suffixedName("Participantes Ativ. Coletiva")];
  if(partCachedFluxo){
    var iPDataFluxo = colIndex(partCachedFluxo.headers, "data");
    var iPNomeFluxo = colIndex(partCachedFluxo.headers, "participante");
    if(iPDataFluxo >= 0 && iPNomeFluxo >= 0){
      partCachedFluxo.rows.forEach(function(r){
        var nome = String(r[iPNomeFluxo]||"").trim();
        if(!nome || nome.indexOf("(sem lista nominal") === 0) return;
        registrar(nome, parseBRDate(r[iPDataFluxo]));
      });
    }
  }
  return {mapa: mapa, janela: janela};
}

function fluxoLabelPara(fluxoInfo, nome){
  var info = fluxoInfo.mapa[String(nome||"").toUpperCase()];
  if(!info) return "";
  if(info.primeira && withinPeriod(info.primeira, fluxoInfo.janela.inicio, fluxoInfo.janela.fim)) return "Entrada";
  if(!info.temNaJanela) return "Saída";
  return "";
}

// Profissional da eMulti: pelo cadastro da aba PROFISSIONAIS; se ele ainda não carregou, cai no critério comparativo.
function ehEmultiAgenda(nome){
  return profissionaisRoster.length ? nomeEhDaEmulti(nome) : ehProfissionalComparativoEmulti(nome);
}

export function pessoasAtendidasParaMeses(monthValues){
  // nome em maiúsculas -> {nome, at, part, datas:[Date,...],
  // profissionais:{nome:true} (todo mundo que já atendeu, histórico
  // completo — usado só em profissionalCol/busca/PDF),
  // infoPorProf:{nome:{data:Date,tipo:string}} (última ocorrência DE
  // CADA profissional, com o tipo do evento — alimenta o popover),
  // ultimaData:Date|null (data do evento mais recente da pessoa, De
  // QUALQUER tipo), ultimoTipo:string|null, ultimoProfissionalPrincipal:
  // string|null (o ÚNICO nome que aparece na coluna "Profissional")}
  var pessoasSet = {};
  function dentroDoFiltro(d){
    if(!monthValues || !monthValues.length) return true;
    return !!d && monthValues.indexOf(monthOptionValue(d)) >= 0;
  }
  // Critério de desempate/priorização de nome: profissional da eMulti
  // primeiro, depois ordem alfabética — mesmo padrão já usado em
  // listaProf/ultimoArr antes desta função existir.
  function prioridadeMenor(a, b){
    var eA = nomeEhDaEmulti(a) ? 0 : 1, eB = nomeEhDaEmulti(b) ? 0 : 1;
    if(eA !== eB) return eA - eB;
    return a.localeCompare(b, 'pt-BR');
  }
  // Decide QUEM é o profissional responsável pelo evento mais recente da
  // pessoa (Atendimento ou Participação em Atividade Coletiva) — é esse
  // único nome (nunca uma lista) que a coluna "Profissional" mostra sem
  // badge. "principal" já vem escolhido por quem chamou (o profissional
  // do atendimento, ou o Responsável da atividade coletiva — ver
  // chamadas abaixo); em caso de empate exato de data entre dois
  // eventos diferentes, desempata pela mesma prioridade usada no resto
  // da tela, em vez de juntar os dois nomes.
  function atualizarUltimoGeral(p, d, tipo, principal){
    if(!d || !principal) return;
    if(!p.ultimaData || d.getTime() > p.ultimaData.getTime()){
      p.ultimaData = d;
      p.ultimoTipo = tipo;
      p.ultimoProfissionalPrincipal = principal;
    } else if(d.getTime() === p.ultimaData.getTime()
        && prioridadeMenor(principal, p.ultimoProfissionalPrincipal) < 0){
      p.ultimoTipo = tipo;
      p.ultimoProfissionalPrincipal = principal;
    }
  }
  // Guarda, POR PROFISSIONAL, a data e o tipo (Atendimento/Participação)
  // da ocorrência mais recente dele com esta pessoa — alimenta só o
  // popover "Também atendido por" (histórico completo, além do
  // responsável do último evento).
  function registrarProf(p, prof, d, tipo){
    p.profissionais[prof] = true;
    if(d && (!p.infoPorProf[prof] || d.getTime() > p.infoPorProf[prof].data.getTime())){
      p.infoPorProf[prof] = {data:d, tipo:tipo};
    }
  }
  function novaPessoa(nome){
    return {nome:nome, at:0, part:0, datas:[], profissionais:{}, infoPorProf:{}, ultimaData:null, ultimoTipo:null, ultimoProfissionalPrincipal:null, atEmulti:0, ultAgData:null, ultAgProf:''};
  }
  var atCached = estadoApp.latestSheets[suffixedName("Atendimentos")];
  if(atCached){
    var iData = colIndex(atCached.headers, "data_hora");
    var iNome = colIndex(atCached.headers, "nome");
    var iProfAt = profissionalColIndex(atCached.headers);
    if(iData >= 0 && iNome >= 0){
      atCached.rows.forEach(function(r){
        var nome = String(r[iNome]||"").trim();
        var d = parseBRDate(r[iData]);
        if(!nome || !dentroDoFiltro(d)) return;
        var chave = nome.toUpperCase();
        if(!pessoasSet[chave]) pessoasSet[chave] = novaPessoa(nome);
        var p = pessoasSet[chave];
        p.at++;
        if(d) p.datas.push(d);
        var prof = iProfAt >= 0 ? String(r[iProfAt]||"").trim() : '';
        if(prof){
          registrarProf(p, prof, d, TIPO_EVENTO_ATENDIMENTO);
          atualizarUltimoGeral(p, d, TIPO_EVENTO_ATENDIMENTO, prof);
          // Aba Agendamentos: só conta ATENDIMENTO individual feito por profissional da eMulti
          // (participação em atividade coletiva não entra).
          if(ehEmultiAgenda(prof)){
            p.atEmulti++;
            if(d && (!p.ultAgData || d.getTime() > p.ultAgData.getTime()
                || (d.getTime() === p.ultAgData.getTime() && prioridadeMenor(prof, p.ultAgProf) < 0))){
              p.ultAgData = d; p.ultAgProf = prof;
            }
          }
        }
      });
    }
  }
  var partCached = estadoApp.latestSheets[suffixedName("Participantes Ativ. Coletiva")];
  if(partCached){
    var iPData = colIndex(partCached.headers, "data");
    var iPNome = colIndex(partCached.headers, "participante");
    // colsProfissionaisParticipantes traz o Responsável primeiro (quando
    // preenchido), seguido de profissional 1..5 — profsDoEvento[0] abaixo
    // é sempre o primeiro NOME NÃO VAZIO nessa ordem, então já é o
    // Responsável da atividade sempre que a coluna dele estiver
    // preenchida (mesma prioridade usada em nomesEnvolvidosParticipacao).
    var iProfPartCols = colsProfissionaisParticipantes(partCached.headers);
    if(iPData >= 0 && iPNome >= 0){
      partCached.rows.forEach(function(r){
        var nome = String(r[iPNome]||"").trim();
        var d = parseBRDate(r[iPData]);
        if(!nome || nome.indexOf("(sem lista nominal") === 0 || !dentroDoFiltro(d)) return;
        var chave = nome.toUpperCase();
        if(!pessoasSet[chave]) pessoasSet[chave] = novaPessoa(nome);
        var p = pessoasSet[chave];
        p.part++;
        if(d) p.datas.push(d);
        var profsDoEvento = [];
        iProfPartCols.forEach(function(idx){
          var prof = String(r[idx]||"").trim();
          if(prof){ registrarProf(p, prof, d, TIPO_EVENTO_PARTICIPACAO); profsDoEvento.push(prof); }
        });
        if(profsDoEvento.length) atualizarUltimoGeral(p, d, TIPO_EVENTO_PARTICIPACAO, profsDoEvento[0]);
      });
    }
  }
  var pessoasLista = Object.keys(pessoasSet).map(function(k){ return pessoasSet[k]; })
    .sort(function(a,b){ return a.nome.localeCompare(b.nome,'pt-BR'); });
  // Ordena as datas de cada pessoa em ordem cronológica e descobre o
  // maior número de datas entre todas as pessoas, pra saber quantas
  // colunas "Data N" a tabela precisa ter (colunas sobrando ficam "—"),
  // limitado a no máximo 10 colunas (MAX_DATAS_PESSOA_ATENDIDA) — quem
  // tiver mais de 10 eventos no período só mostra os 10 primeiros.
  var MAX_DATAS_PESSOA_ATENDIDA = 10;
  var maxDatas = 0;
  pessoasLista.forEach(function(p){
    p.datas.sort(function(a,b){ return a-b; });
    if(p.datas.length > maxDatas) maxDatas = p.datas.length;
  });
  maxDatas = Math.min(maxDatas, MAX_DATAS_PESSOA_ATENDIDA);
  var dataHeaders = [];
  for(var i=1;i<=maxDatas;i++){ dataHeaders.push("Data "+i); }
  // Fluxo: calculado sobre o histórico COMPLETO (não limitado por
  // monthValues) — ver calcularFluxoPorPessoa acima.
  var fluxoInfo = calcularFluxoPorPessoa();
  return {
    headers: ["Nome","Atendimentos","Participantes Ativ. Coletiva","Total","Fluxo","Profissional"].concat(dataHeaders),
    rows: pessoasLista.map(function(p){
      // profissionalCol: lista completa (todo mundo que já atendeu essa
      // pessoa, histórico inteiro) — continua igual a antes, usada só
      // por busca/filtro/PDF (ver data-cell-text em
      // renderListCard/cellFullText), NÃO é o que aparece na tela.
      // Profissional(is) da eMulti aparece(m) primeiro, resto em ordem
      // alfabética.
      var listaProf = Object.keys(p.profissionais).sort(prioridadeMenor);
      var profissionalCol = listaProf.length ? listaProf.join(', ') : '—';
      var row = [p.nome, p.at, p.part, p.at+p.part, fluxoLabelPara(fluxoInfo, p.nome), profissionalCol];
      for(var i=0;i<maxDatas;i++){
        row.push(p.datas[i] ? fmtBRDate(p.datas[i]) : "—");
      }
      // Célula "Profissional" exibida na tela: SEMPRE um único nome — o
      // profissional responsável pelo evento mais recente da pessoa
      // (Atendimento ou Participação em Atividade Coletiva; ver
      // atualizarUltimoGeral) — mais um badge "+N" (só quando há outros
      // profissionais no histórico) cujo popover mostra cada um deles
      // com nome, data e o tipo (Atendimento / Participação em
      // Atividade Coletiva) da última vez em que atendeu essa pessoa
      // (ver profissionalBadgeHtml/abrirProfPopover).
      var nomePrincipal = p.ultimoProfissionalPrincipal || listaProf[0] || '—';
      var extras = listaProf
        .filter(function(nome){ return nome !== nomePrincipal; })
        .map(function(nome){
          var info = p.infoPorProf[nome];
          return {nome:nome, data: info ? info.data : null, tipo: info ? info.tipo : null};
        })
        .sort(function(a,b){
          var ta = a.data ? a.data.getTime() : 0, tb = b.data ? b.data.getTime() : 0;
          return tb - ta;
        });
      row.profissionalHtml = profissionalBadgeHtml(nomePrincipal, extras);
      // Nome (texto puro) do profissional do evento mais recente — usado pela
      // aba Agendamentos pra distribuir as datas por profissional da última consulta.
      row.ultimoProfissional = (nomePrincipal && nomePrincipal !== '—') ? nomePrincipal : '';
      // Data do evento mais recente (p.datas já está em ordem cronológica
      // aqui, sem o corte de 10 colunas) — usada na aba Agendamentos.
      var ultData = p.datas.length ? p.datas[p.datas.length-1] : null;
      row.ultimoAtendimentoISO = ultData
        ? ultData.getFullYear()+'-'+('0'+(ultData.getMonth()+1)).slice(-2)+'-'+('0'+ultData.getDate()).slice(-2)
        : '';
      // Aba Agendamentos: elegível = teve atendimento individual com profissional da eMulti.
      // Quem só participou de atividade coletiva (ou só foi atendido por outros profissionais) fica de fora.
      row.agendavel = p.atEmulti > 0;
      row.ultimoProfissionalAgenda = p.ultAgProf || '';
      row.ultimoAtendimentoAgendaISO = p.ultAgData
        ? p.ultAgData.getFullYear()+'-'+('0'+(p.ultAgData.getMonth()+1)).slice(-2)+'-'+('0'+p.ultAgData.getDate()).slice(-2)
        : '';
      return row;
    })
  };
}

// Meses disponíveis pro filtro de "Pessoas atendidas": união dos meses
// com dado em Atendimentos e em Participantes Ativ. Coletiva (mais
// recente primeiro).
export function monthOptionsParaPessoasAtendidas(){
  var seen = {}, months = [];
  function coletar(name, dateHeader){
    var cached = estadoApp.latestSheets[name];
    if(!cached) return;
    var idx = colIndex(cached.headers, dateHeader);
    if(idx < 0) return;
    cached.rows.forEach(function(r){
      var d = parseBRDate(r[idx]);
      if(!d) return;
      var v = monthOptionValue(d);
      if(!seen[v]){ seen[v] = true; months.push(new Date(d.getFullYear(), d.getMonth(), 1)); }
    });
  }
  coletar(suffixedName("Atendimentos"), "data_hora");
  coletar(suffixedName("Participantes Ativ. Coletiva"), "data");
  months.sort(function(a,b){ return b-a; });
  return months.map(function(d){ return {value: monthOptionValue(d), label: monthOptionLabel(d)}; });
}

// Traduz o valor bruto da coluna "equipe_unidade" (ex.: "EMULTI CENTRO
// DA CIDADE - Centro") pro rótulo curto da equipe (ex.: "Centro"),
// usando o mesmo matchKeyword de EQUIPES/filtrarLinhasPorEquipe. Usado
// pra exibir a equipe na lista de Busca-Ativa quando "Todas" as equipes
// estão selecionadas ao mesmo tempo.
export function equipeLabelFromRaw(raw){
  var valor = normalizeText(raw);
  for(var i=0;i<EQUIPES.length;i++){
    var kw = normalizeText(EQUIPES[i].matchKeyword || EQUIPES[i].suffix);
    if(valor.indexOf(kw) !== -1) return EQUIPES[i].suffix;
  }
  return String(raw||"").trim() || "—";
}

// Acha a coluna de profissional de uma aba bruta, tentando o nome exato
// "profissional" primeiro e, se não achar, qualquer cabeçalho que
// contenha "PROFISSIONAL" (mesma estratégia de equipeColIndex).
export function profissionalColIndex(headerRow){
  var idx = colIndex(headerRow, "profissional");
  if(idx >= 0) return idx;
  for(var i=0;i<headerRow.length;i++){
    if(normalizeText(headerRow[i]).indexOf("PROFISSIONAL") !== -1) return i;
  }
  return -1;
}

// ===== módulo: js/listas/render-listas.js =====
// ======================================================================
// listas/render-listas.js
// Listas — modelo, cartões e seção de listas
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// Agrupa por paciente e dia e mantém apenas os grupos com dois ou mais
// profissionais distintos, para identificar atendimentos interprofissionais.
function atendimentosInterprofissionaisParaLista(){
  var source = estadoApp.latestSheets[suffixedName("Atendimentos")];
  var outHeaders = ["Data","Paciente","Idade","Profissionais no dia","Qtd. de atendimentos"];
  if(!source || !source.headers || !source.rows) return {headers:outHeaders, rows:[]};
  var headers = source.headers;
  var iData = colIndex(headers, "data_hora");
  var iNome = colIndex(headers, "nome");
  var iProf = colIndex(headers, "profissional");
  var iId = -1;
  headers.forEach(function(h, i){
    var key = normalizeText(h).replace(/[^A-Z0-9]/g, '');
    if(iId < 0 && (key === 'CNS' || key === 'CPF' || key.indexOf('CARTAONACIONALDESAUDE') >= 0 || key.indexOf('CPF') >= 0)) iId = i;
  });
  if(iData < 0 || iNome < 0 || iProf < 0){
    console.warn('[Atendimentos interprofissionais] faltam colunas de data, nome ou profissional. Cabeçalho:', headers);
    return {headers:outHeaders, rows:[]};
  }
  // Idade do paciente: vem da data de nascimento (calculada na data do
  // atendimento) ou, se a aba não tiver nascimento, da coluna de idade.
  var iNasc = -1, iIdade = -1;
  headers.forEach(function(h, i){
    var key = normalizeText(h).replace(/[^A-Z0-9]/g, '');
    if(iNasc < 0 && key.indexOf('NASC') >= 0) iNasc = i;
    if(iIdade < 0 && key.indexOf('IDADE') === 0 && key.indexOf('GESTAC') < 0) iIdade = i;
  });
  if(iNasc < 0 && iIdade < 0){
    console.warn('[Atendimentos interprofissionais] nenhuma coluna de idade ou data de nascimento encontrada na aba Atendimentos — a coluna Idade fica com "—". Cabeçalho:', headers);
  }
  function formatarIdade(anos, meses){
    if(anos >= 1) return anos + (anos === 1 ? ' ano' : ' anos');
    return '<1 ano';
  }
  function idadeDaLinha(r, dataAtendimento){
    if(iNasc >= 0){
      var nasc = parseBRDate(r[iNasc]);
      if(nasc && nasc <= dataAtendimento){
        var anos = dataAtendimento.getFullYear() - nasc.getFullYear();
        var jaFezAniversario = (dataAtendimento.getMonth() > nasc.getMonth())
          || (dataAtendimento.getMonth() === nasc.getMonth() && dataAtendimento.getDate() >= nasc.getDate());
        if(!jaFezAniversario) anos--;
        return formatarIdade(anos);
      }
    }
    if(iIdade >= 0){
      var bruto = String(r[iIdade] === undefined || r[iIdade] === null ? '' : r[iIdade]).trim();
      if(/^\d+$/.test(bruto)) return formatarIdade(parseInt(bruto, 10));
      if(bruto) return bruto;
    }
    return '';
  }
  var grupos = {};
  source.rows.forEach(function(r){
    var nome = String(r[iNome] || '').trim();
    var data = parseBRDate(r[iData]);
    var profissional = String(r[iProf] || '').trim();
    if(!nome || !data || !profissional) return;
    var id = iId >= 0 ? String(r[iId] || '').trim() : '';
    var paciente = id ? 'ID:' + normalizeText(id).replace(/[^A-Z0-9]/g, '') : 'NOME:' + normalizeText(nome).trim();
    var dia = data.getFullYear() + '-' + String(data.getMonth()+1).padStart(2,'0') + '-' + String(data.getDate()).padStart(2,'0');
    var key = paciente + '|' + dia;
    if(!grupos[key]) grupos[key] = {data:data, nome:nome, idade:'', profissionais:{}, quantidade:0};
    if(!grupos[key].idade) grupos[key].idade = idadeDaLinha(r, data);
    var profKey = normalizeText(profissional).trim();
    if(!grupos[key].profissionais[profKey]) grupos[key].profissionais[profKey] = profissional;
    grupos[key].quantidade++;
  });
  var rows = Object.keys(grupos).map(function(key){
    var g = grupos[key];
    var profissionais = Object.keys(g.profissionais).map(function(k){ return g.profissionais[k]; })
      .sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });
    return profissionais.length >= 2 ? [fmtBRDate(g.data), g.nome, g.idade || '—', profissionais.join('; '), g.quantidade] : null;
  }).filter(Boolean).sort(function(a,b){
    return (parseBRDate(b[0]) - parseBRDate(a[0])) || a[1].localeCompare(b[1], 'pt-BR');
  });
  return {headers:outHeaders, rows:rows};
}

// Monta o modelo de dados de uma lista: pra cada linha guarda o HTML de
// cada <td> (c) e o texto "completo" de cada célula (t) usado por
// busca/filtro por coluna/ordenação/PDF (o mesmo que cellFullText lia do
// DOM). Índices de c/t = índices das colunas (colunas extras de
// "Participantes Ativ. Coletiva" — AÇÃO M2 e Ações — vêm depois).
// "Pessoas atendidas": mostra só Data 1 a Data 3; Data 4 em diante ficam
// recolhidas e se expandem ao clicar no botão acima da tabela.
var PA_DATAS_VISIVEIS = 3;

function idxsDatasExtraPessoasAtendidas(headers){
  var idxs = [];
  headers.forEach(function(h, i){
    var m = /^Data (\d+)$/.exec(String(h));
    if(m && parseInt(m[1], 10) > PA_DATAS_VISIVEIS) idxs.push(i);
  });
  return idxs;
}

function construirModeloLista(name, cached, anterior, stateKey){
  var idxsDataExtra = (name === suffixedName("Pessoas atendidas")) ? idxsDatasExtraPessoasAtendidas(cached.headers) : [];
  var idxsProfNumerados = colsProfissionaisNumerados(cached.headers);
  var idxProfissionalPessoas = (name === suffixedName("Pessoas atendidas")) ? cached.headers.indexOf('Profissional') : -1;
  var isParticipantesColetiva = (displayListName(name) === "Participantes Ativ. Coletiva") && idxsProfNumerados.length > 0;
  // AÇÃO M2 + Ações (Detalhes): Participantes Ativ. Coletiva e Resumo Atividade Coletiva.
  var temAcaoM2 = isParticipantesColetiva || ehListaResumoAtividadeColetiva(name);
  var rows = cached.rows.map(function(r, rowIdx){
    var c = [], t = [];
    cached.headers.forEach(function(h, i){
      var v = r[i];
      var str = (v===undefined||v===null) ? '' : String(v);
      var oculta = isParticipantesColetiva && idxsProfNumerados.indexOf(i) !== -1;
      if(i === idxProfissionalPessoas){
        c.push('<td data-cell-text="'+encodeURIComponent(str)+'">'+(r.profissionalHtml || escapeHtml(str))+'</td>');
        t.push(str);
      } else {
        // Texto longo (responsáveis, participantes, tipo de atividade...) é
        // abreviado com "…" para a linha caber na largura do container; o
        // texto completo aparece ao passar o mouse (atributo title).
        var strTrim = str.trim();
        var tituloCel = strTrim.length > 14 ? ' title="'+escapeHtml(strTrim).replace(/"/g,'&quot;')+'"' : '';
        var ehColData = /^Data \d+$/.test(String(h));
        c.push('<td class="'+(ehColData ? 'cell-data' : 'cell-trunc')+(oculta ? ' part-col-oculta' : '')+(idxsDataExtra.indexOf(i) !== -1 ? ' pa-data-extra' : '')+'"'+tituloCel+'>'+escapeHtml(str)+'</td>');
        t.push(strTrim);
      }
    });
    if(temAcaoM2){
      var classificacao = classificarAcaoM2Lista(name, cached.headers, r);
      c.push('<td>'+acaoM2BadgeHTML(classificacao)+'</td>'); t.push(classificacao.label);
      c.push('<td>'+detalhesBtnHTML(name, rowIdx)+'</td>'); t.push('Detalhes');
    }
    return {c:c, t:t, s:undefined};
  });
  var m = {rows:rows, view:rows.slice(), sortCol:-1, sortDir:''};
  if(anterior && anterior.sortCol >= 0){ m.sortCol = anterior.sortCol; m.sortDir = anterior.sortDir; ordenarModeloLista(stateKey || name, m); }
  return m;
}

function ordenarModeloLista(listName, m){
  if(!m || m.sortCol < 0) return;
  var colIdx = m.sortCol, dir = m.sortDir;
  var isDateCol = (colIdx === listDateColIdx[listName]);
  m.rows.sort(function(a, b){
    var textoA = String(a.t[colIdx]===undefined ? '' : a.t[colIdx]).trim();
    var textoB = String(b.t[colIdx]===undefined ? '' : b.t[colIdx]).trim();
    var cmp;
    if(isDateCol){
      var dA = parseBRDate(textoA), dB = parseBRDate(textoB);
      var tA = dA ? dA.getTime() : (textoA ? Infinity : -Infinity);
      var tB = dB ? dB.getTime() : (textoB ? Infinity : -Infinity);
      cmp = tA - tB;
    } else {
      cmp = textoA.localeCompare(textoB, 'pt-BR', {numeric:true, sensitivity:'base'});
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

function renderListCard(name, containerId){
  // Como M1 e M2 agora têm as mesmas listas, o estado de cada uma
  // (modelo/linhas filtradas, filtro de mês, coluna de data) é guardado
  // por container + nome, para que mexer em uma aba não afete a outra.
  var sk = (containerId || '') + '::' + name;
  // "Pessoas atendidas" é uma lista calculada aqui mesmo no navegador
  // (dedup de Atendimentos + Participantes Ativ. Coletiva) — ver
  // pessoasAtendidasParaMeses. Tem filtro de mês PRÓPRIO, independente
  // do filtro de Mês do topo da página.
  var isInterprofissional = (name === suffixedName("Atendimentos interprofissionais"));
  var isPessoasAtendidas = (name === suffixedName("Pessoas atendidas"));
  // "Busca-Ativa" (só na aba M1): outra lista calculada aqui mesmo — ver
  // buscaAtivaCompute — sem filtro de mês próprio, pois a janela (31 a
  // 120 dias sem atendimento, contados do fim do mês atual) já é fixa.
  var isBuscaAtiva = (name === suffixedName("Busca-Ativa"));
  var cached = isInterprofissional
    ? estadoApp.latestSheets[name]
    : isPessoasAtendidas
      ? pessoasAtendidasParaMeses(listMonthFilters[sk] || [])
      : isBuscaAtiva
        ? buscaAtivaCompute()
        : estadoApp.latestSheets[name];
  if(isPessoasAtendidas || isBuscaAtiva) estadoApp.latestSheets[name] = cached;
  var body;
  var hasTable = false;
  if(!cached){
    body = '<div class="list-placeholder">Não encontramos uma aba chamada "'+escapeHtml(name)+'" na planilha publicada.</div>';
  } else if(!cached.rows.length && isBuscaAtiva){
    body = '<div class="list-placeholder">Nenhum paciente na janela de busca ativa no momento (mais de 30 e até 120 dias sem atendimento, considerando o fim do mês atual).</div>';
  } else if(isBuscaAtiva){
    // Mesmo layout/recursos da lista "Pacientes em risco de abandono"
    // (filtros por profissional/coluna, busca, ordenação, paginação,
    // popover "+N", PDF e Excel) — ver riscoTableHtml/wireRiscoFiltros.
    // Não usa a classe .list-card pra não cair nos tratadores genéricos
    // das listas da planilha (que dependem de listModel).
    return '<div class="card risco-list-card" data-list-card="'+escapeHtml(name)+'" data-state-key="'+escapeHtml(sk)+'">'
      + '<div class="list-card-head"><h4>'+escapeHtml(displayListName(name))+'</h4></div>'
      + '<p class="footnote" style="margin:0 0 10px;line-height:1.5;">Pacientes com mais de 30 e até 120 dias sem atendimento, contados do fim do mês atual (quem está prestes a sair da janela do M1). "Consultas" conta só os atendimentos dos últimos 4 meses; "Dias restantes" é o que falta para completar 120 dias sem atendimento.</p>'
      + riscoTableHtml(cached.registros || [], RISCO_CFG_BUSCA)
      + '</div>';
  } else if(!cached.rows.length && !isPessoasAtendidas){
    body = '<div class="list-placeholder">Esta lista está vazia.</div>';
  } else {
    hasTable = true;
    var dateColIdx = dateColIndexForList(cached.headers);
    listDateColIdx[sk] = dateColIdx;
    var idxsProfNumerados = colsProfissionaisNumerados(cached.headers);
    // Coluna "Profissional" de "Pessoas Atendidas" (isPessoasAtendidas):
    // a célula mostra só o profissional responsável (evento mais
    // recente) + badge "+N" com popover pros demais (ver
    // pessoasAtendidasParaMeses/profissionalBadgeHtml), mas o VALOR de
    // busca/filtro/PDF continua sendo a lista completa de nomes
    // (cached.rows[i][idxProfissionalPessoas], igual sempre foi) — ela
    // vai guardada em data-cell-text (URI-encoded) pra buscas/filtros/
    // PDF lerem em vez do texto realmente renderizado na tela (ver
    // cellFullText, applyFilters e gerarPdfLista).
    var idxProfissionalPessoas = isPessoasAtendidas ? cached.headers.indexOf('Profissional') : -1;
    // Só a lista "Participantes Ativ. Coletiva" ganha o resumo em selo —
    // as 5 colunas "profissional 1".."profissional 5" ficam ocultas
    // (classe .part-col-oculta) e no lugar delas entram "AÇÃO M2" e
    // "Ações" (botão "Detalhes"). Os índices das colunas não mudam —
    // só a exibição — pra não quebrar filtros/PDF que dependem deles.
    var isParticipantesColetiva = (displayListName(name) === "Participantes Ativ. Coletiva") && idxsProfNumerados.length > 0;
    var idxsDataExtra = isPessoasAtendidas ? idxsDatasExtraPessoasAtendidas(cached.headers) : [];
    var theadHtml = '<tr>'+cached.headers.map(function(h,i){
        var oculta = isParticipantesColetiva && idxsProfNumerados.indexOf(i) !== -1;
        if(oculta) return '<th class="part-col-oculta">'+escapeHtml(h)+'</th>';
        return '<th class="sortable-th'+(idxsDataExtra.indexOf(i) !== -1 ? ' pa-data-extra' : '')+'" data-col-idx="'+i+'">'+escapeHtml(h)+'<span class="sort-ind"></span></th>';
      }).join('')
      + ((isParticipantesColetiva || ehListaResumoAtividadeColetiva(name))
          ? '<th class="sortable-th" data-col-idx="'+cached.headers.length+'">AÇÃO M2<span class="sort-ind"></span></th><th>Ações</th>'
          : '')
      + '</tr>';
    listModel[sk] = construirModeloLista(name, cached, null, sk);
    // Nas colunas normais (índice numérico), pula "profissional 1" a
    // "profissional 5" — elas viram UMA opção só ("Profissional da
    // eMulti"), inserida na posição da primeira delas.
    var colOptionsHtml = '<option value="">Filtrar por coluna…</option>'
      + cached.headers.map(function(h,i){
        if(idxsProfNumerados.indexOf(i) !== -1){
          return (i === idxsProfNumerados[0])
            ? '<option value="'+PROF_EMULTI_FILTER_VALUE+'">Profissional da eMulti</option>'
            : '';
        }
        return '<option value="'+i+'">'+escapeHtml(h)+'</option>';
      }).join('')
      + ((isParticipantesColetiva || ehListaResumoAtividadeColetiva(name)) ? '<option value="'+ACAO_M2_FILTER_VALUE+'">AÇÃO M2</option>' : '');
    var filterPairsHtml = [0,1,2].map(function(idx){
      return '<div class="filter-pair">'
        + '<select class="filter-col">'+colOptionsHtml+'</select>'
        + '<div class="ms-wrap filter-val-ms ms-disabled" data-pair-idx="'+idx+'"></div>'
        + '</div>';
    }).join('');
    // Filtro de mês (multisseleção) — aparece quando a lista tem uma
    // coluna de data reconhecível ("data" ou "data_hora"), ou é a
    // "Pessoas atendidas" calculada (filtro próprio, ver acima). Fica
    // na MESMA linha dos filtros de coluna (dentro de .list-filters),
    // como o primeiro item da fileira.
    var monthFilterHtml = (dateColIdx >= 0 || isPessoasAtendidas)
      ? '<div class="list-month-filter"><label class="list-month-filter-label">Mês</label>'
        + '<div class="ms-wrap" data-month-filter="'+escapeHtml(name)+'" data-state-key="'+escapeHtml(sk)+'"'+(isPessoasAtendidas ? ' data-computed-months="1"' : '')+'></div></div>'
      : '';
    body = '<p class="list-meta">'+fmtInt(cached.rows.length)+(cached.rows.length===1?' linha':' linhas')+'</p>'
      + '<div class="list-filters" data-list-filters="'+escapeHtml(name)+'">'+monthFilterHtml+filterPairsHtml+'</div>'
      + '<input class="list-search" type="text" placeholder="Filtrar nesta lista…" data-filter-key="'+escapeHtml(name)+'">'
      + (idxsDataExtra.length
          ? '<div class="pa-datas-bar"><button type="button" class="pa-toggle-datas" data-pa-toggle-datas="'+idxsDataExtra.length+'" aria-expanded="'+(listDatasExpandidas[sk] ? 'true' : 'false')+'">'
            + (listDatasExpandidas[sk] ? 'Recolher datas ▴' : 'Mostrar mais datas (+'+idxsDataExtra.length+') ▾')
            + '</button></div>'
          : '')
      + '<div class="table-wrap"><table class="data-table"><thead>'+theadHtml+'</thead><tbody></tbody></table></div>'
      + '<div class="risco-pager" data-list-pager="'+escapeHtml(name)+'"></div>';
  }
  var pdfBtnHtml = hasTable
    ? '<button type="button" class="pdf-btn" data-pdf-btn="'+escapeHtml(name)+'">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h1a1.5 1.5 0 0 0 0-3H9v5"/><path d="M13 12v5h1a2 2 0 0 0 0-5z"/><path d="M18.5 12H17v5"/><path d="M17 14.5h1.3"/></svg>'
      + '<span>Gerar PDF</span></button>'
    : '';
  return '<div class="card list-card'+(listDatasExpandidas[sk] ? ' pa-datas-expandidas' : '')+'" data-list-card="'+escapeHtml(name)+'" data-state-key="'+escapeHtml(sk)+'">'
    + '<div class="list-card-head"><h4>'+escapeHtml(displayListName(name))+'</h4>'+pdfBtnHtml+'</div>'
    + body + '</div>';
}

// Aba ativa (nome da lista) por container de listas relacionadas
// (listsM1/listsM2) — default é a primeira lista de cada aba.
var listActiveTab = {};

function relatedListsPillsHtml(containerId, names){
  var active = listActiveTab[containerId] || names[0];
  if(names.indexOf(active) < 0) active = names[0];
  listActiveTab[containerId] = active;
  var pills = names.map(function(name){
    var isActive = name === active;
    var cached = estadoApp.latestSheets[name];
    var count = cached ? fmtInt(cached.rows.length) : '';
    var bg = isActive ? '#153F35' : '#FFFFFF';
    var border = isActive ? '#153F35' : '#D9E1D6';
    var nameColor = isActive ? '#EEF3EA' : '#1B2E27';
    var countColor = isActive ? '#9FC0AE' : '#8B978F';
    return '<button type="button" class="related-list-pill" data-list-pill="'+escapeHtml(name)+'" data-container="'+escapeHtml(containerId)+'"'
      + ' style="display:inline-flex;align-items:center;gap:5px;padding:7px 11px;border-radius:999px;border:1px solid '+border+';background:'+bg+';cursor:pointer;font-family:inherit;white-space:nowrap;flex:0 0 auto;">'
      + '<span style="font-size:12.5px;font-weight:600;color:'+nameColor+';">'+escapeHtml(displayListName(name))+'</span>'
      + (count ? '<span style="font-size:12px;color:'+countColor+';">'+count+'</span>' : '')
      + '</button>';
  }).join('');
  return '<div class="related-lists-bar" style="margin-bottom:14px;">'
    + '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:#5C6B62;text-transform:uppercase;margin-bottom:8px;">Listas relacionadas</div>'
    + '<div class="related-lists-pills" style="position:relative;display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin;-webkit-overflow-scrolling:touch;">'+pills+'</div>'
    + '</div>';
}

// wb (latestWb) já usado pra montar cada container de listas relacionadas
// (listsM1/listsM2) da última vez — ver renderListsSection logo abaixo.
var listsRenderedForWb = {};

// Último estado FILTRADO da lista "Pessoas atendidas" (a que o usuário mexeu
// por último, em M1 ou M2): quem aparece nela depois de Mês, filtros de coluna
// e busca. A aba Agendamentos lê isto pra mostrar exatamente as mesmas pessoas.
var pessoasFiltroAtual = null;
window.__emultiPessoasAtendidasFiltradas = function(){ return pessoasFiltroAtual; };

export function renderListsSection(containerId, names){
  var el = document.getElementById(containerId);
  if(!el) return;
  // As tabelas brutas (Atendimentos, Participantes Ativ. Coletiva etc.)
  // só mudam de conteúdo quando os DADOS da planilha mudam (nova leitura
  // ou troca de equipe, que sempre gera um wb novo em fetchAndLoad) —
  // filtros do topo (Mês, Quadrimestre, Tipo de Cálculo) só afetam os
  // cards de M1/M2 (já atualizados à parte, antes desta chamada), não o
  // conteúdo dessas listas. Reconstruir milhares de <tr> via innerHTML
  // (com escapeHtml linha a linha) a cada clique nesses filtros era a
  // maior causa de travamento do painel ao "aplicar filtros" — agora só
  // refaz o HTML quando o workbook realmente mudou. Como bônus, isso
  // também para de apagar a busca/filtros de coluna que o usuário tinha
  // digitado dentro de uma lista sempre que ele mexia em outro filtro.
  if(listsRenderedForWb[containerId] === latestWb && el.children.length){
    return;
  }
  listsRenderedForWb[containerId] = latestWb;
  var interprofissionalName = suffixedName("Atendimentos interprofissionais");
  if(names.indexOf(interprofissionalName) >= 0){
    estadoApp.latestSheets[interprofissionalName] = atendimentosInterprofissionaisParaLista();
  }
  // "Pessoas atendidas" e "Busca-Ativa" são calculadas no navegador (não
  // vêm prontas da planilha) e só ficavam em latestSheets depois que
  // renderListCard rodava pra cada uma — como isso só acontece DEPOIS
  // de relatedListsPillsHtml montar os pills (linha abaixo), o
  // quantitativo dessas duas ficava faltando no pill na PRIMEIRA aba
  // renderizada (M1) e só aparecia certo na aba seguinte (M2, que já
  // reaproveitava o cache deixado pela passada de M1). Calculando aqui
  // antes dos pills, as duas abas saem iguais.
  var pessoasAtendidasName = suffixedName("Pessoas atendidas");
  if(names.indexOf(pessoasAtendidasName) >= 0){
    var skPessoas = containerId + '::' + pessoasAtendidasName;
    estadoApp.latestSheets[pessoasAtendidasName] = pessoasAtendidasParaMeses(listMonthFilters[skPessoas] || []);
  }
  var buscaAtivaName = suffixedName("Busca-Ativa");
  if(names.indexOf(buscaAtivaName) >= 0){
    estadoApp.latestSheets[buscaAtivaName] = buscaAtivaCompute();
  }
  el.innerHTML = relatedListsPillsHtml(containerId, names) + names.map(function(n){ return renderListCard(n, containerId); }).join('');
  // Liga filtros/ordenação/PDF/Excel da Busca-Ativa (tabela no formato da
  // lista de risco de abandono).
  if(names.indexOf(buscaAtivaName) >= 0){
    var regsBusca = (estadoApp.latestSheets[buscaAtivaName] || {}).registros || [];
    if(regsBusca.length) wireRiscoFiltros(regsBusca, [], false, regsBusca, RISCO_CFG_BUSCA);
  }

  // Só o card da lista ativa (pill selecionada) fica visível — os
  // outros continuam no DOM (com seus próprios filtros já montados),
  // só escondidos, pra alternar de lista sem perder filtro/estado.
  function aplicarAbaAtiva(){
    var active = listActiveTab[containerId];
    el.querySelectorAll('[data-list-card]').forEach(function(card){
      card.style.display = (card.getAttribute('data-list-card') === active) ? '' : 'none';
    });
    el.querySelectorAll('[data-list-pill]').forEach(function(btn){
      var isActive = btn.getAttribute('data-list-pill') === active;
      var nameEl = btn.querySelector('span:first-child');
      var countEl = btn.querySelector('span:last-child');
      btn.style.background = isActive ? '#153F35' : '#FFFFFF';
      btn.style.borderColor = isActive ? '#153F35' : '#D9E1D6';
      if(nameEl) nameEl.style.color = isActive ? '#EEF3EA' : '#1B2E27';
      if(countEl && countEl !== nameEl) countEl.style.color = isActive ? '#9FC0AE' : '#8B978F';
    });
  }
  aplicarAbaAtiva();
  el.querySelectorAll('[data-list-pill]').forEach(function(btn){
    btn.addEventListener('click', function(){
      listActiveTab[containerId] = btn.getAttribute('data-list-pill');
      aplicarAbaAtiva();
      var faixa = btn.parentNode;
      if(faixa && faixa.scrollWidth > faixa.clientWidth){
        var alvo = btn.offsetLeft - (faixa.clientWidth - btn.offsetWidth) / 2;
        faixa.scrollTo({left: Math.max(0, alvo), behavior: 'smooth'});
      }
    });
  });

  // ---- Paginação das listas (100 por página) ----
  // As linhas fora da página recebem a classe .pg-hidden (display:none
  // !important) — NÃO mexem em tr.style.display, que continua sendo só o
  // resultado dos filtros (usado pela recontagem por pessoa e pelo PDF,
  // que por isso seguem enxergando TODAS as linhas filtradas).
  var LISTA_POR_PAGINA = 100;
  var listaPagina = {};
  if(!document.getElementById('listPagerStyles')){
    var stLp = document.createElement('style');
    stLp.id = 'listPagerStyles';
    stLp.textContent = '.risco-pager{display:flex;align-items:center;justify-content:center;gap:14px;margin:10px 0 4px;font-size:13px;color:var(--ink-soft)}'
      + '.risco-pager button{border:1px solid var(--line);background:var(--paper,#fff);border-radius:999px;padding:6px 14px;font:inherit;font-weight:600;color:var(--ink);cursor:pointer}'
      + '.risco-pager button:disabled{opacity:.4;cursor:default}';
    document.head.appendChild(stLp);
  }
  // Abrevia (com "…") as células de texto longo até a linha caber na
  // largura do container: tenta limites de 220px, 180px, ... 64px por
  // célula e para no primeiro em que a tabela não estoura a largura.
  // Não faz nada enquanto a lista está escondida (largura 0).
  var TRUNC_PASSOS = [220, 180, 150, 120, 100, 80, 64];
  function ajustarTruncamentoLista(card){
    var wrap = card.querySelector('.table-wrap');
    var tbl = card.querySelector('table.data-table');
    if(!wrap || !tbl) return;
    // Datas expandidas (Pessoas atendidas): a linha aparece inteira, sem
    // "…" em nenhuma célula; se passar da largura, a tabela rola na horizontal.
    if(card.classList.contains('pa-datas-expandidas')){
      tbl.style.setProperty('--cell-max', 'none');
      return;
    }
    if(!wrap.clientWidth) return;
    for(var i = 0; i < TRUNC_PASSOS.length; i++){
      tbl.style.setProperty('--cell-max', TRUNC_PASSOS[i] + 'px');
      if(tbl.offsetWidth <= wrap.clientWidth + 1) break;
    }
  }
  function observarTruncamentoLista(card){
    var wrap = card.querySelector('.table-wrap');
    if(!wrap || wrap._truncObs) return;
    var ultima = -1;
    var refazer = function(){
      var w = wrap.clientWidth;
      if(w === ultima) return;
      ultima = w;
      ajustarTruncamentoLista(card);
    };
    if(typeof ResizeObserver === 'function'){
      wrap._truncObs = new ResizeObserver(refazer);
      wrap._truncObs.observe(wrap);
    } else {
      wrap._truncObs = true;
      window.addEventListener('resize', refazer);
    }
  }
  function paginarLista(card){
    var listName = card.getAttribute('data-list-card');
    var pagerEl = card.querySelector('[data-list-pager]');
    var tbody = card.querySelector('tbody');
    var m = listModel[card.getAttribute('data-state-key')];
    if(!tbody || !m) return;
    var total = m.view.length;
    var totalPaginas = Math.max(1, Math.ceil(total / LISTA_POR_PAGINA));
    var pg = listaPagina[listName] || 1;
    if(pg > totalPaginas) pg = totalPaginas;
    if(pg < 1) pg = 1;
    listaPagina[listName] = pg;
    var ini = (pg - 1) * LISTA_POR_PAGINA, fim = ini + LISTA_POR_PAGINA;
    var visiveis = m.view.slice(ini, fim);
    var nCols = card.querySelectorAll('thead th').length || 1;
    tbody.innerHTML = visiveis.length
      ? visiveis.map(function(row){ return '<tr>'+row.c.join('')+'</tr>'; }).join('')
      : '<tr><td colspan="'+nCols+'" class="footnote" style="padding:14px 12px;">Nenhuma linha encontrada com esse filtro.</td></tr>';
    if(pagerEl){
      pagerEl.innerHTML = total <= LISTA_POR_PAGINA ? '' : ''
        + '<button type="button" data-pg="prev"'+(pg<=1?' disabled':'')+'>‹ Anterior</button>'
        + '<span>Página '+fmtInt(pg)+' de '+fmtInt(totalPaginas)
        +   ' · mostrando '+fmtInt(ini+1)+'–'+fmtInt(Math.min(fim,total))+' de '+fmtInt(total)+'</span>'
        + '<button type="button" data-pg="next"'+(pg>=totalPaginas?' disabled':'')+'>Próxima ›</button>';
    }
    ajustarTruncamentoLista(card);
    observarTruncamentoLista(card);
  }
  el.querySelectorAll('[data-list-pager]').forEach(function(pagerEl){
    pagerEl.addEventListener('click', function(ev){
      var b = ev.target.closest ? ev.target.closest('button[data-pg]') : null;
      if(!b || b.disabled) return;
      var card = pagerEl.closest('.list-card');
      var nome = card.getAttribute('data-list-card');
      listaPagina[nome] = (listaPagina[nome] || 1) + (b.getAttribute('data-pg') === 'next' ? 1 : -1);
      paginarLista(card);
      var wrap = card.querySelector('.table-wrap');
      if(wrap) wrap.scrollTop = 0;
    });
  });

  function applyFilters(card){
    var listName = card.getAttribute('data-list-card');
    var listKey = card.getAttribute('data-state-key');
    var cached = estadoApp.latestSheets[listName];
    var dateColIdx = listDateColIdx[listKey];
    var selectedMonths = listMonthFilters[listKey] || [];
    var textInput = card.querySelector('.list-search');
    var term = textInput ? textInput.value.trim().toLowerCase() : '';
    var activeFilters = [];
    var idxsProfNumeradosFiltro = colsProfissionaisNumerados(cached ? cached.headers : []);
    card.querySelectorAll('.filter-pair').forEach(function(pair){
      var colSelect = pair.querySelector('.filter-col');
      var valWrap = pair.querySelector('.filter-val-ms');
      var isProfEmulti = colSelect && colSelect.value === PROF_EMULTI_FILTER_VALUE;
      var isAcaoM2 = colSelect && colSelect.value === ACAO_M2_FILTER_VALUE;
      var colIdx = (colSelect && !isProfEmulti && !isAcaoM2 && colSelect.value !== '') ? parseInt(colSelect.value, 10) : null;
      var vals = (valWrap && valWrap._msInstance) ? valWrap._msInstance.getSelected() : [];
      if(!vals.length) return;
      if(isProfEmulti){ activeFilters.push({profEmulti:true, colIdxs:idxsProfNumeradosFiltro, vals:vals}); }
      // A célula do selo "AÇÃO M2" é sempre a primeira coluna acrescentada
      // depois das colunas originais da planilha (ver renderListCard) —
      // por isso a posição é sempre cached.headers.length, sem precisar
      // de um índice fixo guardado em outro lugar.
      else if(isAcaoM2){ activeFilters.push({colIdx: cached ? cached.headers.length : -1, vals:vals}); }
      else if(colIdx !== null){ activeFilters.push({colIdx:colIdx, vals:vals}); }
    });
    var m = listModel[listKey];
    if(!m) return;
    var view = [];
    m.rows.forEach(function(row){
      var matchesText = true;
      if(term){
        if(row.s === undefined) row.s = row.t.join(' ').toLowerCase();
        matchesText = row.s.indexOf(term) !== -1;
      }
      var matchesCols = activeFilters.every(function(f){
        if(f.profEmulti){
          // Bate se QUALQUER uma das 5 colunas "profissional N" desta
          // linha tiver um dos nomes marcados no filtro.
          return f.colIdxs.some(function(ci){
            return row.t[ci] !== undefined && f.vals.indexOf(row.t[ci]) >= 0;
          });
        }
        var texto = row.t[f.colIdx];
        if(texto === undefined) return false;
        var headerName = (cached && cached.headers) ? cached.headers[f.colIdx] : '';
        if(headerName === DIAS_SEM_ATENDIMENTO_HEADER){
          var bucket = diasBucketLabel(texto);
          return !!bucket && f.vals.indexOf(bucket) >= 0;
        }
        return f.vals.indexOf(texto) >= 0;
      });
      var matchesMonth = true;
      if(selectedMonths.length && dateColIdx != null && dateColIdx >= 0){
        var raw = row.t[dateColIdx];
        var d = parseBRDate(raw===undefined ? null : String(raw).trim());
        var mv = d ? monthOptionValue(d) : null;
        matchesMonth = !!mv && selectedMonths.indexOf(mv) >= 0;
      }
      if(matchesText && matchesCols && matchesMonth) view.push(row);
    });
    m.view = view;
    if(listName === suffixedName("Pessoas atendidas")){
      pessoasFiltroAtual = {
        origem: listKey.indexOf('listsM1') === 0 ? 'M1' : (listKey.indexOf('listsM2') === 0 ? 'M2' : listKey),
        nomes: view.map(function(row){ return String(row.t[0] === undefined ? '' : row.t[0]).trim(); }),
        meses: selectedMonths.slice()
      };
      try{ window.dispatchEvent(new CustomEvent('emulti:pessoas-filtro')); }catch(e){}
    }
    var visibleCount = view.length;
    // Contagem de linhas mostrada acima da lista: reflete o resultado
    // depois de aplicar TODOS os filtros ativos (mês, colunas e busca),
    // não o total bruto da lista.
    var metaEl = card.querySelector('.list-meta');
    if(metaEl) metaEl.textContent = fmtInt(visibleCount) + (visibleCount === 1 ? ' linha' : ' linhas');

    // Recalcula colunas de quantidade "por período" (ex.:
    // "qtd_atendimentos_periodo") pra baterem com o período (mês/meses)
    // e demais filtros ATUALMENTE aplicados nesta lista, em vez de usar
    // o valor bruto e fixo que já vem pronto da planilha de origem (que
    // reflete o total da pessoa na aba inteira, não do período
    // filtrado). Vale pra qualquer lista das abas M1/M2 que tenha uma
    // coluna "nome" e uma coluna "qtd_..._per..." (ex.: Atendimentos).
    var headersForQtd = cached ? cached.headers : [];
    var nomeIdxQtd = -1;
    headersForQtd.forEach(function(h, i){
      // "NOME" cobre a tabela Atendimentos; "PARTICIPANTE" cobre a
      // tabela "Participantes Ativ. Coletiva" (mesma lógica de
      // recontagem por nome, só muda o nome da coluna-chave).
      if(nomeIdxQtd < 0 && (normalizeText(h) === 'NOME' || normalizeText(h) === 'PARTICIPANTE')) nomeIdxQtd = i;
    });
    var qtdColIdxs = [];
    headersForQtd.forEach(function(h, i){
      var hn = normalizeText(h);
      var ehPeriodoPattern = hn.indexOf('QTD_') === 0 && hn.indexOf('PER') !== -1;
      // "Qtd de atendimentos"/"qtd_atendimentos"/"Quantidade de
      // atendimentos" (ex.: coluna homônima na lista "Atendimentos") e
      // "Qtd de participações"/"qtd_participacoes"/"Quantidade de
      // participações" (ex.: coluna homônima na lista "Participantes
      // Ativ. Coletiva") também entram no recálculo por filtro — sem
      // isso a coluna fica sempre com o valor bruto (ou vazio) da
      // planilha, em vez de refletir o período/filtros ativos na lista.
      var chaveQtd = hn.replace(/[-\s]+/g, '_');
      var ehQtdAtendimentos = ['QTD_ATENDIMENTOS','QTD_DE_ATENDIMENTOS','QUANTIDADE_DE_ATENDIMENTOS'].indexOf(chaveQtd) !== -1;
      var ehQtdParticipacoes = ['QTD_PARTICIPACOES','QTD_DE_PARTICIPACOES','QUANTIDADE_DE_PARTICIPACOES','QTD_PARTICIPACAO','QTD_DE_PARTICIPACAO','QUANTIDADE_DE_PARTICIPACAO'].indexOf(chaveQtd) !== -1;
      if(ehPeriodoPattern || ehQtdAtendimentos || ehQtdParticipacoes) qtdColIdxs.push(i);
    });
    if(nomeIdxQtd >= 0 && qtdColIdxs.length){
      var countsPorNomeQtd = {};
      view.forEach(function(row){
        var nomeVal = String(row.t[nomeIdxQtd]===undefined ? '' : row.t[nomeIdxQtd]).trim().toUpperCase();
        if(!nomeVal) return;
        countsPorNomeQtd[nomeVal] = (countsPorNomeQtd[nomeVal] || 0) + 1;
      });
      view.forEach(function(row){
        var nomeVal = String(row.t[nomeIdxQtd]===undefined ? '' : row.t[nomeIdxQtd]).trim().toUpperCase();
        var txt = fmtInt(nomeVal ? (countsPorNomeQtd[nomeVal] || 0) : 0);
        qtdColIdxs.forEach(function(ci){
          if(ci >= row.c.length || row.t[ci] === txt) return;
          row.t[ci] = txt;
          row.c[ci] = '<td>'+txt+'</td>';
          row.s = undefined;
        });
      });
    }
    // Filtro/busca/ordenação novos sempre voltam pra página 1.
    listaPagina[listName] = 1;
    paginarLista(card);
  }

  el.querySelectorAll('[data-month-filter]').forEach(function(container){
    var name = container.getAttribute('data-month-filter');
    var key = container.getAttribute('data-state-key');
    if(container.getAttribute('data-computed-months') === '1'){
      // "Pessoas atendidas": filtro de mês próprio — recalcula a
      // dedup (Atendimentos + Participantes Ativ. Coletiva) na hora,
      // em vez de só esconder/mostrar linhas de uma tabela fixa.
      var optsCalc = monthOptionsParaPessoasAtendidas();
      var validCalc = optsCalc.map(function(o){ return o.value; });
      listMonthFilters[key] = (listMonthFilters[key] || []).filter(function(v){
        return validCalc.indexOf(v) >= 0;
      });
      var calcMs = createMultiSelect(container, {
        placeholder: 'Todos os meses', multi: true, search: optsCalc.length > 8, showTags: true,
        onChange: function(keys){
          listMonthFilters[key] = keys;
          var card = container.closest('.list-card');
          var novoCached = pessoasAtendidasParaMeses(keys);
          estadoApp.latestSheets[name] = novoCached;
          listModel[key] = construirModeloLista(name, novoCached, listModel[key], key);
          applyFilters(card);
        }
      });
      calcMs.setOptions(optsCalc);
      calcMs.setSelected(listMonthFilters[key]);
      applyFilters(container.closest('.list-card'));
      return;
    }
    var cached = estadoApp.latestSheets[name];
    var dateColIdx = listDateColIdx[key];
    if(!cached || dateColIdx == null || dateColIdx < 0) return;
    var opts = monthOptionsForList(cached, dateColIdx);
    var validValues = opts.map(function(o){ return o.value; });
    // Mantém só a seleção anterior que ainda faz sentido (evita "mês
    // fantasma" depois que os dados são atualizados).
    listMonthFilters[key] = (listMonthFilters[key] || []).filter(function(v){
      return validValues.indexOf(v) >= 0;
    });
    var monthMs = createMultiSelect(container, {
      placeholder: 'Todos os meses', multi: true, search: opts.length > 8, showTags: true,
      onChange: function(keys){
        listMonthFilters[key] = keys;
        applyFilters(container.closest('.list-card'));
      }
    });
    monthMs.setOptions(opts);
    monthMs.setSelected(listMonthFilters[key]);
    applyFilters(container.closest('.list-card'));
  });

  el.querySelectorAll('[data-filter-key]').forEach(function(input){
    var debouncedApply = debounce(function(){ applyFilters(input.closest('.list-card')); }, 200);
    input.addEventListener('input', debouncedApply);
  });

  el.querySelectorAll('.list-card .filter-pair').forEach(function(pair){
    var colSelect = pair.querySelector('.filter-col');
    var valWrap = pair.querySelector('.filter-val-ms');
    // Multisseleção de valores ("Todos os valores"): fica desabilitada
    // (opacidade + sem clique, via .ms-disabled) até uma coluna ser
    // escolhida no select ao lado. A instância fica pendurada no
    // próprio elemento (._msInstance) pra applyFilters conseguir ler
    // os valores marcados sem precisar de um estado global à parte.
    var msInst = createMultiSelect(valWrap, {
      placeholder: 'Todos os valores', multi: true, search: true, showTags: true,
      onChange: function(){ applyFilters(pair.closest('.list-card')); }
    });
    valWrap._msInstance = msInst;

    colSelect.addEventListener('change', function(){
      var card = colSelect.closest('.list-card');
      var listName = card.querySelector('[data-list-filters]').getAttribute('data-list-filters');
      var cached = estadoApp.latestSheets[listName];
      var isProfEmulti = colSelect.value === PROF_EMULTI_FILTER_VALUE;
      var isAcaoM2 = colSelect.value === ACAO_M2_FILTER_VALUE;
      var colIdx = (!isProfEmulti && !isAcaoM2 && colSelect.value !== '') ? parseInt(colSelect.value, 10) : null;
      if(colIdx === null && !isProfEmulti && !isAcaoM2){
        msInst.setOptions([]);
        msInst.setSelected([]);
        valWrap.classList.add('ms-disabled');
      } else if(isAcaoM2){
        // Valores fixos do selo (não vêm de uma coluna da planilha, são
        // calculados linha a linha — ver classificarAcaoM2Participacao).
        var seenAcao = {};
        var valuesAcao = [];
        (cached ? cached.rows : []).forEach(function(r){
          var label = classificarAcaoM2Lista(listName, cached.headers, r).label;
          if(!seenAcao[label]){ seenAcao[label] = true; valuesAcao.push(label); }
        });
        valuesAcao.sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });
        msInst.setOptions(valuesAcao.map(function(v){ return {value:v, label:v}; }));
        msInst.setSelected([]);
        valWrap.classList.remove('ms-disabled');
      } else if(isProfEmulti){
        // Junta os valores distintos das 5 colunas "profissional N",
        // mas só os nomes cadastrados na aba PROFISSIONAIS (roster da
        // eMulti) — é isso que interessa pro indicador, não qualquer
        // nome que apareça em alguma dessas colunas.
        var idxsProf = colsProfissionaisNumerados(cached ? cached.headers : []);
        var seenProf = {};
        var valuesProf = [];
        (cached ? cached.rows : []).forEach(function(r){
          idxsProf.forEach(function(ci){
            var v = r[ci];
            v = (v===undefined||v===null) ? '' : String(v).trim();
            if(!v || !nomeEhDaEmulti(v) || seenProf[v]) return;
            seenProf[v] = true;
            valuesProf.push(v);
          });
        });
        valuesProf.sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });
        msInst.setOptions(valuesProf.map(function(v){ return {value:v, label:v}; }));
        msInst.setSelected([]);
        valWrap.classList.remove('ms-disabled');
      } else {
        var headerName = (cached && cached.headers) ? cached.headers[colIdx] : '';
        var isDiasCol = (headerName === DIAS_SEM_ATENDIMENTO_HEADER);
        var seen = {};
        var values = [];
        (cached ? cached.rows : []).forEach(function(r){
          var v = r[colIdx];
          v = (v===undefined||v===null) ? '' : String(v).trim();
          if(!v) return;
          if(isDiasCol){
            // Filtro por FAIXA de dias, não valor a valor (31, 32, 33…):
            // agrupa em "31–60", "61–90" e "> 90".
            var bucket = diasBucketLabel(v);
            if(bucket && !seen[bucket]){ seen[bucket] = true; values.push(bucket); }
          } else if(!seen[v]){ seen[v] = true; values.push(v); }
        });
        if(isDiasCol){
          values.sort(function(a,b){
            return FAIXAS_DIAS_SEM_ATENDIMENTO.indexOf(a) - FAIXAS_DIAS_SEM_ATENDIMENTO.indexOf(b);
          });
        } else if(values.length && values.every(function(v){ return v !== '' && isFinite(Number(v.replace(',', '.'))); })){
          // Coluna só com números: ordena crescente NUMERICAMENTE, não
          // alfabeticamente (que colocaria "10" antes de "2").
          values.sort(function(a,b){ return Number(a.replace(',', '.')) - Number(b.replace(',', '.')); });
        } else {
          values.sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });
        }
        msInst.setOptions(values.map(function(v){ return {value:v, label:v}; }));
        msInst.setSelected([]);
        valWrap.classList.remove('ms-disabled');
      }
      applyFilters(card);
    });
  });

  el.querySelectorAll('[data-pdf-btn]').forEach(function(btn){
    btn.addEventListener('click', function(){
      gerarPdfLista(btn.getAttribute('data-pdf-btn'), btn.closest('.list-card'), btn);
    });
  });

  // Delegado no card: os botões "Detalhes" são recriados a cada página.
  el.querySelectorAll('.list-card').forEach(function(card){
    card.addEventListener('click', function(ev){
      var btn = ev.target.closest ? ev.target.closest('[data-detalhes-part-idx]') : null;
      if(!btn) return;
      var listName = btn.getAttribute('data-detalhes-part-list');
      var idx = parseInt(btn.getAttribute('data-detalhes-part-idx'), 10);
      var cachedLista = estadoApp.latestSheets[listName];
      if(!cachedLista || !cachedLista.rows[idx]) return;
      abrirDetalhesParticipacao(cachedLista.headers, cachedLista.rows[idx], listName);
    });
  });

  // "Pessoas atendidas": botão que expande/recolhe as colunas Data 4 em diante.
  el.querySelectorAll('.list-card').forEach(function(card){
    var btnDatas = card.querySelector('[data-pa-toggle-datas]');
    if(!btnDatas) return;
    btnDatas.addEventListener('click', function(){
      var sk = card.getAttribute('data-state-key');
      var expandir = !card.classList.contains('pa-datas-expandidas');
      listDatasExpandidas[sk] = expandir;
      card.classList.toggle('pa-datas-expandidas', expandir);
      btnDatas.setAttribute('aria-expanded', expandir ? 'true' : 'false');
      btnDatas.textContent = expandir
        ? 'Recolher datas ▴'
        : 'Mostrar mais datas (+' + btnDatas.getAttribute('data-pa-toggle-datas') + ') ▾';
      ajustarTruncamentoLista(card);
    });
  });

  // Ordenação alfanumérica ao clicar no cabeçalho — vale pra QUALQUER
  // coluna visível de QUALQUER lista (inclusive o selo "AÇÃO M2"), sem
  // duplicar dado nenhum: só reordena os <tr> já existentes no <tbody> e
  // reaplica os filtros/busca já ativos (applyFilters lê tudo direto do
  // DOM, então continua batendo certinho depois da reordenação).
  function ordenarTabelaPorColuna(th){
    var card = th.closest('.list-card');
    var table = th.closest('table');
    var tbody = table ? table.querySelector('tbody') : null;
    if(!card || !tbody) return;
    var listName = card.getAttribute('data-list-card');
    var colIdx = parseInt(th.getAttribute('data-col-idx'), 10);
    var novaDir = th.getAttribute('data-sort-dir') === 'asc' ? 'desc' : 'asc';
    table.querySelectorAll('.sortable-th').forEach(function(h){
      if(h !== th){ h.removeAttribute('data-sort-dir'); h.classList.remove('sort-asc','sort-desc'); }
    });
    th.setAttribute('data-sort-dir', novaDir);
    th.classList.remove('sort-asc','sort-desc');
    th.classList.add(novaDir === 'asc' ? 'sort-asc' : 'sort-desc');
    var listKey = card.getAttribute('data-state-key');
    var m = listModel[listKey];
    if(!m) return;
    m.sortCol = colIdx;
    m.sortDir = novaDir;
    ordenarModeloLista(listKey, m);
    applyFilters(card);
  }
  el.querySelectorAll('.list-card .sortable-th').forEach(function(th){
    th.addEventListener('click', function(){ ordenarTabelaPorColuna(th); });
  });
  el.querySelectorAll('.list-card').forEach(function(card){
    if(card.querySelector('tbody')) paginarLista(card);
  });
}

// ===== módulo: js/pdf/pdf-divergencia.js =====
// ======================================================================
// pdf/pdf-divergencia.js
// PDF de divergência: calculado (painel) vs. oficial
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


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
