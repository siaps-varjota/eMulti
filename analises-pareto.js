// ======================================================================
// analises-pareto.js
// Aba "Análises" (substitui "Notas metodológicas"): onde estão os pontos
// perdidos da nota final (Pareto 80/20), resultado por equipe/quadrimestre
// e prioridades de acompanhamento (regras fixas; IA opcional).
// Cálculo: para cada equipe e quadrimestre escolhidos, usa a MESMA
// metodologia do painel (média do M1/M2 de cada mês, cada um com sua
// janela móvel de 4 meses, e nota = pontos M1 x 6 + pontos M2 x 4).
// ======================================================================
import {
  estadoApp, EQUIPES, QUAD_LABELS, CLASS_PILL_HEX, calcularSerieTendencia, classificarM1, classificarM2,
  classificarDesempenho, createMultiSelect, escapeHtml, filtrarLinhasPorEquipe,
  filtrarAtividadesColetivasPorEquipe, suffixedName, monthShortLabel
} from './nucleo.js';
import { latestRawSheets, latestWb } from './app.js';
import {
  PESOS, NOME_INDICADOR, PONTOS_CLASSE, fmtNum, linhasDePerda, agregarPareto, gerarPrioridadesRegras
} from './analises-pareto-core.js';

// IA opcional: endereço da função serverless que devolve {resumo, prioridades}.
// Vazio = só regras fixas. Também pode ser definido em window.EMULTI_IA_URL.
var URL_IA = 'https://saude-bucal-varjota.vercel.app/api/sugerir-acoes';

var estado = { quads: [], equipes: [], indicador: 'todos', agrupar: 'indicador', cache: { wb: null, mapa: {} }, chart: null, resultados: [], montado: false, analise: null };

function el(id) { return document.getElementById(id); }

// ---------- períodos ----------
function mesesDoQuad(ano, q) {
  var hoje = new Date(), out = [];
  for (var i = 0; i < 4; i++) {
    var d = new Date(ano, q * 4 + i, 1);
    if (d <= hoje) out.push(d);
  }
  return out.length ? out : [new Date(ano, q * 4, 1)];
}
function rotuloQuad(ano, q) {
  var parcial = mesesDoQuad(ano, q).length < 4 ? ' (parcial)' : '';
  return QUAD_LABELS[q] + '/' + ano + parcial;
}
function opcoesQuad() {
  var hoje = new Date(), ano = hoje.getFullYear(), qAtual = Math.floor(hoje.getMonth() / 4), out = [];
  for (var a = ano; a >= ano - 2; a--) {
    for (var q = 2; q >= 0; q--) {
      if (a === ano && q > qAtual) continue;
      out.push({ value: a + '-' + q, label: QUAD_LABELS[q] + '/' + a });
    }
  }
  return out;
}

// ---------- cálculo por equipe/quadrimestre ----------
function comEquipe(eq, fn) {
  var salvo = estadoApp.currentEquipes;
  estadoApp.currentEquipes = [eq];
  try { return fn(); } finally { estadoApp.currentEquipes = salvo; }
}

function construirWb(eq) {
  // Mesma montagem do carregamento do painel (app.js), mas para UMA equipe.
  var wb = { SheetNames: [], Sheets: {} };
  var ativ = filtrarAtividadesColetivasPorEquipe(latestRawSheets['Participantes Ativ. Coletiva'], latestRawSheets['Resumo Atividade Coletiva'], [eq]);
  Object.keys(latestRawSheets).forEach(function (nome) {
    var linhas;
    if (nome === 'Participantes Ativ. Coletiva' && ativ.part) linhas = ativ.part;
    else if (nome === 'Resumo Atividade Coletiva' && ativ.rac) linhas = ativ.rac;
    else linhas = filtrarLinhasPorEquipe(latestRawSheets[nome], [eq]);
    var key = suffixedName(nome);
    wb.Sheets[key] = linhas;
    wb.SheetNames.push(key);
  });
  return wb;
}

function media(vals) {
  var v = vals.filter(function (x) { return x != null && !isNaN(x); });
  return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
}

