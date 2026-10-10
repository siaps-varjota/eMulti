// Aba de agendamentos: lê/grava a aba Agendamentos pelo backend existente.
var rowsAg=[]; var busyAg=false; var profCacheAg=null;
// Datas geradas automaticamente que ainda NÃO foram salvas na planilha:
// índice da linha em rowsAg -> data (AAAA-MM-DD). Só vão pra planilha quando
// a pessoa clica em "Salvar datas geradas".
var propostaAg={};
var paginaAg=1;                 // página atual da tabela (1-based)
var loteIndisponivelAg=false;   // backend ainda sem a ação em lote -> usa o salvamento linha a linha
var LOTE_AG=100;                // pessoas por pedido no salvamento em lote
var LS_FILTROS_AG='emulti.agendamentos.filtros', LS_CONFIG_AG='emulti.agendamentos.config';
function lsGetAg(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}}
function lsSetAg(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function valAg(id){var el=document.getElementById(id);return el?String(el.value==null?'':el.value):'';}

// ---------- Configuração da agenda (vagas, dias de atendimento, janela) ----------
// Padrão: 6 vagas pela manhã + 6 à tarde, seg–sex. Pode ser ajustado por profissional.
var DIAS_UTEIS_AG=[0,1,1,1,1,1,0];            // índice = Date.getDay() (0 = domingo)
var DIAS_SEM_AG=['dom','seg','ter','qua','qui','sex','sáb'];
var cfgAg={m:6,t:6,dias:DIAS_UTEIS_AG.slice(),janela:0,prof:{}};
function numAg(v,def,min){var n=parseInt(v,10);return isNaN(n)||n<min?def:n;}
function carregarConfigAg(){
  var c=lsGetAg(LS_CONFIG_AG);if(!c||typeof c!=='object')return;
  cfgAg.m=numAg(c.m,6,0);cfgAg.t=numAg(c.t,6,0);cfgAg.janela=numAg(c.janela,0,0);
  if(Array.isArray(c.dias)&&c.dias.length===7)cfgAg.dias=c.dias.map(function(x){return x?1:0;});
  cfgAg.prof=c.prof&&typeof c.prof==='object'?c.prof:{};
}
function salvarConfigAg(){lsSetAg(LS_CONFIG_AG,cfgAg);}
// Capacidade efetiva de um profissional (chave = nome normalizado).
function capAg(k){
  var o=(k&&cfgAg.prof[k])||{};
  var m=o.m==null?cfgAg.m:numAg(o.m,cfgAg.m,0), t=o.t==null?cfgAg.t:numAg(o.t,cfgAg.t,0);
  var dias=Array.isArray(o.dias)&&o.dias.length===7?o.dias:cfgAg.dias;
  if(m+t<1){m=6;t=6;}
  if(!dias.some(function(x){return x;}))dias=DIAS_UTEIS_AG;
  return {m:m,t:t,dia:m+t,dias:dias};
}

// Último atendimento de uma linha de Pessoas atendidas: usa a data completa
// (listas.js) e, se ela não existir, a maior das colunas "Data 1..N" (índice 6+).
function ultimoAg(r){if(r.ultimoAtendimentoISO)return r.ultimoAtendimentoISO;var best='';for(var i=6;i<r.length;i++){var m=String(r[i]==null?'':r[i]).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(m){var iso=m[3]+'-'+m[2]+'-'+m[1];if(iso>best)best=iso;}}return best;}
function normAg(v){return String(v==null?'':v).trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');}
// Mapa pessoa -> profissionais (histórico completo), vindo de Pessoas atendidas
// (coluna "Profissional"). Também junta a lista de profissionais para o datalist.
function profMapAg(){
  if(profCacheAg)return profCacheAg;
  var list=window.__emultiPessoasAtendidas&&window.__emultiPessoasAtendidas();
  if(!list||!Array.isArray(list.rows)||!list.rows.length)return null;
  var map={},nomes={},ult={},ultProf={};
  list.rows.forEach(function(r){
    var u=ultimoAg(r); if(u)ult[normAg(r[0])]=u;
    // Profissional do evento mais recente da pessoa (nome único) — base da
    // distribuição automática de datas.
    var up=String(r.ultimoProfissional==null?'':r.ultimoProfissional).trim();
    if(up&&up!=='—')ultProf[normAg(r[0])]=up;
    var txt=String(r[5]==null?'':r[5]);
    if(!txt||txt==='—')return;
    map[normAg(r[0])]=normAg(txt);
    txt.split(',').forEach(function(n){n=n.trim();if(n&&n!=='—')nomes[n]=1;});
  });
  profCacheAg={map:map,ult:ult,ultProf:ultProf,rows:list.rows,nomes:Object.keys(nomes).sort(function(a,b){return a.localeCompare(b,'pt-BR');})};
  return profCacheAg;
}
function fillProfAg(){var dl=document.getElementById('agendamentosProfissionais'),c=profMapAg();if(!dl||!c)return;dl.innerHTML=c.nomes.map(function(n){return '<option value="'+escAg(n)+'"></option>';}).join('');}
function apiAg(payload){var api=window.PAINEL_API,token=window.painelToken&&window.painelToken();if(!api||!token)return Promise.reject(Error('Sessão não iniciada. Entre novamente no painel.'));return fetch(api.url,{method:'POST',headers:{'Content-Type':'text/plain'},cache:'no-store',body:JSON.stringify(Object.assign({chave:api.chave,acao:'agendamentos',token:token},payload))}).then(function(r){if(!r.ok)throw Error('Falha de comunicação com a planilha.');return r.json();}).then(function(r){if(r.status==='sessao_expirada'){if(window.logoutPainelEmulti)window.logoutPainelEmulti();throw Error('Sessão expirada. Entre novamente.');}if(r.ok===false||r.status==='erro')throw Error(r.error||r.mensagem||'Operação não concluída.');return r;});}
function msgAg(text,error){var el=document.getElementById('agendamentosFeedback');if(el){el.textContent=text||'';el.className='agendamentos-feedback'+(error?' erro':'');}}
function dateAg(v){if(!v)return '';if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);var s=String(v).trim(),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(/^\d{4}-\d\d-\d\d$/.test(s))return s;if(m)return m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2);var d=new Date(s);return isNaN(d)?'':d.toISOString().slice(0,10);}
function ultimoDeAg(r,uc){return (uc&&uc.ult[normAg(r.Nome)])||dateAg(r['Último Atendimento'])||'';}

// ---------- Situação ----------
// Cancelado e Faltou não ocupam vaga nem têm turno. Faltou volta para a fila de reagendamento.
function ehAtivoAg(r){var s=r.Situação||'Pendente';return s!=='Cancelado'&&s!=='Faltou';}

