// ======================================================================
// nucleo/dados.js
// Parsing, filtro por equipe, dados oficiais, cadastro de profissionais e classificações
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { estadoApp } from './estado.js';
import { calcularIndicadoresDoPeriodo } from '../indicadores/calculo.js';
import { EQUIPES, calcularJanelaPeriodo } from './config.js';
import { fetchSheetCsv } from './fetch-csv.js';
import { OFFICIAL_SHEET_NAME } from './periodos.js';

// ---------- Parsing ----------
export function sheetToRows(ws){
  if(Array.isArray(ws)) return ws; // já é uma matriz de linhas (vindo do parseCsv)
  return XLSX.utils.sheet_to_json(ws, {header:1, defval:""});
}

// ---------- Filtro por equipe (linha a linha) ----------
// Não existem abas separadas por equipe — cada linha da aba tem uma
// coluna "equipe_unidade" (ou similar) que identifica a equipe. Aqui a
// gente acha essa coluna e mantém só as linhas da equipe selecionada.
export function normalizeText(s){
  return String(s||"").toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

// Profissionais que de fato são da eMulti — usado só pra filtrar o
// gráfico "Comparativo por profissional" (a aba de atendimentos traz
// profissionais de fora da equipe também, ex. de outros programas que
// atenderam o mesmo paciente, e esses não devem entrar nesse
// comparativo). Comparação ignora acento/maiúscula (normalizeText).
var PROFISSIONAIS_COMPARATIVO_EMULTI;

export function ehProfissionalComparativoEmulti(nome){
  return PROFISSIONAIS_COMPARATIVO_EMULTI.indexOf(normalizeText(nome)) >= 0;
}

export function equipeColIndex(headerRow){
  for(var i=0;i<headerRow.length;i++){
    var h = normalizeText(headerRow[i]).replace(/\s+/g,'_');
    if(h === "EQUIPE_UNIDADE") return i;
  }
  for(var j=0;j<headerRow.length;j++){
    if(normalizeText(headerRow[j]).indexOf("EQUIPE") !== -1) return j;
  }
  return -1;
}

// ---------- Dados oficiais (aba Q2-26) ----------
// A aba Q2-26 tem uma única tabela, uma linha por equipe/mês, com
// cabeçalho: MÊS | NOME DA EQUIPE | SIGLA DA EQUIPE | NUMERADOR M1 |
// DENOMINADOR M1 | PONTUAÇÃO M1 (não usada — recalculamos pra garantir
// a mesma fórmula do painel) | NUMERADOR M2 | DENOMINADOR M2 |
// PONTUAÇÃO M2. Não há coluna separada por aba/equipe — filtramos e
// agrupamos aqui mesmo.
var MESES_PT_ABREV = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};

export function parseMesAbrevPt(raw){
  var s = String(raw||"").trim().toLowerCase().replace(/\./g,'');
  var m = s.match(/^([a-z]{3})\/(\d{2,4})$/);
  if(m && MESES_PT_ABREV[m[1]]!==undefined){
    var anoStr = m[2];
    var ano = anoStr.length===2 ? (2000+ +anoStr) : +anoStr;
    return {ano:ano, mesIdx:MESES_PT_ABREV[m[1]]};
  }
  // Reforço: se a célula "MÊS" for uma data de verdade (não texto), o
  // gviz/CSV pode devolver algo como "31/5/2026" ou "2026-05-31" em vez
  // de "mai./26" — tenta os dois formatos antes de desistir.
  var d = parseBRDate(raw);
  if(d) return {ano: d.getFullYear(), mesIdx: d.getMonth()};
  return null;
}

// Acha a equipe (EQUIPES) cujo matchKeyword aparece no "NOME DA EQUIPE"
// da aba oficial — mesma lógica/keywords usadas pra filtrar as abas
// brutas por equipe (ver EQUIPES e filtrarLinhasPorEquipe).
export function equipeKeyFromNomeOficial(nome){
  var norm = normalizeText(nome);
  var achou = EQUIPES.filter(function(eq){ return norm.indexOf(normalizeText(eq.matchKeyword)) !== -1; });
  return achou.length ? achou[0].key : null;
}