function resultadoEquipeQuad(eq, ano, q) {
  if (estado.cache.wb !== latestWb) estado.cache = { wb: latestWb, mapa: {} };
  var chave = eq.key + '|' + ano + '|' + q;
  if (estado.cache.mapa[chave]) return estado.cache.mapa[chave];
  var meses = mesesDoQuad(ano, q);
  var res = comEquipe(eq, function () {
    var wb = construirWb(eq);
    var serie = calcularSerieTendencia(wb, meses[meses.length - 1], meses.length);
    var m1 = media(serie.map(function (p) { return p.m1; }));
    var m2 = media(serie.map(function (p) { return p.m2; }));
    var classeM1 = m1 != null ? classificarM1(m1) : '—';
    var classeM2 = m2 != null ? classificarM2(m2) : '—';
    var p1 = PONTOS_CLASSE[classeM1], p2 = PONTOS_CLASSE[classeM2];
    var nota = (p1 !== undefined && p2 !== undefined) ? p1 * PESOS.M1 + p2 * PESOS.M2 : null;
    return {
      equipe: eq.label, equipeKey: eq.key, periodo: rotuloQuad(ano, q), ano: ano, q: q,
      m1: m1, m2: m2, classeM1: classeM1, classeM2: classeM2, nota: nota, desempenho: classificarDesempenho(nota),
      meses: serie.map(function (p) { return { mes: monthShortLabel(p.mes), m1: p.m1, m2: p.m2 }; })
    };
  });
  estado.cache.mapa[chave] = res;
  return res;
}

function calcularTudo() {
  var out = [];
  estado.quads.forEach(function (qk) {
    var p = qk.split('-');
    estado.equipes.forEach(function (eq) { out.push(resultadoEquipeQuad(eq, +p[0], +p[1])); });
  });
  return out;
}

// ---------- montagem da tela ----------
function montar() {
  var painel = el('apRaiz');
  if (!painel || estado.montado) return;
  painel.innerHTML =
      '<div class="card ap-card">'
    +   '<h3 class="ap-titulo">Análises — onde estão os pontos perdidos</h3>'
    +   '<p class="ap-sub">A nota final do Componente III vale até 10 pontos (M1 pesa 6 e M2 pesa 4). O gráfico de Pareto mostra quanto cada indicador deixa de somar; os itens que, juntos, respondem por cerca de 80% da perda são os que mais compensam acompanhar primeiro.</p>'
    +   '<div class="ap-filtros">'
    +     '<div class="list-month-filter"><label class="list-month-filter-label">Quadrimestre</label><div class="ms-wrap" id="apQuadMs"></div></div>'
    +     '<div class="list-month-filter"><label class="list-month-filter-label">Equipe</label><div class="ms-wrap" id="apEquipeMs"></div></div>'
    +     '<div class="list-month-filter"><label class="list-month-filter-label">Indicador</label><div class="ms-wrap" id="apIndMs"></div></div>'
    +     '<div class="list-month-filter"><label class="list-month-filter-label">Agrupar por</label><div class="ms-wrap" id="apAgrMs"></div></div>'
    +   '</div>'
    + '</div>'
    + '<div id="apCorpo"></div>';

  var opts = opcoesQuad();
  var qAtual = Math.floor(new Date().getMonth() / 4), anoAtual = new Date().getFullYear();
  estado.quads = [anoAtual + '-' + qAtual];
  estado.equipes = EQUIPES.slice();

  var quadMs = createMultiSelect(el('apQuadMs'), {
    placeholder: 'Selecione', multi: true, search: false,
    onChange: function (keys) { estado.quads = keys.length ? keys : [anoAtual + '-' + qAtual]; estado.analise = null; renderizar(); }
  });
  quadMs.setOptions(opts); quadMs.setSelected(estado.quads);

  var eqMs = createMultiSelect(el('apEquipeMs'), {
    placeholder: 'Todas', multi: true, search: false,
    onChange: function (keys) {
      estado.equipes = keys.length ? EQUIPES.filter(function (e) { return keys.indexOf(e.key) >= 0; }) : EQUIPES.slice();
      estado.analise = null; renderizar();
    }
  });
  eqMs.setOptions(EQUIPES.map(function (e) { return { value: e.key, label: e.label }; }));
  eqMs.setSelected([]);

  var indMs = createMultiSelect(el('apIndMs'), {
    placeholder: 'Todos', multi: false, search: false,
    onChange: function (keys) { estado.indicador = keys[0] || 'todos'; estado.analise = null; renderizar(); }
  });
  indMs.setOptions([{ value: 'todos', label: 'Todos' }, { value: 'M1', label: 'M1 — Média de atendimentos' }, { value: 'M2', label: 'M2 — Ações compartilhadas' }]);
  indMs.setSelected(['todos']);

  var agrMs = createMultiSelect(el('apAgrMs'), {
    placeholder: 'Indicador', multi: false, search: false,
    onChange: function (keys) { estado.agrupar = keys[0] || 'indicador'; renderizar(); }
  });
  agrMs.setOptions([{ value: 'indicador', label: 'Indicador' }, { value: 'equipe', label: 'Equipe + indicador' }]);
  agrMs.setSelected(['indicador']);

  estado.montado = true;
}