// ---------- Filtros ----------
// Filtro próprio da aba: último atendimento nos últimos N dias (padrão 120; 0/vazio = todos).
function diasAg(){var el=document.getElementById('agendamentosDias');if(!el)return 120;var n=parseInt(el.value,10);return isNaN(n)||n<0?120:n;}
function limiteDiasAg(){var n=diasAg();if(!n)return '';var h=new Date();return isoAg(new Date(h.getFullYear(),h.getMonth(),h.getDate()-n));}
function dentroDiasAg(r,uc,lim){if(!lim)return true;var u=ultimoDeAg(r,uc);return !!u&&u>=lim;}
function seguirListaAg(){var el=document.getElementById('agendamentosSeguir');return !!(el&&el.checked);}
// Opcional: seguir também a lista "Pessoas atendidas" com os filtros aplicados lá (Mês, colunas, busca).
function filtroListaAg(){
  if(!seguirListaAg())return null;
  var f=window.__emultiPessoasAtendidasFiltradas&&window.__emultiPessoasAtendidasFiltradas();
  if(!f||!Array.isArray(f.nomes))return null;
  var set={};f.nomes.forEach(function(n){set[normAg(n)]=true;});
  return {set:set,origem:f.origem,meses:f.meses||[],n:f.nomes.length};
}
var FILTROS_IDS_AG={prof:'agendamentosProfissional',turno:'agendamentosTurno',sit:'agendamentosSituacao',dias:'agendamentosDias',de:'agendamentosDe',ate:'agendamentosAte',pp:'agendamentosPorPagina'};
// Lembra os filtros (não a busca por nome) entre aberturas do painel.
function salvarFiltrosAg(){var o={sort:sortAg,seguir:seguirListaAg()};Object.keys(FILTROS_IDS_AG).forEach(function(k){o[k]=valAg(FILTROS_IDS_AG[k]);});lsSetAg(LS_FILTROS_AG,o);}
function restaurarFiltrosAg(){
  var o=lsGetAg(LS_FILTROS_AG);if(!o||typeof o!=='object')return;
  Object.keys(FILTROS_IDS_AG).forEach(function(k){var el=document.getElementById(FILTROS_IDS_AG[k]);if(el&&o[k]!=null)el.value=o[k];});
  var sg=document.getElementById('agendamentosSeguir');if(sg)sg.checked=!!o.seguir;
  if(o.sort&&typeof o.sort.col==='string'&&(o.sort.dir==='asc'||o.sort.dir==='desc'))sortAg={col:o.sort.col,dir:o.sort.dir};
}

// Quem está em Pessoas atendidas mas ainda não existe na planilha vira uma
// linha "virtual" (Pendente, sem data). Ela só é gravada na planilha quando
// recebe data/situação (antes disso é sincronizada automaticamente).
function completarVirtuaisAg(){
  var uc=profMapAg();if(!uc)return;
  var tem={};rowsAg.forEach(function(r){tem[normAg(r.Nome)]=true;});
  uc.rows.forEach(function(p){
    var nome=String(p[0]||'').trim();if(!nome||tem[normAg(nome)])return;tem[normAg(nome)]=true;
    rowsAg.push({Nome:nome,Atendimentos:Number(p[1])||0,Total:Number(p[3])||0,'Último Atendimento':ultimoAg(p),Situação:'Pendente','Data agendada':'','Atualizado em':'',_virtual:true});
  });
}
function garantirNaPlanilhaAg(linhas){
  var uc=profMapAg();
  var pessoas=linhas.map(function(r){return{nome:String(r.Nome||'').trim(),at:Number(r.Atendimentos)||0,total:Number(r.Total)||0,ultimo:ultimoDeAg(r,uc)};});
  return apiAg({action:'agendamentos.sync',rows:pessoas}).then(function(){linhas.forEach(function(r){delete r._virtual;});});
}
function brAg(v){var s=String(v==null?'':v).trim(),m=s.match(/^(\d{4})-(\d\d)-(\d\d)$/);return m?m[3]+'/'+m[2]+'/'+m[1]:s;}
function escAg(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

// ---------- Ordenação por coluna ----------
// Padrão: Data agendada, da mais recente para a mais antiga (quem não tem data fica no fim).
var sortAg={col:'data',dir:'desc'};
function tsAg(v){var s=String(v==null?'':v).trim();if(!s)return 0;var m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);if(m)return new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0)).getTime();var t=Date.parse(s);return isNaN(t)?0:t;}
var TURNO_ORD_AG={manha:1,tarde:2,excedente:3};
// Valor de ordenação da coluna: texto (string), número ou data (AAAA-MM-DD). Vazio = null (sempre no fim).
function chaveSortAg(col,r,ix,uc,turnos){
  switch(col){
    case 'nome':return normAg(r.Nome)||null;
    case 'atendimentos':return r.Atendimentos===''||r.Atendimentos==null?null:Number(r.Atendimentos)||0;
    case 'total':return r.Total===''||r.Total==null?null:Number(r.Total)||0;
    case 'ultimo':return ultimoDeAg(r,uc)||null;
    case 'prof':return normAg(uc&&uc.ultProf[normAg(r.Nome)])||null;
    case 'situacao':return normAg(r.Situação||'Pendente');
    case 'data':return propostaAg[ix]||dateAg(r['Data agendada'])||null;
    case 'turno':return turnos[ix]?TURNO_ORD_AG[turnos[ix].classe]:null;
    case 'atualizado':return tsAg(r['Atualizado em'])||null;
  }
  return null;
}
function ordenarAg(list,uc,turnos){
  var col=sortAg.col,mult=sortAg.dir==='asc'?1:-1,pos=new Map();
  rowsAg.forEach(function(r,i){pos.set(r,i);});
  var itens=list.map(function(r){var ix=pos.get(r);return {r:r,ix:ix,k:chaveSortAg(col,r,ix,uc,turnos)};});
  itens.sort(function(a,b){
    if(a.k===null&&b.k!==null)return 1;   // vazios sempre por último
    if(b.k===null&&a.k!==null)return -1;
    var c=0;
    if(a.k!==null){c=typeof a.k==='number'?a.k-b.k:String(a.k).localeCompare(String(b.k),'pt-BR',{numeric:true});}
    if(c)return c*mult;
    return normAg(a.r.Nome).localeCompare(normAg(b.r.Nome),'pt-BR');  // desempate estável por nome
  });
  return itens.map(function(x){return x.r;});
}
function marcarOrdemAg(){
  document.querySelectorAll('#tabAgendamentos th[data-ag-sort]').forEach(function(th){
    var ativo=th.getAttribute('data-ag-sort')===sortAg.col;
    th.classList.toggle('sort-asc',ativo&&sortAg.dir==='asc');
    th.classList.toggle('sort-desc',ativo&&sortAg.dir==='desc');
  });
}

