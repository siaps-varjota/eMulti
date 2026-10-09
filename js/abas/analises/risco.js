// ======================================================================
// abas/analises/risco.js
// Aba Frequência e Retorno — tabela de pacientes em risco e Excel
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../../nucleo/estado.js';
import { gerarPdfRisco } from './pdf.js';
import { fmtBRDate, parseBRDate } from '../../nucleo/dados.js';
import { createMultiSelect } from '../../nucleo/multiselect.js';
import { escapeHtml, fmtDec, fmtInt } from '../../nucleo/utils.js';
import { slugifyFileName } from '../../pdf/pdf-listas.js';

// Cabeçalhos da tabela "Pacientes em risco de abandono", na mesma ordem
// das células montadas em linhaRiscoHtml — usado tanto pro <thead>
// quanto pro comparador de ordenação (compareRiscoPorColuna).
var RISCO_HEADERS = ['Paciente','Profissional','Equipe','Consultas','Última consulta','Dias sem voltar','Dias restantes','Última participação coletiva'];

// Colunas oferecidas no "Filtrar por coluna…" da tabela de risco — cada
// uma expõe o MESMO texto exibido na célula (fmtInt/fmtBRDate/etc.), pra
// bater exatamente com o que aparece na tela. "Profissional" fica de
// fora porque já tem o filtro dedicado ao lado (Profissional da última
// consulta); o índice aqui é só a posição no <select>, não o índice da
// coluna na tabela (ver RISCO_HEADERS pra esse outro índice).
var RISCO_COLUNAS_FILTRAVEIS = [
  {label:'Paciente', getValor: function(r){ return r.nome; }},
  {label:'Equipe', getValor: function(r){ return r.equipe; }},
  {label:'Consultas', numeric:true, getValor: function(r){ return fmtInt(r.totalConsultas); }},
  {label:'Última consulta', isDate:true, getValor: function(r){ return fmtBRDate(r.ultima); }},
  // "Dias sem voltar" filtra por FAIXAS (não por valor exato de dias):
  // até 30, 31–60, 61–90 e mais de 90 dias. A lista de opções é fixa
  // (fixedValues), na ordem das faixas, mesmo que alguma esteja vazia.
  {label:'Dias sem voltar', fixedValues: ['Até 30 dias','31 a 60 dias','61 a 90 dias','Mais de 90 dias'],
    getValor: function(r){
      var d = r.diasDesde;
      if(d <= 30) return 'Até 30 dias';
      if(d <= 60) return '31 a 60 dias';
      if(d <= 90) return '61 a 90 dias';
      return 'Mais de 90 dias';
    }}
];

// Valores distintos de uma coluna filtrável, na ordem certa pro tipo:
// cronológica (isDate), numérica (numeric) ou alfanumérica (padrão) —
// mesmo critério já usado pros filtros de coluna da aba Listas.
function valoresDistintosRisco(colDef, dados){
  if(colDef.fixedValues) return colDef.fixedValues.slice();
  var seen = {}, values = [];
  dados.forEach(function(r){
    var v = colDef.getValor(r);
    v = (v===undefined||v===null) ? '' : String(v).trim();
    if(!v || seen[v]) return;
    seen[v] = true;
    values.push(v);
  });
  if(colDef.isDate){
    values.sort(function(a,b){
      var da = parseBRDate(a), db = parseBRDate(b);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });
  } else if(colDef.numeric){
    values.sort(function(a,b){ return parseFloat(a.replace(',','.')) - parseFloat(b.replace(',','.')); });
  } else {
    values.sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });
  }
  return values;
}

// Comparador usado pela ordenação alfanumérica ao clicar num cabeçalho
// (ver wireRiscoFiltros) — opera direto sobre os dados (não sobre texto
// já renderizado), pra ordenar a lista INTEIRA filtrada antes do corte
// dos 40 exibidos, e não só as linhas já visíveis na tela.
function compareRiscoPorColuna(a, b, idx){
  switch(idx){
    case 3: return a.totalConsultas - b.totalConsultas;
    case 5: return a.diasDesde - b.diasDesde;
    case 6: { // nulos (não se aplica) ficam no fim da ordem crescente
      var ra = a.diasRestantes==null ? 1e9 : a.diasRestantes, rb = b.diasRestantes==null ? 1e9 : b.diasRestantes;
      return ra - rb;
    }
    case 7: return (a.ultimaColetiva ? a.ultimaColetiva.getTime() : 0) - (b.ultimaColetiva ? b.ultimaColetiva.getTime() : 0);
    case 4: return a.ultima - b.ultima;
    case 1: return String(a.profissional).localeCompare(String(b.profissional), 'pt-BR', {numeric:true, sensitivity:'base'});
    case 2: return String(a.equipe).localeCompare(String(b.equipe), 'pt-BR', {numeric:true, sensitivity:'base'});
    default: return String(a.nome).localeCompare(String(b.nome), 'pt-BR', {numeric:true, sensitivity:'base'});
  }
}