function officialOverrideKey(equipeKey, ano, mesIdx, indicador){
  return equipeKey + '|' + ano + '-' + String(mesIdx+1).padStart(2,'0') + '|' + indicador;
}

// Faz o parse do CSV bruto da aba Q2-26 pro mapa de overrides. Espera
// uma linha de cabeçalho com MÊS, NOME DA EQUIPE, SIGLA DA EQUIPE,
// NUMERADOR M1, DENOMINADOR M1, PONTUAÇÃO M1, NUMERADOR M2,
// DENOMINADOR M2, PONTUAÇÃO M2 (colunas achadas pelo nome, não por
// posição fixa — ver colIndex). Cada linha de dado gera até 2 entradas
// no mapa (M1 e M2); linhas sem MÊS/NOME DA EQUIPE reconhecíveis, ou a
// própria linha de cabeçalho, são ignoradas.
function parseOfficialSheetCsv(csvText){
  var rows = parseCsv(csvText);
  var map = {};
  if(!rows.length) return map;
  var header = rows[0];
  var iMes = colIndex(header, 'mes');
  var iEquipe = colIndex(header, 'nome_da_equipe');
  var iNumM1 = colIndex(header, 'numerador_m1');
  var iDenM1 = colIndex(header, 'denominador_m1');
  var iNumM2 = colIndex(header, 'numerador_m2');
  var iDenM2 = colIndex(header, 'denominador_m2');
  if(iMes<0 || iEquipe<0 || iNumM1<0 || iDenM1<0 || iNumM2<0 || iDenM2<0) return map;
  rows.slice(1).forEach(function(r){
    var equipeKey = equipeKeyFromNomeOficial(r[iEquipe]);
    if(!equipeKey) return;
    var mes = parseMesAbrevPt(r[iMes]);
    if(!mes) return;
    map[officialOverrideKey(equipeKey, mes.ano, mes.mesIdx, 'M1')] = {
      numerador: toInt(r[iNumM1]),
      denominador: toInt(r[iDenM1])
    };
    map[officialOverrideKey(equipeKey, mes.ano, mes.mesIdx, 'M2')] = {
      numerador: toInt(r[iNumM2]),
      denominador: toInt(r[iDenM2])
    };
  });
  return map;
}

// Busca a aba oficial à parte (não é uma aba "bruta" filtrada por
// equipe, ver requiredSheetNames). Nunca rejeita a promise — se a aba
// não existir ou a busca falhar, simplesmente mantém os overrides já
// carregados antes (ou vazio, na primeira vez), sem travar o resto do
// carregamento do painel.
export function fetchOfficialOverridesSafe(){
  return fetchSheetCsv(OFFICIAL_SHEET_NAME)
    .then(function(csvText){ estadoApp.officialOverrides = parseOfficialSheetCsv(csvText); })
    .catch(function(){ /* mantém officialOverrides como estava */ });
}

// ---------- Cadastro de Profissionais (aba "PROFISSIONAIS") ----------
// Fonte de verdade de QUEM deve aparecer na aba Desempenho Profissional:
// cada linha desta aba (na mesma planilha de origem) traz o nome do
// profissional, a equipe a que pertence e a categoria profissional
// (CBO/função). Diferente das abas de dados brutos (BASE_SHEET_NAMES),
// esta é uma aba de CADASTRO, sem data/período — é buscada à parte,
// igual à aba oficial (ver fetchOfficialOverridesSafe acima), e nunca
// trava o carregamento do painel se estiver ausente, vazia ou com
// colunas de nome diferente (ver profRosterColIndex).
var PROFISSIONAIS_SHEET_NAME = "PROFISSIONAIS";

// lista de {nome, equipeKey, categoria} — uma entrada por
// profissional+equipe cadastrados na aba (um profissional que atua em
// 2 equipes gera 2 entradas, uma pra cada).
export var profissionaisRoster = [];

