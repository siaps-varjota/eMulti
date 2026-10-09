// ======================================================================
// abas.js
// Arquivo consolidado a partir dos módulos de js/ (ver MODULOS.md).
// Cada seção "=== módulo: ... ===" corresponde a um arquivo original.
// ======================================================================

import { CLASS_BANDS_M1, EQUIPES, OV_ICONS, PONTOS_POR_CLASSE, QUAD_LABELS, TOTAL_PROF_EMULTI_HEADER, addMonths, buildGauge, calcularJanelaPeriodo, calcularSerieTendencia, classificarM1, classificarM2, colIndex, colTotalProfEmulti, createMultiSelect, criarCalculadoraTotalProfEmulti, criarLigacaoAtividades, displayListName, ehProfissionalComparativoEmulti, equipeColIndex, escapeHtml, estadoApp, filtrarLinhasPorEquipe, fmtBRDate, fmtDec, fmtInt, gaugeInterpretationHTML, gaugeLegendHTML, kpiPanelHTML, kpiPanelIcon, mesesDosQuadsSelecionadosUniao, nomeEhDaEmulti, normalizeText, ovIconHTML, ovLegendHTML, ovStatus, parseBRDate, pillHex, profissionaisRoster, quadShortLabel, sheetToRows, suffixedName, ultimoMesDosQuadsSelecionados, withinPeriod } from './nucleo.js';
import { equipeLabelFromRaw, pdfComNumeracao, pdfLinhaProfissional, profissionalColIndex, slugifyFileName } from './listas.js';
import { latestRawSheets, latestWb } from './app.js';

// ===== módulo: js/abas/profissionais.js =====
// ======================================================================
// abas/profissionais.js
// Aba Panorama Assistencial (Desempenho Profissional)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Desempenho Profissional ----------
// Agrupa a Lista de Atendimentos (já filtrada por equipe no fetch) por
// "profissional" e, dentro de cada profissional, conta quantos
// atendimentos cada paciente (por nome) teve no período — igual à
// lógica do protótipo "Profissionais.html", mas com dados reais em vez
// de mock, renderizada com Chart.js igual ao protótipo original.
var PROF_LABELS = ['1 Consulta', '2 Consultas', '3 Consultas', '4+ Consultas'];

export var profListaAtual = [];

var profViewMode = 'percent';

 // 'percent' | 'absolute'
var profChartMain = null;

var profChartInstances = [];

 // donuts/barras individuais (recriados a cada render)

// Resolve as cores reais (hex) das variáveis CSS do painel — Chart.js
// desenha em <canvas>, que não entende "var(--x)" diretamente.
var PROF_COLORS_CACHE = null;

function getProfColors(){
  if(!PROF_COLORS_CACHE){
    var cs = getComputedStyle(document.documentElement);
    PROF_COLORS_CACHE = [
      cs.getPropertyValue('--pill-regular').trim() || '#B5474B',
      cs.getPropertyValue('--pill-suficiente').trim() || '#C68A3D',
      cs.getPropertyValue('--pill-bom').trim() || '#6B8F71',
      cs.getPropertyValue('--pill-otimo').trim() || '#2F6F5E'
    ];
  }
  return PROF_COLORS_CACHE;
}

export function calcularPerformanceProfissionais(wb, periodo){
  var ws = wb.Sheets[suffixedName("Atendimentos")];
  var rows = ws ? sheetToRows(ws) : [];
  var header = rows[0] || [];
  var iData = colIndex(header, "data_hora");
  var iNome = colIndex(header, "nome");
  var iProf = colIndex(header, "profissional");
  var iQtd = colIndex(header, "qtd_atendimentos");
  // Com 2+ equipes selecionadas ao mesmo tempo, um profissional que
  // atende em ambas apareceria com os atendimentos das duas somados
  // numa linha só (contagem de consultas por paciente ficaria errada,
  // misturando pacientes de equipes diferentes). Só nesse caso,
  // desambigua agrupando por profissional+equipe.
  var precisaSepararPorEquipe = estadoApp.currentEquipes.length > 1;
  var iEquipe = (iProf >= 0 && precisaSepararPorEquipe) ? equipeColIndex(header) : -1;

  // Contagem de atendimentos por profissional (chave INTERNA — nome
  // normalizado [+ equipe], nunca o rótulo exibido), cada uma com
  // {pacienteMaiusculo: contagem}. displayNamePorChave guarda o nome
  // "bonito" (como veio na aba Atendimentos) pra usar só no fallback
  // (ver abaixo), já que o roster da aba PROFISSIONAIS tem sua própria
  // grafia de nome, preferida quando disponível.
  var porProfInterno = {};
  var displayNamePorChaveInterna = {};
  if(iProf >= 0){
    rows.slice(1).forEach(function(r){
      var nome = String(r[iNome]||"").trim();
      var prof = String(r[iProf]||"").trim();
      if(!nome || !prof) return;
      if(!withinPeriod(parseBRDate(r[iData]), periodo.inicio, periodo.fim)) return;
      var equipeDaLinha = null;
      if(precisaSepararPorEquipe && iEquipe >= 0){
        var valorEquipe = normalizeText(r[iEquipe]);
        equipeDaLinha = EQUIPES.filter(function(eq){
          return valorEquipe.indexOf(normalizeText(eq.matchKeyword)) !== -1;
        })[0] || null;
      }
      var chaveInterna = normalizeText(prof) + (equipeDaLinha ? '|' + equipeDaLinha.key : '');
      if(!porProfInterno[chaveInterna]) porProfInterno[chaveInterna] = {};
      var chavePac = nome.toUpperCase();
      porProfInterno[chaveInterna][chavePac] = (porProfInterno[chaveInterna][chavePac]||0) + 1;
      if(!displayNamePorChaveInterna[chaveInterna]){
        displayNamePorChaveInterna[chaveInterna] = equipeDaLinha ? (prof + ' (' + equipeDaLinha.suffix + ')') : prof;
      }
    });
  }

  // A aba "PROFISSIONAIS" é quem decide QUEM aparece: só entram os
  // profissionais cadastrados em alguma das equipes selecionadas —
  // mesmo os que não tiveram nenhum atendimento no período (aparecem
  // com contagens zeradas, já que o objetivo aqui é mostrar o quadro
  // completo de profissionais da equipe, não só quem atendeu).
  var rosterFiltrado = profissionaisRoster.filter(function(p){
    return p.equipeKey && estadoApp.currentEquipes.some(function(eq){ return eq.key === p.equipeKey; });
  });

  var listaBase;
  if(rosterFiltrado.length){
    listaBase = rosterFiltrado.map(function(p){
      var equipeInfo = precisaSepararPorEquipe ? EQUIPES.filter(function(e){ return e.key === p.equipeKey; })[0] : null;
      var nomeExibicao = equipeInfo ? (p.nome + ' (' + equipeInfo.suffix + ')') : p.nome;
      var chaveInterna = normalizeText(p.nome) + (precisaSepararPorEquipe ? '|' + p.equipeKey : '');
      return {
        nome: nomeExibicao,
        categoria: p.categoria,
        pacientes: porProfInterno[chaveInterna] || {}
      };
    });
  } else if(iProf >= 0){
    // Fallback (aba PROFISSIONAIS ainda não carregou, está vazia ou
    // nenhuma linha bate com a(s) equipe(s) selecionada(s)): mantém o
    // comportamento antigo, derivando a lista direto de quem aparece
    // em Atendimentos, sem categoria.
    listaBase = Object.keys(porProfInterno).map(function(chaveInterna){
      return {nome: displayNamePorChaveInterna[chaveInterna], categoria: '', pacientes: porProfInterno[chaveInterna]};
    });
  } else {
    listaBase = [];
  }

  var comContagens = listaBase.map(function(item){
    var pacientes = item.pacientes;
    var c1=0, c2=0, c3=0, c4=0, totalAtend=0;
    Object.keys(pacientes).forEach(function(k){
      var n = pacientes[k];
      totalAtend += n;
      if(n===1) c1++; else if(n===2) c2++; else if(n===3) c3++; else c4++;
    });
    var totalPacientes = Object.keys(pacientes).length;
    var recorrentes = c2+c3+c4;
    return {
      nome: item.nome, categoria: item.categoria, c1:c1, c2:c2, c3:c3, c4:c4,
      totalPacientes: totalPacientes,
      totalAtendimentos: totalAtend,
      taxaRetorno: totalPacientes ? (recorrentes/totalPacientes*100) : null,
      media: totalPacientes ? (totalAtend/totalPacientes) : null
    };
  });
  // No fallback (sem roster), continua escondendo quem não teve
  // nenhum atendimento — não faz sentido listar um "profissional"
  // sem nenhuma linha em Atendimentos nesse caso. Com roster, todo
  // mundo cadastrado na equipe aparece, mesmo com 0 atendimentos.
  var listaFinal = rosterFiltrado.length ? comContagens : comContagens.filter(function(p){ return p.totalPacientes > 0; });
  return listaFinal.sort(function(a,b){ return b.totalPacientes - a.totalPacientes; });
}

// Dados do gráfico comparativo principal, no modo 'percent' (cada barra
// soma 100%) ou 'absolute' (contagem real) — mesma lógica de
// getChartData() do protótipo original.
function profMainChartData(lista, mode){
  return [0,1,2,3].map(function(i){
    return lista.map(function(p){
      var v = [p.c1,p.c2,p.c3,p.c4][i];
      if(mode !== 'percent') return v;
      var t = p.totalPacientes || 0;
      return t ? Math.round(v/t*100) : 0;
    });
  });
}

// Plugin do Chart.js que desenha o TOTAL (soma dos segmentos) logo após
// o fim de cada barra empilhada, tanto no modo Valores Absolutos quanto
// no modo Percentual (nesse caso, mostra o total real de pacientes, não
// "100%", que seria sempre igual em toda barra).
var profTotalLabelPlugin = {
  id: 'profTotalLabel',
  afterDatasetsDraw: function(chart){
    var cfg = chart.options.plugins && chart.options.plugins.profTotalLabel;
    var totals = cfg && cfg.totals;
    if(!totals || !chart.data.datasets.length) return;
    var meta = chart.getDatasetMeta(chart.data.datasets.length - 1);
    if(!meta || !meta.data) return;
    var ctx = chart.ctx;
    ctx.save();
    ctx.font = "600 11px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillStyle = '#1B2E27';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    meta.data.forEach(function(el, idx){
      var total = totals[idx];
      if(total === null || total === undefined) return;
      var pos = el.getProps ? el.getProps(['x','y'], true) : el;
      ctx.fillText(fmtInt(total), pos.x + 6, pos.y);
    });
    ctx.restore();
  }
};

function renderProfMainChart(lista){
  var canvas = document.getElementById('profStackedChart');
  if(!canvas || typeof Chart === 'undefined') return;
  var colors = getProfColors();
  var chartData = profMainChartData(lista, profViewMode);
  // Total de pacientes por profissional (soma dos 4 segmentos) — exibido
  // no fim da barra pelo profTotalLabelPlugin, independente do modo.
  var totals = lista.map(function(p){
    return p.totalPacientes != null ? p.totalPacientes : (p.c1+p.c2+p.c3+p.c4);
  });
  // Altura do canvas proporcional ao Nº de profissionais: sem isso, com
  // container de altura fixa e muitas barras, o Chart.js ativa autoSkip
  // no eixo Y e passa a esconder o nome de linhas alternadas (ou a cada
  // 3ª, dependendo de quantas cabem) pra não sobrepor o texto — ver
  // ticks.autoSkip:false abaixo, que só funciona de verdade se também
  // houver altura de sobra pra encaixar uma linha por profissional.
  var rowH = 42, minH = 220;
  var neededH = Math.max(minH, lista.length * rowH + 60);
  var wrap = canvas.parentElement;
  if(wrap) wrap.style.height = neededH + 'px';
  canvas.style.height = neededH + 'px';
  if(profChartMain){ profChartMain.destroy(); profChartMain = null; }
  profChartMain = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: lista.map(function(p){ return p.nome; }),
      datasets: PROF_LABELS.map(function(lbl,i){
        return {label: lbl, data: chartData[i], backgroundColor: colors[i]};
      })
    },
    plugins: [profTotalLabelPlugin],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      // Espaço reservado à direita das barras pro rótulo do total não
      // ficar cortado (principalmente no modo Percentual, onde toda
      // barra vai até o fim da escala).
      layout: { padding: { right: 42 } },
      scales: {
        x: {
          stacked: true,
          max: profViewMode==='percent' ? 100 : undefined,
          ticks: { callback: function(v){ return profViewMode==='percent' ? v+'%' : v; } }
        },
        y: {
          stacked: true,
          // autoSkip:false força o Chart.js a desenhar o nome de TODOS
          // os profissionais, mesmo que a fonte precise apertar um
          // pouco — sem isso, ele escondia nomes alternados pra não
          // sobrepor texto quando a altura do canvas era insuficiente.
          ticks: { autoSkip: false }
        }
      },
      plugins: {
        profTotalLabel: { totals: totals },
        tooltip: {
          callbacks: {
            label: function(ctx){
              var unit = profViewMode==='percent' ? '%' : ' pacientes';
              return ' '+ctx.dataset.label+': '+ctx.raw+unit;
            },
            footer: function(items){
              var idx = items && items.length ? items[0].dataIndex : null;
              if(idx === null || totals[idx] == null) return '';
              return 'Total: '+fmtInt(totals[idx])+' pacientes';
            }
          }
        }
      }
    }
  });
}

