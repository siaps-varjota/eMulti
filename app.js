/* ============================================================================
   app.js — carregador do Painel eMulti

   O código do painel foi dividido em módulos ES (pasta js/, ver MODULOS.md).
   Este arquivo é só o carregador: mantém o <script src="app.js"> do index.html
   funcionando e faz a ponte com o auth.js, que chama window.iniciarPainelEmulti()
   logo depois do login (ou ao abrir o painel com a sessão ainda válida).
   ========================================================================== */
(function () {
  'use strict';

  // Enquanto os módulos não terminam de carregar, esta função fica no lugar de
  // window.iniciarPainelEmulti. Quando o módulo principal carrega, ele substitui
  // por a função real (js/app/init.js); aí a chamada que ficou pendente é refeita.
  function iniciar() {
    carregado.then(function () {
      if (window.iniciarPainelEmulti !== iniciar) window.iniciarPainelEmulti();
    });
  }

  // Começa a carregar já (sem esperar o login), como o app.js antigo fazia.
  var carregado = import('./js/app/main.js').catch(function (err) {
    console.error('[Painel eMulti] Falha ao carregar os módulos de js/:', err);
    throw err;
  });

  window.iniciarPainelEmulti = iniciar;
})();