// ---------- Lista filtrada + ordenada (usada pela tabela, exportação e impressão) ----------
function calcularListaAg(){
  var uc=profMapAg(),
      q=valAg('agendamentosBusca').trim().toLocaleLowerCase('pt-BR'),
      pq=normAg(valAg('agendamentosProfissional')),
      tf=valAg('agendamentosTurno'), sf=valAg('agendamentosSituacao'),
      de=valAg('agendamentosDe'), ate=valAg('agendamentosAte'),
      lf=filtroListaAg(), lim=limiteDiasAg(), semProf=!!pq&&!uc,
      turnos=turnosAg(uc);
  var list=semProf?[]:rowsAg.filter(function(r,ix){
    if(lf&&!lf.set[normAg(r.Nome)])return false;
    if(!dentroDiasAg(r,uc,lim))return false;
    if(sf&&(r.Situação||'Pendente')!==sf)return false;
    if(tf){var t=turnos[ix];if(tf==='sem'?!!t:(!t||t.classe!==tf))return false;}
    if(de||ate){var d=propostaAg[ix]||dateAg(r['Data agendada']);if(!d||(de&&d<de)||(ate&&d>ate))return false;}
    if(q&&!String(r.Nome||'').toLocaleLowerCase('pt-BR').includes(q))return false;
    if(pq){var up=uc.ultProf[normAg(r.Nome)]||'';if(normAg(up).indexOf(pq)<0)return false;}
    return true;
  });
  list=ordenarAg(list,uc,turnos);
  return {uc:uc,list:list,turnos:turnos,lf:lf,lim:lim,semProf:semProf,filtrado:!!(q||pq||lf||lim||tf||sf||de||ate)};
}
function renderAg(){
  var body=document.getElementById('agendamentosBody'); if(!body)return;
  marcarOrdemAg();
  var c=calcularListaAg(),uc=c.uc,list=c.list,turnos=c.turnos,lf=c.lf,lim=c.lim;
  document.getElementById('agendamentosContagem').textContent=list.length+(list.length===1?' pessoa':' pessoas');
  var info=document.getElementById('agendamentosFiltroInfo');
  if(info){var dn=diasAg(),txtDias=dn?('Último atendimento nos últimos '+dn+' dias'+(lim?' (desde '+brAg(lim)+')':'')):'Todos os períodos';info.textContent=txtDias+(lf?' · seguindo também a lista Pessoas atendidas (aba '+lf.origem+'): '+lf.n+(lf.n===1?' pessoa':' pessoas')+' · '+(lf.meses.length?lf.meses.length+(lf.meses.length===1?' mês selecionado':' meses selecionados'):'todos os meses')+'.':'.');}
  // Paginação
  var porPag=parseInt(valAg('agendamentosPorPagina'),10)||0,total=list.length,paginas=porPag?Math.max(1,Math.ceil(total/porPag)):1;
  if(paginaAg>paginas)paginaAg=paginas;if(paginaAg<1)paginaAg=1;
  var vis=porPag?list.slice((paginaAg-1)*porPag,paginaAg*porPag):list;
  var pg=document.getElementById('agendamentosPagina');
  if(pg)pg.textContent=total?('Página '+paginaAg+' de '+paginas+(porPag?' · '+(vis.length?((paginaAg-1)*porPag+1)+'–'+((paginaAg-1)*porPag+vis.length):'0')+' de '+total:'')):'—';
  var bp=document.getElementById('agendamentosPrev'),bn=document.getElementById('agendamentosNext');
  if(bp)bp.disabled=paginaAg<=1;if(bn)bn.disabled=paginaAg>=paginas;
  renderVagasAg(uc);
  if(!list.length){
    body.innerHTML='<tr><td colspan="10" class="agendamentos-vazio">'+(busyAg?'Carregando…':c.semProf?'Dados de profissionais indisponíveis. Atualize os dados do painel.':c.filtrado?'Nenhuma pessoa encontrada.':'Nenhum registro disponível. Sincronize Pessoas atendidas.')+'</td></tr>';
    return;
  }
  var pos=new Map();rowsAg.forEach(function(r,i){pos.set(r,i);});
  body.innerHTML=vis.map(function(r){
    var ix=pos.get(r), prop=propostaAg[ix], data=prop||dateAg(r['Data agendada']);
    var prof=(uc&&uc.ultProf[normAg(r.Nome)])||'—', t=turnos[ix];
    var turnoHtml=t?'<span class="ag-turno '+t.classe+'" title="'+escAg(t.dica)+'">'+t.rotulo+'</span>':'<span title="'+escAg(motivoSemTurnoAg(r,ix,uc))+'">—</span>';
    var sit=r.Situação||'Pendente';
    return '<tr data-ag-ix="'+ix+'"'+(prop?' class="agendamentos-gerada" title="Data gerada automaticamente — ainda não salva"':'')+'>'
      +'<td class="agendamentos-nome">'+escAg(r.Nome)+'</td>'
      +'<td>'+escAg(r.Atendimentos)+'</td>'
      +'<td>'+escAg(r.Total)+'</td>'
      +'<td>'+escAg(brAg(ultimoDeAg(r,uc)))+'</td>'
      +'<td class="agendamentos-prof">'+escAg(prof)+'</td>'
      +'<td><select data-ag="situacao" aria-label="Situação">'+['Pendente','Agendado','Realizado','Faltou','Cancelado'].map(function(s){return '<option'+(sit===s?' selected':'')+'>'+s+'</option>';}).join('')+'</select></td>'
      +'<td><input type="date" data-ag="dataAgendada" value="'+data+'"></td>'
      +'<td>'+turnoHtml+'</td>'
      +'<td class="agendamentos-atualizado">'+escAg(r['Atualizado em']||'')+'</td>'
      +'<td><button type="button" class="agendamentos-salvar" data-ag-save>Salvar</button></td></tr>';
  }).join('');
}