function pill(classe) {
  var cor = CLASS_PILL_HEX[classe] || '#8A948F';
  return '<span class="ap-pill" style="background:' + cor + '">' + escapeHtml(classe) + '</span>';
}

function renderizar() {
  var corpo = el('apCorpo');
  if (!corpo) return;
  if (!latestWb || !latestRawSheets || !Object.keys(latestRawSheets).length) {
    corpo.innerHTML = '<div class="card"><p class="ap-vazio">Os dados ainda não foram carregados. Aguarde a leitura da planilha ou use o botão Atualizar.</p></div>';
    return;
  }
  corpo.innerHTML = '<div class="card"><p class="ap-vazio">Calculando…</p></div>';
  setTimeout(function () {
    var resultados;
    try { resultados = calcularTudo(); }
    catch (e) {
      console.error('[analises] falha ao calcular', e);
      corpo.innerHTML = '<div class="card"><p class="ap-vazio">Não foi possível calcular as análises: ' + escapeHtml(String(e && e.message || e)) + '</p></div>';
      return;
    }
    estado.resultados = resultados;
    desenhar(resultados);
  }, 20);
}

function desenhar(resultados) {
  var corpo = el('apCorpo');
  var linhas = [];
  resultados.forEach(function (r) { linhas = linhas.concat(linhasDePerda(r)); });
  if (estado.indicador !== 'todos') linhas = linhas.filter(function (l) { return l.indicador === estado.indicador; });

  if (!linhas.length) {
    corpo.innerHTML = '<div class="card"><p class="ap-vazio">Sem dados de M1/M2 para os filtros escolhidos.</p></div>';
    destruirGrafico();
    return;
  }
  var pareto = agregarPareto(linhas, estado.agrupar);
  var possivel = linhas.reduce(function (s, l) { return s + l.peso; }, 0);
  var obtido = linhas.reduce(function (s, l) { return s + l.obtido; }, 0);
  var perdido = possivel - obtido;

  var kpis =
      '<div class="ap-kpis">'
    +   '<div class="ap-kpi"><span>Pontos possíveis</span><b>' + fmtNum(possivel, 2) + '</b></div>'
    +   '<div class="ap-kpi"><span>Pontos obtidos</span><b>' + fmtNum(obtido, 2) + '</b></div>'
    +   '<div class="ap-kpi ap-kpi-perda"><span>Pontos perdidos</span><b>' + fmtNum(perdido, 2) + '</b></div>'
    +   '<div class="ap-kpi"><span>Maior perda</span><b>' + (perdido > 0 ? escapeHtml(pareto[0].rotulo) : 'Nenhuma') + '</b></div>'
    + '</div>';

  var linhasPareto = pareto.map(function (i, n) {
    return '<tr' + (i.prioritario ? ' class="ap-prio"' : '') + '><td>' + (n + 1) + '</td><td>' + escapeHtml(i.rotulo) + '</td>'
      + '<td>' + fmtNum(i.peso, 2) + '</td><td>' + fmtNum(i.obtido, 2) + '</td><td><b>' + fmtNum(i.perda, 2) + '</b></td>'
      + '<td>' + fmtNum(i.pct, 1) + '%</td><td>' + fmtNum(i.acumulado, 1) + '%</td>'
      + '<td>' + (i.perda > 0 ? (i.prioritario ? '<span class="ap-badge ap-badge-alta">Foco (até 80%)</span>' : '<span class="ap-badge">Acompanhar</span>') : '<span class="ap-badge ap-badge-ok">Sem perda</span>') + '</td></tr>';
  }).join('');

  var linhasRes = resultados.map(function (r) {
    return '<tr><td>' + escapeHtml(r.equipe) + '</td><td>' + escapeHtml(r.periodo) + '</td>'
      + '<td>' + fmtNum(r.m1, 2) + ' ' + (r.classeM1 !== '—' ? pill(r.classeM1) : '') + '</td>'
      + '<td>' + fmtNum(r.m2, 2) + '% ' + (r.classeM2 !== '—' ? pill(r.classeM2) : '') + '</td>'
      + '<td><b>' + fmtNum(r.nota, 2) + '</b></td>'
      + '<td>' + (r.desempenho && r.desempenho !== '—' ? pill(r.desempenho) : '—') + '</td></tr>';
  }).join('');

  corpo.innerHTML =
      '<div class="card ap-card">' + kpis + '</div>'
    + '<div class="card ap-card"><h4 class="ap-h4">Pareto dos pontos perdidos</h4>'
    +   '<p class="ap-sub">Barras: pontos perdidos. Linha: perda acumulada (%). Linha tracejada: 80%.</p>'
    +   '<div class="ap-chart-box"><canvas id="apChart"></canvas></div></div>'
    + '<div class="card ap-card"><h4 class="ap-h4">Prioridades pelo Pareto 80/20</h4>'
    +   '<div class="ap-scroll"><table class="data-table ap-tabela"><thead><tr><th>#</th><th>Item</th><th>Pontos possíveis</th><th>Obtidos</th><th>Perdidos</th><th>% da perda</th><th>% acumulado</th><th>Foco</th></tr></thead><tbody>' + linhasPareto + '</tbody></table></div></div>'
    + '<div class="card ap-card"><h4 class="ap-h4">Resultado por equipe e quadrimestre</h4>'
    +   '<div class="ap-scroll"><table class="data-table ap-tabela"><thead><tr><th>Equipe</th><th>Período</th><th>M1 (atend. por pessoa)</th><th>M2 (ações compartilhadas)</th><th>Nota final</th><th>Desempenho</th></tr></thead><tbody>' + linhasRes + '</tbody></table></div>'
    +   '<p class="ap-sub">Cada quadrimestre é a média do M1/M2 de seus meses (cada mês com a janela móvel oficial de 4 meses). Em quadrimestre em andamento, só entram os meses já iniciados.</p></div>'
    + '<div class="card ap-card" id="apPrioridades"></div>';

  desenharGrafico(pareto);
  desenharPrioridades();
}