// Diz se um nome está cadastrado na aba PROFISSIONAIS (roster da
// eMulti). Usado em vários lugares (filtro de M1, "Pessoas atendidas",
// debug) — fica num único lugar pra não duplicar a lógica de
// normalização. O cache é reconstruído sozinho sempre que
// profissionaisRoster muda de referência (recarregou a planilha).
var rosterNomesEmultiCache = null;

var rosterNomesEmultiCacheFor = null;

export function nomeEhDaEmulti(nome){
  if(rosterNomesEmultiCacheFor !== profissionaisRoster){
    rosterNomesEmultiCache = {};
    profissionaisRoster.forEach(function(p){ rosterNomesEmultiCache[normalizeText(p.nome)] = true; });
    rosterNomesEmultiCacheFor = profissionaisRoster;
  }
  nome = String(nome||"").trim();
  return !!nome && !!rosterNomesEmultiCache[normalizeText(nome)];
}

// Acha a coluna certa tentando primeiro nomes exatos e, não achando,
// cai pra uma busca por palavra-chave no cabeçalho — protege contra a
// aba PROFISSIONAIS usar um nome de coluna um pouco diferente do
// esperado.
function profRosterColIndex(header, candidatos, fallbackKeyword){
  for(var i=0;i<candidatos.length;i++){
    var idx = colIndex(header, candidatos[i]);
    if(idx >= 0) return idx;
  }
  if(fallbackKeyword){
    for(var j=0;j<header.length;j++){
      if(normalizeText(header[j]).indexOf(fallbackKeyword) !== -1) return j;
    }
  }
  return -1;
}

// Layout real da aba (ver print do usuário): "Nome do Profissional" |
// "CATEGORIA PROFISSIONAL" | "Equipe 1" | "Equipe 2" (podendo ter mais
// colunas "Equipe N" à direita) — cada profissional pode ter 1 ou 2
// equipes preenchidas (2 quando atua nas duas). Por isso, ao contrário
// das outras colunas, TODAS as colunas cujo cabeçalho contenha
// "EQUIPE" são lidas, e cada uma preenchida na linha vira uma entrada
// separada no roster (mesmo profissional, equipes diferentes).
function parseProfissionaisCsv(csvText){
  var rows = parseCsv(csvText);
  if(!rows.length) return [];
  var header = rows[0];
  var iNome = profRosterColIndex(header, ["Nome do Profissional","profissional","nome_profissional","nome"], "PROFISSIONAL");
  var iCategoria = profRosterColIndex(header, ["CATEGORIA PROFISSIONAL","categoria_profissional","categoria_prof","categoria","cbo"], "CATEGORIA");
  var equipeCols = [];
  header.forEach(function(h, idx){
    if(normalizeText(h).indexOf("EQUIPE") !== -1) equipeCols.push(idx);
  });
  if(iNome < 0) return [];
  var lista = [];
  // Deduplica por profissional+equipe: evita cartão duplicado no
  // Panorama Assistencial quando a mesma equipe aparece preenchida em
  // mais de uma coluna "Equipe N" da mesma linha (ex.: "Equipe 1" e
  // "Equipe 2" ambas com "Centro" por engano de digitação) — sem isso,
  // cada coluna virava uma entrada separada no roster com o MESMO
  // nome+equipe, e calcularPerformanceProfissionais gerava um cartão
  // idêntico pra cada uma.
  var vistos = {};
  rows.slice(1).forEach(function(r){
    var nome = String(r[iNome]||"").trim();
    if(!nome) return;
    var categoria = iCategoria>=0 ? String(r[iCategoria]||"").trim() : "";
    equipeCols.forEach(function(iEquipe){
      var valorEquipe = normalizeText(r[iEquipe]);
      if(!valorEquipe) return; // "Equipe 2" costuma vir vazia pra quem só atua em 1 equipe
      var equipeMatch = EQUIPES.filter(function(eq){ return valorEquipe.indexOf(normalizeText(eq.matchKeyword)) !== -1; })[0];
      if(!equipeMatch) return;
      var chave = normalizeText(nome) + '|' + equipeMatch.key;
      if(vistos[chave]) return;
      vistos[chave] = true;
      lista.push({nome: nome, equipeKey: equipeMatch.key, categoria: categoria});
    });
  });
  return lista;
}