// ---------- Geração automática de datas ----------
// Regras: por profissional da ÚLTIMA consulta da pessoa; faltosos primeiro e depois quem tem a
// última consulta mais antiga; só nos dias de atendimento do profissional; no máximo as vagas
// configuradas por dia (padrão 6 manhã + 6 tarde). Quem já tem data na planilha (e não está
// Cancelado/Faltou) ocupa vaga no dia dele. As pessoas são espalhadas de forma uniforme pelos
// dias (o dia menos carregado recebe a próxima), em vez de lotar um dia por vez.
function isoAg(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function isoParaDataAg(iso){var m=String(iso||'').match(/^(\d{4})-(\d\d)-(\d\d)$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):null;}
function somaDiaAg(d,n){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);}
// Primeiro dia de atendimento a partir de d (inclusive), segundo o vetor de dias da semana.
function proxDiaAg(d,dias){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate()),n=0;while(!dias[x.getDay()]&&n<8){x.setDate(x.getDate()+1);n++;}return x;}
function diaUtilAg(d){return proxDiaAg(d,DIAS_UTEIS_AG);}
function amanhaAg(){var h=new Date();return new Date(h.getFullYear(),h.getMonth(),h.getDate()+1);}
// Núcleo da distribuição (função pura).
//  cands: [{ix,prof,nome,ult,pri}]  prof = chave do profissional; ult = AAAA-MM-DD; pri 0 = faltoso (vai primeiro)
//  ocupados: {prof:{AAAA-MM-DD:n}}  vagas já usadas  |  inicio: Date
//  opt: {cap:function(prof)->{dia,dias}, janela:n}  (janela = nº de dias de atendimento para espalhar; 0 = o menor possível)
//  devolve {ix: AAAA-MM-DD}
function planejarAg(cands,ocupados,inicio,opt){
  opt=opt||{};var capFn=opt.cap||function(){return capAg('');},janela=opt.janela||0;
  var porProf={},plano={};
  cands.forEach(function(c){(porProf[c.prof]=porProf[c.prof]||[]).push(c);});
  Object.keys(porProf).forEach(function(p){
    var cap=capFn(p),oc=ocupados[p]||{};
    var fila=porProf[p].slice().sort(function(a,b){
      if((a.pri||0)!==(b.pri||0))return (a.pri||0)-(b.pri||0);
      if(a.ult!==b.ult)return a.ult<b.ult?-1:1;
      return String(a.nome).localeCompare(String(b.nome),'pt-BR');
    });
    var N=fila.length,dias=[],livre=0,dia=proxDiaAg(inicio,cap.dias),guard=0;
    // 1) dias de atendimento com vaga, até caber todo mundo (e pelo menos "janela" dias)
    while((livre<N||dias.length<janela)&&guard<3000){
      guard++;
      var k=isoAg(dia),f=Math.max(0,cap.dia-(oc[k]||0));
      if(f>0){dias.push({k:k,f:f,carga:oc[k]||0,n:0});livre+=f;}
      dia=proxDiaAg(somaDiaAg(dia,1),cap.dias);
    }
    // 2) quantas pessoas em cada dia: sempre no dia menos carregado (empate: o mais cedo)
    for(var i=0;i<N;i++){
      var melhor=null;
      for(var j=0;j<dias.length;j++){var d=dias[j];if(d.n>=d.f)continue;if(!melhor||d.carga+d.n<melhor.carga+melhor.n)melhor=d;}
      if(!melhor)break;
      melhor.n++;
    }
    // 3) a fila (prioridade e depois a última consulta mais antiga) ocupa os dias em ordem cronológica
    var pos=0;
    dias.forEach(function(d){for(var i=0;i<d.n&&pos<N;i++){plano[fila[pos].ix]=d.k;pos++;}});
  });
  return plano;
}
function chaveProfAg(r,uc){var p=uc&&uc.ultProf[normAg(r.Nome)];return p?normAg(p):'';}
// Por que a linha está sem turno (mostrado como dica no "—" da coluna Turno).
function motivoSemTurnoAg(r,ix,uc){
  if((r.Situação||'Pendente')==='Cancelado')return 'Sem turno: agendamento cancelado';
  if((r.Situação||'Pendente')==='Faltou')return 'Sem turno: faltou — aguardando reagendamento';
  if(!chaveProfAg(r,uc))return 'Sem turno: profissional da última consulta não identificado';
  if(!(propostaAg[ix]||dateAg(r['Data agendada'])))return 'Sem turno: ainda não tem data agendada';
  return 'Sem turno';
}
// Turno gravado na planilha (coluna "Turno"), válido só enquanto a data da linha não foi mexida aqui.
function turnoGuardadoAg(r,ix){if(propostaAg[ix])return '';var t=normAg(r.Turno);return t==='manha'||t==='tarde'?t:'';}
// Turno de cada pessoa com data (salva ou gerada, exceto Cancelado/Faltou). Por profissional+dia:
// quem já tem turno gravado mantém; as demais se dividem meio a meio (a metade de cima, com a
// última consulta mais antiga, fica de manhã) respeitando as vagas de cada turno; passou do
// limite do dia = excedente (só acontece com data manual).
function turnosAg(uc){
  var grupos={},res={};
  rowsAg.forEach(function(r,ix){
    var k=chaveProfAg(r,uc); if(!k||!ehAtivoAg(r))return;
    var d=propostaAg[ix]||dateAg(r['Data agendada']); if(!d)return;
    (grupos[k+'|'+d]=grupos[k+'|'+d]||[]).push({ix:ix,ult:ultimoDeAg(r,uc),nome:String(r.Nome||''),fixo:turnoGuardadoAg(r,ix)});
  });
  Object.keys(grupos).forEach(function(g){
    var cap=capAg(g.slice(0,g.lastIndexOf('|')));
    var ord=grupos[g].sort(function(a,b){
      if(a.ult!==b.ult)return a.ult<b.ult?-1:1;
      return a.nome.localeCompare(b.nome,'pt-BR');
    });
    var nEff=Math.min(ord.length,cap.dia),alvoM=Math.min(cap.m,Math.max(Math.ceil(nEff/2),nEff-cap.t));
    var nM=0,nT=0;
    ord.forEach(function(x){if(x.fixo==='manha'){nM++;x.cls='manha';}else if(x.fixo==='tarde'){nT++;x.cls='tarde';}});
    var vagaM=Math.max(0,alvoM-nM);
    ord.forEach(function(x){
      if(x.cls)return;
      if(vagaM>0&&nM<cap.m){x.cls='manha';nM++;vagaM--;}
      else if(nT<cap.t){x.cls='tarde';nT++;}
      else if(nM<cap.m){x.cls='manha';nM++;}
      else x.cls='excedente';
    });
    ord.forEach(function(x){
      if(x.cls==='manha')res[x.ix]={rotulo:'Manhã',classe:'manha',dica:'Manhã — '+nM+' de '+cap.m+' vagas no dia'+(x.fixo?' (turno gravado)':'')};
      else if(x.cls==='tarde')res[x.ix]={rotulo:'Tarde',classe:'tarde',dica:'Tarde — '+nT+' de '+cap.t+' vagas no dia'+(x.fixo?' (turno gravado)':'')};
      else res[x.ix]={rotulo:'Excedente',classe:'excedente',dica:'Acima do limite de '+cap.dia+' pessoas por dia para este profissional'};
    });
  });
  return res;
}
// Turno que a linha teria com a situação/data informadas (usado ao gravar, para guardar na planilha).
function turnoFuturoAg(ix,sit,data){
  var uc=profMapAg();if(!uc||!data||sit==='Cancelado'||sit==='Faltou')return '';
  var r=rowsAg[ix],bs=r.Situação,bd=r['Data agendada'],bt=r.Turno,bp=propostaAg[ix];
  r.Situação=sit;r['Data agendada']=data;r.Turno='';delete propostaAg[ix];
  var t=turnosAg(uc)[ix];
  r.Situação=bs;r['Data agendada']=bd;r.Turno=bt;if(bp!==undefined)propostaAg[ix]=bp;
  return t?t.rotulo:'';
}
function atualizarBotoesGeracaoAg(){
  var tem=Object.keys(propostaAg).length>0;
  ['agendamentosSalvarGerados','agendamentosDescartar'].forEach(function(id){var el=document.getElementById(id);if(el)el.hidden=!tem;});
  if(!tem){var rs=document.getElementById('agendamentosResumo');if(rs)rs.innerHTML='';}
}
function resumoGeradoAg(uc,nomes){
  var por={};
  Object.keys(propostaAg).forEach(function(ix){
    var k=chaveProfAg(rowsAg[ix],uc),d=propostaAg[ix];
    var o=por[k]=por[k]||{n:0,dias:{},min:d,max:d};
    o.n++;o.dias[d]=1;if(d<o.min)o.min=d;if(d>o.max)o.max=d;
  });
  var el=document.getElementById('agendamentosResumo'); if(!el)return;
  var itens=Object.keys(por).sort(function(a,b){return String(nomes[a]).localeCompare(String(nomes[b]),'pt-BR');}).map(function(k){
    var o=por[k],nd=Object.keys(o.dias).length;
    return '<li><b>'+escAg(nomes[k]||k)+'</b>: '+o.n+(o.n===1?' pessoa':' pessoas')+' · '+brAg(o.min)+(o.min===o.max?'':' a '+brAg(o.max))+' ('+nd+(nd===1?' dia de atendimento)':' dias de atendimento)')+'</li>';
  }).join('');
  el.innerHTML=itens?'<ul>'+itens+'</ul>':'';
}
// auto=true: geração automática (ao abrir a aba / mudar filtros). Não depende do filtro de
// profissional da tela e fica em silêncio quando não há o que gerar. prefixo: texto a manter no aviso.
function gerarAg(auto,prefixo){
  if(auto!==true)auto=false;
  if(busyAg)return;
  var uc=profMapAg();
  if(!uc||!Object.keys(uc.ultProf).length){if(!auto)msgAg('Atualize os dados do painel para carregar Pessoas atendidas antes de gerar as datas.',true);return;}
  if(!rowsAg.length){if(!auto)msgAg('Não há registros em Agendamentos. Clique em "Sincronizar Pessoas atendidas" primeiro.',true);return;}
  var ini=isoParaDataAg(valAg('agendamentosInicio'));
  var inicio=diaUtilAg(ini||amanhaAg());
  var pq=auto?'':normAg(valAg('agendamentosProfissional'));
  var lf=filtroListaAg(),lim=limiteDiasAg();
  var ocupados={},nomes={},cands=[],semProf=0,jaTem=0,faltosos=0;
  rowsAg.forEach(function(r){
    var k=chaveProfAg(r,uc),d=dateAg(r['Data agendada']);
    if(!k||!d||!ehAtivoAg(r))return;
    (ocupados[k]=ocupados[k]||{})[d]=((ocupados[k]||{})[d]||0)+1;
  });
  rowsAg.forEach(function(r,ix){
    if(lf&&!lf.set[normAg(r.Nome)])return;
    if(!dentroDiasAg(r,uc,lim))return;
    var sit=r.Situação||'Pendente';
    if(sit!=='Pendente'&&sit!=='Faltou')return;
    // Pendente com data já está resolvido; Faltou volta para a fila mesmo tendo a data antiga.
    if(sit==='Pendente'&&dateAg(r['Data agendada'])){jaTem++;return;}
    var prof=uc.ultProf[normAg(r.Nome)];
    if(!prof){semProf++;return;}
    var k=normAg(prof);
    if(pq&&k.indexOf(pq)<0)return;
    nomes[k]=prof;
    if(sit==='Faltou')faltosos++;
    cands.push({ix:ix,prof:k,nome:String(r.Nome||''),ult:ultimoDeAg(r,uc),pri:sit==='Faltou'?0:1});
  });
  if(!cands.length){propostaAg={};atualizarBotoesGeracaoAg();renderAg();if(auto){if(prefixo)msgAg(prefixo,false);return;}msgAg('Nenhuma pessoa pendente para agendar'+(pq?' deste profissional':'')+'.'+(jaTem?' '+jaTem+' já têm data.':''),false);return;}
  propostaAg=planejarAg(cands,ocupados,inicio,{cap:capAg,janela:cfgAg.janela});
  var datas=Object.keys(propostaAg).map(function(i){return propostaAg[i];}).sort();
  renderAg();atualizarBotoesGeracaoAg();resumoGeradoAg(uc,nomes);
  msgAg((prefixo?prefixo+' ':'')+cands.length+(cands.length===1?' pessoa distribuída':' pessoas distribuídas')+(faltosos?' ('+faltosos+(faltosos===1?' faltoso reagendado':' faltosos reagendados')+')':'')+' de '+brAg(datas[0])+' a '+brAg(datas[datas.length-1])+' (dias de atendimento e vagas por profissional conforme a configuração). Revise e clique em "Salvar datas geradas".'+(semProf?' '+semProf+' sem profissional identificado ficaram de fora.':''),false);
}
function descartarAg(){propostaAg={};atualizarBotoesGeracaoAg();renderAg();msgAg('Datas geradas descartadas.',false);}

