// ======================================================================
// listas/render-listas.js
// Listas — modelo, cartões e seção de listas
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../nucleo/estado.js';
import { ACAO_M2_FILTER_VALUE, DIAS_SEM_ATENDIMENTO_HEADER, FAIXAS_DIAS_SEM_ATENDIMENTO, PROF_EMULTI_FILTER_VALUE, buscaAtivaCompute, diasBucketLabel } from '../abas/m1-busca-ativa.js';
import { latestWb } from '../app/carga.js';
import { abrirDetalhesParticipacao, acaoM2BadgeHTML, classificarAcaoM2Lista, colsProfissionaisNumerados, detalhesBtnHTML, ehListaResumoAtividadeColetiva } from './atividade-coletiva.js';
import { monthOptionsParaPessoasAtendidas, pessoasAtendidasParaMeses } from './pessoas-atendidas.js';
import { displayListName, monthOptionValue, suffixedName } from '../nucleo/config.js';
import { colIndex, fmtBRDate, nomeEhDaEmulti, normalizeText, parseBRDate } from '../nucleo/dados.js';
import { dateColIndexForList, listDatasExpandidas, listDateColIdx, listModel, listMonthFilters, monthOptionsForList } from '../nucleo/listas-estado.js';
import { createMultiSelect } from '../nucleo/multiselect.js';
import { debounce, escapeHtml, fmtInt } from '../nucleo/utils.js';
import { gerarPdfLista } from '../pdf/pdf-listas.js';

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

  // Só o card da lista ativa (pill selecionada) fica visível — os
  // outros continuam no DOM (com seus próprios filtros já montados),
  // só escondidos, pra alternar de lista sem perder filtro/estado.
  function aplicarAbaAtiva(){
    var active = listActiveTab[containerId];
    el.querySelectorAll('.list-card').forEach(function(card){
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

  el.querySelectorAll('.filter-pair').forEach(function(pair){
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
  el.querySelectorAll('.sortable-th').forEach(function(th){
    th.addEventListener('click', function(){ ordenarTabelaPorColuna(th); });
  });
  el.querySelectorAll('.list-card').forEach(function(card){
    if(card.querySelector('tbody')) paginarLista(card);
  });
}
