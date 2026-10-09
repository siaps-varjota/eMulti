  // ---------- Desempenho Profissional ----------
  // Agrupa a Lista de Atendimentos (já filtrada por equipe no fetch) por
  // "profissional" e, dentro de cada profissional, conta quantos
  // atendimentos cada paciente (por nome) teve no período — igual à
  // lógica do protótipo "Profissionais.html", mas com dados reais em vez
  // de mock, renderizada com Chart.js igual ao protótipo original.
  var PROF_LABELS = ['1 Consulta', '2 Consultas', '3 Consultas', '4+ Consultas'];
  var profListaAtual = [];
  var profViewMode = 'percent'; // 'percent' | 'absolute'
  var profChartMain = null;
  var profChartInstances = []; // donuts/barras individuais (recriados a cada render)

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

  function calcularPerformanceProfissionais(wb, periodo){
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
    var precisaSepararPorEquipe = currentEquipes.length > 1;
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
      return p.equipeKey && currentEquipes.some(function(eq){ return eq.key === p.equipeKey; });
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
  (function setupProfPills(){
    var pillPercent = document.getElementById('profPillPercent');
    var pillAbsolute = document.getElementById('profPillAbsolute');
    if(pillPercent) pillPercent.addEventListener('click', function(){ setProfViewMode('percent'); });
    if(pillAbsolute) pillAbsolute.addEventListener('click', function(){ setProfViewMode('absolute'); });
  })();

  function renderPerformanceProfissionais(lista){
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

