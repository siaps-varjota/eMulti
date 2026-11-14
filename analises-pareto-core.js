// ======================================================================
// analises-pareto-core.js
// Regras puras da aba "Análises" (sem DOM e sem acesso à planilha):
// perda de pontos por indicador, Pareto 80/20 e prioridades por regras.
// Fica separado de analises-pareto.js para poder ser testado em Node.
// ======================================================================

// Nota final do Componente III (eMulti): pontos M1 x 6 + pontos M2 x 4 (máx. 10).
export var PESOS = { M1: 6, M2: 4 };
export var NOME_INDICADOR = {
  M1: 'M1 — Média de atendimentos por pessoa',
  M2: 'M2 — Ações compartilhadas'
};
export var PONTOS_CLASSE = { 'Regular': 0.25, 'Suficiente': 0.5, 'Bom': 0.75, 'Ótimo': 1 };
var ORDEM_CLASSES = ['Regular', 'Suficiente', 'Bom', 'Ótimo'];

// Limite SUPERIOR de cada classe (o valor precisa SUPERAR o limite da classe atual
// para passar à próxima — mesmas regras de classificarM1/classificarM2).
var LIMITES = {
  M1: { 'Regular': 1, 'Suficiente': 2, 'Bom': 3 },
  M2: { 'Regular': 1, 'Suficiente': 2.5, 'Bom': 5 }
};

export function fmtNum(v, casas) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas == null ? 1 : casas, maximumFractionDigits: casas == null ? 1 : casas });
}

// Uma linha de resultado = uma equipe em um quadrimestre:
// { equipe, periodo, m1, m2, classeM1, classeM2, nota, meses:[{mes, m1, m2}] }
// Devolve uma linha por indicador com os pontos obtidos e perdidos.
export function linhasDePerda(res) {
  var out = [];
  ['M1', 'M2'].forEach(function (ind) {
    var classe = ind === 'M1' ? res.classeM1 : res.classeM2;
    var valor = ind === 'M1' ? res.m1 : res.m2;
    var pts = PONTOS_CLASSE[classe];
    if (pts === undefined) return; // sem dado: não entra
    var peso = PESOS[ind];
    out.push({
      equipe: res.equipe, periodo: res.periodo, indicador: ind, valor: valor, classe: classe,
      peso: peso, obtido: pts * peso, perda: peso - pts * peso
    });
  });
  return out;
}

// agrupar = 'indicador' (padrão: soma entre equipes/períodos) ou 'equipe' (equipe + indicador).
// Devolve as barras ordenadas pela maior perda, com % individual e % acumulado.
export function agregarPareto(linhas, agrupar) {
  var mapa = {}, ordem = [];
  linhas.forEach(function (l) {
    var chave = agrupar === 'equipe' ? l.equipe + '|' + l.indicador : l.indicador;
    var rotulo = agrupar === 'equipe' ? l.equipe + ' — ' + l.indicador : NOME_INDICADOR[l.indicador];
    if (!mapa[chave]) { mapa[chave] = { chave: chave, indicador: l.indicador, equipe: agrupar === 'equipe' ? l.equipe : null, rotulo: rotulo, peso: 0, obtido: 0, perda: 0 }; ordem.push(chave); }
    mapa[chave].peso += l.peso; mapa[chave].obtido += l.obtido; mapa[chave].perda += l.perda;
  });
  var itens = ordem.map(function (k) { return mapa[k]; })
    .sort(function (a, b) { return b.perda - a.perda || b.peso - a.peso; });
  var total = itens.reduce(function (s, i) { return s + i.perda; }, 0);
  var acum = 0;
  itens.forEach(function (i) {
    i.pct = total > 0 ? i.perda / total * 100 : 0;
    acum += i.pct;
    i.acumulado = total > 0 ? Math.min(100, acum) : 0;
    i.prioritario = total > 0 && (i.acumulado - i.pct) < 80; // até cruzar 80%
  });
  return itens;
}

export function proximaClasse(classe) {
  var i = ORDEM_CLASSES.indexOf(classe);
  return i >= 0 && i < ORDEM_CLASSES.length - 1 ? ORDEM_CLASSES[i + 1] : null;
}

// Quanto falta para a próxima classe e quanto isso vale na nota final.
export function ganhoProximaClasse(ind, valor, classe) {
  var prox = proximaClasse(classe);
  if (!prox || valor == null) return null;
  var limite = LIMITES[ind][classe];
  return {
    proxima: prox, limite: limite, falta: Math.max(0, limite - valor),
    ganhoNota: (PONTOS_CLASSE[prox] - PONTOS_CLASSE[classe]) * PESOS[ind]
  };
}