// ---------- Conflito de edição (duas pessoas mexendo na mesma linha) ----------
// Antes de gravar, relê a planilha e compara Situação/Data agendada com o que esta tela sabia.
function verificarConflitosAg(linhas){
  var reais=linhas.filter(function(r){return r&&!r._virtual;});
  if(!reais.length)return Promise.resolve([]);
  return apiAg({action:'agendamentos.list'}).then(function(resp){
    var remoto={};(Array.isArray(resp.rows)?resp.rows:[]).forEach(function(x){remoto[normAg(x.Nome)]=x;});
    var conf=[];
    reais.forEach(function(l){
      var x=remoto[normAg(l.Nome)];if(!x)return;
      if((l.Situação||'Pendente')!==(x.Situação||'Pendente')||dateAg(l['Data agendada'])!==dateAg(x['Data agendada']))conf.push({linha:l,remoto:x});
    });
    return conf;
  },function(e){if(/Sess/i.test((e&&e.message)||''))throw e;return [];});
}
// Pergunta se pode sobrescrever. Se não, mostra o estado atual da planilha nessas linhas.
function confirmarConflitosAg(conf){
  var itens=conf.slice(0,6).map(function(c){var s=c.remoto.Situação||'Pendente',d=dateAg(c.remoto['Data agendada']);return '• '+c.linha.Nome+' — agora: '+s+(d?' em '+brAg(d):'');}).join('\n');
  var ok=window.confirm((conf.length===1?'Esta pessoa foi alterada':conf.length+' pessoas foram alteradas')+' por outra pessoa depois que a lista foi carregada:\n'+itens+(conf.length>6?'\n…':'')+'\n\nSalvar mesmo assim e sobrescrever?');
  if(!ok){conf.forEach(function(c){c.linha.Situação=c.remoto.Situação||'Pendente';c.linha['Data agendada']=c.remoto['Data agendada']||'';c.linha['Atualizado em']=c.remoto['Atualizado em']||c.linha['Atualizado em'];});}
  return ok;
}