// ---------- gráfico ----------
function destruirGrafico() { if (estado.chart) { try { estado.chart.destroy(); } catch (e) { /* ignore */ } estado.chart = null; } }

function desenharGrafico(pareto) {
  destruirGrafico();
  var canvas = el('apChart');
  if (!canvas || typeof Chart === 'undefined') return;
  var labels = pareto.map(function (i) { return i.rotulo; });
  estado.chart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { type: 'bar', label: 'Pontos perdidos', data: pareto.map(function (i) { return +i.perda.toFixed(2); }), yAxisID: 'y',
          backgroundColor: pareto.map(function (i) { return i.prioritario ? '#B5474B' : '#9DB3A6'; }), borderRadius: 6 },
        { type: 'line', label: '% acumulado', data: pareto.map(function (i) { return +i.acumulado.toFixed(1); }), yAxisID: 'y1',
          borderColor: '#1C6D53', backgroundColor: '#1C6D53', tension: 0.15, pointRadius: 4 },
        { type: 'line', label: '80%', data: pareto.map(function () { return 80; }), yAxisID: 'y1',
          borderColor: '#C68A3D', borderDash: [6, 6], pointRadius: 0, borderWidth: 1.5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Pontos perdidos' } },
        y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '% acumulado' }, ticks: { callback: function (v) { return v + '%'; } } }
      }
    }
  });
}

// ---------- prioridades ----------
var NIVEL = { alta: { rot: 'Alta', cls: 'ap-badge-alta' }, media: { rot: 'Média', cls: 'ap-badge-media' }, baixa: { rot: 'Baixa', cls: 'ap-badge-baixa' } };