// Uma linha da tabela de risco — função à parte porque agora é usada
// tanto no render inicial quanto toda vez que o filtro (profissional ou
// busca) muda (ver renderTabelaRisco, dentro de wireRiscoFiltros).
function linhaRiscoHtml(r, profissionaisSelecionados){
  // Só recalcula "Consultas"/"Profissional" a partir de um subconjunto de
  // nomes quando o usuário de fato filtrou por profissional específico
  // (profissionaisSelecionados não vazio). Sem esse filtro ("Todos"), usa
  // sempre os valores "crus" do paciente (r.totalConsultas/r.profissionalHtml)
  // — os MESMOS usados pela ordenação (compareRiscoPorColuna) e pelo filtro
  // "Filtrar por coluna… → Consultas" (RISCO_COLUNAS_FILTRAVEIS). Antes,
  // como fallback usava (r.ultimoProfissionais||[]) mesmo sem filtro
  // aplicado, a célula acabava mostrando só a soma de consultas do(s)
  // profissional(is) da ÚLTIMA consulta — um número menor/diferente do
  // total real sempre que o paciente também foi atendido por outro(s)
  // profissional(is) em consultas anteriores. Isso fazia a coluna
  // "Consultas" exibida na tela não bater com o valor que a ordenação/
  // filtro realmente usam, parecendo que o filtro "não reconhecia" o
  // número certo. (r.profissionalHtml não é mais usado na célula — ver
  // profissionalCelulaHtml, abaixo — mas continua guardado em "risco"
  // caso sirva de referência futura.)
  var temFiltroProf = profissionaisSelecionados && profissionaisSelecionados.length;
  var nomesVisiveis = temFiltroProf
    ? profissionaisSelecionados.filter(function(nome){
        return (r.consultasPorProf || {})[nome] > 0;
      })
    : [];
  // Coluna "Profissional": com filtro específico marcado, o NOME
  // PRINCIPAL mostrado é só quem foi filtrado (comportamento de antes) —
  // mas o popover "+N" continua aparecendo quando o paciente tem OUTROS
  // profissionais no histórico além dos filtrados (r.outrosProfissionais,
  // menos quem já está no nome principal), em vez de sumir só porque um
  // filtro está ativo. Sem filtro ("Todos"), mostra só quem fez a
  // ÚLTIMA consulta (r.profissionalUltimo) + o mesmo badge "+N" —
  // clicar nele abre um popover com esses nomes e a data da última
  // consulta de cada um (ver profissionalBadgeHtml/abrirProfPopover).
  var profissional;
  if(temFiltroProf){
    var principalFiltro = nomesVisiveis.join(', ') || r.profissionalUltimo || r.profissional;
    var extrasFiltro = (r.outrosProfissionais || []).filter(function(o){
      return nomesVisiveis.indexOf(o.nome) === -1;
    });
    profissional = profissionalBadgeHtml(principalFiltro, extrasFiltro);
  } else {
    profissional = profissionalCelulaHtml(r);
  }
  var totalConsultas = (temFiltroProf && nomesVisiveis.length)
    ? nomesVisiveis.reduce(function(total, nome){
        return total + ((r.consultasPorProf || {})[nome] || 0);
      }, 0)
    : r.totalConsultas;
  var profAttr = escapeHtml((r.ultimoProfissionais||[]).join('|'));
  return '<tr data-ultimo-prof="'+profAttr+'"><td>'+escapeHtml(r.nome)+'</td><td>'+profissional+'</td><td>'+escapeHtml(r.equipe)+'</td><td>'+fmtInt(totalConsultas)+'</td><td>'+fmtBRDate(r.ultima)+'</td><td>'+fmtInt(r.diasDesde)+' dias</td><td>'+diasRestantesTxt(r)+'</td><td>'+(r.ultimaColetiva ? fmtBRDate(r.ultimaColetiva) : '—')+'</td></tr>';
}

