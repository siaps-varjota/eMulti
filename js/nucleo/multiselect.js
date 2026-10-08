// ======================================================================
// nucleo/multiselect.js
// Componente createMultiSelect (Equipe / Quadrimestre / Mês)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { escapeHtml } from './utils.js';

// ---------- Multi-select arredondado (Equipe / Quadrimestre / Mês) ----------
// Componente genérico: em modo multi:true permite marcar vários valores
// (com "Selecionar tudo"/"Limpar" e tags abaixo do botão); em modo
// multi:false funciona como um "select" de valor único, mas com o
// mesmo visual arredondado — clicar numa opção troca a seleção e fecha.
export function createMultiSelect(container, cfg){
  cfg = cfg || {};
  var state = {options: [], selected: [], isOpen: false, searchTerm: ''};
  container.innerHTML =
      '<button type="button" class="ms-btn">'
    +   '<span class="ms-btn-text"></span>'
    +   '<svg class="ms-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>'
    + '</button>'
    + '<div class="ms-panel" style="display:none;"></div>';
    // Obs.: não existe mais uma caixa de "tags" fora do botão listando
    // cada valor selecionado (cfg.showTags é ignorado de propósito) — o
    // valor selecionado só aparece DENTRO do próprio filtro (ms-btn-text,
    // abaixo, ex.: "3 selecionados"), nunca plotado fora dele. Vale pra
    // todo filtro (Profissional, Equipe, Mês, coluna etc.) em todas as
    // tabelas do painel, já que todas usam este mesmo componente.
  var btn = container.querySelector('.ms-btn');
  var btnText = container.querySelector('.ms-btn-text');
  var panel = container.querySelector('.ms-panel');
  var tagsBox = container.querySelector('.ms-tags');

  function labelFor(value){
    var found = state.options.filter(function(o){ return o.value===value; })[0];
    return found ? found.label : value;
  }

  function renderTags(){
    if(!tagsBox) return;
    if(!cfg.multi || state.selected.length<2){ tagsBox.innerHTML=''; return; }
    tagsBox.innerHTML = state.selected.map(function(v){
      return '<span class="ms-tag" data-value="'+escapeHtml(v)+'">'+escapeHtml(labelFor(v))
        + '<button type="button" data-remove="'+escapeHtml(v)+'">'
        +   '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>'
        + '</button></span>';
    }).join('');
    tagsBox.querySelectorAll('[data-remove]').forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        setSelected(state.selected.filter(function(v){ return v!==b.getAttribute('data-remove'); }));
      });
    });
  }

  function render(){
    var selLabels = state.selected.map(labelFor);
    btnText.textContent = selLabels.length===0 ? (cfg.placeholder || 'Todos')
      : (cfg.multi && selLabels.length>1 ? selLabels.length+' selecionados' : selLabels.join(', '));
    container.classList.toggle('ms-has-value', selLabels.length>0);
    btn.classList.toggle('ms-open', state.isOpen);
    renderTags();

    if(!state.isOpen){ panel.style.display='none'; panel.innerHTML=''; return; }
    panel.style.display='block';

    var term = state.searchTerm.toLowerCase();
    var filtered = !term ? state.options : state.options.filter(function(o){
      return o.label.toLowerCase().indexOf(term) >= 0;
    });

    var html = '';
    if(cfg.search){
      html += '<div class="ms-search-wrap"><input type="text" class="ms-search" placeholder="Buscar…" value="'+escapeHtml(state.searchTerm)+'"></div>';
    }
    if(cfg.multi){
      html += state.selected.length>0
        ? '<button type="button" class="ms-action" data-action="clear">Limpar seleção</button>'
        : '<button type="button" class="ms-action" data-action="all">Selecionar tudo</button>';
    }
    html += '<div class="ms-list">';
    html += filtered.length===0
      ? '<div class="ms-empty">Nenhum resultado encontrado</div>'
      : filtered.map(function(o){
          var checked = state.selected.indexOf(o.value)>=0;
          return '<button type="button" class="ms-option'+(checked?' ms-option-checked':'')+'" data-value="'+escapeHtml(o.value)+'">'
            + '<span class="ms-option-label">'+escapeHtml(o.label)+'</span>'
            + (checked ? '<svg class="ms-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>' : '')
            + '</button>';
        }).join('');
    html += '</div>';
    panel.innerHTML = html;

    // Abre pra cima quando não cabe embaixo (mesmo comportamento do
    // <select> nativo do navegador, usado no "Filtrar por coluna…"):
    // sem isso, este painel customizado sempre abria pra baixo, mesmo
    // perto do fim da tela, cortando a lista ou saindo da viewport —
    // vale pra todo filtro deste componente (Mês, Equipe, Profissional
    // etc.) em qualquer tabela, já que todas usam createMultiSelect.
    panel.classList.remove('ms-panel-up');
    var btnRect = btn.getBoundingClientRect();
    var espacoAbaixo = window.innerHeight - btnRect.bottom;
    var espacoAcima = btnRect.top;
    if(panel.offsetHeight > espacoAbaixo && espacoAcima > espacoAbaixo){
      panel.classList.add('ms-panel-up');
    }

    var searchInput = panel.querySelector('.ms-search');
    if(searchInput){
      searchInput.focus();
      var pos = state.searchTerm.length;
      searchInput.setSelectionRange(pos,pos);
      searchInput.addEventListener('input', function(){ state.searchTerm = searchInput.value; render(); });
    }
    var actionBtn = panel.querySelector('.ms-action');
    if(actionBtn){
      actionBtn.addEventListener('click', function(){
        if(actionBtn.getAttribute('data-action')==='clear') setSelected([]);
        else setSelected(filtered.map(function(o){ return o.value; }));
      });
    }
    panel.querySelectorAll('.ms-option').forEach(function(elOpt){
      elOpt.addEventListener('click', function(){
        var v = elOpt.getAttribute('data-value');
        if(cfg.multi){
          var next = state.selected.indexOf(v)>=0
            ? state.selected.filter(function(x){ return x!==v; })
            : state.selected.concat([v]);
          setSelected(next);
        } else {
          state.isOpen = false;
          setSelected([v]);
        }
      });
    });
  }

  function setSelected(values, silent){
    state.selected = values;
    render();
    if(!silent && cfg.onChange) cfg.onChange(state.selected.slice());
  }

  btn.addEventListener('click', function(){
    state.isOpen = !state.isOpen;
    state.searchTerm = '';
    render();
  });
  document.addEventListener('mousedown', function(e){
    if(state.isOpen && !container.contains(e.target)){
      state.isOpen = false;
      state.searchTerm = '';
      render();
    }
  });

  return {
    setOptions: function(opts){ state.options = opts; render(); },
    setSelected: function(values){ setSelected(values, true); },
    getSelected: function(){ return state.selected.slice(); }
  };
}
