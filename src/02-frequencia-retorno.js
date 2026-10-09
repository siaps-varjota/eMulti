  // ---------- Aba "Análises" (perfil de paciente / tempo entre consultas) ----------
  // Diferente das outras abas, aqui NÃO se aplica o filtro de Quadrimestre/
  // Mês do topo: intervalo entre consultas, funil de abandono etc. olham
  // pro HISTÓRICO INTEIRO do paciente na equipe selecionada (wb.Sheets já
  // vem filtrado por equipe — ver fetchAndLoad/filtrarLinhasPorEquipe —,
  // só não filtramos mais por período aqui).
  var DIA_MS = 24*60*60*1000;
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
  var analisesChartInstances = [];
  var analisesDataAtual = null;

  // Monta, por paciente (nome em maiúsculas), a lista ORDENADA de datas de
  // atendimento e o conjunto de profissionais que o atenderam — base pra
  // todas as análises abaixo. Usa a aba Atendimentos BRUTA (todas as
  // equipes, cache latestRawSheets), filtrada aqui mesmo pela Equipe e,
  // se houver, pelo(s) Quadrimestre(s) marcados no filtro PRÓPRIO desta
  // aba (analisesEquipes/analisesQuads) — independente do filtro global
  // do topo e do filtro de Quadrimestre/Mês usado nas outras abas.
  function construirHistoricosPacientes(){
    var rows = sheetToRows(latestRawSheets["Atendimentos"] || []);
    rows = filtrarLinhasPorEquipe(rows, analisesEquipes);
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
    var precisaSepararPorEquipe = analisesEquipes.length > 1;
    var iEquipe = precisaSepararPorEquipe ? equipeColIndex(header) : -1;
    // Nenhum quadrimestre marcado (padrão) = sem restrição de período,
    // olha pro histórico inteiro. 1+ marcados: só datas dentro de algum
    // desses quadrimestres entram no cálculo.
    var faixasQuad = analisesQuads.map(function(q){
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
      if(analisesProfissional && prof !== analisesProfissional) return;
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

  function calcularAnalises(){
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
    var equipeLabelUnica = analisesEquipes.length === 1 ? analisesEquipes[0].label : null;
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
      var pr = filtrarLinhasPorEquipe(sheetToRows(latestRawSheets["Participantes Ativ. Coletiva"] || []), analisesEquipes);
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
      intervaloSelecionado: analisesQuads.length ? analisesQuads.map(function(q){ return q.ano + ' — Q' + (q.qIndex+1); }).join(', ') : 'Histórico completo',
      intervalos: intervalos,
      funil: funil,
      perfilFreq: perfilFreq,
      diasSemanaLabels: DIAS_SEMANA,
      porDiaSemana: porDiaSemana,
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
  function waterfallDiasSvg(intervalos){
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
  function funnelHtml(funil){
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
  function profissionalBadgeHtml(nomePrincipal, extras){
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

  function riscoTableHtml(risco){
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
  function wireRiscoFiltros(risco, kpiRegistros, temMediana, registrosTabela){
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
    var mediana = analisesDataAtual && analisesDataAtual.medianaBase;
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
    var equipeLabel = analisesEquipes.map(function(e){ return e.label; }).join(' + ') + (analisesProfissional ? ' — ' + analisesProfissional : '');
    XLSX.writeFile(wb, slugifyFileName('Pacientes_risco_abandono')+'__'+slugifyFileName(equipeLabel)+'__'+slugifyFileName(new Date().toLocaleDateString('pt-BR'))+'.xlsx');
  }

  // ---------- Exportar "Pacientes em risco de abandono" em PDF ----------
  // Mesma linha visual dos outros PDFs do painel (faixa de cabeçalho +
  // tabela), mas usa a lista COMPLETA de risco (não só os 40 primeiros
  // mostrados na tela).
  function gerarPdfRisco(risco, totalGeral, profSel){
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
    var equipeLabel = analisesEquipes.map(function(e){ return e.label; }).join(' + ') + (analisesProfissional ? ' — ' + analisesProfissional : '');
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

  function renderAnalises(data){
    if(atualizarOpcoesProfissionaisAnalises()) data = calcularAnalises();
    analisesDataAtual = data;
    analisesChartInstances.forEach(function(c){ try{ c.destroy(); }catch(e){} });
    analisesChartInstances = [];

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
        analisesChartInstances.push(freqChart);
        setTimeout(function(){ try{ freqChart.resize(); }catch(e){} }, 0);
      }
      var semanaCanvas = document.getElementById('analisesDiaSemana');
      if(semanaCanvas){
        var semanaChart = new Chart(semanaCanvas, {
          type: 'bar',
          data: {
            labels: data.diasSemanaLabels,
            datasets: [{ data: data.porDiaSemana, backgroundColor: '#2F6F5E', borderRadius: 4, categoryPercentage:0.7, barPercentage:0.9 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { bodyFont:{size:13}, titleFont:{size:13} } },
            scales: {
              y: { beginAtZero: true, ticks: { font:{size:13} } },
              x: { ticks: { font:{size:13} } }
            }
          }
        });
        analisesChartInstances.push(semanaChart);
        // Mesmo ajuste do gráfico de comparativo por profissional logo
        // abaixo: se o canvas é criado com o card ainda "recuado" (ex.: a
        // aba Análises acabou de ficar visível e o layout do card vizinho
        // ainda não assentou), o Chart.js às vezes trava com a largura
        // antiga e as barras ficam espremidas do lado esquerdo, sobrando
        // espaço vazio à direita. Forçar um resize() explícito no próximo
        // tick corrige isso.
        setTimeout(function(){ try{ semanaChart.resize(); }catch(e){} }, 0);
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

  function renderComparativoProfChart(canvas, comparativoProf, comparativoProf23){
    if(!canvas) return;
    if(!comparativoProf.length && !comparativoProf23.length){
      var wrapVazio = canvas.parentElement;
      if(wrapVazio) wrapVazio.innerHTML = '<p class="footnote">Sem dados suficientes ainda.</p>';
      return;
    }
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
    analisesChartInstances.push(chart);
    // Redimensiona explicitamente no próximo tick — em alguns navegadores
    // o Chart.js não pega o tamanho certo do container se o gráfico foi
    // criado no mesmo instante em que a aba ficou visível.
    setTimeout(function(){ try{ chart.resize(); }catch(e){} }, 0);
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
      + '<div class="card" style="margin-bottom:16px;">'
      +   '<h4 style="margin-top:0;">Funil de abandono</h4>'
      +   '<div id="analisesFunil"></div>'
      + '</div>'
      + '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">'
      +   '<div class="card" style="flex:1;min-width:280px;margin-bottom:0;">'
      +     '<h4 style="margin-top:0;">Perfil de frequência</h4>'
      +     '<div class="card-charts-layout card-charts-layout--lg">'
      +       '<div class="chart-box"><canvas id="analisesFreqDonut"></canvas></div>'
      +       '<div id="analisesFreqLegenda" class="kpi-container kpi-legend-vertical" style="flex-direction:column;align-items:stretch;gap:6px;"></div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="card" style="flex:1;min-width:280px;margin-bottom:0;">'
      +     '<h4 style="margin-top:0;">Atendimentos por dia da semana</h4>'
      +     '<div class="chart-box-full" style="height:220px;"><canvas id="analisesDiaSemana"></canvas></div>'
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
  injetarAbaAnalises();

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

    var TODAS_KEY = 'todas';
    var analisesEquipeMs = createMultiSelect(equipeContainer, {
      placeholder: 'Selecione', multi: false, search: false,
      onChange: function(keys){
        analisesEquipes = keys[0] === TODAS_KEY ? EQUIPES.slice()
          : EQUIPES.filter(function(eq){ return eq.key === keys[0]; });
        atualizarOpcoesProfissionaisAnalises();
        recalcularERedesenhar();
      }
    });
    analisesEquipeMs.setOptions(
      EQUIPES.map(function(eq){ return {value: eq.key, label: eq.label}; })
        .concat([{value: TODAS_KEY, label: 'Todas'}])
    );
    analisesEquipeMs.setSelected([analisesEquipes.length > 1 ? TODAS_KEY : analisesEquipes[0].key]);

    var analisesQuadMs = createMultiSelect(quadContainer, {
      placeholder: 'Histórico completo', multi: true, search: false, showTags: true,
      onChange: function(keys){
        analisesQuads = keys.map(function(k){
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
    analisesQuadMs.setSelected(analisesQuads.map(function(q){ return q.ano+'-'+q.qIndex; }));

    analisesProfissionalMs = createMultiSelect(profissionalContainer, {
      placeholder: 'Todos', multi: false, search: true,
      onChange: function(keys){
        analisesProfissional = keys[0] || '';
        renderAnalises(calcularAnalises());
      }
    });
    atualizarOpcoesProfissionaisAnalises();
  }

