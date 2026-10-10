/**
 * Backend (Apps Script) — salvamento em lote + coluna "Turno" da aba Agendamentos.
 *
 * O painel já funciona SEM este código (ele detecta que a ação em lote não existe e salva
 * pessoa por pessoa). Colando isto, "Salvar datas geradas" passa a gravar tudo em poucos
 * pedidos e o turno fica gravado na planilha.
 *
 * ATENÇÃO: não vi o seu script atual, então os nomes abaixo seguem o que o painel envia
 * e recebe. Confira os 3 pontos marcados com "AJUSTE" antes de publicar uma nova versão.
 *
 * PASSO A PASSO
 * 1) Cole este arquivo no projeto Apps Script (arquivo novo).
 * 2) No seu doPost, onde já trata 'agendamentos.update', adicione AO LADO:
 *      if (p.action === 'agendamentos.updateLote') return SUA_FUNCAO_DE_RESPOSTA(agendamentosLote_(p.rows));
 *    (use a mesma função que o 'agendamentos.update' usa para devolver JSON; "p" = payload já lido,
 *     e a checagem de token/sessão deve valer para esta ação também, como nas outras).
 * 3) Na ação 'agendamentos.update' existente, grave também o turno, se vier no pedido:
 *      if (p.turno !== undefined) sh.getRange(LINHA, colTurno + 1).setValue(p.turno);
 *    (a coluna "Turno" é criada automaticamente na primeira chamada em lote; se preferir, crie
 *     você mesmo uma coluna com o cabeçalho exato "Turno" na aba Agendamentos).
 * 4) A ação 'agendamentos.list' já devolve as colunas pelo cabeçalho; se for assim no seu código,
 *    "Turno" volta sozinho para o painel. Se o seu list devolve colunas fixas, inclua "Turno".
 * 5) Também permita a situação "Faltou" onde o seu código valida as situações (se validar).
 * 6) Implantar > Gerenciar implantações > Editar > Nova versão.
 */

var AG_ABA = 'Agendamentos';            // AJUSTE: nome da aba, se for outro

function agNorm_(v) {
  return String(v == null ? '' : v).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

// AJUSTE: grave a data do mesmo jeito que o 'agendamentos.update' atual grava
// (aqui vai como data de verdade; se o seu update grava texto AAAA-MM-DD, devolva o texto).
function agDataSheet_(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d\d)-(\d\d)$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
}

/**
 * rows: [{nome, situacao, dataAgendada (AAAA-MM-DD), turno}]
 * Resposta: {ok:true, lote:true, atualizados:n, falhas:[{nome, erro}]}
 * Escreve só nas colunas Situação, Data agendada, Turno e Atualizado em (4 gravações no total),
 * sem tocar nas outras colunas (fórmulas e formatação ficam intactas).
 */
function agendamentosLote_(rows) {
  rows = rows || [];
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(AG_ABA);
    if (!sh) throw new Error('Aba "' + AG_ABA + '" não encontrada.');
    var cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var cNome = cab.indexOf('Nome'), cSit = cab.indexOf('Situação'),
        cData = cab.indexOf('Data agendada'), cAtu = cab.indexOf('Atualizado em'),
        cTurno = cab.indexOf('Turno');                                   // AJUSTE: cabeçalhos
    if (cNome < 0 || cSit < 0 || cData < 0) throw new Error('Cabeçalhos esperados: Nome, Situação, Data agendada.');
    if (cTurno < 0) { cTurno = cab.length; sh.getRange(1, cTurno + 1).setValue('Turno'); }

    var n = sh.getLastRow() - 1;
    if (n < 1) return { ok: true, lote: true, atualizados: 0, falhas: rows.map(function (x) { return { nome: x.nome, erro: 'Aba vazia' }; }) };

    function lerCol(c) { return sh.getRange(2, c + 1, n, 1).getValues(); }
    var nomes = lerCol(cNome), sit = lerCol(cSit), data = lerCol(cData), turno = lerCol(cTurno),
        atu = cAtu >= 0 ? lerCol(cAtu) : null;

    var idx = {};
    nomes.forEach(function (v, i) { idx[agNorm_(v[0])] = i; });
    var agora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var falhas = [], ok = 0;

    rows.forEach(function (x) {
      var i = idx[agNorm_(x.nome)];
      if (i === undefined) { falhas.push({ nome: x.nome, erro: 'Pessoa não encontrada na aba' }); return; }
      sit[i][0] = x.situacao;
      data[i][0] = agDataSheet_(x.dataAgendada);
      turno[i][0] = x.turno || '';
      if (atu) atu[i][0] = agora;
      ok++;
    });

    sh.getRange(2, cSit + 1, n, 1).setValues(sit);
    sh.getRange(2, cData + 1, n, 1).setValues(data);
    sh.getRange(2, cTurno + 1, n, 1).setValues(turno);
    if (atu) sh.getRange(2, cAtu + 1, n, 1).setValues(atu);
    SpreadsheetApp.flush();
    return { ok: true, lote: true, atualizados: ok, falhas: falhas };
  } finally {
    lock.releaseLock();
  }
}