// Texto da coluna "Dias restantes" (estimativa até o limite de abandono
// consumado = 3x a mediana histórica 1ª→2ª consulta).
function diasRestantesTxt(r){
  if(r.diasRestantes == null) return '—';
  if(r.diasRestantes < 0) return 'Ultrapassou há '+fmtInt(-r.diasRestantes)+' dias';
  return fmtInt(r.diasRestantes)+' dias';
}

// Monta a célula "Profissional" no modo padrão (sem filtro de
// profissional marcado): nome de quem fez a última consulta, mais um
// botão "+N" (só quando há outros profissionais no histórico do
// paciente) que abre o popover com "Também atendido por…". Os dados dos
// outros profissionais vão codificados em data-prof-extra (JSON +
// encodeURIComponent, pra não depender de escapeHtml lidar com aspas em
// atributo) e são lidos pelo listener delegado em wireRiscoFiltros.
// Monta a célula "Profissional" no padrão "1 nome + badge +N com
// popover pros demais": usada tanto pela tabela "Pacientes em risco de
// abandono" (profissionalCelulaHtml, abaixo) quanto por "Pessoas
// Atendidas" (pessoasAtendidasParaMeses/renderListCard). extras é um
// array de {nome, data:Date|null}; a data já formatada
// (fmtBRDate) vai codificada em data-prof-extra (JSON +
// encodeURIComponent, pra não depender de escapeHtml lidar com aspas em
// atributo) e é lida pelo listener delegado que abre o popover
// (abrirProfPopover) — ver wireRiscoFiltros e wireListasProfPopover.
export function profissionalBadgeHtml(nomePrincipal, extras){
  var nomeHtml = escapeHtml(nomePrincipal || '—');
  if(!extras || !extras.length) return nomeHtml;
  // "t" (tipo: Atendimento / Participação em Atividade Coletiva) é
  // opcional — a tabela "Pacientes em risco de abandono" não informa
  // (só usa Atendimentos), e o popover simplesmente não mostra a linha
  // de tipo nesse caso (ver abrirProfPopover).
  var payload = extras.map(function(o){ return {n:o.nome, d: o.data ? fmtBRDate(o.data) : '', t: o.tipo || ''}; });
  var attr = encodeURIComponent(JSON.stringify(payload));
  return nomeHtml
    + ' <button type="button" class="prof-mais-btn" data-prof-extra="'+attr+'" title="Ver outros profissionais envolvidos">+'+extras.length+'</button>';
}

function profissionalCelulaHtml(r){
  return profissionalBadgeHtml(r.profissionalUltimo || r.profissional, r.outrosProfissionais);
}