// Nunca rejeita a promise — sem a aba PROFISSIONAIS (ou com erro na
// busca), profissionaisRoster fica como estava (ou vazio, na primeira
// vez) e calcularPerformanceProfissionais cai no comportamento antigo
// (lista derivada da aba Atendimentos — ver mais abaixo).
export function fetchProfissionaisSafe(){
  return fetchSheetCsv(PROFISSIONAIS_SHEET_NAME)
    .then(function(csvText){ profissionaisRoster = parseProfissionaisCsv(csvText); })
    .catch(function(){ /* mantém profissionaisRoster como estava */ });
}

// Aplica (in-place) o override oficial em `data` (o objeto retornado por
// calcularIndicadoresDoPeriodo) pro mês/ano informados, considerando as
// equipes atualmente selecionadas (currentEquipes). Só substitui M1 (ou
// M2) quando TODAS as equipes selecionadas têm dado oficial pra aquele
// indicador/mês — com 2 equipes marcadas, soma numerador e denominador
// de ambas e recalcula a pontuação (mesma fórmula do painel: M1 =
// numerador/denominador; M2 = numerador/denominador×100). Sem dado
// oficial completo, o valor calculado pelo painel é mantido como está.
function aplicarOverrideOficial(data, ano, mesIdx){
  // Guarda o valor CALCULADO pelo painel antes de qualquer substituição
  // — usado só pelo relatório de divergência (ver gerarPdfDivergenciaOficial),
  // pra poder comparar lado a lado com o valor oficial mesmo depois que
  // `data` já foi sobrescrito abaixo.
  data.numeradorM1Calculado = data.numeradorM1;
  data.denominadorM1Calculado = data.denominadorM1;
  data.m1Calculado = data.m1;
  data.numeradorM2Calculado = data.numeradorM2;
  data.denominadorM2Calculado = data.denominadorM2;
  data.m2Calculado = data.m2;
  ['M1','M2'].forEach(function(indicador){
    var entradas = estadoApp.currentEquipes.map(function(eq){
      return estadoApp.officialOverrides[officialOverrideKey(eq.key, ano, mesIdx, indicador)];
    });
    if(!entradas.length || entradas.some(function(e){ return !e; })) return;
    var numerador = entradas.reduce(function(a,e){ return a+e.numerador; }, 0);
    var denominador = entradas.reduce(function(a,e){ return a+e.denominador; }, 0);
    if(indicador === 'M1'){
      var m1 = denominador ? (numerador/denominador) : null;
      data.numeradorM1 = numerador;
      data.denominadorM1 = denominador;
      data.m1 = m1;
      data.classificacaoM1 = classificarM1(m1);
      data.m1Oficial = true;
    } else {
      var m2 = denominador ? (numerador/denominador*100) : null;
      data.numeradorM2 = numerador;
      data.denominadorM2 = denominador;
      data.m2 = m2;
      data.classificacaoM2 = classificarM2(m2);
      data.m2Oficial = true;
    }
  });
  // Recalcula a síntese (pontos/nota/desempenho) com as classificações
  // já atualizadas acima — idêntico ao cálculo original quando não há
  // override (não altera nada nesse caso, só reexecuta a mesma fórmula).
  var pontosM1 = PONTOS_POR_CLASSE[data.classificacaoM1];
  var pontosM2 = PONTOS_POR_CLASSE[data.classificacaoM2];
  var pontosM1Pesados = pontosM1!==undefined ? pontosM1*6 : null;
  var pontosM2Pesados = pontosM2!==undefined ? pontosM2*4 : null;
  data.pontosM1 = pontosM1Pesados;
  data.pontosM2 = pontosM2Pesados;
  data.notaFinal = (pontosM1Pesados!=null && pontosM2Pesados!=null) ? (pontosM1Pesados+pontosM2Pesados) : null;
  data.desempenho = classificarDesempenho(data.notaFinal);
  return data;
}

