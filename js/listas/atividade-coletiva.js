// ======================================================================
// listas/atividade-coletiva.js
// Listas — participantes e resumo de atividade coletiva (AÇÃO M2 + modal)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { TOTAL_PROF_EMULTI_HEADER, colTotalProfEmulti } from '../indicadores/calculo.js';
import { profissionalColIndex } from './pessoas-atendidas.js';
import { displayListName } from '../nucleo/config.js';
import { colIndex, colRespParticipantes, equipeColIndex, nomeEhDaEmulti, toInt } from '../nucleo/dados.js';
import { escapeHtml } from '../nucleo/utils.js';

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
export function init(){
injectPartModalStyles();
}