function setProfViewMode(mode){
  if(profViewMode === mode) return;
  profViewMode = mode;
  var pillPercent = document.getElementById('profPillPercent');
  var pillAbsolute = document.getElementById('profPillAbsolute');
  var title = document.getElementById('profMainChartTitle');
  if(pillPercent) pillPercent.classList.toggle('active', mode==='percent');
  if(pillAbsolute) pillAbsolute.classList.toggle('active', mode==='absolute');
  if(title) title.innerText = mode==='percent'
    ? 'Quadro Geral de Distribuição de Consultas por Profissional (%)'
    : 'Quadro Geral de Distribuição de Consultas  por Profissional (Valores Absolutos)';
  renderProfMainChart(profListaAtual);
}

export function renderPerformanceProfissionais(lista){
  profListaAtual = lista || [];

  profChartInstances.forEach(function(c){ try{ c.destroy(); }catch(e){} });
  profChartInstances = [];

  renderProfMainChart(profListaAtual);

  var gridEl = document.getElementById('profGrid');
  if(!gridEl) return;
  if(!profListaAtual.length){
    gridEl.innerHTML = '<p class="footnote">Nenhum profissional cadastrado (aba "PROFISSIONAIS") para esta equipe, e nenhum atendimento com profissional identificado neste período.</p>';
    return;
  }

  var colors = getProfColors();

  // ---- Card "Panorama da Equipe" ----
  // Consolida os números de todos os profissionais listados (mesma
  // conta de cada card individual, só que somada), pra dar uma visão
  // geral da equipe antes de descer pros cards por profissional. Não
  // deduplica paciente que passou por mais de um profissional — é a
  // soma direta dos totais já calculados por profissional.
  var equipe = profListaAtual.reduce(function(acc, p){
    acc.totalAtendimentos += p.totalAtendimentos || 0;
    acc.totalPacientes += p.totalPacientes || 0;
    acc.c1 += p.c1||0; acc.c2 += p.c2||0; acc.c3 += p.c3||0; acc.c4 += p.c4||0;
    return acc;
  }, {totalAtendimentos:0, totalPacientes:0, c1:0, c2:0, c3:0, c4:0});
  var equipeRecorrentes = equipe.c2 + equipe.c3 + equipe.c4;
  equipe.taxaRetorno = equipe.totalPacientes ? (equipeRecorrentes/equipe.totalPacientes*100) : null;
  equipe.media = equipe.totalPacientes ? (equipe.totalAtendimentos/equipe.totalPacientes) : null;
  var corRetornoEquipe = equipe.taxaRetorno==null ? 'var(--ink-soft)' : (equipe.taxaRetorno>=50 ? 'var(--pill-bom)' : 'var(--pill-regular)');
  var qtdProfissionais = profListaAtual.length;

  var cardEquipe = '<div class="card" style="margin-bottom:0;">'
    + '<div class="prof-header">'
    +   '<div class="prof-avatar">E</div>'
    +   '<div class="prof-info"><h3>PANORAMA DA EQUIPE</h3><span>'+fmtInt(qtdProfissionais)+' profissional'+(qtdProfissionais===1?'':'is')+' · '+fmtInt(equipe.totalAtendimentos)+' atendimentos no período</span></div>'
    + '</div>'
    + '<div class="kpi-container">'
    +   '<div class="kpi-item"><label>Pacientes Únicos</label><span>'+fmtInt(equipe.totalPacientes)+'</span></div>'
    +   '<div class="kpi-item"><label>Taxa Retorno</label><span style="color:'+corRetornoEquipe+';">'+(equipe.taxaRetorno==null?'—':fmtDec(equipe.taxaRetorno,0)+'%')+'</span></div>'
    +   '<div class="kpi-item"><label>Média Cons/Pac</label><span>'+(equipe.media==null?'—':fmtDec(equipe.media,1))+'</span></div>'
    + '</div>'
    + '<div class="card-charts-layout">'
    +   '<div class="chart-box"><canvas id="prof-donut-equipe"></canvas>'
    +     '<div class="donut-center-text"><span class="val">'+(equipe.taxaRetorno==null?'—':fmtDec(equipe.taxaRetorno,0)+'%')+'</span><span class="lbl">Retorno</span></div>'
    +   '</div>'
    +   '<div class="chart-box"><canvas id="prof-bar-equipe"></canvas></div>'
    + '</div>'
    + '</div>';

  gridEl.innerHTML = cardEquipe + profListaAtual.map(function(p, idx){
    var corRetorno = p.taxaRetorno==null ? 'var(--ink-soft)' : (p.taxaRetorno>=50 ? 'var(--pill-bom)' : 'var(--pill-regular)');
    return '<div class="card" style="margin-bottom:0;">'
      + '<div class="prof-header">'
      +   '<div class="prof-avatar">'+escapeHtml((p.nome.trim().charAt(0)||'?').toUpperCase())+'</div>'
      +   '<div class="prof-info"><h3>'+escapeHtml(p.nome)+'</h3><span>'+(p.categoria ? escapeHtml(p.categoria)+' · ' : '')+fmtInt(p.totalAtendimentos)+' atendimentos no período</span></div>'
      + '</div>'
      + '<div class="kpi-container">'
      +   '<div class="kpi-item"><label>Pacientes Únicos</label><span>'+fmtInt(p.totalPacientes)+'</span></div>'
      +   '<div class="kpi-item"><label>Taxa Retorno</label><span style="color:'+corRetorno+';">'+(p.taxaRetorno==null?'—':fmtDec(p.taxaRetorno,0)+'%')+'</span></div>'
      +   '<div class="kpi-item"><label>Média Cons/Pac</label><span>'+(p.media==null?'—':fmtDec(p.media,1))+'</span></div>'
      + '</div>'
      + '<div class="card-charts-layout">'
      +   '<div class="chart-box"><canvas id="prof-donut-'+idx+'"></canvas>'
      +     '<div class="donut-center-text"><span class="val">'+(p.taxaRetorno==null?'—':fmtDec(p.taxaRetorno,0)+'%')+'</span><span class="lbl">Retorno</span></div>'
      +   '</div>'
      +   '<div class="chart-box"><canvas id="prof-bar-'+idx+'"></canvas></div>'
      + '</div>'
      + '</div>';
  }).join('');

  if(typeof Chart === 'undefined') return;
  setTimeout(function(){
    // Donut/barra do card "Panorama da Equipe" — mesmos moldes dos
    // cards individuais, com ids fixos "-equipe" em vez de índice.
    var donutEquipeEl = document.getElementById('prof-donut-equipe');
    if(donutEquipeEl){
      profChartInstances.push(new Chart(donutEquipeEl, {
        type: 'doughnut',
        data: {
          labels: ['1 Consulta', 'Retornou (2+)'],
          datasets: [{ data: [equipe.c1, equipeRecorrentes], backgroundColor: [colors[0], colors[3]], borderWidth: 0 }]
        },
        options: { cutout: '75%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      }));
    }
    var barEquipeEl = document.getElementById('prof-bar-equipe');
    if(barEquipeEl){
      profChartInstances.push(new Chart(barEquipeEl, {
        type: 'bar',
        data: {
          labels: ['1', '2', '3', '4+'],
          datasets: [{ data: [equipe.c1,equipe.c2,equipe.c3,equipe.c4], backgroundColor: colors, borderRadius: 4 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { grid: { display: false } }, y: { display: false } }
        }
      }));
    }

    profListaAtual.forEach(function(p, idx){
      var recorrentes = p.c2+p.c3+p.c4;
      var donutEl = document.getElementById('prof-donut-'+idx);
      if(donutEl){
        profChartInstances.push(new Chart(donutEl, {
          type: 'doughnut',
          data: {
            labels: ['1 Consulta', 'Retornou (2+)'],
            datasets: [{ data: [p.c1, recorrentes], backgroundColor: [colors[0], colors[3]], borderWidth: 0 }]
          },
          options: { cutout: '75%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        }));
      }
      var barEl = document.getElementById('prof-bar-'+idx);
      if(barEl){
        profChartInstances.push(new Chart(barEl, {
          type: 'bar',
          data: {
            labels: ['1', '2', '3', '4+'],
            datasets: [{ data: [p.c1,p.c2,p.c3,p.c4], backgroundColor: colors, borderRadius: 4 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } }, y: { display: false } }
          }
        }));
      }
    });
  }, 50);
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_abas_profissionais(){
(function setupProfPills(){
    var pillPercent = document.getElementById('profPillPercent');
    var pillAbsolute = document.getElementById('profPillAbsolute');
    if(pillPercent) pillPercent.addEventListener('click', function(){ setProfViewMode('percent'); });
    if(pillAbsolute) pillAbsolute.addEventListener('click', function(){ setProfViewMode('absolute'); });
  })();
}

// ===== módulo: js/abas/analises/pdf.js =====
// ======================================================================
// abas/analises/pdf.js
// Aba Frequência e Retorno — PDFs (gráficos e lista de risco)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


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

// ===== módulo: js/abas/analises/risco.js =====
// ======================================================================
// abas/analises/risco.js
// Aba Frequência e Retorno — tabela de pacientes em risco e Excel
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


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

// ===== módulo: js/abas/m1-busca-ativa.js =====
// ======================================================================
// abas/m1-busca-ativa.js
// Aba M1 — Busca ativa
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// Valor sentinela (não é um índice numérico de coluna) usado no <select>
// "Filtrar por coluna…" pra representar o filtro virtual "Profissional
// da eMulti", que substitui as 5 colunas "profissional 1".."profissional
// 5" por uma única opção — o valor list combina as 5 colunas (linha
// bate se QUALQUER uma delas tiver um profissional da eMulti marcado),
// em vez do filtro normal de 1 coluna só.
export var PROF_EMULTI_FILTER_VALUE = 'prof_emulti';

// Valor sentinela do filtro virtual "AÇÃO M2" (Compartilhada/Específica),
// da lista "Participantes Ativ. Coletiva" — não é índice de coluna, é
// calculado na hora a partir da classificação de cada linha (ver
// classificarAcaoM2Participacao) e comparado com o texto já renderizado
// no selo da célula (ver applyFilters).
export var ACAO_M2_FILTER_VALUE = 'acao_m2';

// Nome exato da coluna calculada de dias sem atendimento (Busca-Ativa) —
// usado tanto pro filtro de coluna (que agrupa em faixas, não valor a
// valor) quanto pro cálculo em applyFilters.
export var DIAS_SEM_ATENDIMENTO_HEADER = "Dias sem Atendimento";

export var FAIXAS_DIAS_SEM_ATENDIMENTO = ['31–60', '61–90', '> 90'];

export function diasBucketLabel(raw){
  var n = parseInt(String(raw||"").trim(), 10);
  if(isNaN(n)) return null;
  if(n <= 60) return '31–60';
  if(n <= 90) return '61–90';
  return '> 90';
}

// ---------- Busca-Ativa (aba M1) ----------
// Lista, calculada aqui mesmo, das pessoas com ATENDIMENTO individual em
// atraso: mais de 30 dias desde a última consulta, mas ainda dentro da
// janela de 120 dias (a mesma janela usada pelo M1 — ver JANELA_MESES),
// sempre contando a partir do ÚLTIMO DIA DO MÊS ATUAL (não do dia de
// hoje, nem do mês filtrado no topo da página) — assim a lista mostra
// sempre quem vai "sair da janela" do indicador dentro do mês corrente.
// Critério de ordenação: 1º a data da última consulta, da mais antiga
// pra mais atual (quem está mais atrasado aparece primeiro); em caso de
// empate na data, 2º critério é a quantidade de consultas, crescente.
export function buscaAtivaCompute(){
  // Janela de referência da Busca-Ativa: os mesmos JANELA_MESES (4)
  // meses usados pelo M1/M2, terminando no mês ATUAL (não no mês
  // filtrado no topo da página — a Busca-Ativa não tem filtro de mês
  // próprio, é sempre "os últimos 4 meses a partir de hoje"). A coluna
  // "Atendimentos" mostrada na lista conta só os atendimentos DENTRO
  // dessa janela — não o total histórico da pessoa.
  var hoje = new Date();
  var mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  var janelaPeriodo = calcularJanelaPeriodo(mesAtual);
  var pessoasSet = {}; // nome em maiúsculas -> {nome, countPeriodo, ultima:Date, equipe, profissional}
  var atCached = estadoApp.latestSheets[suffixedName("Atendimentos")];
  if(atCached){
    var iData = colIndex(atCached.headers, "data_hora");
    var iNome = colIndex(atCached.headers, "nome");
    var iProf = colIndex(atCached.headers, "profissional");
    var iEquipe = equipeColIndex(atCached.headers);
    if(iData >= 0 && iNome >= 0){
      atCached.rows.forEach(function(r){
        var nome = String(r[iNome]||"").trim();
        var d = parseBRDate(r[iData]);
        if(!nome || !d) return;
        var chave = nome.toUpperCase();
        if(!pessoasSet[chave]) pessoasSet[chave] = {nome:nome, countPeriodo:0, ultima:null, equipe:'', profissional:''};
        // Só entra na contagem exibida se cair dentro da janela dos
        // últimos 4 meses — a "Última Consulta" (usada pra saber há
        // quantos dias a pessoa está sem atendimento) continua olhando
        // TODO o histórico, não só a janela.
        if(withinPeriod(d, janelaPeriodo.inicio, janelaPeriodo.fim)){
          pessoasSet[chave].countPeriodo++;
        }
        // Equipe/Profissional guardados são sempre os da ÚLTIMA consulta
        // (a mesma que aparece na coluna "Última Consulta"), não os do
        // primeiro atendimento encontrado.
        if(!pessoasSet[chave].ultima || d > pessoasSet[chave].ultima){
          pessoasSet[chave].ultima = d;
          pessoasSet[chave].equipe = iEquipe >= 0 ? equipeLabelFromRaw(r[iEquipe]) : '—';
          pessoasSet[chave].profissional = iProf >= 0 ? (String(r[iProf]||"").trim() || '—') : '—';
        }
      });
    }
  }
  // Fim do mês atual, zerado na hora (comparação só por dia) — usado só
  // pra decidir quem ENTRA na janela de busca ativa (a lista fica estável
  // o mês inteiro, ninguém entra/sai da janela de 30-120 dias no meio do
  // mês). Hoje, também zerado na hora, é usado à parte pra calcular o
  // valor REAL exibido na coluna "Dias sem Atendimento" — antes o mesmo
  // número (até fim do mês) era reaproveitado pra exibir, o que fazia a
  // coluna mostrar dias "do futuro" (ex.: última consulta 08/09 aparecia
  // como 53 dias em 07/10, quando o real era 29) — confundia "dias
  // projetados até o fim do mês" (critério de filtro) com "dias reais
  // desde a última consulta" (o que a coluna promete mostrar).
  var fimMes = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0);
  var hojeDiaZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  var MS_DIA = 24*60*60*1000;
  var lista = Object.keys(pessoasSet).map(function(k){ return pessoasSet[k]; })
    .map(function(p){
      var ultimaDiaZero = new Date(p.ultima.getFullYear(), p.ultima.getMonth(), p.ultima.getDate());
      var diasAteFimMes = Math.round((fimMes - ultimaDiaZero) / MS_DIA);
      var diasReais = Math.round((hojeDiaZero - ultimaDiaZero) / MS_DIA);
      return {nome:p.nome, count:p.countPeriodo, ultima:p.ultima, diasAteFimMes:diasAteFimMes, diasReais:diasReais, equipe:p.equipe, profissional:p.profissional};
    })
    // Janela: mais de 30 dias e no máximo 120 dias sem atendimento,
    // contados até o último dia do mês atual (critério de filtro — não é
    // o número exibido na coluna, ver diasReais acima).
    .filter(function(p){ return p.diasAteFimMes > 30 && p.diasAteFimMes <= 120; })
    .sort(function(a,b){
      var diffData = a.ultima - b.ultima;
      if(diffData !== 0) return diffData; // mais antiga primeiro
      return a.count - b.count; // 2º critério: menos consultas primeiro
    });
  return {
    headers: ["Nome","Equipe","Profissional","Última Consulta","Dias sem Atendimento","Atendimentos"],
    rows: lista.map(function(p){ return [p.nome, p.equipe, p.profissional, fmtBRDate(p.ultima), p.diasReais, p.count]; })
  };
}

export function populateSheetsCache(wb){
  estadoApp.latestSheets = {};
  // Mapa ID da atividade -> total de profissionais da eMulti (calculado a
  // partir de Participantes Ativ. Coletiva) pra exibir a coluna "Total de
  // Profissionais da EMulti" nas duas listas.
  var nomePartAba = suffixedName("Participantes Ativ. Coletiva");
  var wsPart = wb.Sheets[nomePartAba];
  var partRowsBrutas = wsPart ? sheetToRows(wsPart).filter(function(r){
    return r.some(function(c){ return String(c).trim() !== ""; });
  }) : [];
  var totalEmultiCalc = partRowsBrutas.length ? criarCalculadoraTotalProfEmulti(partRowsBrutas[0]) : null;
  wb.SheetNames.forEach(function(name){
    var rows = sheetToRows(wb.Sheets[name]).filter(function(r){
      return r.some(function(c){ return String(c).trim() !== ""; });
    });
    if(!rows.length) return;
    var headers = rows[0].map(function(h){ return String(h||"").trim() || "—"; });
    var dataRows = rows.slice(1);
    // A coluna "Status" da lista "Atendimentos" não deve aparecer nas
    // tabelas das abas M1 e M2 (pedido explícito) — removida aqui, só
    // deste cache de EXIBIÇÃO das listas, então nenhum cálculo (que lê
    // direto de wb.Sheets/latestWb) é afetado.
    if(displayListName(name) === "Atendimentos"){
      var statusIdx = colIndex(headers, "status");
      if(statusIdx >= 0){
        headers.splice(statusIdx, 1);
        dataRows = dataRows.map(function(r){
          var novaLinha = r.slice();
          novaLinha.splice(statusIdx, 1);
          return novaLinha;
        });
      }
    }
    // Se a planilha trouxer MAIS DE UMA coluna "Total de Profissionais da
    // EMulti" (inclusive com grafias diferentes, ex. "Profissionails" e
    // "Profissionais"), mantém só a PRIMEIRA e remove as demais da
    // EXIBIÇÃO — evita coluna duplicada com valores conflitantes.
    (function(){
      var idxs = [];
      headers.forEach(function(h, i){
        var t = normalizeText(h);
        if(t.indexOf("TOTAL") !== -1 && t.indexOf("PROFISSION") !== -1 && t.indexOf("EMULTI") !== -1) idxs.push(i);
      });
      if(idxs.length > 1){
        var remover = idxs.slice(1);
        headers = headers.filter(function(h, i){ return remover.indexOf(i) === -1; });
        dataRows = dataRows.map(function(r){
          return r.filter(function(c, i){ return remover.indexOf(i) === -1; });
        });
      }
    })();
    // Coluna virtual "Total de Profissionais da EMulti" (só na EXIBIÇÃO):
    // - Participantes Ativ. Coletiva: calculada linha a linha (Responsável
    //   + Profissional 1..5 que são da eMulti); se a planilha já trouxer
    //   uma coluna com esse nome, ela é mantida.
    // - Resumo Atividade Coletiva: a coluna de total de profissionais é
    //   SUBSTITUÍDA pelo valor de Participantes (ligação pelo ID da
    //   atividade); se não existir, é acrescentada no fim.
    var nomeExib = displayListName(name);
    if(nomeExib === "Participantes Ativ. Coletiva" && totalEmultiCalc && totalEmultiCalc.disponivel
       && colTotalProfEmulti(headers) < 0){
      var calcLinha = totalEmultiCalc.calcular;
      headers = headers.concat([TOTAL_PROF_EMULTI_HEADER]);
      dataRows = dataRows.map(function(r){ return r.concat([calcLinha(r)]); });
    } else if(nomeExib === "Resumo Atividade Coletiva" && partRowsBrutas.length){
      var ligacao = criarLigacaoAtividades(partRowsBrutas, headers);
      if(ligacao){
        var iTot = colTotalProfEmulti(headers);
        var acrescentar = iTot < 0;
        if(acrescentar){ headers = headers.concat([TOTAL_PROF_EMULTI_HEADER]); iTot = headers.length-1; }
        dataRows = dataRows.map(function(r){
          var nova = r.slice();
          var v = ligacao.total(r);
          if(v !== undefined) nova[iTot] = v;
          else if(acrescentar) nova[iTot] = "";
          return nova;
        });
      } else {
        console.warn('[Resumo Atividade Coletiva] não foi possível ligar às linhas de Participantes Ativ. Coletiva (sem ID em comum e sem data/equipe/responsável nas duas abas). cabeçalho Resumo:', headers, '| cabeçalho Participantes:', partRowsBrutas[0]);
      }
    }
    estadoApp.latestSheets[name] = {headers: headers, rows: dataRows};
  });
}

// ===== módulo: js/abas/analises/render.js =====
// ======================================================================
// abas/analises/render.js
// Aba Frequência e Retorno — gráficos, filtros próprios (Equipe/Quadrimestre/Profissional) e layout
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// Devolve true quando o profissional escolhido deixou de existir na lista
// (ex.: trocou de equipe) e o filtro voltou pra "Todos" — quem chamou
// precisa recalcular as análises, que ainda estavam com o filtro antigo.
function atualizarOpcoesProfissionaisAnalises(){
  if(!estadoApp.analisesProfissionalMs) return false;
  var rows = sheetToRows(((latestRawSheets || {})["Atendimentos"]) || []);
  rows = filtrarLinhasPorEquipe(rows, estadoApp.analisesEquipes);
  var header = rows[0] || [];
  var idxProf = profissionalColIndex(header);
  var nomes = {};
  if(idxProf >= 0){
    rows.slice(1).forEach(function(r){
      var nome = String(r[idxProf]||'').trim();
      if(!nome) return;
      nomes[nome] = true;
    });
  }
  var opts = Object.keys(nomes).sort(function(a,b){return a.localeCompare(b,'pt-BR');})
    .map(function(nome){return {value:nome,label:nome};});
  estadoApp.analisesProfissionalMs.setOptions([{value:'',label:'Todos'}].concat(opts));
  var zerou = false;
  if(estadoApp.analisesProfissional && !nomes[estadoApp.analisesProfissional]){ estadoApp.analisesProfissional = ''; zerou = true; }
  estadoApp.analisesProfissionalMs.setSelected([estadoApp.analisesProfissional]);
  return zerou;
}

export function renderAnalises(data){
  if(atualizarOpcoesProfissionaisAnalises()) data = calcularAnalises();
  estadoApp.analisesDataAtual = data;
  estadoApp.analisesChartInstances.forEach(function(c){ try{ c.destroy(); }catch(e){} });
  estadoApp.analisesChartInstances = [];

  var elIntervalos = document.getElementById('analisesIntervalos');
  var elFunil = document.getElementById('analisesFunil');
  var elRisco = document.getElementById('analisesRisco');
  var elRiscoResumo = document.getElementById('analisesRiscoResumo');
  var elTotal = document.getElementById('analisesTotalPacientes');
  if(!elIntervalos && !elFunil) return; // painel ainda não injetado no DOM

  if(!data || !data.totalPacientes){
    if(elTotal) elTotal.textContent = '—';
    if(elIntervalos) elIntervalos.innerHTML = '<p class="footnote">Ainda não há dados suficientes pra esta equipe/período/profissional.</p>';
    if(elFunil) elFunil.innerHTML = '';
    if(elRiscoResumo) elRiscoResumo.innerHTML = '';
    if(elRisco) elRisco.innerHTML = '';
    return;
  }

  if(elTotal) elTotal.textContent = fmtInt(data.totalPacientes) + ' pacientes · ' + fmtInt(data.totalAtendimentos || 0) + ' atendimentos';
  if(elIntervalos) elIntervalos.innerHTML = waterfallDiasSvg(data.intervalos);
  if(elFunil) elFunil.innerHTML = funnelHtml(data.funil);
  if(elRiscoResumo){
    if(!data.medianaBase){
      elRiscoResumo.innerHTML = '<p class="footnote" style="margin:0;">Ainda não há mediana histórica suficiente (1ª→2ª consulta) pra classificar quem está em dia, em risco ou em abandono consumado.</p>';
    }
    // Quando há mediana, o conteúdo (cards Total/Com 2+/Em dia/Em
    // risco/Abandono) é montado dentro de wireRiscoFiltros — ele já
    // recalcula esses números toda vez que um filtro da tabela abaixo
    // muda, em vez de deixá-los fixos no total geral sem filtro.
  }
  if(elRisco){
    elRisco.innerHTML = riscoTableHtml(data.risco);
    wireRiscoFiltros(data.risco, data.kpiRegistros, !!data.medianaBase, data.registrosTabela);
  }

  var freqEl = document.getElementById('analisesFreqLegenda');
  if(freqEl){
    var f = data.perfilFreq, tot = f.unica+f.ocasional+f.consolidado;
    function pct(n){ return tot ? Math.round(n/tot*100) : 0; }
    freqEl.innerHTML = ''
      + '<div class="kpi-item"><label>Consulta única</label><span>'+fmtInt(f.unica)+' ('+pct(f.unica)+'%)</span></div>'
      + '<div class="kpi-item"><label>Retorno ocasional (2-3)</label><span>'+fmtInt(f.ocasional)+' ('+pct(f.ocasional)+'%)</span></div>'
      + '<div class="kpi-item"><label>Vínculo consolidado (4+)</label><span>'+fmtInt(f.consolidado)+' ('+pct(f.consolidado)+'%)</span></div>'
      + '<div class="kpi-item"><label>Média de atendimentos por paciente</label><span>'+fmtDec(f.mediaConsultas,1)+'</span></div>'
      + '<div class="kpi-item"><label>Total de atendimentos no período</label><span>'+fmtInt(data.totalAtendimentos || 0)+'</span></div>';
  }

  if(typeof Chart === 'undefined') return;
  setTimeout(function(){
    var freqCanvas = document.getElementById('analisesFreqDonut');
    if(freqCanvas){
      var f = data.perfilFreq;
      var freqChart = new Chart(freqCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Consulta única','Retorno ocasional (2-3)','Vínculo consolidado (4+)'],
          datasets: [{ data: [f.unica,f.ocasional,f.consolidado], backgroundColor: ['#B5474B','#C68A3D','#2F6F5E'], borderWidth: 0 }]
        },
        options: {
          cutout: '65%', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels:{boxWidth:12, font:{size:13}} },
            tooltip: { bodyFont:{size:13}, titleFont:{size:13} }
          }
        }
      });
      estadoApp.analisesChartInstances.push(freqChart);
      setTimeout(function(){ try{ freqChart.resize(); }catch(e){} }, 0);
    }
    var semanaCanvas = document.getElementById('analisesDiaSemana');
    if(semanaCanvas){
      // Média dos totais por dia da semana (só dias com atendimento —
      // domingo/sábado zerados não puxam a média pra baixo).
      var totaisSemana = data.porDiaSemana.filter(function(v){ return v > 0; });
      var mediaLinhaSemana = totaisSemana.length ? totaisSemana.reduce(function(a,b){ return a+b; }, 0) / totaisSemana.length : null;
      var semanaChart = new Chart(semanaCanvas, {
        type: 'bar',
        plugins: [linhaMediaDiaPlugin],
        data: {
          labels: data.diasSemanaLabels,
          datasets: [{ data: data.porDiaSemana, backgroundColor: '#2F6F5E', borderRadius: 4, categoryPercentage:0.7, barPercentage:0.9 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { bodyFont:{size:13}, titleFont:{size:13} },
            linhaMediaDia: { valor: mediaLinhaSemana, cor: '#B5474B', texto: mediaLinhaSemana == null ? '' : 'Média: ' + fmtDec(mediaLinhaSemana,0) + ' atend./dia da semana' }
          },
          scales: {
            y: { beginAtZero: true, ticks: { font:{size:13} } },
            x: { ticks: { font:{size:13} } }
          }
        }
      });
      estadoApp.analisesChartInstances.push(semanaChart);
      // Mesmo ajuste do gráfico de comparativo por profissional logo
      // abaixo: se o canvas é criado com o card ainda "recuado" (ex.: a
      // aba Análises acabou de ficar visível e o layout do card vizinho
      // ainda não assentou), o Chart.js às vezes trava com a largura
      // antiga e as barras ficam espremidas do lado esquerdo, sobrando
      // espaço vazio à direita. Forçar um resize() explícito no próximo
      // tick corrige isso.
      setTimeout(function(){ try{ semanaChart.resize(); }catch(e){} }, 0);
    }
    var mediaSemanaCanvas = document.getElementById('analisesMediaDiaSemana');
    if(mediaSemanaCanvas){
      // Média geral por dia de atendimento: total de atendimentos ÷ total
      // de datas distintas com atendimento (ponderada, não a média simples
      // das barras).
      var somaAtend = data.porDiaSemana.reduce(function(a,b){ return a+b; }, 0);
      var somaDias = (data.diasDistintosSemana || []).reduce(function(a,b){ return a+b; }, 0);
      var mediaLinhaGeral = somaDias ? somaAtend/somaDias : null;
      var mediaSemanaChart = new Chart(mediaSemanaCanvas, {
        type: 'bar',
        plugins: [linhaMediaDiaPlugin],
        data: {
          labels: data.diasSemanaLabels,
          datasets: [{ data: data.mediaPorDiaSemana, backgroundColor: '#C68A3D', borderRadius: 4, categoryPercentage:0.7, barPercentage:0.9 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              bodyFont:{size:13}, titleFont:{size:13},
              callbacks: { label: function(ctx){ return 'Média: ' + fmtDec(ctx.parsed.y,1) + ' atendimentos/dia'; } }
            },
            linhaMediaDia: { valor: mediaLinhaGeral, cor: '#B5474B', texto: mediaLinhaGeral == null ? '' : 'Média geral: ' + fmtDec(mediaLinhaGeral,1) + ' atend./dia' }
          },
          scales: {
            y: { beginAtZero: true, ticks: { font:{size:13} } },
            x: { ticks: { font:{size:13} } }
          }
        }
      });
      estadoApp.analisesChartInstances.push(mediaSemanaChart);
      setTimeout(function(){ try{ mediaSemanaChart.resize(); }catch(e){} }, 0);
    }
    var compCanvas = document.getElementById('analisesCompProf');
    renderComparativoProfChart(compCanvas, data.comparativoProf, data.comparativoProf23);
  }, 50);
}

// Monta o gráfico de barras verticais "Comparativo por profissional",
// com as barras de tempo até a 2ª consulta e de 2ª até a 3ª consulta
// lado a lado (agrupadas) pra cada profissional, num só gráfico.
// Linhas médias exclusivas do gráfico da aba Análises.
// Cada linha usa a mesma cor da série/barras correspondente.
var analisesMediaPlugin = {
  id: 'analisesMediaPlugin',
  afterDraw: function(chart){
    if(!chart || !chart.chartArea || !chart.data || !chart.data.datasets) return;
    var ctx = chart.ctx;
    var yScale = chart.scales && chart.scales.y;
    if(!yScale) return;

    // Primeiro calcula a média de cada dataset, pra saber qual é a
    // menor e qual é a maior — o rótulo da menor média fica abaixo
    // da própria linha e o da maior fica acima dela, não importa
    // a ordem dos datasets no gráfico.
    var medias = chart.data.datasets.map(function(dataset){
      var valores = (dataset.data || []).filter(function(v){
        return typeof v === 'number' && isFinite(v);
      });
      if(!valores.length) return null;
      return valores.reduce(function(total, valor){ return total + valor; }, 0) / valores.length;
    });
    var valoresValidos = medias.filter(function(m){ return m != null; });
    var mediaMin = valoresValidos.length ? Math.min.apply(null, valoresValidos) : null;
    var mediaMax = valoresValidos.length ? Math.max.apply(null, valoresValidos) : null;

    ctx.save();
    chart.data.datasets.forEach(function(dataset, datasetIndex){
      var media = medias[datasetIndex];
      if(media == null) return;

      var y = yScale.getPixelForValue(media);
      var cor = Array.isArray(dataset.backgroundColor)
        ? dataset.backgroundColor[0]
        : (dataset.backgroundColor || '#2F6F5E');

      ctx.beginPath();
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = cor;
      ctx.globalAlpha = 0.95;
      ctx.moveTo(chart.chartArea.left, y);
      ctx.lineTo(chart.chartArea.right, y);
      ctx.stroke();

      // Média menor: rótulo abaixo da linha. Média maior: rótulo
      // acima da linha. (Se as duas médias forem iguais, cai no
      // caso "maior" — fica acima.)
      var ehMenor = media === mediaMin && media !== mediaMax;

      var texto = 'Média: ' + Math.round(media) + ' dias';
      ctx.setLineDash([]);
      ctx.font = "600 11px 'Inter', sans-serif";
      ctx.textAlign = 'left';
      ctx.textBaseline = ehMenor ? 'top' : 'bottom';
      ctx.fillStyle = cor;
      ctx.fillText(texto, chart.chartArea.left + 4, y + (ehMenor ? 4 : -4));
    });
    ctx.restore();
  }
};

// Linha de média tracejada pros gráficos de dia da semana. O valor, a
// cor e o texto vêm de options.plugins.linhaMediaDia (calculados em
// renderAnalises), então não depende dos valores das barras.
var linhaMediaDiaPlugin = {
  id: 'linhaMediaDia',
  afterDatasetsDraw: function(chart, args, opts){
    if(!opts || typeof opts.valor !== 'number' || !isFinite(opts.valor)) return;
    var yScale = chart.scales && chart.scales.y, area = chart.chartArea;
    if(!yScale || !area) return;
    var y = yScale.getPixelForValue(opts.valor);
    if(y < area.top || y > area.bottom) return;
    var cor = opts.cor || '#B5474B';
    var ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([7,5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = cor;
    ctx.moveTo(area.left, y);
    ctx.lineTo(area.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "600 11px 'Inter', sans-serif";
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    var texto = opts.texto || '';
    var w = ctx.measureText(texto).width;
    // fundo claro pra o texto não se perder em cima das barras
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(area.left + 2, y - 17, w + 8, 16);
    ctx.fillStyle = cor;
    ctx.fillText(texto, area.left + 6, y - 4);
    ctx.restore();
  }
};

function renderComparativoProfChart(canvas, comparativoProf, comparativoProf23){
  if(!canvas) return;
  // Não destrói o <canvas>: só esconde e mostra um aviso ao lado. Antes, o
  // aviso substituía o innerHTML do container, e uma renderização sem dados
  // (ex.: filtro sem resultado) apagava o canvas pra sempre — mesmo depois
  // de voltar a ter dados, o gráfico não reaparecia.
  var wrapVazio = canvas.parentElement;
  var avisoVazio = wrapVazio ? wrapVazio.querySelector('[data-aviso-vazio]') : null;
  if(!comparativoProf.length && !comparativoProf23.length){
    canvas.style.display = 'none';
    if(wrapVazio && !avisoVazio){
      avisoVazio = document.createElement('p');
      avisoVazio.className = 'footnote';
      avisoVazio.setAttribute('data-aviso-vazio','1');
      avisoVazio.textContent = 'Sem dados suficientes ainda.';
      wrapVazio.appendChild(avisoVazio);
    }
    return;
  }
  canvas.style.display = '';
  if(avisoVazio && avisoVazio.parentNode) avisoVazio.parentNode.removeChild(avisoVazio);
  // União dos profissionais que aparecem em qualquer um dos dois
  // União dos profissionais que aparecem em qualquer um dos dois
  // intervalos, ordenada crescente pela mediana de "até a 2ª consulta"
  // (1ª coluna) — profissional sem dado nessa coluna usa a mediana da
  // 2ª coluna como critério de desempate e fica ordenado por ela;
  // sem dado em nenhuma das duas fica por último, em ordem alfabética.
  var mapa12 = {}, mapa23 = {};
  comparativoProf.forEach(function(p){ mapa12[p.profissional] = p; });
  comparativoProf23.forEach(function(p){ mapa23[p.profissional] = p; });
  var nomesSet = {};
  comparativoProf.concat(comparativoProf23).forEach(function(p){ nomesSet[p.profissional] = true; });
  function valorOrdenacao(n){
    if(mapa12[n]) return mapa12[n].medianaDias;
    if(mapa23[n]) return mapa23[n].medianaDias;
    return null;
  }
  var nomes = Object.keys(nomesSet).sort(function(a,b){
    var va = valorOrdenacao(a), vb = valorOrdenacao(b);
    if(va == null && vb == null) return a.localeCompare(b, 'pt-BR');
    if(va == null) return 1;
    if(vb == null) return -1;
    if(va !== vb) return va - vb;
    return a.localeCompare(b, 'pt-BR');
  });
  var chart = new Chart(canvas, {
    type: 'bar',
    plugins: [analisesMediaPlugin],
    data: {
      labels: nomes,
      datasets: [
        {
          label: 'Até a 2ª consulta',
          data: nomes.map(function(n){ return mapa12[n] ? Math.round(mapa12[n].medianaDias) : null; }),
          backgroundColor:'#C68A3D', borderRadius:4, categoryPercentage:0.7, barPercentage:0.9
        },
        {
          label: '2ª até a 3ª consulta',
          data: nomes.map(function(n){ return mapa23[n] ? Math.round(mapa23[n].medianaDias) : null; }),
          backgroundColor:'#2F6F5E', borderRadius:4, categoryPercentage:0.7, barPercentage:0.9
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position:'top', labels:{boxWidth:12, font:{size:12}} },
        tooltip: { bodyFont:{size:13}, titleFont:{size:13} }
      },
      scales: {
        x: { ticks: { autoSkip:false, font:{size:13}, maxRotation:40, minRotation:0 } },
        y: { beginAtZero: true, ticks: { font:{size:13} }, title:{ display:true, text:'Mediana de dias' } }
      }
    }
  });
  estadoApp.analisesChartInstances.push(chart);
  // Redimensiona explicitamente no próximo tick — em alguns navegadores
  // o Chart.js não pega o tamanho certo do container se o gráfico foi
  // criado no mesmo instante em que a aba ficou visível.
  setTimeout(function(){ try{ chart.resize(); }catch(e){} }, 0);
}

// O painel "Frequência e Retorno" vem pronto do index.html (Funil em
// largura total; Perfil + Dia da semana lado a lado). Aqui reorganizamos
// o DOM existente, sem precisar editar o index.html:
//   linha 1: Funil de abandono | Perfil de frequência
//   linha 2: Atendimentos por dia da semana | Média de atendimentos por dia da semana
function ajustarLayoutAnalises(){
  if(document.getElementById('analisesMediaDiaSemana')) return; // já ajustado
  var funilEl = document.getElementById('analisesFunil');
  var donutEl = document.getElementById('analisesFreqDonut');
  var semanaEl = document.getElementById('analisesDiaSemana');
  if(!funilEl || !donutEl || !semanaEl) return;
  var cFunil = funilEl.closest('.card'), cPerfil = donutEl.closest('.card'), cSemana = semanaEl.closest('.card');
  if(!cFunil || !cPerfil || !cSemana) return;
  var oldRow = cPerfil.parentNode;
  function novaLinha(antesDe){
    var r = document.createElement('div');
    r.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;width:100%;max-width:none;box-sizing:border-box;align-self:stretch;grid-column:1/-1;';
    antesDe.parentNode.insertBefore(r, antesDe);
    return r;
  }
  function metade(c){
    c.style.flex = '1 1 0'; c.style.minWidth = '280px'; c.style.marginBottom = '0';
    c.style.width = 'auto'; c.style.maxWidth = 'none'; c.style.boxSizing = 'border-box';
  }
  var h4Ref = cSemana.querySelector('h4');
  var cMedia = document.createElement('div');
  cMedia.className = cSemana.className;
  cMedia.innerHTML = '<h4 style=\"margin-top:0;\">Média de atendimentos por dia da semana</h4>'
    + '<div class=\"chart-box-full\" style=\"height:220px;\"><canvas id=\"analisesMediaDiaSemana\"></canvas></div>';
  if(h4Ref && h4Ref.className) cMedia.querySelector('h4').className = h4Ref.className;
  var semanaBox = semanaEl.parentNode;
  if(semanaBox && semanaBox.style && semanaBox.style.height) cMedia.querySelector('.chart-box-full').style.height = semanaBox.style.height;

  var linha1 = novaLinha(cFunil);
  linha1.appendChild(cFunil); linha1.appendChild(cPerfil);
  var linha2 = novaLinha(cSemana);
  linha2.appendChild(cSemana); linha2.appendChild(cMedia);
  [cFunil,cPerfil,cSemana,cMedia].forEach(metade);
  // remove a linha antiga se ficou vazia
  if(oldRow && oldRow !== linha1 && oldRow !== linha2 && !oldRow.children.length && oldRow.parentNode) oldRow.parentNode.removeChild(oldRow);
}

// Injeta o botão da aba e o painel "Análises" no DOM (o HTML base do
// painel não precisa ser editado — a estrutura é montada aqui e
// aproveita as mesmas classes .tab/.tab-panel/.card já usadas nas
// outras abas, então herda o mesmo visual sem precisar de CSS extra).
function injetarAbaAnalises(){
  // A aba e o painel "Frequência e Retorno" agora ficam direto no
  // index.html (botão data-tab="analises" + <div id="tabAnalises">), assim
  // a ordem e os nomes das abas se ajustam só por lá. Se já existem, aqui
  // só ligamos os filtros. O código abaixo continua como reserva, caso
  // algum index.html antigo (sem essa aba) seja usado com este app.js.
  if(document.getElementById('tabAnalises')){
    ajustarLayoutAnalises();
    wireAnalisesFiltrosTopo();
    return;
  }
  var tabRef = document.querySelector('.tab');
  var panelRef = document.querySelector('.tab-panel');
  if(!tabRef || !panelRef || document.getElementById('tabAnalises')) return;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tab';
  btn.setAttribute('data-tab', 'analises');
  btn.textContent = 'Frequência e Retorno';
  var tabBar = tabRef.parentElement;
  var notasTab = tabBar.querySelector('.tab[data-tab="notas"]');
  if (notasTab) {
    tabBar.insertBefore(btn, notasTab);
  } else {
    tabBar.appendChild(btn);
  }
  // Reordena a aba "Tendência" (já existente no HTML) pra logo depois
  // de "Frequência e Retorno" — só move o BOTÃO na barra de abas; a
  // troca de aba é controlada pela classe "active" em cada botão (ver
  // wiring dos .tab logo abaixo, no fim do arquivo), não pela ordem dos
  // painéis no DOM, então não precisa mexer no painel #tabTendencia.
  var tendenciaTab = tabBar.querySelector('.tab[data-tab="tendencia"]');
  if (tendenciaTab && notasTab) {
    tabBar.insertBefore(tendenciaTab, notasTab);
  }

  var panel = document.createElement('div');
  panel.className = 'tab-panel';
  panel.id = 'tabAnalises';
  panel.innerHTML =
      // Só nesta aba: títulos (h3/h4) +10% e textos secundários
      // (legendas/observações/contador/label de filtro/campo de busca)
      // +20%, sobre os tamanhos padrão já usados no resto do painel.
      '<style>'
    +   '#tabAnalises h3{font-size:20.6px;}'
    +   '#tabAnalises h4{font-size:17.6px;}'
    +   '#tabAnalises .footnote{font-size:14.4px;}'
    +   '#tabAnalises .list-meta{font-size:14.4px;}'
    +   '#tabAnalises .list-month-filter-label{font-size:15px;}'
    +   '#tabAnalises .list-search{font-size:15.6px;}'
    +   '#tabAnalises #analisesFreqLegenda.kpi-item{min-width:0;}'
    +   '#tabAnalises #analisesFreqLegenda{min-width:0;flex:1 1 160px;box-sizing:border-box;}'
    +   '#tabAnalises #analisesFreqLegenda .kpi-item{min-width:0;max-width:100%;box-sizing:border-box;gap:2px;}'
    +   '#tabAnalises #analisesFreqLegenda .kpi-item label{font-size:12.5px;white-space:normal;margin:0;line-height:1.2;}'
    +   '#tabAnalises #analisesFreqLegenda .kpi-item span{font-size:15.6px;word-break:break-word;margin:0;line-height:1.2;}'
    + '</style>'
    + '<div class="card" style="margin-bottom:16px;">'
    +   '<h3 style="margin:0 0 4px;">Perfil de pacientes — '+'<span id="analisesTotalPacientes">—</span> pacientes no período</h3>'
    +   '<p class="footnote" style="margin:0 0 12px;">Estas análises usam um filtro de Equipe e Quadrimestre PRÓPRIO desta aba (independente do filtro do topo). Sem nenhum quadrimestre marcado, olham pro histórico completo de atendimentos.</p>'
    +   '<div class="list-filters">'
    +     '<div class="list-month-filter"><label class="list-month-filter-label">Quadrimestre</label><div class="ms-wrap" id="analisesQuadMs"></div></div>'
    +     '<div class="list-month-filter"><label class="list-month-filter-label">Equipe</label><div class="ms-wrap" id="analisesEquipeMs"></div></div>'
    +     '<div class="list-month-filter"><label class="list-month-filter-label">Profissional</label><div class="ms-wrap" id="analisesProfMs"></div></div>'
    +   '</div>'
    + '</div>'
    + '<div class="card" style="margin-bottom:16px;">'
    +   '<h4 style="margin-top:0;">Tempo entre consultas</h4>'
    +   '<div id="analisesIntervalos"></div>'
    + '</div>'
    + '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">'
    +   '<div class="card" style="flex:1 1 0;min-width:280px;margin-bottom:0;">'
    +     '<h4 style="margin-top:0;">Funil de abandono</h4>'
    +     '<div id="analisesFunil"></div>'
    +   '</div>'
    +   '<div class="card" style="flex:1 1 0;min-width:280px;margin-bottom:0;">'
    +     '<h4 style="margin-top:0;">Perfil de frequência</h4>'
    +     '<div class="card-charts-layout card-charts-layout--lg">'
    +       '<div class="chart-box"><canvas id="analisesFreqDonut"></canvas></div>'
    +       '<div id="analisesFreqLegenda" class="kpi-container kpi-legend-vertical" style="flex-direction:column;align-items:stretch;gap:6px;"></div>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">'
    +   '<div class="card" style="flex:1 1 0;min-width:280px;margin-bottom:0;">'
    +     '<h4 style="margin-top:0;">Atendimentos por dia da semana</h4>'
    +     '<div class="chart-box-full" style="height:220px;"><canvas id="analisesDiaSemana"></canvas></div>'
    +   '</div>'
    +   '<div class="card" style="flex:1 1 0;min-width:280px;margin-bottom:0;">'
    +     '<h4 style="margin-top:0;">Média de atendimentos por dia da semana</h4>'
    +     '<div class="chart-box-full" style="height:220px;"><canvas id="analisesMediaDiaSemana"></canvas></div>'
    +   '</div>'
    + '</div>'
    + '<div class="card" style="margin-bottom:16px;">'
    +   '<h4 style="margin-top:0;">Tempo até a 2ª e da 2ª até a 3ª consulta de acordo com o Profissional</h4>'
    +   '<div class="chart-box-full" style="height:260px;"><canvas id="analisesCompProf"></canvas></div>'
    + '</div>'
    + '<div class="card">'
    +   '<h4 style="margin-top:0;">Pacientes em risco de abandono</h4>'
    +   '<p class="footnote" style="margin-top:0;line-height:1.5;">Pacientes com 2+ consultas cujo último atendimento já passou da mediana histórica de retorno da equipe, mas ainda dentro de uma janela em que voltar é plausível. Quando o paciente tem 2 ou mais profissionais no histórico, o nome <b>que aparece visível</b> na coluna "Profissional" é de quem realizou a última consulta. <b>Dias restantes</b> é uma estimativa: quanto falta pra passar de 3x a mediana histórica de retorno (limite de abandono consumado); depois disso aparece "Ultrapassou há X dias". <b>Última participação coletiva</b> é só informativa — não entra no cálculo de risco.</p>'
    +   '<div id="analisesRiscoResumo" style="margin-bottom:14px;"></div>'
    +   '<div id="analisesRisco"></div>'
    + '</div>';
  panelRef.parentElement.appendChild(panel);
  wireAnalisesFiltrosTopo();
}

// Liga os filtros PRÓPRIOS da aba Análises (Quadrimestre multisselect +
// Equipe), independentes do filtro do topo — mudar qualquer um dos dois
// recalcula e redesenha só esta aba (calcularAnalises usa analisesEquipes/
// analisesQuads direto do cache bruto, sem precisar buscar a planilha de
// novo). Chamada uma única vez, junto com injetarAbaAnalises.
function wireAnalisesFiltrosTopo(){
  var quadContainer = document.getElementById('analisesQuadMs');
  var equipeContainer = document.getElementById('analisesEquipeMs');
  if(!quadContainer || !equipeContainer) return;
  // O index.html atual não tem o campo "Profissional": cria aqui, logo
  // depois do filtro de Equipe. Sem isso, esta função abortava e NENHUM
  // dos filtros da aba (Quadrimestre/Equipe/Profissional) era ligado.
  var profissionalContainer = document.getElementById('analisesProfMs');
  if(!profissionalContainer){
    var wrapProf = document.createElement('div');
    wrapProf.className = 'list-month-filter';
    wrapProf.innerHTML = '<label class="list-month-filter-label">Profissional</label><div class="ms-wrap" id="analisesProfMs"></div>';
    var wrapEquipe = equipeContainer.closest('.list-month-filter') || equipeContainer.parentElement;
    wrapEquipe.parentNode.insertBefore(wrapProf, wrapEquipe.nextSibling);
    profissionalContainer = wrapProf.querySelector('#analisesProfMs');
  }

  function recalcularERedesenhar(){
    renderAnalises(calcularAnalises());
  }

  // Botão "Gerar PDF" (gráficos da aba) no mesmo container dos filtros.
  if(!document.getElementById('btnAnalisesPdf')){
    var filtrosBox = equipeContainer.closest('.list-filters') || equipeContainer.parentElement.parentElement;
    var wrapPdf = document.createElement('div');
    wrapPdf.className = 'list-month-filter';
    wrapPdf.style.alignSelf = 'flex-end';
    wrapPdf.innerHTML = '<button type="button" class="pdf-btn" id="btnAnalisesPdf">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h1a1.5 1.5 0 0 0 0-3H9v5"/><path d="M13 12v5h1a2 2 0 0 0 0-5z"/></svg>'
      + '<span>Gerar PDF</span></button>';
    filtrosBox.appendChild(wrapPdf);
    wrapPdf.querySelector('button').addEventListener('click', gerarPdfGraficosAnalises);
  }

  var TODAS_KEY = 'todas';
  var analisesEquipeMs = createMultiSelect(equipeContainer, {
    placeholder: 'Selecione', multi: false, search: false,
    onChange: function(keys){
      estadoApp.analisesEquipes = keys[0] === TODAS_KEY ? EQUIPES.slice()
        : EQUIPES.filter(function(eq){ return eq.key === keys[0]; });
      atualizarOpcoesProfissionaisAnalises();
      recalcularERedesenhar();
    }
  });
  analisesEquipeMs.setOptions(
    EQUIPES.map(function(eq){ return {value: eq.key, label: eq.label}; })
      .concat([{value: TODAS_KEY, label: 'Todas'}])
  );
  analisesEquipeMs.setSelected([estadoApp.analisesEquipes.length > 1 ? TODAS_KEY : estadoApp.analisesEquipes[0].key]);

  var analisesQuadMs = createMultiSelect(quadContainer, {
    placeholder: 'Histórico completo', multi: true, search: false, showTags: true,
    onChange: function(keys){
      estadoApp.analisesQuads = keys.map(function(k){
        var parts = k.split('-');
        return {ano: +parts[0], qIndex: +parts[1]};
      });
      atualizarOpcoesProfissionaisAnalises();
      recalcularERedesenhar();
    }
  });
  var anoAtual = new Date().getFullYear();
  var mesAtualIdx = new Date().getMonth();
  var qAtual = Math.floor(mesAtualIdx/4);
  var quadOpts = [];
  for(var ano=anoAtual; ano>=anoAtual-2; ano--){
    for(var q=2; q>=0; q--){
      if(ano===anoAtual && q>qAtual) continue; // não mostra quadrimestre futuro do ano atual
      quadOpts.push({value: ano+'-'+q, label: QUAD_LABELS[q]+'/'+ano});
    }
  }
  analisesQuadMs.setOptions(quadOpts);
  analisesQuadMs.setSelected(estadoApp.analisesQuads.map(function(q){ return q.ano+'-'+q.qIndex; }));

  estadoApp.analisesProfissionalMs = createMultiSelect(profissionalContainer, {
    placeholder: 'Todos', multi: false, search: true,
    onChange: function(keys){
      estadoApp.analisesProfissional = keys[0] || '';
      renderAnalises(calcularAnalises());
    }
  });
  atualizarOpcoesProfissionaisAnalises();
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_abas_analises_render(){
injetarAbaAnalises();
}

// ===== módulo: js/abas/m1-m2.js =====
// ======================================================================
// abas/m1-m2.js
// Abas M1 / M2 — cards, metas e layout
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


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
export function ipGaugeCardHTML(value, domainMax, bands, gaugeId, valueHtml, classLabel, capText, anterior, decimals, suffix, legend, iconKind){
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
export function nextTierInfo(classLabel, bands){
  var idx = -1;
  for(var i=0;i<bands.length;i++){ if(bands[i].classe===classLabel){ idx=i; break; } }
  if(idx<0 || idx>=bands.length-1) return null;
  return {label: bands[idx+1].classe, threshold: bands[idx+1].from};
}

// Bloco "Leitura do M1/M2" (abaixo das 3 colunas): resume em texto o
// valor atual, a variação em relação ao período anterior e o que falta
// pra subir de faixa.
export function ipReadingHTML(title, value, classLabel, anterior, decimals, suffix, bands, unitLabel){
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
export var METAS_ICON_SVG;

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
export function metaQuadrimestreHTML(titulo, base, baseLabel, cardsCfg, preliminar, projecaoLabel){
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
export function metaQuadrimestreMiniHTML(base, baseLabel, cardsCfg, preliminar, projecaoLabel){
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

export function calcularMetasQuadrimestre(numerador, denominador, thresholds, unidade, unidadeFaltam){
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

export var M1_META_THRESHOLDS = [
  {value:2,   label:'Bom (M1 ≥ 2,00)',   color:'var(--arc-bom)'},
  {value:3,   label:'Ótimo (M1 ≥ 3,00)', color:'var(--arc-otimo)'}
];

export var M2_META_THRESHOLDS = [
  {value:0.025, label:'Bom (M2 ≥ 2,50%)',  color:'var(--arc-bom)'},
  {value:0.05,  label:'Ótimo (M2 ≥ 5,00%)', color:'var(--arc-otimo)'}
];

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_abas_m1_m2(){
  METAS_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'
    + '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.3"/><circle cx="12" cy="12" r="1"/></svg>';
}

// ===== módulo: js/abas/geral-cards.js =====
// ======================================================================
// abas/geral-cards.js
// Aba Visão geral — cartões, evolução e quadrimestre anterior
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// Quadrimestre imediatamente anterior ao selecionado, calculado com a
// MESMA metodologia do quadrimestre atual (média do m1/m2 de cada um dos
// 4 meses, cada um já com sua janela móvel oficial — ver mediaDeMeses) —
// usado só pro bloco "Evolução - Quadrimestre" dos cartões da Visão
// geral. Retorna null nos campos que não tiverem os 4 meses de dado
// disponíveis (aí o cartão mostra "Sem histórico" pra aquele indicador).
export function calcularQuadrimestreAnterior(){
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

export function evoTrackHTML(atual, anterior, domainMax, decimals, suffix, bands, classLabel){
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
export function overviewCardHTML(opts){
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

// ===== módulo: js/abas/tendencia.js =====
// ======================================================================
// abas/tendencia.js
// Aba Tendência — barras empilhadas, sparkline e interatividade
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Composition bars ----------
export function stackbar(segments, total){
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
export function sparkline(points, color, opts){
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
export function setupTrendInteractivity(){
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
export function setupPreliminarToggle(){
  var btn = document.getElementById('trendPreliminarToggle');
  if(!btn) return;
  var card = btn.closest('.trend-card-combo');
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    var active = btn.classList.toggle('active');
    if(card) card.classList.toggle('show-preliminar', active);
  });
}

// ===== módulo: js/abas/analises/calculo.js =====
// ======================================================================
// abas/analises/calculo.js
// Aba Frequência e Retorno — históricos, intervalos, funil e risco (cálculo)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================


// ---------- Aba "Análises" (perfil de paciente / tempo entre consultas) ----------
// Diferente das outras abas, aqui NÃO se aplica o filtro de Quadrimestre/
// Mês do topo: intervalo entre consultas, funil de abandono etc. olham
// pro HISTÓRICO INTEIRO do paciente na equipe selecionada (wb.Sheets já
// vem filtrado por equipe — ver fetchAndLoad/filtrarLinhasPorEquipe —,
// só não filtramos mais por período aqui).
var DIA_MS;

function diffDias(a,b){ return Math.round((b-a)/DIA_MS); }

function mediana(arr){
  if(!arr || !arr.length) return null;
  var s = arr.slice().sort(function(a,b){ return a-b; });
  var mid = Math.floor(s.length/2);
  return s.length%2 ? s[mid] : (s[mid-1]+s[mid])/2;
}

function percentil(arr, p){
  if(!arr || !arr.length) return null;
  var s = arr.slice().sort(function(a,b){ return a-b; });
  var idx = (s.length-1)*p;
  var lo = Math.floor(idx), hi = Math.ceil(idx);
  if(lo===hi) return s[lo];
  return s[lo] + (s[hi]-s[lo])*(idx-lo);
}

// Monta, por paciente (nome em maiúsculas), a lista ORDENADA de datas de
// atendimento e o conjunto de profissionais que o atenderam — base pra
// todas as análises abaixo. Usa a aba Atendimentos BRUTA (todas as
// equipes, cache latestRawSheets), filtrada aqui mesmo pela Equipe e,
// se houver, pelo(s) Quadrimestre(s) marcados no filtro PRÓPRIO desta
// aba (analisesEquipes/analisesQuads) — independente do filtro global
// do topo e do filtro de Quadrimestre/Mês usado nas outras abas.
function construirHistoricosPacientes(){
  var rows = sheetToRows(latestRawSheets["Atendimentos"] || []);
  rows = filtrarLinhasPorEquipe(rows, estadoApp.analisesEquipes);
  var header = rows[0] || [];
  var iData = colIndex(header, "data_hora");
  var iNome = colIndex(header, "nome");
  var iProf = colIndex(header, "profissional");
  var iQtd = colIndex(header, "qtd_atendimentos");
  if(iData < 0 || iNome < 0) return [];
  // Com 2+ equipes selecionadas ao mesmo tempo neste filtro, um mesmo
  // paciente pode ter atendimentos vindos de equipes diferentes —
  // guarda qual(is) equipe(s) de fato atenderam cada paciente (coluna
  // "equipe_unidade"), usado só pra exibir a coluna "Equipe" na lista
  // de risco de abandono. Com 1 equipe só selecionada não precisa nem
  // olhar a coluna: já é a mesma pra todo mundo (ver risco.push, mais
  // abaixo).
  var precisaSepararPorEquipe = estadoApp.analisesEquipes.length > 1;
  var iEquipe = precisaSepararPorEquipe ? equipeColIndex(header) : -1;
  // Nenhum quadrimestre marcado (padrão) = sem restrição de período,
  // olha pro histórico inteiro. 1+ marcados: só datas dentro de algum
  // desses quadrimestres entram no cálculo.
  var faixasQuad = estadoApp.analisesQuads.map(function(q){
    var inicio = new Date(q.ano, q.qIndex*4, 1, 0,0,0,0);
    var fim = new Date(q.ano, q.qIndex*4+4, 0, 23,59,59,999);
    return {inicio:inicio, fim:fim};
  });
  function dataDentroDoFiltro(d){
    return !faixasQuad.length || faixasQuad.some(function(f){ return d >= f.inicio && d <= f.fim; });
  }
  var porPaciente = {};
  rows.slice(1).forEach(function(r){
    var nome = String(r[iNome]||"").trim();
    var d = parseBRDate(r[iData]);
    var prof = iProf >= 0 ? String(r[iProf]||"").trim() : "";
    if(!nome || !d) return;
    if(!dataDentroDoFiltro(d)) return;
    if(estadoApp.analisesProfissional && prof !== estadoApp.analisesProfissional) return;
    var chave = nome.toUpperCase();
    if(!porPaciente[chave]) porPaciente[chave] = {nome:nome, datas:[], profissionais:{}, consultasPorProf:{}, ultimaDataPorProf:{}, equipes:{}, ultimaData:null, ultimaProfissionais:{}, totalAtendimentos:0};
    var p = porPaciente[chave];
    var qtd = iQtd >= 0 ? Number(String(r[iQtd]||'').replace(',', '.')) : 1;
    if(!isFinite(qtd) || qtd < 0) qtd = 1;
    p.totalAtendimentos += qtd;
    p.datas.push(d);
    if(prof){
      p.profissionais[prof] = true;
      p.consultasPorProf[prof] = (p.consultasPorProf[prof] || 0) + 1;
      // Última data em que ESSE profissional específico atendeu o
      // paciente (independente de ser ou não quem fez a última consulta
      // geral) — usada pro popover "Também atendido por" na lista de
      // risco de abandono (ver risco.push, mais abaixo).
      if(!p.ultimaDataPorProf[prof] || d.getTime() > p.ultimaDataPorProf[prof].getTime()){
        p.ultimaDataPorProf[prof] = d;
      }
    }
    // Guarda o(s) profissional(is) da consulta MAIS RECENTE (por data) de
    // cada paciente, pra poder destacar quem de fato atendeu na última
    // consulta quando o paciente tem 2+ profissionais no histórico (ver
    // uso em "risco de abandono", mais abaixo).
    if(!p.ultimaData || d.getTime() > p.ultimaData.getTime()){
      p.ultimaData = d;
      p.ultimaProfissionais = {};
      if(prof) p.ultimaProfissionais[prof] = true;
    } else if(d.getTime() === p.ultimaData.getTime() && prof){
      p.ultimaProfissionais[prof] = true;
    }
    if(precisaSepararPorEquipe && iEquipe >= 0){
      var valorEquipe = normalizeText(r[iEquipe]);
      var equipeDaLinha = EQUIPES.filter(function(eq){
        return valorEquipe.indexOf(normalizeText(eq.matchKeyword)) !== -1;
      })[0];
      if(equipeDaLinha) porPaciente[chave].equipes[equipeDaLinha.label] = true;
    }
  });
  return Object.keys(porPaciente).map(function(k){
    var p = porPaciente[k];
    p.datas.sort(function(a,b){ return a-b; });
    return p;
  });
}

export function calcularAnalises(){
  var pacientes = construirHistoricosPacientes();
  if(!pacientes.length) return {totalPacientes:0, pacientes:[]};

  // Intervalo (em dias) entre 1ª→2ª, 2ª→3ª, 3ª→4ª, 4ª→5ª consulta de
  // cada paciente que já teve consultas suficientes pra cada transição.
  var brutos = {t12:[], t23:[], t34:[], t45:[]};
  pacientes.forEach(function(p){
    var d = p.datas;
    if(d.length>=2) brutos.t12.push(diffDias(d[0], d[1]));
    if(d.length>=3) brutos.t23.push(diffDias(d[1], d[2]));
    if(d.length>=4) brutos.t34.push(diffDias(d[2], d[3]));
    if(d.length>=5) brutos.t45.push(diffDias(d[3], d[4]));
  });
  function resumo(arr){
    if(!arr.length) return null;
    return {n:arr.length, min:Math.min.apply(null,arr), p25:percentil(arr,0.25), mediana:mediana(arr), p75:percentil(arr,0.75), max:Math.max.apply(null,arr)};
  }
  var intervalos = [
    {chave:'t12', label:'1ª → 2ª consulta', stats: resumo(brutos.t12)},
    {chave:'t23', label:'2ª → 3ª consulta', stats: resumo(brutos.t23)},
    {chave:'t34', label:'3ª → 4ª consulta', stats: resumo(brutos.t34)},
    {chave:'t45', label:'4ª → 5ª consulta', stats: resumo(brutos.t45)}
  ];

  // Funil de abandono: quantos pacientes chegam a cada "degrau".
  var funil = [
    {label:'1ª consulta', n: pacientes.length},
    {label:'2ª consulta', n: pacientes.filter(function(p){return p.datas.length>=2;}).length},
    {label:'3ª consulta', n: pacientes.filter(function(p){return p.datas.length>=3;}).length},
    {label:'4ª+ consulta', n: pacientes.filter(function(p){return p.datas.length>=4;}).length}
  ];

  // Perfil de frequência: única / ocasional (2-3) / consolidado (4+) —
  // e a média de consultas por paciente (total de consultas do
  // histórico ÷ nº de pacientes), pra dar uma leitura rápida do volume
  // médio de retorno ao lado da distribuição por faixa.
  var perfilFreq = {unica:0, ocasional:0, consolidado:0, mediaConsultas:0};
  var totalConsultasFreq = 0;
  var totalAtendimentos = 0;
  pacientes.forEach(function(p){
    var n = p.totalAtendimentos || p.datas.length;
    totalConsultasFreq += n;
    totalAtendimentos += n;
    if(n===1) perfilFreq.unica++;
    else if(n===2||n===3) perfilFreq.ocasional++;
    else perfilFreq.consolidado++;
  });
  perfilFreq.mediaConsultas = pacientes.length ? (totalConsultasFreq/pacientes.length) : 0;

  // Sazonalidade: nº de atendimentos por dia da semana (todas as datas,
  // não só a 1ª consulta).
  var DIAS_SEMANA = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  var porDiaSemana = [0,0,0,0,0,0,0];
  pacientes.forEach(function(p){ p.datas.forEach(function(d){ porDiaSemana[d.getDay()]++; }); });
  // Média de atendimentos por dia da semana: total do dia da semana ÷
  // nº de datas DISTINTAS daquele dia da semana com algum atendimento
  // no período (feriados/dias sem expediente não entram no divisor).
  var datasDistintasSemana = [{},{},{},{},{},{},{}];
  pacientes.forEach(function(p){ p.datas.forEach(function(d){
    datasDistintasSemana[d.getDay()][d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()] = 1;
  }); });
  var diasDistintosSemana = datasDistintasSemana.map(function(o){ return Object.keys(o).length; });
  var mediaPorDiaSemana = porDiaSemana.map(function(n,i){
    var qtd = diasDistintosSemana[i];
    return qtd ? n/qtd : 0;
  });

  // Comparativo por profissional: mediana de dias entre duas consultas
  // consecutivas, atribuída a cada profissional que atendeu o paciente
  // (aproximação — a aba não diz qual profissional fez qual consulta
  // específica). idxA/idxB são os índices (0-based) das duas consultas
  // na sequência do paciente (ex.: 0,1 = 1ª→2ª; 1,2 = 2ª→3ª).
  function calcularComparativoProf(idxA, idxB){
    var porProf = {};
    pacientes.forEach(function(p){
      if(p.datas.length <= idxB) return;
      var dias = diffDias(p.datas[idxA], p.datas[idxB]);
      Object.keys(p.profissionais).forEach(function(prof){
        if(!ehProfissionalComparativoEmulti(prof)) return;
        if(!porProf[prof]) porProf[prof] = [];
        porProf[prof].push(dias);
      });
    });
    return Object.keys(porProf).map(function(prof){
      return {profissional:prof, n:porProf[prof].length, medianaDias: mediana(porProf[prof])};
    }).sort(function(a,b){ return a.medianaDias - b.medianaDias; });
  }
  var comparativoProf = calcularComparativoProf(0, 1);
  var comparativoProf23 = calcularComparativoProf(1, 2);

  // Pacientes em risco de abandono: já romperam o "silêncio" normal (mais
  // tempo sem voltar do que a mediana histórica de 1ª→2ª consulta) mas
  // ainda dentro de uma janela em que o retorno é plausível (até 3x essa
  // mediana) — depois disso, tratamos como provável abandono já
  // consumado, não mais "risco".
  var medianaBase = intervalos[0].stats ? intervalos[0].stats.mediana : null;
  var hoje = new Date();
  var risco = [];
  var equipeLabelUnica = estadoApp.analisesEquipes.length === 1 ? estadoApp.analisesEquipes[0].label : null;
  // Classificação completa de quem já teve 2+ consultas (base de
  // comparação pra "Pacientes em risco de abandono" não ser lida contra
  // o total geral de pacientes, que inclui quem nunca voltou nem uma vez
  // — esses já aparecem em "Consulta única", no Perfil de frequência):
  // em dia (ainda dentro da mediana) / em risco (na janela) / abandono
  // consumado (já passou de 3x a mediana sem voltar).
  var comRetorno = 0, emDiaCount = 0, abandonoConsumadoCount = 0;
  // Registro "leve" com o mesmo formato usado pelo filtro da tabela de
  // risco (nome/profissional/equipe/consultas/última consulta/dias sem
  // voltar + ultimoProfissionais/todosProfissionais), mas pra TODO
  // paciente com pelo menos 1 consulta — não só os que estão na janela
  // de risco. É contra essa lista (kpiRegistros, abaixo) que os cards de
  // estatística (Total no histórico / Com 2+ consultas / Em dia / Em
  // risco / Abandono consumado) são recalculados a cada mudança nos
  // filtros da tabela (ver wireRiscoFiltros), em vez de ficarem fixos no
  // total geral independente do filtro.
  var kpiRegistros = [];
  var registrosTabela = [];
  // Última participação em atividade coletiva de cada paciente (nome em
  // maiúsculas -> Date), lida da aba Participantes Ativ. Coletiva. Só é
  // INFORMATIVA (coluna "Última participação coletiva"): NÃO entra na
  // "última consulta" nem na mediana, pra quem só vai a grupo não sumir
  // da lista de risco de acompanhamento individual.
  var ultimaColetivaPorNome = {};
  (function(){
    var pr = filtrarLinhasPorEquipe(sheetToRows(latestRawSheets["Participantes Ativ. Coletiva"] || []), estadoApp.analisesEquipes);
    var h = pr[0] || [];
    var iN = colIndex(h, "participante"), iD = colIndex(h, "data");
    if(iN < 0 || iD < 0) return;
    pr.slice(1).forEach(function(r){
      var nome = String(r[iN]||"").trim();
      if(!nome || nome.indexOf("(sem lista nominal") === 0) return;
      var d = parseBRDate(r[iD]);
      if(!d) return;
      var k = nome.toUpperCase();
      if(!ultimaColetivaPorNome[k] || d > ultimaColetivaPorNome[k]) ultimaColetivaPorNome[k] = d;
    });
  })();
  pacientes.forEach(function(p){
    if(!p.datas.length) return;
    var todosProfs = Object.keys(p.profissionais).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); });
    var ultimosProfsSet = p.ultimaProfissionais || {};
    // Ordena os profissionais da ÚLTIMA consulta com a MESMA prioridade
    // usada no resto do painel (profissional da eMulti primeiro, depois
    // alfabética) — o primeiro da lista vira o nome PRINCIPAL da célula;
    // os demais (inclusive co-profissional da MESMA última consulta,
    // quando há empate de data) entram no popover "+N" junto com os
    // profissionais de consultas mais antigas, em vez de ficarem
    // grudados no texto principal sem badge (ver outrosProfissionais
    // logo abaixo).
    var ultimoProfissionaisArrKpi = Object.keys(ultimosProfsSet).sort(function(a,b){
      var eA = nomeEhDaEmulti(a) ? 0 : 1, eB = nomeEhDaEmulti(b) ? 0 : 1;
      if(eA !== eB) return eA - eB;
      return a.localeCompare(b,'pt-BR');
    });
    var equipeTxtKpi = equipeLabelUnica || Object.keys(p.equipes||{}).sort().join(' + ');
    var ultima = p.datas[p.datas.length-1];
    var diasDesde = diffDias(ultima, hoje);
    var status = 'unica'; // 1 consulta só — entra em "Total no histórico", mas não nas demais contagens

    if(p.datas.length >= 2){
      comRetorno++;
      if(!medianaBase){
        status = 'semMediana'; // sem histórico suficiente ainda pra classificar
      } else if(diasDesde <= medianaBase){
        status = 'emDia'; emDiaCount++;
      } else if(diasDesde > medianaBase*3){
        status = 'abandono'; abandonoConsumadoCount++;
      } else {
        status = 'risco';
      }
    }

    kpiRegistros.push({
      nome: p.nome, status: status, diasDesde: diasDesde, ultima: ultima,
      totalConsultas: p.datas.length, equipe: equipeTxtKpi || '—',
      profissional: todosProfs.join(', ') || '—',
      ultimoProfissionais: ultimoProfissionaisArrKpi, todosProfissionais: todosProfs
    });

    // Com 2+ profissionais no histórico do paciente, destaca em
    // negrito quem de fato fez a ÚLTIMA consulta (profissionalHtml,
    // usado na tela). O PDF continua em texto puro (profissional).
    var profissionalHtml = todosProfs.map(function(nomeProf){
      var escapado = escapeHtml(nomeProf);
      return (todosProfs.length >= 2 && ultimosProfsSet[nomeProf]) ? '<b>'+escapado+'</b>' : escapado;
    }).join(', ');
    var ultimoProfissionaisArr = ultimoProfissionaisArrKpi;
    var profissionalTxt = todosProfs.join(', ');
    // Coluna "Profissional" da tabela: SEMPRE 1 nome principal (o
    // primeiro de ultimoProfissionaisArr, já com a prioridade
    // eMulti-primeiro acima) + badge "+N" com popover pros demais — em
    // TODOS os casos em que o paciente tem mais de 1 profissional no
    // histórico, mesmo quando os "outros" são só o(s) co-profissional(is)
    // da PRÓPRIA última consulta (empate de data), que antes ficavam
    // grudados no texto principal sem popover nenhum. Cada item do
    // popover leva a data em que ESSE profissional atendeu a pessoa pela
    // última vez (ultimaDataPorProf, ou a própria "ultima" quando é
    // co-profissional do último dia), do mais recente pro mais antigo.
    var principalNome = ultimoProfissionaisArr[0] || null;
    var extrasUltimaData = ultimoProfissionaisArr.slice(1).map(function(nomeProf){
      return {nome: nomeProf, data: ultima};
    });
    var outrosProfissionaisAntigos = todosProfs
      .filter(function(nomeProf){ return !ultimosProfsSet[nomeProf]; })
      .map(function(nomeProf){ return {nome: nomeProf, data: (p.ultimaDataPorProf||{})[nomeProf] || null}; });
    var outrosProfissionais = extrasUltimaData.concat(outrosProfissionaisAntigos)
      .sort(function(a,b){
        var ta = a.data ? a.data.getTime() : 0, tb = b.data ? b.data.getTime() : 0;
        return tb - ta;
      });
    var equipeTxt = equipeTxtKpi;
    var registroTabela = {
      nome:p.nome, status:status, diasDesde:diasDesde, ultima:ultima,
      totalConsultas:p.datas.length,
      consultasPorProf:p.consultasPorProf || {},
      profissional: profissionalTxt || '—',
      profissionalHtml: profissionalHtml || '—',
      profissionalUltimo: principalNome || '—',
      outrosProfissionais: outrosProfissionais,
      ultimoProfissionais: ultimoProfissionaisArr,
      todosProfissionais: todosProfs,
      equipe: equipeTxt || '—',
      // Estimativa: dias até cruzar 3x a mediana histórica (limite de
      // "abandono consumado"). Negativo = já ultrapassou. null = não se
      // aplica (em dia, consulta única ou sem mediana).
      diasRestantes: (status === 'risco' || status === 'abandono') && medianaBase
        ? (status === 'risco' ? Math.floor(medianaBase*3 - diasDesde) : -Math.ceil(diasDesde - medianaBase*3))
        : null,
      ultimaColetiva: ultimaColetivaPorNome[p.nome.toUpperCase()] || null
    };
    registrosTabela.push(registroTabela);
    if(status === 'risco') risco.push(registroTabela);
  });
  // Ordem padrão da tabela: mais dias sem voltar primeiro; no empate,
  // quem tem MENOS consultas primeiro; persistindo o empate, nome (A→Z).
  // Aplicada também a registrosTabela (a lista que de fato alimenta a
  // tabela) — antes só "risco" era ordenada, e a tabela saía na ordem em
  // que os pacientes aparecem na planilha.
  function ordemPadraoRisco(a, b){
    if(b.diasDesde !== a.diasDesde) return b.diasDesde - a.diasDesde;
    if(a.totalConsultas !== b.totalConsultas) return a.totalConsultas - b.totalConsultas;
    return String(a.nome).localeCompare(String(b.nome), 'pt-BR', {sensitivity:'base'});
  }
  risco.sort(ordemPadraoRisco);
  registrosTabela.sort(ordemPadraoRisco);

  return {
    totalPacientes: pacientes.length,
    totalAtendimentos: totalAtendimentos,
    intervaloSelecionado: estadoApp.analisesQuads.length ? estadoApp.analisesQuads.map(function(q){ return q.ano + ' — Q' + (q.qIndex+1); }).join(', ') : 'Histórico completo',
    intervalos: intervalos,
    funil: funil,
    perfilFreq: perfilFreq,
    diasSemanaLabels: DIAS_SEMANA,
    porDiaSemana: porDiaSemana,
    mediaPorDiaSemana: mediaPorDiaSemana,
    diasDistintosSemana: diasDistintosSemana,
    comparativoProf: comparativoProf,
    comparativoProf23: comparativoProf23,
    medianaBase: medianaBase,
    comRetorno: comRetorno,
    emDiaCount: emDiaCount,
    abandonoConsumadoCount: abandonoConsumadoCount,
    risco: risco,
    kpiRegistros: kpiRegistros,
    registrosTabela: registrosTabela
  };
}

// "Boxplot" simplificado em SVG (min/p25/mediana/p75/max) pros
// intervalos — sem depender de nenhuma lib de gráfico nova. Layout em
// grade (2 colunas) pra caber os 4 intervalos (1ª→2ª, 2ª→3ª, 3ª→4ª,
// 4ª→5ª) em 4 quadrantes, em vez de 4 linhas empilhadas ocupando altura
// desnecessária.
// Waterfall (cascata incremental) do tempo entre consultas: cada barra
// "flutua" a partir de onde a anterior parou, representando quantos dias
// aquele intervalo ACRESCENTA ao tempo acumulado desde a 1ª consulta.
// Só entram no acumulado os intervalos com dados suficientes (it.stats);
// os que ainda não têm dado aparecem como aviso, sem quebrar a cascata.
export function waterfallDiasSvg(intervalos){
  var comDados = intervalos.filter(function(it){ return it.stats; });
  if(!comDados.length){
    return '<p class="footnote">Ainda não há dados suficientes pra montar a cascata.</p>';
  }

  var W = 640, H = 250;
  var padLeft = 14, padRight = 14, padTop = 40, padBottom = 44;
  var plotW = W - padLeft - padRight;
  var plotH = H - padTop - padBottom;
  var n = comDados.length;
  var gap = 26;
  var barW = (plotW - gap*(n-1)) / n;

  var cumulative = 0;
  var steps = comDados.map(function(it){
    var incremento = Math.round(it.stats.mediana);
    var inicio = cumulative;
    cumulative += incremento;
    return {label: it.label, incremento: incremento, inicio: inicio, fim: cumulative, n: it.stats.n};
  });

  var maxTotal = cumulative || 1;
  function y(v){ return padTop + plotH - (v/maxTotal)*plotH; }

  var cores = ['#2F6F5E','#3E8571','#57A088','#7CB89F','#A3CFBB'];
  var baseline = '<line x1="'+padLeft+'" y1="'+y(0)+'" x2="'+(padLeft+plotW)+'" y2="'+y(0)+'" stroke="var(--ink-soft)" stroke-width="1"/>';

  var bars = steps.map(function(s, i){
    var xPos = padLeft + i*(barW+gap);
    var yTop = y(s.fim), yBottom = y(s.inicio);
    var barH = Math.max(2, yBottom - yTop);
    var cor = cores[i % cores.length];

    var connector = '';
    if(i > 0){
      var prevX = padLeft + (i-1)*(barW+gap) + barW;
      var yLevel = y(s.inicio);
      connector = '<line x1="'+prevX+'" y1="'+yLevel+'" x2="'+xPos+'" y2="'+yLevel+'" stroke="var(--ink-soft)" stroke-width="1" stroke-dasharray="3,3"/>';
    }

    var barRect = '<rect x="'+xPos+'" y="'+yTop+'" width="'+barW+'" height="'+barH+'" fill="'+cor+'" rx="4"/>';
    var incLabel = '<text x="'+(xPos+barW/2)+'" y="'+(yTop-8)+'" font-size="11" font-weight="700" fill="var(--ink)" text-anchor="middle">+'+fmtInt(s.incremento)+' dias</text>';
    var catLabel = '<text x="'+(xPos+barW/2)+'" y="'+(padTop+plotH+18)+'" font-size="10.5" font-weight="700" fill="var(--ink)" text-anchor="middle">'+escapeHtml(s.label)+'</text>';
    var nSub = '<text x="'+(xPos+barW/2)+'" y="'+(padTop+plotH+31)+'" font-size="8.5" fill="var(--ink-soft)" text-anchor="middle">mediana · n='+s.n+'</text>';

    return connector + barRect + incLabel + catLabel + nSub;
  }).join('');

  var totalLabel = '<text x="'+(padLeft+plotW)+'" y="18" font-size="11" font-weight="700" fill="var(--ink)" text-anchor="end">Total acumulado: '+fmtInt(cumulative)+' dias</text>';

  return '<svg class="spark-svg" viewBox="0 0 '+W+' '+H+'">'+baseline+bars+totalLabel+'</svg>';
}

// Funil de abandono: barras horizontais de largura proporcional ao 1º
// degrau (1ª consulta = 100%).
export function funnelHtml(funil){
  var base = (funil[0] && funil[0].n) || 0;
  var cores = ['#2F6F5E','#6B8F71','#C68A3D','#B5474B'];
  return '<div>' + funil.map(function(f,i){
    var pct = base ? Math.round(f.n/base*100) : 0;
    return '<div style="margin-bottom:11px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">'
      +   '<span>'+escapeHtml(f.label)+'</span><span><b>'+fmtInt(f.n)+'</b> pacientes · '+pct+'%</span>'
      + '</div>'
      + '<div style="background:#EAEAE3;border-radius:6px;height:14px;overflow:hidden;">'
      +   '<div style="width:'+pct+'%;height:100%;background:'+(cores[i]||'#2F6F5E')+';"></div>'
      + '</div>'
      + '</div>';
  }).join('') + '</div>';
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init_abas_analises_calculo(){
  DIA_MS = 24*60*60*1000;

  estadoApp.analisesChartInstances = [];

  estadoApp.analisesDataAtual = null;
}

