// ======================================================================
// app/carga.js
// Carga de dados, mês de referência, debug e seletor de equipe
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from '../nucleo/estado.js';
import { calcularAnalises } from '../abas/analises/calculo.js';
import { populateSheetsCache } from '../abas/m1-busca-ativa.js';
import { calcularPerformanceProfissionais } from '../abas/profissionais.js';
import { loadHistoryArray, saveHistoryArray } from './historico.js';
import { renderDashboard } from './render.js';
import { calcularIndicadoresDoPeriodo, criarLigacaoAtividades } from '../indicadores/calculo.js';
import { mediaDeMeses } from '../indicadores/media-meses.js';
import { EQUIPES, calcularJanelaPeriodo, monthOptionValue, monthShortLabel, refMonthLabel, suffixedName } from '../nucleo/config.js';
import { calcularJanelaComOverride, colIndex, fetchOfficialOverridesSafe, fetchProfissionaisSafe, filtrarLinhasPorEquipe, fmtBRDate, normalizeText, parseBRDate, parseCsv, profissionaisRoster, sheetToRows, temaEhDiscussaoCasoPts, tipoEhReuniao, toInt, withinPeriod } from '../nucleo/dados.js';
import { fetchAllSheets } from '../nucleo/fetch-csv.js';
import { createMultiSelect } from '../nucleo/multiselect.js';
import { JANELA_MESES, TREND_MESES, anchorMonthDate, labelQuadsSelecionados, mesesDosQuadsSelecionadosUniao, mesesElapsedDosQuadsSelecionadosUniao, periodoMesUnico } from '../nucleo/periodos.js';
import { anoMs, calcularSerieTendencia, mesMs, quadMs, valoresUnicosOrdenados } from '../nucleo/seletores-periodo.js';
import { escapeHtml } from '../nucleo/utils.js';

// ---------- Fetch ----------
var fetchStatusEl;

var refreshBtn;

var refreshLabel;