export function riscoTableHtml(risco){
  if(!risco.length) return '<p class="footnote">Nenhum paciente na janela de risco no momento (ou ainda não há intervalo histórico suficiente pra calcular).</p>';
  // A tabela/contador/rodapé começam vazios de propósito — quem preenche
  // (e reage ao filtro de profissional + coluna + busca) é
  // wireRiscoFiltros, logo depois deste HTML entrar no DOM. Isso garante
  // que o quantitativo mostrado na tela E o PDF sempre reflitam o filtro
  // atual, em vez de só esconder linhas já renderizadas da lista
  // completa.
  var pdfBtnHtml = '<button type="button" class="pdf-btn" id="btnRiscoPdf">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h1a1.5 1.5 0 0 0 0-3H9v5"/><path d="M13 12v5h1a2 2 0 0 0 0-5z"/><path d="M18.5 12H17v5"/><path d="M17 14.5h1.3"/></svg>'
    + '<span>Gerar PDF</span></button>';
  var xlsxBtnHtml = '<button type="button" class="pdf-btn" id="btnRiscoXlsx" style="margin-right:8px;">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13l4 5M13 13l-4 5"/></svg>'
    + '<span>Exportar Excel</span></button>';
  // Filtro por coluna (Paciente/Equipe/Consultas/Última consulta/Dias sem
  // voltar — "Profissional" fica de fora porque já tem o filtro dedicado
  // ao lado): mesmo padrão visual (select + multisseleção de valores) das
  // listas da aba Listas — ver RISCO_COLUNAS_FILTRAVEIS/wireRiscoFiltros.
  var opcoesSituacao = [
    {value:'status:2mais', label:'Com 2+ consultas'},
    {value:'status:emDia', label:'Em dia'},
    {value:'status:risco', label:'Em risco'},
    {value:'status:abandono', label:'Abandono consumado'}
  ];
  var colOptionsHtml = '<option value="">Filtrar…</option>'
    + opcoesSituacao.map(function(o){ return '<option value="'+o.value+'">'+escapeHtml(o.label)+'</option>'; }).join('')
    + RISCO_COLUNAS_FILTRAVEIS.map(function(c, i){ return '<option value="col:'+i+'">'+escapeHtml(c.label)+'</option>'; }).join('');
  var colFilterHtml = '<div class="filter-pair">'
    + '<select class="filter-col" id="riscoFilterCol">'+colOptionsHtml+'</select>'
    + '<div class="ms-wrap filter-val-ms ms-disabled" id="riscoFilterValMs"></div>'
    + '</div>';
  // Cabeçalhos clicáveis (ordenação alfanumérica, mesmo padrão visual
  // .sortable-th/.sort-ind usado na aba Listas) — ver ordenarTabelaRisco.
  var theadHtml = RISCO_HEADERS.map(function(h, i){
    return '<th class="sortable-th" data-risco-col-idx="'+i+'">'+escapeHtml(h)+'<span class="sort-ind"></span></th>';
  }).join('');
  return '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">'+xlsxBtnHtml+pdfBtnHtml+'</div>'
    + '<p class="list-meta" id="riscoListMeta"></p>'
    + '<div class="list-filters">'
    +   '<div class="list-month-filter"><label class="list-month-filter-label">Profissional (última consulta)</label>'
    +     '<div class="ms-wrap" id="riscoProfMs"></div></div>'
    +   '<div class="list-month-filter"><label class="list-month-filter-label">Profissional</label>'
    +     '<div class="ms-wrap" id="riscoProfAnyMs"></div></div>'
    +   colFilterHtml
    + '</div>'
    + '<input class="list-search" type="text" placeholder="Filtrar nesta lista…" id="riscoSearchInput">'
    + '<div class="table-wrap"><table class="data-table"><thead><tr>'
    + theadHtml
    + '</tr></thead><tbody id="riscoTbody"></tbody></table></div>'
    + '<div class="risco-pager" id="riscoPager"></div>'
    + '<p class="footnote" id="riscoFootnote"></p>';
}

