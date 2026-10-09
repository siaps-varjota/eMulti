// ======================================================================
// abas/analises/render.js
// Aba Frequência e Retorno — gráficos, filtros próprios (Equipe/Quadrimestre/Profissional) e layout
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../../nucleo/estado.js';
import { calcularAnalises, funnelHtml, waterfallDiasSvg } from './calculo.js';
import { gerarPdfGraficosAnalises } from './pdf.js';
import { riscoTableHtml, wireRiscoFiltros } from './risco.js';
import { latestRawSheets } from '../../app/carga.js';
import { profissionalColIndex } from '../../listas/pessoas-atendidas.js';
import { EQUIPES } from '../../nucleo/config.js';
import { filtrarLinhasPorEquipe, sheetToRows } from '../../nucleo/dados.js';
import { createMultiSelect } from '../../nucleo/multiselect.js';
import { QUAD_LABELS } from '../../nucleo/periodos.js';
import { fmtDec, fmtInt } from '../../nucleo/utils.js';

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
export function init(){
injetarAbaAnalises();
}
