// ======================================================================
// nucleo/popovers.js
// Popovers "Também atendido por…" e de informação (ícone i)
// (módulo gerado a partir do app.js original — ver MODULOS.md)
// ======================================================================

import { escapeHtml } from './utils.js';

// ---------- Popover "Também atendido por…" (coluna Profissional, lista
// de risco de abandono) ----------
// Um único elemento reaproveitado pra todos os botões "+N" (criado sob
// demanda no primeiro clique), posicionado perto do botão clicado via
// getBoundingClientRect. Fecha ao clicar fora, rolar a página ou
// redimensionar a janela.
var profPopEl = null;

function profPopGarantirEl(){
  if(profPopEl) return profPopEl;
  var el = document.createElement('div');
  el.className = 'prof-pop';
  document.body.appendChild(el);
  profPopEl = el;
  document.addEventListener('click', function(ev){
    if(!profPopEl || !profPopEl.classList.contains('is-open')) return;
    if(profPopEl.contains(ev.target)) return;
    if(ev.target.closest && ev.target.closest('.prof-mais-btn')) return;
    fecharProfPopover();
  });
  window.addEventListener('scroll', fecharProfPopover, true);
  window.addEventListener('resize', fecharProfPopover);
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape') fecharProfPopover(); });
  return el;
}

function fecharProfPopover(){
  if(profPopEl) profPopEl.classList.remove('is-open');
}

// itens: [{nome, data}] já com "data" como TEXTO formatado (fmtBRDate já
// aplicado por quem chamou) — ver profissionalCelulaHtml.
function abrirProfPopover(btnEl, itens){
  var el = profPopGarantirEl();
  el.innerHTML = '<div class="prof-pop-title">Também atendido por</div>'
    + (itens.length
        ? itens.map(function(it){
            var tipoHtml = it.tipo ? '<div class="prof-pop-tipo">'+escapeHtml(it.tipo)+'</div>' : '';
            return '<div class="prof-pop-item"><div class="prof-pop-item-row"><span>'+escapeHtml(it.nome)+'</span><span>'+escapeHtml(it.data||'—')+'</span></div>'+tipoHtml+'</div>';
          }).join('')
        : '<div class="prof-pop-item"><span>—</span></div>');
  el.classList.add('is-open');
  // Reseta a posição antes de medir (garante que a largura/altura
  // calculadas sejam as do conteúdo novo, não de um popover anterior
  // maior/menor ainda no DOM).
  el.style.left = '0px';
  el.style.top = '0px';
  var r = btnEl.getBoundingClientRect();
  var rect = el.getBoundingClientRect();
  var left = Math.min(r.left, window.innerWidth - rect.width - 10);
  left = Math.max(8, left);
  var top = r.bottom + 6;
  if(top + rect.height > window.innerHeight - 8){ top = r.top - rect.height - 6; }
  if(top < 8) top = 8;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

// ---------- Popover de informação (ícone "i" nas legendas dos cards de
// Composição — Numerador/Denominador M1 e M2) ----------
// Mesmo padrão do popover de profissionais acima (elemento único
// reaproveitado, fecha ao clicar fora/rolar/redimensionar/Esc), só que
// com texto simples em vez de lista — usado pra mostrar a definição
// oficial (Nota Metodológica M1/M2) de cada parcela ao TOCAR/CLICAR no
// ícone "i" (funciona no celular, diferente de tooltip por hover).
var legendInfoPopEl = null;

function legendInfoPopGarantirEl(){
  if(legendInfoPopEl) return legendInfoPopEl;
  var el = document.createElement('div');
  el.className = 'prof-pop legend-info-pop';
  document.body.appendChild(el);
  legendInfoPopEl = el;
  document.addEventListener('click', function(ev){
    if(!legendInfoPopEl || !legendInfoPopEl.classList.contains('is-open')) return;
    if(legendInfoPopEl.contains(ev.target)) return;
    if(ev.target.closest && ev.target.closest('.legend-info-btn')) return;
    fecharLegendInfoPopover();
  });
  window.addEventListener('scroll', fecharLegendInfoPopover, true);
  window.addEventListener('resize', fecharLegendInfoPopover);
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape') fecharLegendInfoPopover(); });
  return el;
}

function fecharLegendInfoPopover(){
  if(legendInfoPopEl) legendInfoPopEl.classList.remove('is-open');
}

function abrirLegendInfoPopover(btnEl, texto){
  var el = legendInfoPopGarantirEl();
  el.innerHTML = escapeHtml(texto);
  el.classList.add('is-open');
  // Reseta a posição antes de medir (garante que a largura/altura
  // calculadas sejam as do conteúdo novo, não de um popover anterior
  // maior/menor ainda no DOM).
  el.style.left = '0px';
  el.style.top = '0px';
  var r = btnEl.getBoundingClientRect();
  var rect = el.getBoundingClientRect();
  var left = Math.min(r.left, window.innerWidth - rect.width - 10);
  left = Math.max(8, left);
  var top = r.bottom + 6;
  if(top + rect.height > window.innerHeight - 8){ top = r.top - rect.height - 6; }
  if(top < 8) top = 8;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

// Código que rodava no carregamento (ordem original preservada pelo main.js)
export function init(){
  // Listener delegado ÚNICO (no document, sobrevive a qualquer re-render)
  // pro botão "+N" da coluna Profissional — usado tanto pela tabela
  // "Pacientes em risco de abandono" quanto por "Pessoas Atendidas" (e
  // qualquer outra lista futura que use profissionalBadgeHtml).
document.addEventListener('click', function(ev){
    var btn = ev.target.closest ? ev.target.closest('.prof-mais-btn') : null;
    if(!btn) return;
    ev.stopPropagation();
    var raw = btn.getAttribute('data-prof-extra') || '';
    var itens = [];
    try{
      itens = (JSON.parse(decodeURIComponent(raw)) || []).map(function(it){
        return {nome: it.n, data: it.d, tipo: it.t};
      });
    }catch(e){}
    abrirProfPopover(btn, itens);
  });

document.addEventListener('click', function(ev){
    var btn = ev.target.closest ? ev.target.closest('.legend-info-btn') : null;
    if(!btn) return;
    ev.stopPropagation();
    var raw = btn.getAttribute('data-info-text') || '';
    var texto = '';
    try{ texto = decodeURIComponent(raw); }catch(e){}
    abrirLegendInfoPopover(btn, texto);
  });
}