// Liga o filtro de profissional (multisseleção) e a busca livre da
// tabela "Pacientes em risco de abandono", e também o botão de PDF —
// os três precisam compartilhar o mesmo resultado filtrado (ver
// riscoFiltrado, abaixo), pra que o quantitativo na tela, o rodapé
// ("Mostrando X de Y") e o PDF gerado batam sempre com o filtro atual
// (profissional da última consulta + busca), em vez do total geral.
export function wireRiscoFiltros(risco, kpiRegistros, temMediana, registrosTabela){
  var profMsEl = document.getElementById('riscoProfMs');
  var searchEl = document.getElementById('riscoSearchInput');
  var metaEl = document.getElementById('riscoListMeta');
  var footnoteEl = document.getElementById('riscoFootnote');
  var tbody = document.getElementById('riscoTbody');
  var btnPdf = document.getElementById('btnRiscoPdf');
  var btnXlsx = document.getElementById('btnRiscoXlsx');
  var resumoEl = document.getElementById('analisesRiscoResumo');
  var pagerEl = document.getElementById('riscoPager');
  var RISCO_POR_PAGINA = 100, paginaRisco = 1;
  if(!document.getElementById('riscoPagerStyles')){
    var stPg = document.createElement('style');
    stPg.id = 'riscoPagerStyles';
    stPg.textContent = '.risco-pager{display:flex;align-items:center;justify-content:center;gap:14px;margin:10px 0 4px;font-size:13px;color:var(--ink-soft)}'
      + '.risco-pager button{border:1px solid var(--line);background:var(--paper,#fff);border-radius:999px;padding:6px 14px;font:inherit;font-weight:600;color:var(--ink);cursor:pointer}'
      + '.risco-pager button:disabled{opacity:.4;cursor:default}';
    document.head.appendChild(stPg);
  }
  if(!tbody) return;

  var todos = registrosTabela || risco || [];
  // Base pros cards de estatística (Total no histórico / Com 2+
  // consultas / Em dia / Em risco / Abandono consumado): cobre TODOS os
  // pacientes (não só os em risco), filtrada com o MESMO predicado da
  // tabela abaixo (ver filtroPredicado), pra esses números variarem
  // junto com Profissional/Equipe/coluna/busca em vez de ficar fixos.
  var kpiTodos = kpiRegistros || [];
  // Opções do filtro: qualquer profissional que apareça como responsável
  // pela ÚLTIMA consulta de PELO MENOS UM paciente em risco (lista
  // completa, não só os 40 exibidos na tela).
  var profsSet = {};
  todos.forEach(function(r){ (r.ultimoProfissionais||[]).forEach(function(nome){ profsSet[nome] = true; }); });
  var profsOpts = Object.keys(profsSet).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); })
    .map(function(nome){ return {value:nome, label:nome}; });
  // Opções do filtro "Profissional" (independente de última consulta):
  // qualquer profissional que já atendeu PELO MENOS UM paciente em risco
  // em QUALQUER consulta do histórico dele, não só a mais recente.
  var profsAnySet = {};
  todos.forEach(function(r){ (r.todosProfissionais||[]).forEach(function(nome){ profsAnySet[nome] = true; }); });
  var profsAnyOpts = Object.keys(profsAnySet).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); })
    .map(function(nome){ return {value:nome, label:nome}; });

  // Texto de busca de cada paciente, pré-montado (mesmas colunas
  // exibidas na tabela), pra buscar sobre os DADOS reais — e não só
  // sobre o texto já renderizado na tela, que só cobre os 40 visíveis.
  function textoBusca(r){
    return [r.nome, r.profissional, r.equipe, fmtInt(r.totalConsultas), fmtBRDate(r.ultima), fmtInt(r.diasDesde)+' dias']
      .join(' ').toLowerCase();
  }

  var riscoFiltrado = todos.slice(); // resultado do filtro atual (lista completa, sem cap de 40) — é o que o PDF usa

  // O clique no botão "+N" da coluna Profissional é tratado por um
  // listener global único no document — ver logo depois de
  // abrirProfPopover, mais abaixo no arquivo.

  var profMs = profMsEl ? createMultiSelect(profMsEl, {
    placeholder: 'Todos', multi:true, search: profsOpts.length>8, showTags:true,
    onChange: function(){ renderTabelaRisco(); }
  }) : null;
  if(profMs) profMs.setOptions(profsOpts);

  var profAnyMsEl = document.getElementById('riscoProfAnyMs');
  var profAnyMs = profAnyMsEl ? createMultiSelect(profAnyMsEl, {
    placeholder: 'Todos', multi:true, search: profsAnyOpts.length>8, showTags:true,
    onChange: function(){ renderTabelaRisco(); }
  }) : null;
  if(profAnyMs) profAnyMs.setOptions(profsAnyOpts);

  if(searchEl) searchEl.addEventListener('input', renderTabelaRisco);

  // Filtro por coluna (Paciente/Equipe/Consultas/Última consulta/Dias sem
  // voltar): select da coluna + multisseleção de valores, mesmo padrão da
  // aba Listas — a multisseleção de valores fica desabilitada até uma
  // coluna ser escolhida (ver RISCO_COLUNAS_FILTRAVEIS/valoresDistintosRisco).
  var colSelectEl = document.getElementById('riscoFilterCol');
  var colValWrapEl = document.getElementById('riscoFilterValMs');
  var colValMs = colValWrapEl ? createMultiSelect(colValWrapEl, {
    placeholder: 'Todos os valores', multi:true, search:true, showTags:true,
    onChange: function(){ renderTabelaRisco(); }
  }) : null;
  if(colSelectEl){
    colSelectEl.addEventListener('change', function(){
      var valorFiltro = colSelectEl.value || '';
      var idx = valorFiltro.indexOf('col:') === 0 ? parseInt(valorFiltro.slice(4), 10) : null;
      if(idx === null || !colValMs){
        if(colValMs){ colValMs.setOptions([]); colValMs.setSelected([]); }
        if(colValWrapEl) colValWrapEl.classList.add('ms-disabled');
      } else {
        var valores = valoresDistintosRisco(RISCO_COLUNAS_FILTRAVEIS[idx], todos);
        colValMs.setOptions(valores.map(function(v){ return {value:v, label:v}; }));
        colValMs.setSelected([]);
        colValWrapEl.classList.remove('ms-disabled');
      }
      renderTabelaRisco();
    });
  }

  // Ordenação alfanumérica ao clicar no cabeçalho — ordena a lista
  // FILTRADA inteira (não só as linhas já visíveis), antes do corte dos
  // 40 exibidos na tela, pra bater com o que o rodapé/PDF mostram (ver
  // compareRiscoPorColuna). Clicar de novo no mesmo cabeçalho inverte a
  // direção; clicar em outro reinicia em ordem crescente.
  var sortColIdx = null, sortDir = 'asc';
  var theadThs = Array.prototype.slice.call(document.querySelectorAll('[data-risco-col-idx]'));
  theadThs.forEach(function(th){
    th.addEventListener('click', function(){
      var idx = parseInt(th.getAttribute('data-risco-col-idx'), 10);
      sortDir = (sortColIdx === idx && sortDir === 'asc') ? 'desc' : 'asc';
      sortColIdx = idx;
      theadThs.forEach(function(h){ h.classList.remove('sort-asc','sort-desc'); });
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      renderTabelaRisco();
    });
  });

  // Predicado de filtro único, usado tanto pra lista "risco" exibida na
  // tabela quanto (com os mesmos critérios) pros cards de estatística
  // acima dela — kpiTodos cobre todos os pacientes, e como os campos
  // (nome/profissional/equipe/totalConsultas/ultima/diasDesde/
  // ultimoProfissionais/todosProfissionais) têm o mesmo formato nos dois
  // casos, o mesmo predicado serve pra ambos.
  function filtroPredicado(r, paraTabela){
    var selecionados = profMs ? profMs.getSelected() : [];
    var selecionadosAny = profAnyMs ? profAnyMs.getSelected() : [];
    var termo = searchEl ? searchEl.value.trim().toLowerCase() : '';
    var valorFiltro = colSelectEl ? (colSelectEl.value || '') : '';
    var colIdxFiltro = valorFiltro.indexOf('col:') === 0 ? parseInt(valorFiltro.slice(4), 10) : null;
    var statusFiltro = valorFiltro.indexOf('status:') === 0 ? valorFiltro.slice(7) : '';
    var valoresColSelecionados = colValMs ? colValMs.getSelected() : [];
    var profsLinha = r.ultimoProfissionais || [];
    var matchesProf = !selecionados.length || selecionados.some(function(v){ return profsLinha.indexOf(v) >= 0; });
    // "Profissional" (independente de ser a última consulta ou não):
    // olha pra r.todosProfissionais (qualquer profissional que já
    // atendeu o paciente em algum momento do histórico) — diferente do
    // filtro "Profissional (última consulta)" acima, que só olha
    // r.ultimoProfissionais.
    var profsLinhaAny = r.todosProfissionais || [];
    var matchesProfAny = !selecionadosAny.length || selecionadosAny.some(function(v){ return profsLinhaAny.indexOf(v) >= 0; });
    var matchesTexto = !termo || textoBusca(r).indexOf(termo) !== -1;
    var matchesColuna = (colIdxFiltro === null || !valoresColSelecionados.length)
      || valoresColSelecionados.indexOf(RISCO_COLUNAS_FILTRAVEIS[colIdxFiltro].getValor(r)) >= 0;
    var matchesSituacao = true;
    if(statusFiltro === '2mais') matchesSituacao = r.totalConsultas >= 2;
    else if(statusFiltro === 'emDia') matchesSituacao = r.status === 'emDia';
    else if(statusFiltro === 'risco') matchesSituacao = r.status === 'risco';
    else if(statusFiltro === 'abandono') matchesSituacao = r.status === 'abandono';
    // Sem situação escolhida, mantém o comportamento original: a tabela
    // começa mostrando apenas os pacientes em risco.
    else if(paraTabela) matchesSituacao = r.status === 'risco';
    return matchesProf && matchesProfAny && matchesTexto && matchesColuna && matchesSituacao;
  }

  // Recalcula e redesenha os cards de estatística acima da tabela a
  // partir da lista COMPLETA de pacientes (kpiTodos), já filtrada pelos
  // mesmos critérios da tabela — assim os números variam junto com o
  // filtro, em vez de refletirem sempre o total geral sem filtro.
  function renderKpis(kpiFiltrados){
    if(!resumoEl || !temMediana) return;
    var comRetornoF = 0, emDiaF = 0, riscoF = 0, abandonoF = 0;
    kpiFiltrados.forEach(function(r){
      if(r.status === 'unica' || r.status === 'semMediana') return;
      comRetornoF++;
      if(r.status === 'emDia') emDiaF++;
      else if(r.status === 'risco') riscoF++;
      else if(r.status === 'abandono') abandonoF++;
    });
    // "Em dia"/"Em risco"/"Abandono consumado" continuam comparados só
    // com quem TEM 2+ consultas dentro do filtro atual (comRetornoF) —
    // não com o total geral filtrado, que inclui "Consulta única".
    function pctRetorno(n){ return comRetornoF ? Math.round(n/comRetornoF*100) : 0; }
    resumoEl.innerHTML = ''
      + '<div class="kpi-container">'
      +   '<div class="kpi-item"><label>Total no histórico</label><span>'+fmtInt(kpiFiltrados.length)+'</span></div>'
      +   '<div class="kpi-item"><label>Com 2+ consultas</label><span>'+fmtInt(comRetornoF)+'</span></div>'
      +   '<div class="kpi-item"><label>Em dia</label><span>'+fmtInt(emDiaF)+' ('+pctRetorno(emDiaF)+'%)</span></div>'
      +   '<div class="kpi-item"><label>Em risco</label><span>'+fmtInt(riscoF)+' ('+pctRetorno(riscoF)+'%)</span></div>'
      +   '<div class="kpi-item"><label>Abandono consumado</label><span>'+fmtInt(abandonoF)+' ('+pctRetorno(abandonoF)+'%)</span></div>'
      + '</div>';
  }

  function renderTabelaRisco(){
    var selecionados = profMs ? profMs.getSelected() : [];
    riscoFiltrado = todos.filter(function(r){ return filtroPredicado(r, true); });
    renderKpis(kpiTodos.filter(function(r){ return filtroPredicado(r, false); }));
    if(sortColIdx !== null){
      riscoFiltrado.sort(function(a,b){
        var cmp = compareRiscoPorColuna(a, b, sortColIdx);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    // Nova filtragem/ordenação sempre volta pra página 1.
    paginaRisco = 1;
    renderPaginaRisco(selecionados);

    // Quantitativo mostrado acima da tabela: reflete o TOTAL filtrado
    // (riscoFiltrado), não só as linhas da página atual.
    if(metaEl) metaEl.textContent = fmtInt(riscoFiltrado.length) + (riscoFiltrado.length===1 ? ' paciente' : ' pacientes');
    if(footnoteEl) footnoteEl.textContent = '';
  }

  // Paginação: 100 pacientes por página (todos os filtrados ficam
  // acessíveis pelas páginas, em vez do corte fixo em 40).
  function renderPaginaRisco(selecionadosParam){
    var selecionados = selecionadosParam || (profMs ? profMs.getSelected() : []);
    var total = riscoFiltrado.length;
    var totalPaginas = Math.max(1, Math.ceil(total / RISCO_POR_PAGINA));
    if(paginaRisco > totalPaginas) paginaRisco = totalPaginas;
    if(paginaRisco < 1) paginaRisco = 1;
    var ini = (paginaRisco - 1) * RISCO_POR_PAGINA;
    var visiveis = riscoFiltrado.slice(ini, ini + RISCO_POR_PAGINA);
    tbody.innerHTML = visiveis.length
      ? visiveis.map(function(r){ return linhaRiscoHtml(r, selecionados); }).join('')
      : '<tr><td colspan="8" class="footnote" style="padding:14px 12px;">Nenhum paciente encontrado com esse filtro.</td></tr>';

    if(pagerEl){
      if(total <= RISCO_POR_PAGINA){
        pagerEl.innerHTML = '';
      } else {
        pagerEl.innerHTML = ''
          + '<button type="button" data-pg="prev"'+(paginaRisco<=1?' disabled':'')+'>‹ Anterior</button>'
          + '<span>Página '+fmtInt(paginaRisco)+' de '+fmtInt(totalPaginas)
          +   ' · mostrando '+fmtInt(ini+1)+'–'+fmtInt(Math.min(ini+RISCO_POR_PAGINA,total))+' de '+fmtInt(total)+'</span>'
          + '<button type="button" data-pg="next"'+(paginaRisco>=totalPaginas?' disabled':'')+'>Próxima ›</button>';
      }
    }
    var wrap = tbody.parentNode && tbody.parentNode.parentNode;
    if(wrap) wrap.scrollTop = 0;
  }
  if(pagerEl){
    pagerEl.addEventListener('click', function(ev){
      var b = ev.target.closest ? ev.target.closest('button[data-pg]') : null;
      if(!b || b.disabled) return;
      paginaRisco += (b.getAttribute('data-pg') === 'next') ? 1 : -1;
      renderPaginaRisco();
    });
  }
  renderTabelaRisco();

  if(btnPdf) btnPdf.addEventListener('click', function(){ gerarPdfRisco(riscoFiltrado, todos.length, {
    ultima: profMs ? profMs.getSelected() : [],
    qualquer: profAnyMs ? profAnyMs.getSelected() : []
  }); });
  if(btnXlsx) btnXlsx.addEventListener('click', function(){ gerarExcelRisco(riscoFiltrado, todos.length); });
}

// ---------- Exportar "Pacientes em risco de abandono" em Excel ----------
// Exporta a lista COMPLETA filtrada (mesmo riscoFiltrado do PDF, na
// ordem atual — não só a página visível). "Motivo" é objetivo (dias sem
// retorno x mediana/limite); "Próxima ação sugerida" segue só a situação;
// "Ação realizada" e "Responsável" ficam em branco pra equipe preencher.
function gerarExcelRisco(lista, totalGeral){
  if(typeof XLSX === 'undefined' || !XLSX.utils){
    alert('Não foi possível carregar a biblioteca de Excel (verifique a conexão com a internet) — tente novamente.');
    return;
  }
  if(!lista.length){
    alert('Não há pacientes pra exportar com o filtro atual.');
    return;
  }
  var mediana = estadoApp.analisesDataAtual && estadoApp.analisesDataAtual.medianaBase;
  var limite = mediana ? Math.floor(mediana*3) : null;
  var SITUACAO = {emDia:'Em dia', risco:'Em risco', abandono:'Abandono consumado', unica:'Consulta única', semMediana:'Sem mediana'};
  var ACAO = {
    risco:'Contato ativo (telefone/visita) para reagendar',
    abandono:'Busca ativa / visita domiciliar',
    emDia:'Manter acompanhamento',
    unica:'Verificar necessidade de retorno',
    semMediana:'—'
  };
  function motivo(r){
    if(!mediana || r.status==='unica' || r.status==='semMediana') return '—';
    var base = fmtInt(r.diasDesde)+' dias sem voltar; mediana de retorno '+fmtDec(mediana,0)+' dias';
    if(r.status==='emDia') return base+' (dentro da mediana)';
    if(r.status==='risco') return base+'; limite de abandono consumado '+fmtInt(limite)+' dias';
    return base+'; passou do limite de '+fmtInt(limite)+' dias';
  }
  var head = ['Paciente','Profissional (última consulta)','Todos os profissionais','Equipe','Consultas','Última consulta','Dias sem voltar','Situação','Dias restantes (estimativa)','Última participação coletiva','Motivo','Próxima ação sugerida','Ação realizada','Responsável'];
  var rows = lista.map(function(r){
    return [
      r.nome, r.profissionalUltimo || r.profissional, r.profissional, r.equipe, r.totalConsultas,
      fmtBRDate(r.ultima), r.diasDesde, SITUACAO[r.status] || r.status,
      r.diasRestantes == null ? '' : r.diasRestantes,
      r.ultimaColetiva ? fmtBRDate(r.ultimaColetiva) : '',
      motivo(r), ACAO[r.status] || '', '', ''
    ];
  });
  var ws = XLSX.utils.aoa_to_sheet([head].concat(rows));
  ws['!cols'] = [{wch:34},{wch:28},{wch:34},{wch:20},{wch:10},{wch:14},{wch:14},{wch:20},{wch:16},{wch:18},{wch:58},{wch:44},{wch:26},{wch:22}];
  ws['!autofilter'] = {ref: XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:rows.length, c:head.length-1}})};
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Risco de abandono');
  var equipeLabel = estadoApp.analisesEquipes.map(function(e){ return e.label; }).join(' + ') + (estadoApp.analisesProfissional ? ' — ' + estadoApp.analisesProfissional : '');
  XLSX.writeFile(wb, slugifyFileName('Pacientes_risco_abandono')+'__'+slugifyFileName(equipeLabel)+'__'+slugifyFileName(new Date().toLocaleDateString('pt-BR'))+'.xlsx');
}