// Wrapper usado em todo lugar que hoje calcula o resultado "com janela
// móvel" de um mês de referência (calcularIndicadoresDoPeriodo +
// calcularJanelaPeriodo) — aplica o override oficial (quando existir)
// logo em seguida, então o restante do painel (gauge, cards, médias,
// gráfico de Tendência) nem precisa saber se o valor veio calculado ou
// da aba oficial.
export function calcularJanelaComOverride(wb, refMonth){
  var res = calcularIndicadoresDoPeriodo(wb, calcularJanelaPeriodo(refMonth));
  aplicarOverrideOficial(res.data, refMonth.getFullYear(), refMonth.getMonth());
  return res;
}

export function filtrarLinhasPorEquipe(matrix, equipes){
  if(!matrix || !matrix.length) return matrix || [];
  var header = matrix[0];
  var idx = equipeColIndex(header);
  if(idx < 0) return matrix; // aba sem coluna de equipe: não filtra
  var keywords = equipes.map(function(eq){ return normalizeText(eq.matchKeyword || eq.suffix); });
  var linhas = matrix.slice(1).filter(function(r){
    var valor = normalizeText(r[idx]);
    return keywords.some(function(kw){ return valor.indexOf(kw) !== -1; });
  });
  return [header].concat(linhas);
}

