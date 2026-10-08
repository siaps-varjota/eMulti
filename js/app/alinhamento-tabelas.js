// ======================================================================
// app/alinhamento-tabelas.js
// Alinhamento uniforme das tabelas
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================




// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
  // ---------- Alinhamento uniforme das tabelas ----------
  // Centraliza cabeçalhos e células; mantém à esquerda apenas os valores
  // das colunas cujo cabeçalho contém um dos termos metodologicamente definidos.
(function aplicarAlinhamentoUniformeTabelas(){
    if(document.getElementById('alinhamentoUniformeTabelasStyles')) return;
    var style = document.createElement('style');
    style.id = 'alinhamentoUniformeTabelasStyles';
    style.textContent =
      'table th,table td{text-align:center !important;}' +
      'table thead th{text-align:center !important;}' +
      'table td[data-align-left="true"]{text-align:left !important;}';
    document.head.appendChild(style);

    var excecoes = ['profissional','nome','paciente','equipe','responsavel','participante','tipo de atividade'];
    function normalizarTitulo(texto){
      return String(texto || '').toLowerCase()
        .normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')
        .replace(/\\s+/g,' ').trim();
    }
    function alinharTabelas(root){
      var tabelas = [];
      if(root && root.matches && root.matches('table')) tabelas.push(root);
      if(root && root.querySelectorAll){
        Array.prototype.forEach.call(root.querySelectorAll('table'), function(t){ tabelas.push(t); });
      }
      tabelas.forEach(function(table){
        var headers = Array.prototype.slice.call(table.querySelectorAll('thead th'));
        if(!headers.length) return;
        var indicesEsquerda = {};
        headers.forEach(function(th){
          var titulo = normalizarTitulo(th.textContent);
          if(excecoes.some(function(termo){ return titulo.indexOf(termo) >= 0; })){
            indicesEsquerda[th.cellIndex] = true;
          }
        });
        Array.prototype.forEach.call(table.querySelectorAll('tbody td'), function(td){
          if(indicesEsquerda[td.cellIndex]) td.setAttribute('data-align-left','true');
          else td.removeAttribute('data-align-left');
        });
      });
    }
    alinharTabelas(document);
    if(document.body && typeof MutationObserver !== 'undefined'){
      var observer = new MutationObserver(function(mutations){
        mutations.forEach(function(m){
          Array.prototype.forEach.call(m.addedNodes, function(node){
            if(node.nodeType === 1) alinharTabelas(node);
          });
        });
      });
      observer.observe(document.body, {childList:true,subtree:true});
    }
  })();
}