// ---------- Salvar datas geradas (em lote, com fallback linha a linha) ----------
function salvarGeradosAg(){
  var ixs=Object.keys(propostaAg);
  if(!ixs.length||busyAg)return;
  var datas=ixs.map(function(i){return propostaAg[i];}).sort();
  if(!window.confirm('Salvar '+ixs.length+' agendamentos (de '+brAg(datas[0])+' a '+brAg(datas[datas.length-1])+')?\nA situação dessas pessoas passará para "Agendado".'))return;
  busyAg=true;
  var linhas=ixs.map(function(i){return rowsAg[Number(i)];}).filter(Boolean);
  msgAg('Conferindo se alguém alterou a planilha…',false);
  verificarConflitosAg(linhas).then(function(conf){return conf.length?confirmarConflitosAg(conf):true;}).then(function(seguir){
    if(!seguir)throw {cancelado:true};
    var virtuais=linhas.filter(function(r){return r._virtual;});
    return virtuais.length?(msgAg('Preparando '+virtuais.length+' pessoas novas na planilha…',false),garantirNaPlanilhaAg(virtuais)):null;
  }).then(function(){executarSalvarGeradosAg(ixs);}).catch(function(e){
    busyAg=false;
    if(e&&e.cancelado){propostaAg={};atualizarBotoesGeracaoAg();renderAg();gerarAg(true,'Nada foi salvo: a planilha tinha mudanças de outra pessoa. As datas foram recalculadas.');return;}
    msgAg((e&&e.message)||'Não foi possível preparar as pessoas na planilha.',true);
  });
}
// Um pedido só por grupo de LOTE_AG pessoas. Resposta esperada: {lote:true, falhas:[{nome,erro}]}.
function enviarLoteAg(items,progresso){
  var out={ok:[],falhas:[]},partes=[];
  for(var i=0;i<items.length;i+=LOTE_AG)partes.push(items.slice(i,i+LOTE_AG));
  function prox(){
    if(!partes.length)return Promise.resolve(out);
    var parte=partes.shift();
    return apiAg({action:'agendamentos.updateLote',rows:parte.map(function(x){return{nome:x.nome,situacao:x.situacao,dataAgendada:x.dataAgendada,turno:x.turno};})}).then(function(r){
      if(!r||r.lote!==true)throw {semLote:true};
      var falhas={};(r.falhas||[]).forEach(function(f){falhas[normAg(f.nome)]=f.erro||'erro';});
      parte.forEach(function(x){var f=falhas[normAg(x.nome)];if(f)out.falhas.push({ix:x.ix,erro:f});else out.ok.push(x.ix);});
      progresso(out.ok.length+out.falhas.length);
      return prox();
    });
  }
  return prox();
}
// Plano B (backend sem a ação em lote): um pedido por pessoa, 3 por vez.
function enviarIndividualAg(items,progresso){
  var out={ok:[],falhas:[]},fila=items.slice();
  function proximo(){
    if(!fila.length)return Promise.resolve();
    var x=fila.shift();
    return apiAg({action:'agendamentos.update',nome:x.nome,situacao:x.situacao,dataAgendada:x.dataAgendada,turno:x.turno}).then(function(){out.ok.push(x.ix);}).catch(function(e){
      var m=(e&&e.message)||'';out.falhas.push({ix:x.ix,erro:m});
      if(/Sess/i.test(m))fila.length=0; // sessão expirada: não adianta insistir
    }).then(function(){progresso(out.ok.length+out.falhas.length);return proximo();});
  }
  return Promise.all([proximo(),proximo(),proximo()]).then(function(){return out;});
}
function executarSalvarGeradosAg(ixs){
  var total=ixs.length,uc=profMapAg(),turnos=turnosAg(uc);
  var items=ixs.map(function(i){i=Number(i);var r=rowsAg[i];return{ix:i,nome:r.Nome,situacao:'Agendado',dataAgendada:propostaAg[i],turno:turnos[i]?turnos[i].rotulo:''};});
  var btns=['agendamentosGerar','agendamentosSalvarGerados','agendamentosDescartar'];
  btns.forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=true;});
  function progresso(n){msgAg('Salvando agendamentos… '+n+' de '+total,false);}
  var envio=loteIndisponivelAg?enviarIndividualAg(items,progresso):enviarLoteAg(items,progresso).catch(function(e){
    if(e&&/Sess/i.test(e.message||''))throw e;
    loteIndisponivelAg=true;              // backend ainda não tem a ação em lote
    return enviarIndividualAg(items,progresso);
  });
  envio.then(function(out){
    out.ok.forEach(function(ix){var r=rowsAg[ix];r.Situação='Agendado';r['Data agendada']=propostaAg[ix];var it=items.filter(function(x){return x.ix===ix;})[0];r.Turno=it?it.turno:'';delete propostaAg[ix];});
    var falhas=out.falhas.length,ultimoErro=falhas?out.falhas[falhas-1].erro:'';
    finalizar(out.ok.length,falhas,ultimoErro);
  }).catch(function(e){finalizar(0,total,(e&&e.message)||'');});
  function finalizar(ok,falhas,ultimoErro){
    busyAg=false;
    btns.forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=false;});
    atualizarBotoesGeracaoAg();renderAg();
    msgAg(ok+(ok===1?' agendamento salvo':' agendamentos salvos')+(falhas?'; '+falhas+' não foram salvos'+(ultimoErro?' ('+ultimoErro+')':'')+' e continuam como proposta — clique em "Salvar datas geradas" para tentar de novo.':'.'),falhas>0);
  }
}
function loadAg(){if(busyAg)return;busyAg=true;profCacheAg=null;propostaAg={};atualizarBotoesGeracaoAg();msgAg('Carregando agendamentos…');renderAg();apiAg({action:'agendamentos.list'}).then(function(r){rowsAg=Array.isArray(r.rows)?r.rows:[];completarVirtuaisAg();msgAg('');}).catch(function(e){msgAg(e.message||'Falha ao carregar.',true);}).finally(function(){busyAg=false;renderAg();renderConfigAg();gerarAg(true);});}
function syncAg(){if(busyAg)return;profCacheAg=null;var list=window.__emultiPessoasAtendidas&&window.__emultiPessoasAtendidas();if(!list||!Array.isArray(list.rows)||!list.rows.length){msgAg('Atualize os dados do painel para carregar Pessoas atendidas antes de sincronizar.',true);return;}var pessoas=list.rows.map(function(r){return{nome:String(r[0]||'').trim(),at:Number(r[1])||0,total:Number(r[3])||0,ultimo:ultimoAg(r)};}).filter(function(x){return x.nome;});if(!pessoas.length){msgAg('Nenhuma pessoa em Pessoas atendidas. Atualize os dados do painel e tente de novo.',true);return;}busyAg=true;msgAg('Sincronizando '+pessoas.length+' pessoas…');renderAg();var syncMsg='';apiAg({action:'agendamentos.sync',rows:pessoas}).then(function(r){syncMsg='Sincronização concluída: '+(Number(r.inseridos)||0)+' novos; '+(Number(r.atualizados)||0)+' atualizados ('+pessoas.length+' pessoas em Pessoas atendidas).';msgAg(syncMsg);return apiAg({action:'agendamentos.list'});}).then(function(r){rowsAg=Array.isArray(r.rows)?r.rows:rowsAg;completarVirtuaisAg();}).catch(function(e){msgAg(e.message||'Falha ao sincronizar.',true);}).finally(function(){busyAg=false;renderAg();renderConfigAg();if(syncMsg){propostaAg={};gerarAg(true,syncMsg);}});}

// ---------- Salvar uma linha ----------
function saveAg(tr){
  var ix=Number(tr.dataset.agIx),r=rowsAg[ix];if(!r)return;
  var btn=tr.querySelector('[data-ag-save]'),fields={};
  tr.querySelectorAll('[data-ag]').forEach(function(el){fields[el.dataset.ag]=el.value;});
  btn.disabled=true;btn.textContent='Salvando…';
  var turno='';
  verificarConflitosAg([r]).then(function(conf){return conf.length?confirmarConflitosAg(conf):true;}).then(function(seguir){
    if(!seguir)throw {cancelado:true};
    return r._virtual?garantirNaPlanilhaAg([r]):null;
  }).then(function(){
    turno=turnoFuturoAg(ix,fields.situacao,fields.dataAgendada);
    return apiAg(Object.assign({action:'agendamentos.update',nome:r.Nome,turno:turno},fields));
  }).then(function(){
    r.Situação=fields.situacao;r['Data agendada']=fields.dataAgendada;r.Turno=turno;
    delete propostaAg[ix];atualizarBotoesGeracaoAg();
    var aviso='Alterações de '+r.Nome+' salvas.';
    msgAg(aviso);
    // Faltou: a pessoa volta para a fila e já recebe uma nova data sugerida.
    if(fields.situacao==='Faltou'){busyAg=false;gerarAg(true,aviso+' Nova data sugerida para o reagendamento.');}
  }).catch(function(e){
    if(e&&e.cancelado){msgAg('Alteração não salva: outra pessoa mudou esta linha. A tela mostra o estado atual da planilha.',true);return;}
    msgAg((e&&e.message)||'Falha ao salvar.',true);
  }).finally(function(){renderAg();});
}

// ---------- Vagas por dia ----------
function renderVagasAg(uc){
  var det=document.getElementById('agendamentosVagas'),box=document.getElementById('agendamentosVagasTabela');
  if(!det||!box||!det.open)return;
  if(!uc){box.innerHTML='<p class="agendamentos-vazio">Carregue Pessoas atendidas para ver as vagas.</p>';return;}
  var nomes={};Object.keys(uc.ultProf).forEach(function(n){var p=uc.ultProf[n];nomes[normAg(p)]=p;});
  var ks=Object.keys(nomes).sort(function(a,b){return nomes[a].localeCompare(nomes[b],'pt-BR');});
  if(!ks.length){box.innerHTML='<p class="agendamentos-vazio">Sem profissionais identificados.</p>';return;}
  var oc={};
  rowsAg.forEach(function(r,ix){var k=chaveProfAg(r,uc),d=propostaAg[ix]||dateAg(r['Data agendada']);if(!k||!d||!ehAtivoAg(r))return;(oc[k]=oc[k]||{})[d]=(oc[k][d]||0)+1;});
  var caps={};ks.forEach(function(k){caps[k]=capAg(k);});
  var h=new Date(),d=new Date(h.getFullYear(),h.getMonth(),h.getDate()),dias=[],guard=0;
  while(dias.length<15&&guard<60){guard++;var dow=d.getDay();if(ks.some(function(k){return caps[k].dias[dow];}))dias.push(d);d=somaDiaAg(d,1);}
  var html='<div class="table-wrap"><table class="data-table agendamentos-vagas-tab"><thead><tr><th>Dia</th>'+ks.map(function(k){return '<th>'+escAg(nomes[k])+'</th>';}).join('')+'</tr></thead><tbody>';
  dias.forEach(function(dt){
    var iso=isoAg(dt);
    html+='<tr><td class="agendamentos-nome">'+DIAS_SEM_AG[dt.getDay()]+', '+brAg(iso)+'</td>'+ks.map(function(k){
      var cap=caps[k];if(!cap.dias[dt.getDay()])return '<td class="vaga-off" title="Não atende neste dia">—</td>';
      var n=(oc[k]&&oc[k][iso])||0,cls=n>=cap.dia?'vaga-lotado':(n>=cap.dia*0.75?'vaga-quase':'vaga-livre');
      return '<td class="'+cls+'" title="'+(cap.dia-n>0?(cap.dia-n)+' vaga(s) livre(s)':'Sem vagas')+'">'+n+'/'+cap.dia+'</td>';
    }).join('')+'</tr>';
  });
  box.innerHTML=html+'</tbody></table></div><p class="agendamentos-filtro-info">Ocupação = pessoas agendadas (salvas ou sugeridas) / vagas do dia. Cancelados e faltosos não contam.</p>';
}

