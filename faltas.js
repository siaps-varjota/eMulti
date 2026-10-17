// Visão "Faltas" da aba Agendamentos.
//  1) Absenteísmo: realizados x faltas por profissional, unidade, turno e mês (a partir do histórico).
//  2) Faltas repetidas: quem está com N faltas seguidas, para a busca ativa.
// Lê os dados pelos ganchos expostos em agendamentos.js (window.__emultiFaltasDados).

var POUCOS_REGISTROS_F = 5; // abaixo disso a taxa oscila muito e a linha aparece em cinza

function elF(id) { return document.getElementById(id); }
function normF(v) {
  return String(v == null ? '' : v).trim().toLocaleLowerCase('pt-BR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}
function escF(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function isoF(v) {
  var s = String(v == null ? '' : v).trim(), m = s.match(/^(\d{4})-(\d\d)-(\d\d)/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
function brF(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d\d)-(\d\d)$/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}
function hojeF() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function turnoF(t) {
  var n = normF(t);
  return n === 'manha' ? 'Manhã' : (n === 'tarde' ? 'Tarde' : 'Sem turno');
}
function pctF(falt, tot) { return tot ? (falt * 100 / tot) : 0; }
function fmtPctF(p) { return p.toFixed(1).replace('.', ',') + '%'; }
function mesF(iso) { return iso.slice(5, 7) + '/' + iso.slice(0, 4); }

// ---------- dados ----------
function dadosF() {
  return window.__emultiFaltasDados ? window.__emultiFaltasDados() : { hist: [], linhas: [], erro: null, versao: '' };
}

// Só desfechos válidos, com data, já normalizados.
function registrosF(d) {
  var out = [];
  (d.hist || []).forEach(function (h) {
    var desf = h.Desfecho;
    if (desf !== 'Realizado' && desf !== 'Faltou') return;
    var data = isoF(h['Data agendada']);
    if (!data) return;
    out.push({
      nome: String(h.Nome || ''),
      chave: normF(h.Nome),
      data: data,
      prof: String(h.Profissional || '').trim() || 'Sem profissional definido',
      unid: String(h.Unidade || '').trim() || 'Sem unidade',
      turno: turnoF(h.Turno),
      falta: desf === 'Faltou'
    });
  });
  return out;
}

function agruparF(regs, chaveFn) {
  var mapa = {}, lista = [];
  regs.forEach(function (r) {
    var k = chaveFn(r);
    if (!mapa[k]) { mapa[k] = { k: k, real: 0, falt: 0, tot: 0 }; lista.push(mapa[k]); }
    if (r.falta) mapa[k].falt++; else mapa[k].real++;
    mapa[k].tot++;
  });
  return lista;
}

// ---------- filtros ----------
function filtroF() {
  return {
    prof: elF('faltasProf').value,
    de: elF('faltasDe').value,
    ate: elF('faltasAte').value,
    limiar: parseInt(elF('faltasLimiar').value, 10) || 2,
    semData: !!elF('faltasSemData').checked,
    busca: normF(elF('faltasBusca').value)
  };
}

function preencherProfissionaisF(regs) {
  var sel = elF('faltasProf'), atual = sel.value, vistos = {}, nomes = [];
  regs.forEach(function (r) { if (!vistos[r.prof]) { vistos[r.prof] = 1; nomes.push(r.prof); } });
  nomes.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  sel.innerHTML = '<option value="">Todos</option>' + nomes.map(function (n) {
    return '<option value="' + escF(n) + '">' + escF(n) + '</option>';
  }).join('');
  sel.value = vistos[atual] ? atual : '';
}

// ---------- 1) absenteísmo ----------
function tabelaF(titulo, linhas) {
  if (!linhas.length) return '<div><h4>' + escF(titulo) + '</h4><p class="faltas-vazio">Sem dados no período.</p></div>';
  var corpo = linhas.map(function (l) {
    var p = pctF(l.falt, l.tot);
    return '<tr' + (l.tot < POUCOS_REGISTROS_F ? ' class="faltas-pouco"' : '') + '><td>' + escF(l.k) + '</td><td>' + l.real +
      '</td><td>' + l.falt + '</td><td>' + l.tot + '</td><td><span class="faltas-barra"><i style="width:' +
      Math.min(100, p).toFixed(0) + '%"></i></span>' + fmtPctF(p) + '</td></tr>';
  }).join('');
  return '<div><h4>' + escF(titulo) + '</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>' +
    escF(titulo.replace(/^Por /, '').replace(/^./, function (c) { return c.toUpperCase(); })) +
    '</th><th>Realizados</th><th>Faltas</th><th>Total</th><th>% de faltas</th></tr></thead><tbody>' + corpo + '</tbody></table></div></div>';
}

function renderAbsenteismoF(regs, f) {
  var base = regs.filter(function (r) {
    if (f.prof && r.prof !== f.prof) return false;
    if (f.de && r.data < f.de) return false;
    if (f.ate && r.data > f.ate) return false;
    return true;
  });
  var falt = base.filter(function (r) { return r.falta; }).length, tot = base.length, real = tot - falt;

  elF('faltasResumo').innerHTML =
    '<div class="faltas-kpi"><b>' + tot + '</b><span>Baixas registradas</span></div>' +
    '<div class="faltas-kpi"><b>' + real + '</b><span>Realizados</span></div>' +
    '<div class="faltas-kpi alerta"><b>' + falt + '</b><span>Faltas</span></div>' +
    '<div class="faltas-kpi alerta"><b>' + (tot ? fmtPctF(pctF(falt, tot)) : '—') + '</b><span>Taxa de faltas</span></div>';

  function porTaxa(a, b) { return pctF(b.falt, b.tot) - pctF(a.falt, a.tot) || b.tot - a.tot; }
  var porProf = agruparF(base, function (r) { return r.prof; }).sort(porTaxa);
  var porUnid = agruparF(base, function (r) { return r.unid; }).sort(porTaxa);
  var porTurno = agruparF(base, function (r) { return r.turno; }).sort(porTaxa);
  var porMes = agruparF(base, function (r) { return mesF(r.data); }).sort(function (a, b) {
    return a.k.slice(3) + a.k.slice(0, 2) < b.k.slice(3) + b.k.slice(0, 2) ? -1 : 1;
  });

  elF('faltasTabelas').innerHTML =
    tabelaF('Por profissional', porProf) + tabelaF('Por unidade', porUnid) +
    tabelaF('Por turno', porTurno) + tabelaF('Por mês', porMes) +
    '<p class="faltas-nota" style="grid-column:1/-1;margin:0">Linhas em itálico têm menos de ' + POUCOS_REGISTROS_F +
    ' registros: a taxa oscila muito e não deve orientar decisões sozinha.</p>';
}

// ---------- 2a) todos os pacientes que faltaram ----------
var ultimaFaltososF = [];

function faltososF(regs, linhas, f) {
  var porPessoa = {}, ordem = [];
  regs.forEach(function (r) {
    if (!r.falta) return;
    if (f.prof && r.prof !== f.prof) return;
    if (f.de && r.data < f.de) return;
    if (f.ate && r.data > f.ate) return;
    if (f.busca && normF(r.nome).indexOf(f.busca) === -1) return;
    if (!porPessoa[r.chave]) { porPessoa[r.chave] = []; ordem.push(r.chave); }
    porPessoa[r.chave].push(r);
  });
  var mapaLinhas = {};
  (linhas || []).forEach(function (r) { mapaLinhas[normF(r.Nome)] = r; });
  var hoje = hojeF(), saida = [];

  ordem.forEach(function (chave) {
    var rs = porPessoa[chave].slice().sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
    var ultimo = rs[rs.length - 1], sit = situacaoAtualF(chave, mapaLinhas, hoje);
    if (f.semData && !sit.semData) return;
    saida.push({
      nome: ultimo.nome, faltas: rs.length, datas: rs.map(function (r) { return r.data; }), ultFalta: ultimo.data,
      prof: ultimo.prof, unid: ultimo.unid, situacao: sit.texto, semData: sit.semData
    });
  });
  saida.sort(function (a, b) {
    return b.faltas - a.faltas || (a.ultFalta < b.ultFalta ? 1 : (a.ultFalta > b.ultFalta ? -1 : 0)) ||
      a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return saida;
}

function datasTextoF(datas, max) {
  var t = datas.map(function (d) { return brF(d).slice(0, 5) + '/' + d.slice(2, 4); });
  return t.length > max ? t.slice(-max).join(', ') + ' (+' + (t.length - max) + ' antes)' : t.join(', ');
}

function renderFaltososF(regs, d, f) {
  var lista = faltososF(regs, d.linhas, f);
  ultimaFaltososF = lista;
  var box = elF('faltasFaltosos');
  if (!lista.length) {
    box.innerHTML = '<p class="faltas-vazio">Nenhum paciente com falta neste filtro.</p>';
    return;
  }
  var corpo = lista.map(function (p) {
    return '<tr><td>' + escF(p.nome) + '</td><td>' + p.faltas + '</td><td>' + escF(datasTextoF(p.datas, 8)) + '</td><td>' +
      escF(p.prof) + '</td><td>' + escF(p.unid) + '</td><td' + (p.semData ? ' class="faltas-sem-data"' : '') + '>' +
      escF(p.situacao) + '</td></tr>';
  }).join('');
  box.innerHTML = '<p class="faltas-vazio"><b>' + lista.length + '</b> ' + (lista.length === 1 ? 'paciente' : 'pacientes') + '.</p>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Paciente</th><th>Faltas</th><th>Datas das faltas</th>' +
    '<th>Profissional</th><th>Unidade</th><th>Situação atual</th></tr></thead><tbody>' + corpo + '</tbody></table></div>';
}

// ---------- 2b) faltas repetidas ----------
var ultimaListaF = []; // linhas exibidas, usadas na exportação

function situacaoAtualF(chave, mapaLinhas, hoje) {
  var r = mapaLinhas[chave];
  if (!r) return { texto: 'Fora da lista atual', semData: true };
  var sit = String(r.Situação || 'Pendente'), data = isoF(r['Data agendada']);
  if (sit === 'Agendado' && data && data >= hoje) return { texto: 'Agendado para ' + brF(data), semData: false };
  if (sit === 'Faltou') return { texto: 'Faltou — sem nova data', semData: true };
  if (sit === 'Cancelado') return { texto: 'Cancelado', semData: true };
  return { texto: sit + ' (sem data futura)', semData: true };
}

function repetidasF(regs, linhas, f) {
  var porPessoa = {}, ordem = [];
  regs.forEach(function (r) {
    if (!porPessoa[r.chave]) { porPessoa[r.chave] = []; ordem.push(r.chave); }
    porPessoa[r.chave].push(r);
  });
  var mapaLinhas = {};
  (linhas || []).forEach(function (r) { mapaLinhas[normF(r.Nome)] = r; });
  var hoje = hojeF(), saida = [];

  ordem.forEach(function (chave) {
    var rs = porPessoa[chave].slice().sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
    var seguidas = 0, total = 0, ultFalta = '';
    rs.forEach(function (r) {
      if (r.falta) { seguidas++; total++; ultFalta = r.data; } else { seguidas = 0; }
    });
    var ultimo = rs[rs.length - 1];
    if (seguidas < f.limiar) return;
    if (f.prof && ultimo.prof !== f.prof) return;
    if (f.busca && normF(ultimo.nome).indexOf(f.busca) === -1) return;
    var sit = situacaoAtualF(chave, mapaLinhas, hoje);
    if (f.semData && !sit.semData) return;
    saida.push({
      nome: ultimo.nome, seguidas: seguidas, total: total, ultFalta: ultFalta,
      prof: ultimo.prof, unid: ultimo.unid, situacao: sit.texto, semData: sit.semData
    });
  });

  saida.sort(function (a, b) {
    return b.seguidas - a.seguidas || (a.ultFalta < b.ultFalta ? 1 : (a.ultFalta > b.ultFalta ? -1 : 0)) ||
      a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return saida;
}

function renderRepetidasF(regs, d, f) {
  var lista = repetidasF(regs, d.linhas, f);
  ultimaListaF = lista;
  var box = elF('faltasRepetidas');
  if (!lista.length) {
    box.innerHTML = '<p class="faltas-vazio">Ninguém com ' + f.limiar + ' ou mais faltas seguidas' +
      (f.semData ? ' e sem nova data' : '') + (f.prof ? ' neste profissional' : '') + '.</p>';
    return;
  }
  var corpo = lista.map(function (p) {
    return '<tr><td>' + escF(p.nome) + '</td><td>' + p.seguidas + '</td><td>' + p.total + '</td><td>' + brF(p.ultFalta) +
      '</td><td>' + escF(p.prof) + '</td><td>' + escF(p.unid) + '</td><td' + (p.semData ? ' class="faltas-sem-data"' : '') + '>' +
      escF(p.situacao) + '</td></tr>';
  }).join('');
  box.innerHTML = '<p class="faltas-vazio"><b>' + lista.length + '</b> ' + (lista.length === 1 ? 'pessoa' : 'pessoas') + '.</p>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Pessoa</th><th>Faltas seguidas</th><th>Total de faltas</th>' +
    '<th>Última falta</th><th>Profissional</th><th>Unidade</th><th>Situação atual</th></tr></thead><tbody>' + corpo + '</tbody></table></div>';
}

function baixarCsvF(linhas, nomeArquivo) {
  function cel(v) { var s = String(v == null ? '' : v); return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  var csv = '\ufeff' + linhas.map(function (l) { return l.map(cel).join(';'); }).join('\r\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nomeArquivo + '-' + hojeF() + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

function exportarRepetidasF() {
  if (!ultimaListaF.length) return;
  var linhas = [['Pessoa', 'Faltas seguidas', 'Total de faltas', 'Última falta', 'Profissional', 'Unidade', 'Situação atual']];
  ultimaListaF.forEach(function (p) { linhas.push([p.nome, p.seguidas, p.total, brF(p.ultFalta), p.prof, p.unid, p.situacao]); });
  baixarCsvF(linhas, 'faltas-repetidas');
}

function exportarFaltososF() {
  if (!ultimaFaltososF.length) return;
  var linhas = [['Paciente', 'Faltas', 'Datas das faltas', 'Última falta', 'Profissional', 'Unidade', 'Situação atual']];
  ultimaFaltososF.forEach(function (p) {
    linhas.push([p.nome, p.faltas, p.datas.map(brF).join(', '), brF(p.ultFalta), p.prof, p.unid, p.situacao]);
  });
  baixarCsvF(linhas, 'pacientes-que-faltaram');
}

// ---------- tela ----------
function renderF() {
  if (!elF('agVisaoFaltas')) return;
  var d = dadosF(), regs = registrosF(d);
  preencherProfissionaisF(regs);
  var f = filtroF(), info = elF('faltasInfo');

  if (!regs.length) {
    info.className = 'agendamentos-feedback' + (d.erro ? ' erro' : '');
    info.textContent = d.erro
      ? 'Não foi possível ler o histórico da planilha. Use "Testar histórico" na tela Agendamentos para ver o motivo.'
      : 'Ainda não há baixas no histórico. Os dados começam a aparecer quando uma situação é marcada como Realizado ou Faltou.';
    elF('faltasResumo').innerHTML = '';
    elF('faltasTabelas').innerHTML = '';
    elF('faltasFaltosos').innerHTML = '';
    elF('faltasRepetidas').innerHTML = '';
    ultimaListaF = []; ultimaFaltososF = [];
    return;
  }

  info.className = 'agendamentos-feedback';
  info.textContent = regs.length + ' baixas no histórico' + (d.versao ? ' · Apps Script versão ' + d.versao : '') + '.';
  renderAbsenteismoF(regs, f);
  renderFaltososF(regs, d, f);
  renderRepetidasF(regs, d, f);
}

function iniciarF() {
  var pf = elF('agPillFaltas'), pl = elF('agPillLista'), pa = elF('agPillAgenda');
  var vf = elF('agVisaoFaltas'), vl = elF('agVisaoLista'), va = elF('agVisaoAgenda');
  if (!pf || !pl || !pa || !vf || !vl || !va) return;

  function visivel() {
    var p = elF('tabAgendamentos');
    return !!(p && p.classList.contains('active') && !vf.hidden);
  }
  function mostrarFaltas() {
    vl.hidden = true; va.hidden = true; vf.hidden = false;
    [pl, pa].forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    pf.classList.add('active'); pf.setAttribute('aria-selected', 'true');
    if (window.__emultiAgendaCarregar) window.__emultiAgendaCarregar();
    renderF();
  }
  function sairFaltas() {
    vf.hidden = true;
    pf.classList.remove('active'); pf.setAttribute('aria-selected', 'false');
  }

  pf.addEventListener('click', mostrarFaltas);
  // As visões Agendamentos e Agenda são controladas por agenda.js; aqui só garantimos que a Faltas some.
  pl.addEventListener('click', sairFaltas);
  pa.addEventListener('click', sairFaltas);
  window.addEventListener('emulti:agenda-dados', function () { if (visivel()) renderF(); });

  ['faltasProf', 'faltasDe', 'faltasAte', 'faltasLimiar', 'faltasSemData'].forEach(function (id) {
    elF(id).addEventListener('change', renderF);
  });
  elF('faltasBusca').addEventListener('input', renderF);
  elF('faltasLimpar').addEventListener('click', function () {
    elF('faltasProf').value = ''; elF('faltasDe').value = ''; elF('faltasAte').value = ''; elF('faltasBusca').value = '';
    renderF();
  });
  elF('faltasAtualizar').addEventListener('click', function () {
    if (window.__emultiFaltasAtualizar) window.__emultiFaltasAtualizar();
  });
  elF('faltasCsv').addEventListener('click', exportarRepetidasF);
  elF('faltasFaltososCsv').addEventListener('click', exportarFaltososF);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarF);
else iniciarF();