// Parser de CSV manual (RFC4180: respeita campos entre aspas, vírgulas e
// quebras de linha dentro de campos). Usado em vez do XLSX.read(string)
// porque a leitura automática de string do SheetJS não separava as
// linhas corretamente para o CSV retornado pelo endpoint gviz.
export function parseCsv(text){
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;
  for(var i=0; i<text.length; i++){
    var c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if(c === '"'){ inQuotes = true; }
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\r'){ /* ignora, quebra tratada no \n */ }
      else if(c === '\n'){ row.push(field); field=''; rows.push(row); row=[]; }
      else { field += c; }
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows;
}

// Datas nas abas brutas vêm como texto dd/mm/aaaa (é assim que o script
// de extração grava). Também aceita aaaa-mm-dd como reforço, caso a
// célula tenha sido digitada nesse formato.
export function parseBRDate(raw){
  var s = String(raw||"").trim();
  if(!s) return null;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return new Date(+m[3], +m[2]-1, +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return new Date(+m[1], +m[2]-1, +m[3]);
  return null;
}

export function fmtBRDate(d){
  if(!d) return "—";
  return String(d.getDate()).padStart(2,'0') + "/" + String(d.getMonth()+1).padStart(2,'0') + "/" + d.getFullYear();
}

export function withinPeriod(dateVal, inicio, fim){
  return dateVal && dateVal >= inicio && dateVal <= fim;
}

export function colIndex(headerRow, name){
  var aliases = {
    data_hora: ['data_hora','data','date'],
    equipe_unidade: ['equipe_unidade','equipe - unidade','equipe  - unidade','equipe/unidade'],
    qtd_atendimentos: ['qtd_atendimentos','qtd de atendimentos','quantidade de atendimentos','atendimentos'],
    // Variações de nome pra coluna de tipo da Atividade Coletiva.
    tipo_atividade: ['tipo_atividade','tipo de atividade','tipo','tipo_da_atividade'],
    // Variações comuns pra "quantidade total de profissionais" e
    // "quantidade de profissionais envolvidos" na aba Resumo Atividade
    // Coletiva — sem isso, se o cabeçalho real da planilha vier escrito
    // diferente do esperado, nenhuma das duas colunas é encontrada e o
    // painel nunca consegue contar nenhuma atividade como compartilhada
    // (ver comentário em cima do cálculo de atividadesCompartilhadasListas).
    // ID da atividade (chave que liga "Resumo Atividade Coletiva" a
    // "Participantes Ativ. Coletiva") e total de profissionais da eMulti
    // vindo de Participantes.
    id_atividade: ['id_atividade','id atividade','id da atividade','codigo_atividade','codigo da atividade','cod_atividade','cod atividade','id_ativ','id','codigo'],
    responsavel: ['responsavel','responsavel atividade','responsavel da atividade'],
    total_prof_emulti: ['total de profissionails da emulti','total profissionails emulti','total_prof_emulti','total de profissionais da emulti','total de profissionais emulti','total profissionais emulti','qtd_profissionais_emulti','qtd total de profissionais da emulti','quantidade de profissionais da emulti'],
    qtd_total_profissionais: ['qtd_total_profissionais','quantidade total de profissionais','total de profissionais','qtd_de_profissionais','qtd total de profissionais'],
    qtd_profissionais_envolvidos: ['qtd_profissionais_envolvidos','profissionais_envolvidos','quantidade de profissionais envolvidos','nº de profissionais envolvidos','numero de profissionais envolvidos','profissionais envolvidos'],
    // Variação de nome pra coluna de participantes da aba Resumo Reuniões.
    qtd_participantes: ['qtd_participantes','quantidade de participantes','participantes','qtd de participantes'],
    // Coluna "Temas da reunião" da aba Resumo Reuniões (pode trazer mais de um tema na mesma célula).
    temas_reuniao: ['temas_reuniao','temas da reuniao','temas_da_reuniao','temas','tema','tema_reuniao','tema da reuniao'],
    // Coluna "Tipo" da reunião na aba Resumo Reuniões (códigos 01-03:
    // Reunião de Equipe, Reunião com outras equipes de saúde, Reunião
    // intersetorial/Conselho local de saúde/Controle social).
    tipo_reuniao: ['tipo_reuniao','tipo de reuniao','tipo_da_reuniao','tipo']
  };
  var wanted = String(name||'').trim().toLowerCase();
  var candidates = aliases[wanted] || [wanted];
  function key(v){ return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[ºª]/g,'').replace(/[-\s]+/g,'_'); }
  for(var i=0;i<headerRow.length;i++){
    var actual = key(headerRow[i]);
    for(var j=0;j<candidates.length;j++){
      if(actual === key(candidates[j])) return i;
    }
  }
  return -1;
}

// Coluna do profissional "Responsável" na aba "Participantes Ativ.
// Coletiva": SEMPRE a 4ª coluna (índice 3) da tabela — é onde esse
// profissional fica registrado nessa aba (junto com Profissional 1 a
// 5, na mesma linha). Não busca mais por nome de cabeçalho: a tentativa
// anterior de achar por nome ("responsavel"/"Responsável"/"Responsavel
// Atividade") não batia com o cabeçalho real da planilha e, pior,
// podia achar por engano outra coluna antes de chegar no fallback
// posicional — por isso a posição fixa é a fonte principal agora, com
// busca por nome só como reforço se a tabela tiver 4 colunas ou menos
// (não deveria acontecer nesta aba).
export function colRespParticipantes(headerRow){
  if(headerRow && headerRow.length > 3) return 3;
  return colIndex(headerRow, "responsavel");
}

export function toInt(v){
  var n = parseInt(String(v===undefined||v===null?"":v).trim(), 10);
  return isNaN(n) ? 0 : n;
}

// Normaliza texto pra comparar tipo_atividade sem depender de acento,
// maiúscula/minúscula ou espaço/barra diferente ("Avaliação/Procedimento
// coletivo" vs "Avaliação / Procedimento Coletivo" etc.).
export function normalizarTexto(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/\s+/g," ").replace(/\s*\/\s*/g,"/").trim();
}

export var PONTOS_POR_CLASSE = {"Regular":0.25, "Suficiente":0.5, "Bom":0.75, "Ótimo":1};

// Mesmas cores dos "pills" de classificação (ver :root), usadas pra
// colorir a linha/rótulo de média de cada quadrimestre no gráfico de
// Tendência conforme a faixa em que a média cai.
var CLASS_COLOR = {"Regular":"#B5474B", "Suficiente":"#C68A3D", "Bom":"#6B8F71", "Ótimo":"#2F6F5E"};

