// Aba de agendamentos: lê/grava a aba Agendamentos pelo backend existente.
var rowsAg=[]; var busyAg=false; var profCacheAg=null;
// Datas geradas automaticamente que ainda NÃO foram salvas na planilha:
// índice da linha em rowsAg -> data (AAAA-MM-DD). Só vão pra planilha quando
// a pessoa clica em "Salvar datas geradas".
var propostaAg={};
// Capacidade de cada profissional por dia útil: 6 pela manhã + 6 à tarde.
var CAP_MANHA_AG=6, CAP_TARDE_AG=6, CAP_DIA_AG=CAP_MANHA_AG+CAP_TARDE_AG;
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
// A lista de Agendamentos segue a lista "Pessoas atendidas" com os filtros
// aplicados lá (Mês, colunas, busca): só aparece quem está nela. Sem estado
// (lista ainda não aberta) mostra todo mundo.
function filtroListaAg(){
  var f=window.__emultiPessoasAtendidasFiltradas&&window.__emultiPessoasAtendidasFiltradas();
  if(!f||!Array.isArray(f.nomes))return null;
  var set={};f.nomes.forEach(function(n){set[normAg(n)]=true;});
  return {set:set,origem:f.origem,meses:f.meses||[],n:f.nomes.length};
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
function renderAg(){
  var body=document.getElementById('agendamentosBody'); if(!body)return;
  var uc=profMapAg(),
      q=(document.getElementById('agendamentosBusca').value||'').trim().toLocaleLowerCase('pt-BR'),
      pq=normAg(document.getElementById('agendamentosProfissional').value),
      lf=filtroListaAg(), semProf=!!pq&&!uc;
  var list=semProf?[]:rowsAg.filter(function(r){
    if(lf&&!lf.set[normAg(r.Nome)])return false;
    if(q&&!String(r.Nome||'').toLocaleLowerCase('pt-BR').includes(q))return false;
    if(pq){var up=uc.ultProf[normAg(r.Nome)]||'';if(normAg(up).indexOf(pq)<0)return false;}
    return true;
  });
  document.getElementById('agendamentosContagem').textContent=list.length+(list.length===1?' pessoa':' pessoas');
  var info=document.getElementById('agendamentosFiltroInfo');
  if(info)info.textContent=lf?('Seguindo a lista Pessoas atendidas (aba '+lf.origem+'): '+lf.n+(lf.n===1?' pessoa':' pessoas')+' · '+(lf.meses.length?lf.meses.length+(lf.meses.length===1?' mês selecionado':' meses selecionados'):'todos os meses')+'. Mude os filtros lá e esta lista acompanha.'):'Mostrando todas as pessoas — abra a lista Pessoas atendidas (M1/M2) e aplique filtros para limitar esta lista.';
  if(!list.length){
    body.innerHTML='<tr><td colspan="10" class="agendamentos-vazio">'+(busyAg?'Carregando…':semProf?'Dados de profissionais indisponíveis. Atualize os dados do painel.':(q||pq||lf)?'Nenhuma pessoa encontrada.':'Nenhum registro disponível. Sincronize Pessoas atendidas.')+'</td></tr>';
    return;
  }
  var turnos=turnosAg(uc);
  body.innerHTML=list.map(function(r){
    var ix=rowsAg.indexOf(r), prop=propostaAg[ix], data=prop||dateAg(r['Data agendada']);
    var prof=(uc&&uc.ultProf[normAg(r.Nome)])||'—', t=turnos[ix];
    var turnoHtml=t?'<span class="ag-turno '+t.classe+'" title="'+escAg(t.dica)+'">'+t.rotulo+'</span>':'—';
    return '<tr data-ag-ix="'+ix+'"'+(prop?' class="agendamentos-gerada" title="Data gerada automaticamente — ainda não salva"':'')+'>'
      +'<td class="agendamentos-nome">'+escAg(r.Nome)+'</td>'
      +'<td>'+escAg(r.Atendimentos)+'</td>'
      +'<td>'+escAg(r.Total)+'</td>'
      +'<td>'+escAg(brAg(ultimoDeAg(r,uc)))+'</td>'
      +'<td class="agendamentos-prof">'+escAg(prof)+'</td>'
      +'<td><select data-ag="situacao" aria-label="Situação"><option'+((r.Situação||'Pendente')==='Pendente'?' selected':'')+'>Pendente</option><option'+(r.Situação==='Agendado'?' selected':'')+'>Agendado</option><option'+(r.Situação==='Realizado'?' selected':'')+'>Realizado</option><option'+(r.Situação==='Cancelado'?' selected':'')+'>Cancelado</option></select></td>'
      +'<td><input type="date" data-ag="dataAgendada" value="'+data+'"></td>'
      +'<td>'+turnoHtml+'</td>'
      +'<td class="agendamentos-atualizado">'+escAg(r['Atualizado em']||'')+'</td>'
      +'<td><button type="button" class="agendamentos-salvar" data-ag-save>Salvar</button></td></tr>';
  }).join('');
}

// ---------- Geração automática de datas ----------
// Regras: por profissional da ÚLTIMA consulta da pessoa; quem tem a última
// consulta mais antiga entra primeiro; só segunda a sexta; no máximo 12 pessoas
// por profissional por dia (6 de manhã + 6 à tarde). Quem já tem data na
// planilha (e não está Cancelado) ocupa vaga no dia dele.
function isoAg(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function isoParaDataAg(iso){var m=String(iso||'').match(/^(\d{4})-(\d\d)-(\d\d)$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):null;}
// Primeiro dia útil (seg–sex) a partir de d (inclusive).
function diaUtilAg(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());while(x.getDay()===0||x.getDay()===6)x.setDate(x.getDate()+1);return x;}
function amanhaAg(){var h=new Date();return new Date(h.getFullYear(),h.getMonth(),h.getDate()+1);}
// Núcleo da distribuição (função pura).
//  cands: [{ix,prof,nome,ult}]  prof = chave do profissional; ult = AAAA-MM-DD
//  ocupados: {prof:{AAAA-MM-DD:n}}  vagas já usadas  |  inicio: Date
//  devolve {ix: AAAA-MM-DD}
function planejarAg(cands,ocupados,inicio){
  var porProf={},plano={};
  cands.forEach(function(c){(porProf[c.prof]=porProf[c.prof]||[]).push(c);});
  Object.keys(porProf).forEach(function(p){
    var fila=porProf[p].slice().sort(function(a,b){
      if(a.ult!==b.ult)return a.ult<b.ult?-1:1;
      return String(a.nome).localeCompare(String(b.nome),'pt-BR');
    });
    var oc=Object.assign({},ocupados[p]||{}),dia=diaUtilAg(inicio);
    fila.forEach(function(c){
      while((oc[isoAg(dia)]||0)>=CAP_DIA_AG)dia=diaUtilAg(new Date(dia.getFullYear(),dia.getMonth(),dia.getDate()+1));
      var k=isoAg(dia);oc[k]=(oc[k]||0)+1;plano[c.ix]=k;
    });
  });
  return plano;
}
function chaveProfAg(r,uc){var p=uc&&uc.ultProf[normAg(r.Nome)];return p?normAg(p):'';}
// Turno de cada pessoa com data (salva ou gerada, exceto Cancelado): em cada
// profissional+dia, as 6 de última consulta mais antiga ficam de manhã, as 6
// seguintes à tarde; passou de 12 = excedente (só acontece com data manual).
function turnosAg(uc){
  var grupos={},res={};
  rowsAg.forEach(function(r,ix){
    var k=chaveProfAg(r,uc); if(!k)return;
    if((r.Situação||'Pendente')==='Cancelado')return;
    var d=propostaAg[ix]||dateAg(r['Data agendada']); if(!d)return;
    (grupos[k+'|'+d]=grupos[k+'|'+d]||[]).push({ix:ix,ult:ultimoDeAg(r,uc),nome:String(r.Nome||'')});
  });
  Object.keys(grupos).forEach(function(g){
    grupos[g].sort(function(a,b){
      if(a.ult!==b.ult)return a.ult<b.ult?-1:1;
      return a.nome.localeCompare(b.nome,'pt-BR');
    }).forEach(function(x,pos){
      var n=pos+1;
      if(pos<CAP_MANHA_AG)res[x.ix]={rotulo:'Manhã',classe:'manha',dica:'Manhã — vaga '+n+' de '+CAP_MANHA_AG};
      else if(pos<CAP_DIA_AG)res[x.ix]={rotulo:'Tarde',classe:'tarde',dica:'Tarde — vaga '+(n-CAP_MANHA_AG)+' de '+CAP_TARDE_AG};
      else res[x.ix]={rotulo:'Excedente',classe:'excedente',dica:'Acima do limite de '+CAP_DIA_AG+' pessoas por dia para este profissional'};
    });
  });
  return res;
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
    return '<li><b>'+escAg(nomes[k]||k)+'</b>: '+o.n+(o.n===1?' pessoa':' pessoas')+' · '+brAg(o.min)+(o.min===o.max?'':' a '+brAg(o.max))+' ('+nd+(nd===1?' dia útil)':' dias úteis)')+'</li>';
  }).join('');
  el.innerHTML=itens?'<ul>'+itens+'</ul>':'';
}
function gerarAg(){
  if(busyAg)return;
  var uc=profMapAg();
  if(!uc||!Object.keys(uc.ultProf).length){msgAg('Atualize os dados do painel para carregar Pessoas atendidas antes de gerar as datas.',true);return;}
  if(!rowsAg.length){msgAg('Não há registros em Agendamentos. Clique em "Sincronizar Pessoas atendidas" primeiro.',true);return;}
  var ini=isoParaDataAg(document.getElementById('agendamentosInicio').value);
  var inicio=diaUtilAg(ini||amanhaAg());
  var pq=normAg(document.getElementById('agendamentosProfissional').value);
  var lf=filtroListaAg();
  var ocupados={},nomes={},cands=[],semProf=0,jaTem=0;
  rowsAg.forEach(function(r){
    var k=chaveProfAg(r,uc),d=dateAg(r['Data agendada']);
    if(!k||!d||(r.Situação||'Pendente')==='Cancelado')return;
    (ocupados[k]=ocupados[k]||{})[d]=((ocupados[k]||{})[d]||0)+1;
  });
  rowsAg.forEach(function(r,ix){
    if(lf&&!lf.set[normAg(r.Nome)])return;
    if((r.Situação||'Pendente')!=='Pendente')return;
    if(dateAg(r['Data agendada'])){jaTem++;return;}
    var prof=uc.ultProf[normAg(r.Nome)];
    if(!prof){semProf++;return;}
    var k=normAg(prof);
    if(pq&&k.indexOf(pq)<0)return;
    nomes[k]=prof;
    cands.push({ix:ix,prof:k,nome:String(r.Nome||''),ult:ultimoDeAg(r,uc)});
  });
  if(!cands.length){propostaAg={};atualizarBotoesGeracaoAg();renderAg();msgAg('Nenhuma pessoa pendente para agendar'+(pq?' deste profissional':'')+'.'+(jaTem?' '+jaTem+' já têm data.':''),false);return;}
  propostaAg=planejarAg(cands,ocupados,inicio);
  var datas=Object.keys(propostaAg).map(function(i){return propostaAg[i];}).sort();
  renderAg();atualizarBotoesGeracaoAg();resumoGeradoAg(uc,nomes);
  msgAg(cands.length+(cands.length===1?' pessoa distribuída':' pessoas distribuídas')+' de '+brAg(datas[0])+' a '+brAg(datas[datas.length-1])+' (seg–sex, até '+CAP_MANHA_AG+' de manhã + '+CAP_TARDE_AG+' à tarde por profissional/dia). Revise e clique em "Salvar datas geradas".'+(semProf?' '+semProf+' sem profissional identificado ficaram de fora.':''),false);
}
function descartarAg(){propostaAg={};atualizarBotoesGeracaoAg();renderAg();msgAg('Datas geradas descartadas.',false);}
// Grava as datas geradas na planilha (Situação passa a "Agendado"), 3 pedidos por vez.
function salvarGeradosAg(){
  var ixs=Object.keys(propostaAg);
  if(!ixs.length||busyAg)return;
  var datas=ixs.map(function(i){return propostaAg[i];}).sort();
  if(!window.confirm('Salvar '+ixs.length+' agendamentos (de '+brAg(datas[0])+' a '+brAg(datas[datas.length-1])+')?\nA situação dessas pessoas passará para "Agendado".'))return;
  busyAg=true;
  var virtuais=ixs.map(function(i){return rowsAg[Number(i)];}).filter(function(r){return r&&r._virtual;});
  var preparo=virtuais.length?(msgAg('Preparando '+virtuais.length+' pessoas novas na planilha…',false),garantirNaPlanilhaAg(virtuais)):Promise.resolve();
  preparo.then(function(){executarSalvarGeradosAg(ixs);}).catch(function(e){busyAg=false;msgAg((e&&e.message)||'Não foi possível preparar as pessoas na planilha.',true);});
}
function executarSalvarGeradosAg(ixs){
  var fila=ixs.slice(),total=ixs.length,ok=0,falhas=0,ultimoErro='';
  ['agendamentosGerar','agendamentosSalvarGerados','agendamentosDescartar'].forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=true;});
  function proximo(){
    if(!fila.length)return Promise.resolve();
    var ix=Number(fila.shift()),r=rowsAg[ix],data=propostaAg[ix];
    return apiAg({action:'agendamentos.update',nome:r.Nome,situacao:'Agendado',dataAgendada:data}).then(function(){
      r.Situação='Agendado';r['Data agendada']=data;delete propostaAg[ix];ok++;
    }).catch(function(e){
      falhas++;ultimoErro=(e&&e.message)||'';
      if(/Sess/i.test(ultimoErro))fila.length=0; // sessão expirada: não adianta insistir
    }).then(function(){
      msgAg('Salvando agendamentos… '+(ok+falhas)+' de '+total,false);
      return proximo();
    });
  }
  Promise.all([proximo(),proximo(),proximo()]).then(function(){
    busyAg=false;
    ['agendamentosGerar','agendamentosSalvarGerados','agendamentosDescartar'].forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=false;});
    atualizarBotoesGeracaoAg();renderAg();
    msgAg(ok+(ok===1?' agendamento salvo':' agendamentos salvos')+(falhas?'; '+falhas+' não foram salvos'+(ultimoErro?' ('+ultimoErro+')':'')+' e continuam como proposta — clique em "Salvar datas geradas" para tentar de novo.':'.'),falhas>0);
  });
}
function loadAg(){if(busyAg)return;busyAg=true;profCacheAg=null;propostaAg={};atualizarBotoesGeracaoAg();msgAg('Carregando agendamentos…');renderAg();apiAg({action:'agendamentos.list'}).then(function(r){rowsAg=Array.isArray(r.rows)?r.rows:[];completarVirtuaisAg();msgAg('');}).catch(function(e){msgAg(e.message||'Falha ao carregar.',true);}).finally(function(){busyAg=false;renderAg();});}
function syncAg(){if(busyAg)return;profCacheAg=null;var list=window.__emultiPessoasAtendidas&&window.__emultiPessoasAtendidas();if(!list||!Array.isArray(list.rows)||!list.rows.length){msgAg('Atualize os dados do painel para carregar Pessoas atendidas antes de sincronizar.',true);return;}var pessoas=list.rows.map(function(r){return{nome:String(r[0]||'').trim(),at:Number(r[1])||0,total:Number(r[3])||0,ultimo:ultimoAg(r)};}).filter(function(x){return x.nome;});if(!pessoas.length){msgAg('Nenhuma pessoa em Pessoas atendidas. Atualize os dados do painel e tente de novo.',true);return;}busyAg=true;msgAg('Sincronizando '+pessoas.length+' pessoas…');renderAg();apiAg({action:'agendamentos.sync',rows:pessoas}).then(function(r){msgAg('Sincronização concluída: '+(Number(r.inseridos)||0)+' novos; '+(Number(r.atualizados)||0)+' atualizados ('+pessoas.length+' pessoas em Pessoas atendidas).');return apiAg({action:'agendamentos.list'});}).then(function(r){rowsAg=Array.isArray(r.rows)?r.rows:rowsAg;completarVirtuaisAg();}).catch(function(e){msgAg(e.message||'Falha ao sincronizar.',true);}).finally(function(){busyAg=false;renderAg();});}
function saveAg(tr){var r=rowsAg[Number(tr.dataset.agIx)];if(!r)return;var btn=tr.querySelector('[data-ag-save]'),fields={};tr.querySelectorAll('[data-ag]').forEach(function(el){fields[el.dataset.ag]=el.value;});btn.disabled=true;btn.textContent='Salvando…';(r._virtual?garantirNaPlanilhaAg([r]):Promise.resolve()).then(function(){return apiAg(Object.assign({action:'agendamentos.update',nome:r.Nome},fields));}).then(function(){r.Situação=fields.situacao;r['Data agendada']=fields.dataAgendada;delete propostaAg[Number(tr.dataset.agIx)];atualizarBotoesGeracaoAg();msgAg('Alterações de '+r.Nome+' salvas.');}).catch(function(e){msgAg(e.message||'Falha ao salvar.',true);}).finally(function(){renderAg();});}
document.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('agendamentosBody');document.getElementById('agendamentosBusca').addEventListener('input',renderAg);var pf=document.getElementById('agendamentosProfissional');pf.addEventListener('input',renderAg);pf.addEventListener('focus',fillProfAg);document.getElementById('agendamentosAtualizar').addEventListener('click',loadAg);document.getElementById('agendamentosSincronizar').addEventListener('click',syncAg);
  // Mudou o filtro em Pessoas atendidas: a lista acompanha e as datas geradas (que valiam
  // pro filtro antigo) são descartadas.
  window.addEventListener('emulti:pessoas-filtro',function(){
    if(Object.keys(propostaAg).length){propostaAg={};atualizarBotoesGeracaoAg();msgAg('O filtro da lista Pessoas atendidas mudou: as datas geradas foram descartadas. Gere novamente.',false);}
    var painel=document.getElementById('tabAgendamentos');if(painel&&painel.classList.contains('active'))renderAg();
  });
  var ini=document.getElementById('agendamentosInicio');if(ini)ini.value=isoAg(diaUtilAg(amanhaAg()));
  document.getElementById('agendamentosGerar').addEventListener('click',gerarAg);
  document.getElementById('agendamentosSalvarGerados').addEventListener('click',salvarGeradosAg);
  document.getElementById('agendamentosDescartar').addEventListener('click',descartarAg);document.querySelector('.tab[data-tab="agendamentos"]').addEventListener('click',loadAg);b.addEventListener('click',function(e){var btn=e.target.closest('[data-ag-save]');if(btn)saveAg(btn.closest('tr'));});b.addEventListener('change',function(e){
    if(e.target.dataset.ag==='situacao')saveAg(e.target.closest('tr'));
    // Ajuste manual da data de uma linha gerada: vale como nova proposta (ainda sem salvar).
    if(e.target.dataset.ag==='dataAgendada'){var tr=e.target.closest('tr'),ix=Number(tr.dataset.agIx);if(propostaAg[ix]!==undefined){if(e.target.value)propostaAg[ix]=e.target.value;else delete propostaAg[ix];atualizarBotoesGeracaoAg();renderAg();}}
  });b.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.matches('input[data-ag]')){e.preventDefault();saveAg(e.target.closest('tr'));}});});