// ---------- Configuração (painel) ----------
function renderConfigAg(){
  var det=document.getElementById('agendamentosConfig');if(!det)return;
  function set(id,v){var el=document.getElementById(id);if(el)el.value=v;}
  set('agCfgM',cfgAg.m);set('agCfgT',cfgAg.t);set('agCfgJanela',cfgAg.janela);
  det.querySelectorAll('.agendamentos-cfg-dias input').forEach(function(cb){cb.checked=!!cfgAg.dias[Number(cb.dataset.dia)];});
  var box=document.getElementById('agCfgProf');if(!box)return;
  var uc=profMapAg();
  if(!uc){box.innerHTML='<p class="agendamentos-filtro-info">Carregue Pessoas atendidas para configurar por profissional.</p>';return;}
  var nomes={};Object.keys(uc.ultProf).forEach(function(n){var p=uc.ultProf[n];nomes[normAg(p)]=p;});
  var ks=Object.keys(nomes).sort(function(a,b){return nomes[a].localeCompare(nomes[b],'pt-BR');});
  box.innerHTML='<div class="table-wrap"><table class="data-table"><thead><tr><th>Profissional</th><th>Vagas manhã</th><th>Vagas tarde</th>'+DIAS_SEM_AG.map(function(n){return '<th>'+n+'</th>';}).join('')+'</tr></thead><tbody>'+ks.map(function(k){
    var o=cfgAg.prof[k]||{},cap=capAg(k);
    return '<tr data-k="'+escAg(k)+'"><td class="agendamentos-nome">'+escAg(nomes[k])+'</td>'
      +'<td><input type="number" min="0" data-campo="m" placeholder="'+cfgAg.m+'" value="'+(o.m==null?'':o.m)+'"></td>'
      +'<td><input type="number" min="0" data-campo="t" placeholder="'+cfgAg.t+'" value="'+(o.t==null?'':o.t)+'"></td>'
      +[0,1,2,3,4,5,6].map(function(i){return '<td><input type="checkbox" data-dia="'+i+'"'+(cap.dias[i]?' checked':'')+'></td>';}).join('')+'</tr>';
  }).join('')+'</tbody></table></div>';
}
// Mudou a configuração: guarda, e refaz a sugestão de datas.
function configMudouAg(){salvarConfigAg();propostaAg={};atualizarBotoesGeracaoAg();renderAg();gerarAg(true);}

// ---------- Exportar / imprimir ----------
function linhasAgendaAg(c){
  var pos=new Map();rowsAg.forEach(function(r,i){pos.set(r,i);});
  var out=[];
  c.list.forEach(function(r){
    var ix=pos.get(r);if(!ehAtivoAg(r))return;
    var d=propostaAg[ix]||dateAg(r['Data agendada']);if(!d)return;
    var t=c.turnos[ix];
    out.push({prof:(c.uc&&c.uc.ultProf[normAg(r.Nome)])||'Sem profissional identificado',data:d,turno:t?t.rotulo:'',tclasse:t?t.classe:'',nome:String(r.Nome||''),ult:ultimoDeAg(r,c.uc),sit:propostaAg[ix]?'Proposta (não salva)':(r.Situação||'Pendente'),at:r.Atendimentos,total:r.Total});
  });
  out.sort(function(a,b){
    return a.prof.localeCompare(b.prof,'pt-BR')||(a.data<b.data?-1:a.data>b.data?1:0)||((TURNO_ORD_AG[a.tclasse]||9)-(TURNO_ORD_AG[b.tclasse]||9))||(a.ult<b.ult?-1:a.ult>b.ult?1:0)||a.nome.localeCompare(b.nome,'pt-BR');
  });
  return out;
}
function diaSemAg(iso){var d=isoParaDataAg(iso);return d?DIAS_SEM_AG[d.getDay()]:'';}
function csvCelAg(v){var s=String(v==null?'':v);return /[";\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function exportarCsvAg(){
  var linhas=linhasAgendaAg(calcularListaAg());
  if(!linhas.length){msgAg('Nada para exportar: nenhuma pessoa com data na lista atual.',true);return;}
  var cab=['Profissional','Data','Dia da semana','Turno','Nome','Último atendimento','Situação','Atendimentos','Total'];
  var txt=[cab].concat(linhas.map(function(l){return [l.prof,brAg(l.data),diaSemAg(l.data),l.turno,l.nome,brAg(l.ult),l.sit,l.at,l.total];})).map(function(r){return r.map(csvCelAg).join(';');}).join('\r\n');
  var blob=new Blob(['\ufeff'+txt],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='agenda-'+isoAg(new Date())+'.csv';document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},2000);
  msgAg('Agenda exportada: '+linhas.length+(linhas.length===1?' pessoa':' pessoas')+' (respeita os filtros atuais).',false);
}
function imprimirAg(){
  var linhas=linhasAgendaAg(calcularListaAg());
  if(!linhas.length){msgAg('Nada para imprimir: nenhuma pessoa com data na lista atual.',true);return;}
  var w=window.open('','_blank');
  if(!w){msgAg('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.',true);return;}
  var porProf={},ordemProf=[];
  linhas.forEach(function(l){if(!porProf[l.prof]){porProf[l.prof]={};ordemProf.push(l.prof);}(porProf[l.prof][l.data]=porProf[l.prof][l.data]||[]).push(l);});
  var hoje=brAg(isoAg(new Date()));
  var html='<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Agenda</title><style>'
    +'body{font:13px/1.4 Arial,sans-serif;color:#1b1b1b;margin:18px}h1{font-size:18px;margin:0 0 2px}h2{font-size:14px;margin:16px 0 4px;background:#EAF3EE;padding:5px 8px}.sub{color:#555;margin:0 0 8px;font-size:12px}'
    +'table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}th{background:#f2f2f2;font-size:12px}td.c{width:70px}td.av{width:60px}'
    +'.prof{page-break-before:always}.prof:first-of-type{page-break-before:auto}@media print{body{margin:8mm}}'
    +'</style></head><body>'
    +ordemProf.map(function(p){
      var dias=Object.keys(porProf[p]).sort();
      return '<section class="prof"><h1>Agenda — '+escAg(p)+'</h1><p class="sub">Gerada em '+hoje+' · '+dias.length+(dias.length===1?' dia':' dias')+'</p>'
        +dias.map(function(d){
          var ls=porProf[p][d];
          return '<h2>'+diaSemAg(d)+', '+brAg(d)+' — '+ls.length+(ls.length===1?' pessoa':' pessoas')+'</h2><table><thead><tr><th>Turno</th><th>Nome</th><th>Último atendimento</th><th>Situação</th><th>Avisado?</th></tr></thead><tbody>'
            +ls.map(function(l){return '<tr><td class="c">'+escAg(l.turno||'—')+'</td><td>'+escAg(l.nome)+'</td><td>'+escAg(brAg(l.ult))+'</td><td>'+escAg(l.sit)+'</td><td class="av"></td></tr>';}).join('')+'</tbody></table>';
        }).join('')+'</section>';
    }).join('')+'</body></html>';
  w.document.open();w.document.write(html);w.document.close();
  setTimeout(function(){try{w.focus();w.print();}catch(e){}},350);
}