function desenharPrioridades() {
  var box = el('apPrioridades');
  if (!box) return;
  var a = estado.analise;
  var html = '<h4 class="ap-h4">Prioridades e ações sugeridas</h4>'
    + '<p class="ap-sub">Aponta onde acompanhar primeiro e o que fazer para chegar mais perto da próxima classificação, com base nos quadrimestres e equipes escolhidos acima.</p>'
    + '<button type="button" class="pdf-btn ap-btn" id="apGerar"' + (estado.carregandoIa ? ' disabled' : '') + '><span>' + (estado.carregandoIa ? 'Analisando…' : 'Gerar análise') + '</span></button>';
  if (a) {
    html += '<div class="ap-resumo">' + escapeHtml(a.resumo) + '</div>';
    html += a.prioridades.map(function (p, i) {
      var n = NIVEL[p.nivel] || { rot: p.nivel, cls: '' };
      return '<div class="ap-prioridade"><div class="ap-prio-topo"><span class="ap-num">' + (i + 1) + '.</span> <b>' + escapeHtml(p.indicador) + '</b> <span class="ap-eq">— ' + escapeHtml(p.equipe) + '</span> <span class="ap-badge ' + n.cls + '">Prioridade ' + escapeHtml(n.rot) + '</span></div>'
        + '<p>' + escapeHtml(p.motivo) + '</p><ul>' + (p.acoes || []).map(function (x) { return '<li>' + escapeHtml(x) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    html += '<p class="ap-sub">' + (a.usouRegras
      ? 'Sugestões por regras fixas' + (urlIa() ? ' (a IA não respondeu agora)' : '') + ': são mais genéricas. Revise com a equipe antes de aplicar.'
      : 'Sugestões geradas por IA — revise com a equipe antes de aplicar.') + '</p>';
  }
  box.innerHTML = html;
  var btn = el('apGerar');
  if (btn) btn.addEventListener('click', gerarAnalise);
}

function urlIa() { return window.EMULTI_IA_URL || URL_IA; }

// Dados enviados à IA (um bloco por equipe/período, com os meses).
function dadosParaIa() {
  return estado.resultados.map(function (r) {
    var inds = [];
    if (r.classeM1 !== '—') inds.push({ indicador: NOME_INDICADOR.M1, peso: PESOS.M1, conceitoPeriodo: r.classeM1, valorPeriodo: r.m1, meses: r.meses.map(function (m) { return { mes: m.mes, valor: m.m1 }; }) });
    if (r.classeM2 !== '—') inds.push({ indicador: NOME_INDICADOR.M2, peso: PESOS.M2, conceitoPeriodo: r.classeM2, valorPeriodo: r.m2, meses: r.meses.map(function (m) { return { mes: m.mes, valor: m.m2 }; }) });
    return { equipe: r.equipe + ' (' + r.periodo + ')', notaFinal: r.nota, indicadores: inds };
  });
}

function gerarAnalise() {
  var regras = gerarPrioridadesRegras(estado.resultados);
  if (estado.indicador !== 'todos') {
    regras.prioridades = regras.prioridades.filter(function (p) { return p.codigo === estado.indicador; });
  }
  var url = urlIa();
  if (!url) { estado.analise = regras; desenharPrioridades(); return; }
  estado.carregandoIa = true; desenharPrioridades();
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 60000);
  fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contexto: 'emulti', dados: dadosParaIa() }), signal: ctrl ? ctrl.signal : undefined
  })
    .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j || !Array.isArray(j.prioridades)) throw new Error('resposta inválida'); return j; }); })
    .then(function (j) { estado.analise = { resumo: String(j.resumo || ''), prioridades: j.prioridades, usouRegras: false }; })
    .catch(function () { estado.analise = regras; })
    .then(function () { clearTimeout(timer); estado.carregandoIa = false; desenharPrioridades(); });
}

// ---------- ativação da aba ----------
function ativar() {
  montar();
  renderizar();
}

function iniciar() {
  document.querySelectorAll('.tab[data-tab="pareto"]').forEach(function (btn) {
    btn.addEventListener('click', function () { setTimeout(ativar, 0); });
  });
  window.addEventListener('resize', function () { if (estado.chart) { try { estado.chart.resize(); } catch (e) { /* ignore */ } } });
}
iniciar();