function sameData(a,b){
  if(!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// Dados brutos (já filtrados pela equipe atual, mas SEM filtro de
// período — o período é aplicado depois, em calcularIndicadoresDoPeriodo)
// guardados aqui após o último fetch bem-sucedido. Trocar o "Mês de
// referência" no seletor reusa este cache e recalcula tudo na hora, sem
// precisar buscar a planilha de novo na rede.
export var latestWb = null;

// Igual latestWb, mas SEM o filtro por equipe (todas juntas, uma linha
// por atendimento, por nome real da aba) — usado só pelo filtro de
// Equipe INDEPENDENTE da aba Análises (analisesEquipes), pra poder
// trocar de equipe ali sem precisar buscar a planilha de novo (ver
// fetchAndLoad e construirHistoricosPacientes).
export var latestRawSheets = {};

// Recalcula M1/M2/pontos/nota + a série de tendência pro mês de
// referência atual (refMonthDates), a partir do cache latestWb.
// saveHistory=true (usado logo após um fetch): grava uma nova "leitura"
// no histórico se os dados mudaram desde a última do mesmo período/equipe.
// saveHistory=false (usado ao trocar o seletor de mês): só recalcula e
// renderiza na hora, sem criar entrada nova no histórico de leituras.
export function aplicarMesReferencia(saveHistory){
  if(!latestWb) return;

  var extracted, periodo, periodoDatas;
  if(estadoApp.refMonthDates.length === 1){
    // Um único mês escolhido: NÃO é só aquele mês isolado — é a janela
    // móvel de JANELA_MESES meses TERMINANDO nesse mês (ex.: maio →
    // fev, mar, abr e maio, incluindo os dois extremos), a mesma janela
    // usada pela série de tendência (ver calcularJanelaPeriodo).
    var janelaMes = calcularJanelaPeriodo(estadoApp.refMonthDates[0]);
    extracted = calcularJanelaComOverride(latestWb, estadoApp.refMonthDates[0]);
    periodo = {inicio: fmtBRDate(janelaMes.inicio), fim: fmtBRDate(janelaMes.fim)};
    periodoDatas = {inicio: janelaMes.inicio, fim: janelaMes.fim};
  } else if(estadoApp.refMonthDates.length > 1){
    // Vários meses escolhidos: o M1/M2 de CADA mês marcado já é o valor
    // com a janela móvel de JANELA_MESES meses terminando naquele mês
    // (mesma regra do mês único, acima) — os resultados dos meses
    // marcados entram na MÉDIA (mesmo princípio da média do
    // quadrimestre, ver mediaDeMeses), e os totais de contexto/"Pessoas
    // atendidas" somam o mês isolado (sem janela) de cada um, pra não
    // sobrepor dados de meses vizinhos quando as janelas se cruzam.
    var resultadosMensaisSel = estadoApp.refMonthDates.map(function(m){
      return calcularIndicadoresDoPeriodo(latestWb, periodoMesUnico(m));
    });
    var resultadosJanelaSel = estadoApp.refMonthDates.map(function(m){
      return calcularJanelaComOverride(latestWb, m);
    });
    extracted = mediaDeMeses(resultadosMensaisSel, resultadosJanelaSel);
    periodo = {
      inicio: fmtBRDate(periodoMesUnico(estadoApp.refMonthDates[0]).inicio),
      fim: fmtBRDate(periodoMesUnico(estadoApp.refMonthDates[estadoApp.refMonthDates.length-1]).fim)
    };
    periodoDatas = {
      inicio: periodoMesUnico(estadoApp.refMonthDates[0]).inicio,
      fim: periodoMesUnico(estadoApp.refMonthDates[estadoApp.refMonthDates.length-1]).fim
    };
  } else {
    // Nenhum mês escolhido: média dos meses do quadrimestre selecionado
    // que JÁ TERMINARAM (mesesElapsedDoQuadrimestre) — os meses futuros
    // (ainda sem nenhum atendimento/atividade real na planilha) NÃO
    // entram na média, pra não diluir o resultado com dado inexistente.
    // Isso equivale, na prática, a projetar os meses que faltam pelo
    // ritmo médio dos meses já decorridos (preencher um mês futuro com
    // a própria média dos já decorridos não muda essa média — só
    // filtrar já dá o mesmo resultado, sem precisar simular nada).
    // O M1/M2 de CADA mês usado na média já é o valor com a janela móvel
    // de JANELA_MESES meses terminando naquele mês (mesma regra oficial
    // usada na seleção de mês individual e no gráfico de tendência) —
    // por isso calculamos cada mês duas vezes: uma com a janela (pra
    // entrar na média de M1/M2) e outra isolada, só o mês em si (pra
    // somar contagens de contexto e montar "Pessoas atendidas" sem
    // sobrepor dados de meses vizinhos).
    var meses = mesesDosQuadsSelecionadosUniao();
    var mesesUsados = mesesElapsedDosQuadsSelecionadosUniao();
    var mesesProjecaoLabel = mesesUsados.length < meses.length
      ? mesesUsados.map(monthShortLabel).join('+')
      : null;
    var resultadosMensais = mesesUsados.map(function(m){
      return calcularIndicadoresDoPeriodo(latestWb, periodoMesUnico(m));
    });
    var resultadosJanela = mesesUsados.map(function(m){
      return calcularJanelaComOverride(latestWb, m);
    });
    extracted = mediaDeMeses(resultadosMensais, resultadosJanela, mesesProjecaoLabel);
    periodo = {
      inicio: fmtBRDate(periodoMesUnico(meses[0]).inicio),
      fim: fmtBRDate(periodoMesUnico(meses[meses.length-1]).fim)
    };
    periodoDatas = {inicio: periodoMesUnico(meses[0]).inicio, fim: periodoMesUnico(meses[meses.length-1]).fim};
  }

  var performanceProfissionais = calcularPerformanceProfissionais(latestWb, periodoDatas);
  var analisesData = calcularAnalises();

  populateSheetsCache(latestWb);
  // "Pessoas atendidas" agora NÃO usa mais extracted.pessoasAtendidas
  // (ligado ao filtro de Mês do topo) — a lista, na aba Listas, é
  // recalculada direto por renderListCard/pessoasAtendidasParaMeses,
  // com o próprio filtro de mês (ver renderListsSection).

  var serie = calcularSerieTendencia(latestWb, anchorMonthDate(), TREND_MESES);

  if(anoMs) anoMs.setSelected(valoresUnicosOrdenados(estadoApp.quadsSelecionados.map(function(c){ return String(c.ano); })));
  if(quadMs) quadMs.setSelected(valoresUnicosOrdenados(estadoApp.quadsSelecionados.map(function(c){ return String(c.qIndex); })));
  if(mesMs) mesMs.setSelected(estadoApp.refMonthDates.map(monthOptionValue));
  var winEl = document.getElementById('refWindowLabel');
  if(winEl){
    winEl.innerHTML = estadoApp.refMonthDates.length
      ? 'Resultado de <b>'+refMonthLabel()+'</b> — janela de '+JANELA_MESES+' meses cada ('+periodo.inicio+' a '+periodo.fim+')'
      : 'Média de <b>'+labelQuadsSelecionados()+'</b> ('+periodo.inicio+' a '+periodo.fim+')';
  }

  if(!saveHistory){
    var base = estadoApp.currentRecordId ? loadHistoryArray().find(function(h){ return h.id === estadoApp.currentRecordId; }) : null;
    var record = {
      id: base ? base.id : 'tmp',
      timestamp: base ? base.timestamp : Date.now(),
      equipe: extracted.equipe,
      data: extracted.data,
      notes: extracted.notes,
      periodo: periodo
    };
    renderDashboard(record, serie, performanceProfissionais, analisesData);
    return;
  }

  var now = Date.now();
  var history = loadHistoryArray();
  var lastForEquipe = history.filter(function(h){
    return !h.error && h.equipe === extracted.equipe
      && h.periodo && h.periodo.inicio === periodo.inicio && h.periodo.fim === periodo.fim;
  }).sort(function(a,b){ return b.timestamp-a.timestamp; })[0];

  if(lastForEquipe && sameData(lastForEquipe.data, extracted.data)){
    estadoApp.currentRecordId = lastForEquipe.id;
    fetchStatusEl.textContent = 'Dados sem alterações desde a última leitura.';
    renderDashboard(lastForEquipe, serie, performanceProfissionais, analisesData);
    return;
  }

  var record = {
    id: 'u'+now+Math.random().toString(36).slice(2,7),
    timestamp: now,
    equipe: extracted.equipe,
    data: extracted.data,
    notes: extracted.notes,
    periodo: periodo
  };
  var arr = loadHistoryArray();
  arr.push(record);
  saveHistoryArray(arr).then(function(){
    estadoApp.currentRecordId = record.id;
    fetchStatusEl.textContent = 'Planilha lida e calculada com sucesso.';
    renderDashboard(record, serie, performanceProfissionais, analisesData);
  });
}

// ---------- Debug manual (console) ----------
// window.debugAtendimentosEmulti(): imprime UMA tabela só, pro período
// EXATO que está selecionado agora no painel (mesma regra usada por
// aplicarMesReferencia — mês único = janela de 4 meses terminando
// nele; vários meses = intervalo entre o primeiro e o último; nenhum
// mês = quadrimestre selecionado inteiro), com a contagem de
// atendimentos por profissional e se cada um é considerado "da eMulti"
// (roster da aba PROFISSIONAIS). Chame direto no console do navegador
// (F12 → Console → digite "debugAtendimentosEmulti()" e Enter) — não
// fica rodando sozinho a cada recálculo (evita a poluição de outras
// janelas, como a do gráfico de Tendência), então o período mostrado é
// sempre exatamente o que está no card "Composição do numerador" no
// momento em que você chamar.
function periodoEfetivoAtual(){
  if(estadoApp.refMonthDates.length === 1){
    return calcularJanelaPeriodo(estadoApp.refMonthDates[0]);
  } else if(estadoApp.refMonthDates.length > 1){
    return {
      inicio: periodoMesUnico(estadoApp.refMonthDates[0]).inicio,
      fim: periodoMesUnico(estadoApp.refMonthDates[estadoApp.refMonthDates.length-1]).fim
    };
  }
  var meses = mesesDosQuadsSelecionadosUniao();
  return {inicio: periodoMesUnico(meses[0]).inicio, fim: periodoMesUnico(meses[meses.length-1]).fim};
}

export function fetchAndLoad(){
  refreshBtn.classList.add('loading');
  refreshBtn.disabled = true;
  refreshLabel.textContent = 'Atualizando…';
  fetchStatusEl.textContent = 'Buscando dados…';
  fetchStatusEl.className = 'fetch-status';

  Promise.all([fetchAllSheets(), fetchOfficialOverridesSafe(), fetchProfissionaisSafe()])
    .then(function(arr){
      var results = arr[0];
      var faltando = results.filter(function(r){ return !r.ok; });
      if(faltando.length){
        // Mostra o motivo REAL devolvido pelo Apps Script (ou pelo navegador)
        // para cada aba, em vez de só a mensagem genérica.
        var motivos = [];
        faltando.forEach(function(r){
          var m = (r.error && r.error.message) ? r.error.message : 'erro desconhecido';
          var linha = r.name + ': ' + m;
          if(motivos.indexOf(linha) < 0) motivos.push(linha);
          try{ console.error('[painel] falha ao ler a aba "' + r.name + '":', r.error); }catch(e){}
        });
        throw new Error('Não foi possível ler a(s) aba(s) "' + faltando.map(function(r){return r.name;}).join('", "')
          + '". Motivo: ' + motivos.join(' | ') + '.');
      }

      var wb = {SheetNames:[], Sheets:{}};
      results.forEach(function(r){
        var parsedRows = parseCsv(r.csvText);
        if(!parsedRows.length) return;
        latestRawSheets[r.name] = parsedRows;
        // r.name é o nome REAL da aba (sem sufixo). Filtra as linhas pela
        // equipe selecionada e guarda no workbook sob a chave "sufixada"
        // — o resto do painel (cálculo, listas) continua lendo por essa
        // chave, sem precisar saber que a aba é compartilhada entre
        // equipes. Note: SEM filtro de período aqui — cada mês de
        // referência filtra por data na hora, em aplicarMesReferencia().
        var filtradas = filtrarLinhasPorEquipe(parsedRows, estadoApp.currentEquipes);
        var key = suffixedName(r.name);
        wb.Sheets[key] = filtradas;
        wb.SheetNames.push(key);
      });

      latestWb = wb;
      aplicarMesReferencia(true);
    })
    .catch(function(err){
      var msg = (err && err.message) ? err.message : 'verifique sua conexão e o link publicado.';
      fetchStatusEl.textContent = 'Não foi possível ler a planilha: ' + msg;
      fetchStatusEl.className = 'fetch-status err';
      var history = loadHistoryArray();
      if(!history.length){
        document.getElementById('statusState').innerHTML =
          '<h2>Não foi possível carregar</h2><p>' + escapeHtml(msg) + '</p>'
          + '<div class="ficha"><b>Verifique:</b> se a planilha continua publicada em "Arquivo → Compartilhar → Publicar na web" (incluindo todas as abas) e se o link ainda é válido.</div>'
          + '<button class="retry-btn" id="retryBtn">Tentar de novo</button>';
        var retry = document.getElementById('retryBtn');
        if(retry) retry.addEventListener('click', fetchAndLoad);
      }
    })
    .finally(function(){
      refreshBtn.classList.remove('loading');
      refreshBtn.disabled = false;
      refreshLabel.textContent = 'Atualizar';
    });
}

function renderEquipeSwitcher(){
  var TODAS_KEY = 'todas';
  var equipeMs = createMultiSelect(document.getElementById('equipeMs'), {
    placeholder: 'Selecione',
    multi: false,
    search: false,
    onChange: function(keys){
      estadoApp.currentEquipes = keys[0] === TODAS_KEY ? EQUIPES.slice()
        : EQUIPES.filter(function(eq){ return eq.key === keys[0]; });
      document.getElementById('statusState').style.display = '';
      fetchAndLoad();
    }
  });
  equipeMs.setOptions(
    EQUIPES.map(function(eq){ return {value: eq.key, label: eq.label}; })
      .concat([{value: TODAS_KEY, label: 'Todas'}])
  );
  equipeMs.setSelected([estadoApp.currentEquipes.length > 1 ? TODAS_KEY : estadoApp.currentEquipes[0].key]);
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
  fetchStatusEl = document.getElementById('fetchStatus');

  refreshBtn = document.getElementById('refreshBtn');

  refreshLabel = document.getElementById('refreshLabel');

window.debugAtendimentosEmulti = function(){
    if(!latestWb){
      console.warn('[debugAtendimentosEmulti] o painel ainda não carregou nenhuma planilha.');
      return;
    }
    var periodo = periodoEfetivoAtual();
    var ws = latestWb.Sheets[suffixedName("Atendimentos")];
    var rows = ws ? sheetToRows(ws) : [];
    var header = rows[0] || [];
    var iData = colIndex(header, "data_hora");
    var iNome = colIndex(header, "nome");
    var iProf = colIndex(header, "profissional");
    var contagem = {};
    rows.slice(1).forEach(function(r){
      var nome = String(r[iNome]||"").trim();
      if(!nome || !withinPeriod(parseBRDate(r[iData]), periodo.inicio, periodo.fim)) return;
      var prof = String(r[iProf]||"").trim() || '(profissional em branco)';
      if(!contagem[prof]){
        var ehEmulti = profissionaisRoster.some(function(p){ return normalizeText(p.nome) === normalizeText(prof); });
        contagem[prof] = {atendimentos: 0, "é da eMulti (aba PROFISSIONAIS)": ehEmulti};
      }
      contagem[prof].atendimentos++;
    });
    var totalEmulti = Object.keys(contagem)
      .filter(function(k){ return contagem[k]["é da eMulti (aba PROFISSIONAIS)"]; })
      .reduce(function(s,k){ return s + contagem[k].atendimentos; }, 0);
    console.log('[debugAtendimentosEmulti] equipe(s): '+estadoApp.currentEquipes.map(function(e){ return e.label; }).join(' + ')
      +' | período: '+fmtBRDate(periodo.inicio)+' a '+fmtBRDate(periodo.fim)
      +' | TOTAL "Atendimentos individuais" (só eMulti): '+totalEmulti);
    console.table(contagem);
    return contagem;
  };

  // window.debugAtividadesCompartilhadas(): imprime, linha a linha, TODAS
  // as atividades de "Resumo Atividade Coletiva" dentro do período
  // efetivo atual (mesma janela usada pelo card "Composição do
  // numerador"), com o motivo exato pelo qual cada uma ENTROU ou NÃO
  // entrou na contagem de "Atividades coletivas compartilhadas". Não há
  // filtro de tipo de atividade aqui (nenhum tipo é excluído nessa aba) —
  // só entram em jogo "Qtd total de profissionais" >= 2 e a ligação com
  // Participantes Ativ. Coletiva ("Total de Profissionais da EMulti" >= 1).
  // Chame no console: debugAtividadesCompartilhadas()
window.debugAtividadesCompartilhadas = function(){
    if(!latestWb){
      console.warn('[debugAtividadesCompartilhadas] o painel ainda não carregou nenhuma planilha.');
      return;
    }
    var periodo = periodoEfetivoAtual();
    var racWs = latestWb.Sheets[suffixedName("Resumo Atividade Coletiva")];
    var racRows = racWs ? sheetToRows(racWs) : [];
    var racHeader = racRows[0] || [];
    var iRacData = colIndex(racHeader, "data");
    var iRacTipo = colIndex(racHeader, "tipo_atividade");
    var iRacTotalProf = colIndex(racHeader, "qtd_total_profissionais");
    var iRacProfEnv = colIndex(racHeader, "qtd_profissionais_envolvidos");
    var partWs = latestWb.Sheets[suffixedName("Participantes Ativ. Coletiva")];
    var partRows = partWs ? sheetToRows(partWs) : [];
    var ligacaoAtiv = criarLigacaoAtividades(partRows, racHeader);
    if(!ligacaoAtiv){
      console.warn('[debugAtividadesCompartilhadas] não foi possível ligar "Total de Profissionais da EMulti" (aba Participantes Ativ. Coletiva) — coluna "Qtd total de profissionais" ainda é checada normalmente, mas a checagem "temEmulti" fica sempre true (não exclui nenhuma linha por isso).');
    } else {
      console.log('[debugAtividadesCompartilhadas] ligação Resumo → Participantes usando: ' + ligacaoAtiv.modo);
    }
    var linhas = racRows.slice(1)
      .filter(function(r){ return withinPeriod(parseBRDate(r[iRacData]), periodo.inicio, periodo.fim); })
      .map(function(r){
        var totalEmultiPart = ligacaoAtiv ? ligacaoAtiv.total(r) : undefined;
        var totalProfGeral = (iRacTotalProf>=0 && r[iRacTotalProf]!=="" && r[iRacTotalProf]!==undefined)
          ? toInt(r[iRacTotalProf])
          : 1+toInt(r[iRacProfEnv]);
        var temEmulti = (totalEmultiPart === undefined) ? true : totalEmultiPart >= 1;
        var tipoRaw = iRacTipo>=0 ? String(r[iRacTipo]||"").trim() : "";
        var iRacTemaDbg = colIndex(racHeader, "temas_reuniao");
        var reuniaoSemTema = tipoRaw !== "" && tipoEhReuniao(tipoRaw)
          && (iRacTemaDbg < 0 || !temaEhDiscussaoCasoPts(r[iRacTemaDbg]));
        var conta = temEmulti && totalProfGeral >= 2 && !reuniaoSemTema;
        var motivoExclusao = conta ? "" :
          (reuniaoSemTema ? 'reunião sem o tema "Discussão de caso / Projeto terapêutico singular"'
          : totalProfGeral < 2 ? 'qtd_total_profissionais < 2 (' + totalProfGeral + ')'
          : 'Total de Profissionais da EMulti = 0 (não achou ligação com Participantes)');
        return {
          data: iRacData>=0 ? String(r[iRacData]) : "",
          tipo_atividade: tipoRaw,
          qtd_total_profissionais: totalProfGeral,
          "Total Prof. EMulti (ligação)": totalEmultiPart===undefined ? "(sem ligação)" : totalEmultiPart,
          "CONTA como compartilhada?": conta ? "SIM" : "não",
          "motivo se não contou": motivoExclusao
        };
      });
    var totalLinhas = linhas.length;
    var totalCompartilhadas = linhas.filter(function(l){ return l["CONTA como compartilhada?"] === "SIM"; }).length;
    console.log('[debugAtividadesCompartilhadas] equipe(s): '+estadoApp.currentEquipes.map(function(e){ return e.label; }).join(' + ')
      +' | período: '+fmtBRDate(periodo.inicio)+' a '+fmtBRDate(periodo.fim)
      +' | linhas no período: '+totalLinhas+' | contam como compartilhada: '+totalCompartilhadas);
    console.table(linhas);
    return linhas;

  };

refreshBtn.addEventListener('click', fetchAndLoad);

renderEquipeSwitcher();
}