var ACOES = {
  M1: [
    'Reforçar o retorno dos usuários já atendidos: agendar o retorno antes de a pessoa sair e fazer busca ativa de faltosos (a média sobe quando cada pessoa volta mais vezes).',
    'Rever a agenda dos profissionais da eMulti: horários protegidos para retorno e redução de vagas ociosas.',
    'Conferir se todos os atendimentos e participações em atividades coletivas dos profissionais da eMulti estão sendo registrados no e-SUS PEC (atendimento sem registro não conta no M1).'
  ],
  M2: [
    'Planejar atendimentos e atividades coletivas em conjunto, com 2 ou mais profissionais, e registrar todos os participantes no PEC.',
    'Registrar as reuniões de equipe com tema "Discussão de caso / Projeto terapêutico singular" e com 2 ou mais participantes (só elas contam como ação compartilhada).',
    'Conferir o preenchimento dos profissionais envolvidos nas atividades coletivas e nos atendimentos compartilhados no PEC.'
  ]
};

var ORDEM_NIVEL = { alta: 0, media: 1, baixa: 2 };
var SOBE = { alta: 'alta', media: 'alta', baixa: 'media' };

// Prioridades por regras fixas (usadas sempre que a IA não está configurada ou falha).
// Entrada: lista de resultados (uma equipe/quadrimestre cada). Cada indicador abaixo de
// "Ótimo" vira uma prioridade: nível pela classe (Regular=alta, Suficiente=média, Bom=baixa),
// subindo um nível quando o indicador piorou entre o primeiro e o último mês do período.
export function gerarPrioridadesRegras(resultados) {
  var lista = [];
  resultados.forEach(function (res) {
    ['M1', 'M2'].forEach(function (ind) {
      var classe = ind === 'M1' ? res.classeM1 : res.classeM2;
      var valor = ind === 'M1' ? res.m1 : res.m2;
      var base = classe === 'Regular' ? 'alta' : classe === 'Suficiente' ? 'media' : classe === 'Bom' ? 'baixa' : null;
      if (!base) return; // Ótimo ou sem dado
      var campo = ind === 'M1' ? 'm1' : 'm2';
      var comDado = (res.meses || []).filter(function (m) { return m[campo] != null; });
      var queda = comDado.length >= 2 && comDado[comDado.length - 1][campo] < comDado[0][campo];
      var nivel = queda ? SOBE[base] : base;
      var un = ind === 'M2' ? '%' : '';
      var motivo = 'Classificação ' + classe + ' em ' + res.periodo + ', com média de ' + fmtNum(valor, 2) + un + ' (peso ' + PESOS[ind] + ').';
      if (queda) {
        motivo += ' Há piora entre ' + comDado[0].mes + ' (' + fmtNum(comDado[0][campo], 2) + un + ') e ' + comDado[comDado.length - 1].mes + ' (' + fmtNum(comDado[comDado.length - 1][campo], 2) + un + ').';
      }
      var g = ganhoProximaClasse(ind, valor, classe);
      if (g) {
        motivo += ' Para chegar a ' + g.proxima + ' é preciso superar ' + fmtNum(g.limite, 1) + un + ' (faltam ' + fmtNum(g.falta, 2) + un + '), o que vale +' + fmtNum(g.ganhoNota, 2) + ' ponto(s) na nota final.';
      }
      lista.push({
        equipe: res.equipe, periodo: res.periodo, indicador: NOME_INDICADOR[ind], codigo: ind, nivel: nivel,
        motivo: motivo, acoes: ACOES[ind].slice(), peso: PESOS[ind], ganho: g ? g.ganhoNota : 0
      });
    });
  });
  lista.sort(function (a, b) {
    return ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel] || b.ganho - a.ganho || b.peso - a.peso;
  });
  var alta = lista.filter(function (p) { return p.nivel === 'alta'; }).length;
  return {
    resumo: lista.length === 0
      ? 'Nenhum indicador abaixo de Ótimo nos períodos escolhidos: os resultados estão Ótimos ou sem dados.'
      : lista.length + ' indicador(es) abaixo do conceito Ótimo, dos quais ' + alta + ' com prioridade alta. Análise automática por regras fixas: ordenada pela classificação, pela tendência entre os meses e pelo ganho de nota possível.',
    prioridades: lista.slice(0, 8),
    usouRegras: true
  };
}