// ---------- Eventos ----------
function limparFiltrosAg(){
  ['agendamentosBusca','agendamentosProfissional','agendamentosTurno','agendamentosSituacao','agendamentosDe','agendamentosAte'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  var d=document.getElementById('agendamentosDias');if(d)d.value='120';
  var s=document.getElementById('agendamentosSeguir');if(s)s.checked=false;
  paginaAg=1;salvarFiltrosAg();propostaAg={};atualizarBotoesGeracaoAg();renderAg();gerarAg(true);
}
document.addEventListener('DOMContentLoaded',function(){
  var b=document.getElementById('agendamentosBody');
  carregarConfigAg();restaurarFiltrosAg();
  // Filtros só de visualização: voltam para a página 1 e ficam salvos.
  function visual(){paginaAg=1;salvarFiltrosAg();renderAg();}
  // Filtros que mudam quem recebe data (dias / seguir lista): refazem a sugestão automática.
  function refiltrarAg(){paginaAg=1;salvarFiltrosAg();propostaAg={};atualizarBotoesGeracaoAg();renderAg();gerarAg(true);}
  document.getElementById('agendamentosBusca').addEventListener('input',function(){paginaAg=1;renderAg();});
  var pf=document.getElementById('agendamentosProfissional');pf.addEventListener('input',visual);pf.addEventListener('focus',fillProfAg);
  ['agendamentosTurno','agendamentosSituacao','agendamentosPorPagina'].forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener('change',visual);});
  ['agendamentosDe','agendamentosAte'].forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener('change',visual);});
  var dEl=document.getElementById('agendamentosDias');if(dEl)dEl.addEventListener('input',refiltrarAg);
  var sEl=document.getElementById('agendamentosSeguir');if(sEl)sEl.addEventListener('change',refiltrarAg);
  var iEl=document.getElementById('agendamentosInicio');if(iEl)iEl.addEventListener('change',function(){propostaAg={};atualizarBotoesGeracaoAg();renderAg();gerarAg(true);});
  var lEl=document.getElementById('agendamentosLimpar');if(lEl)lEl.addEventListener('click',limparFiltrosAg);
  var cEl=document.getElementById('agendamentosCsv');if(cEl)cEl.addEventListener('click',exportarCsvAg);
  var prEl=document.getElementById('agendamentosImprimir');if(prEl)prEl.addEventListener('click',imprimirAg);
  var pv=document.getElementById('agendamentosPrev'),pn=document.getElementById('agendamentosNext');
  if(pv)pv.addEventListener('click',function(){paginaAg--;renderAg();});
  if(pn)pn.addEventListener('click',function(){paginaAg++;renderAg();});
  var thead=document.querySelector('#tabAgendamentos .agendamentos-table thead');
  if(thead)thead.addEventListener('click',function(e){
    var th=e.target.closest('th[data-ag-sort]');if(!th)return;
    var col=th.getAttribute('data-ag-sort');
    sortAg=sortAg.col===col?{col:col,dir:sortAg.dir==='asc'?'desc':'asc'}:{col:col,dir:'asc'};
    paginaAg=1;salvarFiltrosAg();renderAg();
  });
  // Painéis de vagas e configuração
  var dv=document.getElementById('agendamentosVagas');if(dv)dv.addEventListener('toggle',function(){renderAg();});
  var dc=document.getElementById('agendamentosConfig');
  if(dc){
    dc.addEventListener('toggle',function(){if(dc.open)renderConfigAg();});
    var gm=document.getElementById('agCfgM'),gt=document.getElementById('agCfgT'),gj=document.getElementById('agCfgJanela');
    if(gm)gm.addEventListener('change',function(){cfgAg.m=numAg(gm.value,6,0);configMudouAg();});
    if(gt)gt.addEventListener('change',function(){cfgAg.t=numAg(gt.value,6,0);configMudouAg();});
    if(gj)gj.addEventListener('change',function(){cfgAg.janela=numAg(gj.value,0,0);configMudouAg();});
    dc.querySelectorAll('.agendamentos-cfg-dias input').forEach(function(cb){cb.addEventListener('change',function(){cfgAg.dias[Number(cb.dataset.dia)]=cb.checked?1:0;configMudouAg();});});
    var pr=document.getElementById('agCfgProf');
    if(pr)pr.addEventListener('change',function(e){
      var tr=e.target.closest('tr[data-k]');if(!tr)return;
      var k=tr.dataset.k,o=cfgAg.prof[k]||{};
      if(e.target.dataset.campo){var v=e.target.value;if(v==='')delete o[e.target.dataset.campo];else o[e.target.dataset.campo]=numAg(v,0,0);}
      else if(e.target.dataset.dia!==undefined){
        var dias=[0,0,0,0,0,0,0];tr.querySelectorAll('input[data-dia]').forEach(function(cb){dias[Number(cb.dataset.dia)]=cb.checked?1:0;});
        if(dias.join()===cfgAg.dias.join())delete o.dias;else o.dias=dias;
      }
      if(Object.keys(o).length)cfgAg.prof[k]=o;else delete cfgAg.prof[k];
      configMudouAg();
    });
    var rs=document.getElementById('agCfgReset');
    if(rs)rs.addEventListener('click',function(){cfgAg={m:6,t:6,dias:DIAS_UTEIS_AG.slice(),janela:0,prof:{}};renderConfigAg();configMudouAg();});
  }
  document.getElementById('agendamentosAtualizar').addEventListener('click',loadAg);document.getElementById('agendamentosSincronizar').addEventListener('click',syncAg);
  // Mudou o filtro em Pessoas atendidas: só importa se a aba está seguindo aquela lista.
  window.addEventListener('emulti:pessoas-filtro',function(){
    if(!seguirListaAg())return;
    var painel=document.getElementById('tabAgendamentos');
    if(painel&&painel.classList.contains('active'))refiltrarAg();
    else if(Object.keys(propostaAg).length){propostaAg={};atualizarBotoesGeracaoAg();}
  });
  var ini=document.getElementById('agendamentosInicio');if(ini)ini.value=isoAg(diaUtilAg(amanhaAg()));
  document.getElementById('agendamentosGerar').addEventListener('click',function(){gerarAg(false);});
  document.getElementById('agendamentosSalvarGerados').addEventListener('click',salvarGeradosAg);
  document.getElementById('agendamentosDescartar').addEventListener('click',descartarAg);
  document.querySelector('.tab[data-tab="agendamentos"]').addEventListener('click',loadAg);
  b.addEventListener('click',function(e){var btn=e.target.closest('[data-ag-save]');if(btn)saveAg(btn.closest('tr'));});
  b.addEventListener('change',function(e){
    if(e.target.dataset.ag==='situacao')saveAg(e.target.closest('tr'));
    // Ajuste manual da data de uma linha gerada: vale como nova proposta (ainda sem salvar).
    if(e.target.dataset.ag==='dataAgendada'){var tr=e.target.closest('tr'),ix=Number(tr.dataset.agIx);if(propostaAg[ix]!==undefined){if(e.target.value)propostaAg[ix]=e.target.value;else delete propostaAg[ix];atualizarBotoesGeracaoAg();renderAg();}}
  });
  b.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.matches('input[data-ag]')){e.preventDefault();saveAg(e.target.closest('tr'));}});
});