export function classificarM1(v){
  if(v===null) return "—";
  if(v>3) return "Ótimo";
  if(v>2) return "Bom";
  if(v>1) return "Suficiente";
  return "Regular";
}

export function classificarM2(v){
  if(v===null) return "—";
  if(v>5) return "Ótimo";
  if(v>2.5) return "Bom";
  if(v>1) return "Suficiente";
  return "Regular";
}

export function classificarDesempenho(nota){
  if(nota===null) return "—";
  if(nota>7.5) return "Ótimo";
  if(nota>=5) return "Bom";
  if(nota>2.5) return "Suficiente";
  return "Regular";
}

export var NOTAS_METODOLOGICAS = [
  "Cálculo feito pelo próprio painel, direto dos dados brutos extraídos do e-SUS PEC (Atendimentos + Registro Tardio + Atividade Coletiva + Reuniões) para esta equipe/EMULTI, seguindo as fórmulas das Notas Metodológicas M1 (NT 43/2026-CGIAD/DEAPS/SAPS/MS) e M2 (NT 44/2026-CGIAD/DEAPS/SAPS/MS), na janela dos últimos 4 meses (ver 'Período' no topo da página) — não um quadrimestre fixo do calendário.",
  "M1 usa NOME da pessoa (a nota oficial usa CPF/CNS) — pessoas diferentes com o mesmo nome seriam contadas como se fossem uma só.",
  "Atendimento individual (M1) só conta quando o profissional responsável (coluna 'profissional' da aba Atendimentos) está cadastrado na aba PROFISSIONAIS como sendo da eMulti — atendimentos de profissionais de fora da eMulti não entram no numerador.",
  "Participação coletiva (M1) só conta quando pelo menos um dos profissionais da atividade (coluna do Responsável — identificada pelo nome do cabeçalho ou, se não encontrada por nome, pela 4ª coluna da tabela — ou 'Profissional 1' a 'Profissional 5' da aba Participantes Ativ. Coletiva) está cadastrado na aba PROFISSIONAIS como sendo da eMulti — participações conduzidas só por profissionais de fora da eMulti não entram no numerador.",
  "M2 oficial soma 3 componentes: atendimentos individuais compartilhados, atividades coletivas compartilhadas e compartilhamento de cuidado (PEC). Esta extração só consegue aproximar as parcelas de 'atividades coletivas' e 'reuniões'. Regra de ação compartilhada aplicada: pelo menos 1 profissional identificado (CNS/CPF) da eMulti — seja como responsável ou como profissional envolvido, não precisa ser especificamente o responsável — e 2 ou mais profissionais distintos no total; compartilhamentos com eSB ou com qualquer profissional da APS contam igual, desde que identificados. Ainda não é possível checar CBO/CNS propriamente ditos (só o cadastro da aba PROFISSIONAIS), nem aplicar a regra de descartar ação específica duplicada quando a mesma pessoa/grupo também teve ação compartilhada registrada no mesmo dia.",
  "Atendimentos individuais compartilhados são APROXIMADOS aqui (mesma pessoa, mesmo dia, 2+ profissionais distintos na lista de Atendimentos — a lista não traz os profissionais secundários nem o horário simultâneo); cada pessoa/dia compartilhado conta 1 ação e os registros específicos duplicados são desconsiderados. O compartilhamento de cuidado (PEC) NÃO entra aqui (não há aba equivalente) — por isso o M2 calculado tende a ficar ABAIXO do valor oficial. O denominador do M2 é o TOTAL de ações da eMulti no período: atendimentos individuais (específicos + compartilhados) + atividades coletivas (todas, específicas e compartilhadas, incluindo reuniões) — sem contar solicitações de compartilhamento de cuidado no PEC, pelo mesmo motivo.",
  "Atividade Coletiva só conta como 'compartilhada' aqui quando tem pelo menos 1 profissional da eMulti (coluna 'Total de Profissionais da EMulti', de Participantes Ativ. Coletiva) e 2 ou mais profissionais no total ('Qtd total de profissionais') — sem restrição de tipo de atividade (todos os tipos contam).",
  "Reuniões (Resumo Reuniões) só contam pra M2 quando o 'Tipo' é Reunião de Equipe, Reunião com outras equipes de saúde ou Reunião intersetorial/Conselho local de saúde/Controle social (códigos 01-03) E têm 2+ participantes E o tema 'Discussão de caso / Projeto terapêutico singular' marcado na coluna 'Temas da reunião' (a célula pode ter vários temas). Reuniões que não batem essas condições aparecem no total de reuniões, mas não entram como 'compartilhadas'.",
  "'Desempenho quadrimestral' usa a fórmula oficial da Nota Final do Componente III (Qualidade) para eMulti — NT 8/2026-DEAPS/SAPS/MS, Quadro 4: Nota final = pontos M1 × 6 + pontos M2 × 4 (pontos por classificação: Regular=0,25, Suficiente=0,5, Bom=0,75, Ótimo=1), classificada conforme o Quadro 6 da mesma nota: Regular ≤ 2,5, Suficiente > 2,5 e < 5, Bom ≥ 5 e ≤ 7,5, Ótimo > 7,5. O que NÃO é oficial aqui é o DADO de entrada: o M1 e o M2 usados nessa conta são os calculados por este painel a partir dos dados brutos (ver notas acima), não os valores publicados pelo Siaps — por isso o resultado exibido é uma aproximação do Componente III oficial, não o valor de cofinanciamento em si.",
  "Abandono consumado: o paciente precisa ter pelo menos 2 consultas. O painel calcula a mediana histórica do intervalo entre a 1ª e a 2ª consulta dos pacientes analisados e mede os dias desde a última consulta de cada paciente. Quando esse intervalo é maior que 3 vezes a mediana histórica, o paciente é classificado como abandono consumado.",
  "Classificação do acompanhamento: Em dia = dias desde a última consulta ≤ mediana; Em risco = dias desde a última consulta > mediana e ≤ 3 × mediana; Abandono consumado = dias desde a última consulta > 3 × mediana. O painel não usa um número fixo de dias: o limite é calculado dinamicamente com base no comportamento histórico dos pacientes incluídos nos filtros da aba Análises.",
  "Na aba Análises, a classificação considera o histórico inteiro ou os quadrimestres selecionados na própria aba Análises, e não necessariamente o filtro global de período.",
  "Filtro 'Fluxo' (tabela Pessoas Atendidas): calculado sobre o histórico COMPLETO de cada pessoa (Atendimentos + Participantes Ativ. Coletiva, ignorando o filtro de Mês próprio dessa tabela), na janela móvel dos últimos 4 meses terminando no último dia do mês ATUAL real (não no mês filtrado no topo da página). 'Entrada' = o primeiro atendimento/participação de todo o histórico da pessoa caiu dentro dessa janela. 'Saída' = a pessoa não tem nenhum atendimento/participação dentro dessa janela (mesmo tendo histórico anterior). Quem já vinha de antes da janela e também tem evento dentro dela (segue ativa) fica sem rótulo nessa coluna."
];

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
  PROFISSIONAIS_COMPARATIVO_EMULTI = [
    "FRANCISCA TEREZINHA ARAUJO",
    "ANNA ALLYNE ALVES CARVALHO",
    "ECLENE PAULO DOS SANTOS",
    "KELLE ROSSANNE LINHARES PAULO",
    "MARIA EVELINE PONTES MONTE",
    "CLECIANE NOBRE XIMENES",
    "KAROLINY MELO DE CASTRO",
    "IWDMILLY DE SOUSA LINHARES",
    "JOSE LUCAS CAETANO OLIVEIRA",
    "ALINE DE SOUSA ROSA",
    "MARCILENE ALVES DA SILVA",
    "HANNA LUIZA OLIVEIRA GOMES",
    "KARISE SANTOS VASCONCELOS",
    "LETÍCIA EMILLY MESQUITA DE SOUSA",
    "ANNA MAEVILLY LIRA LOPES MARTINS"
  ].map(normalizeText);
}
