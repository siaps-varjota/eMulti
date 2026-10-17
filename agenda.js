// Visão Agenda (pill dentro da aba Agendamentos): calendário mensal dos agendamentos da eMulti.
// Os dados vêm da aba Agendamentos (window.__emultiAgendaDados): agendados/realizados salvos na
// planilha + datas sugeridas ainda não salvas. Exporta PDF, texto para WhatsApp e card em imagem.
var MESES_AGENDA=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
var DIAS_AGENDA=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
var DIAS_AGENDA_LONGO=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
var TIPO_ROTULO_AGENDA={agendado:'Agendado',sugerido:'Sugerido',realizado:'Realizado',faltou:'Faltou'};
var TURNO_ORD_AGENDA={'Manhã':1,'Tarde':2,'':3};

var mesAgenda=(function(){var h=new Date();return new Date(h.getFullYear(),h.getMonth(),1);})();
var semanaAgenda='';   // '' = todo o mês; senão "1".."6" (índice da semana do mês)
var profAgenda='';     // '' = todos
var diaAgenda='';      // '' = período inteiro (mês/semana); senão AAAA-MM-DD do dia escolhido p/ PDF, WhatsApp e Imagem

function elAgenda(id){return document.getElementById(id);}
function escAgenda(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function pad2Agenda(n){return ('0'+n).slice(-2);}
function isoParaDataAgenda(iso){var m=String(iso||'').match(/^(\d{4})-(\d\d)-(\d\d)$/);return m?new Date(+m[1],+m[2]-1,+m[3]):null;}
function brAgenda(d){return pad2Agenda(d.getDate())+'/'+pad2Agenda(d.getMonth()+1)+'/'+d.getFullYear();}
function chaveDiaAgenda(d){return d.getFullYear()+'-'+pad2Agenda(d.getMonth()+1)+'-'+pad2Agenda(d.getDate());}
function mesmoDiaAgenda(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}

// Nome curto para caber na célula: 1º nome, iniciais do meio e último sobrenome.
function nomeCurtoAgenda(nome){
  var p=String(nome||'').trim().split(/\s+/);
  if(p.length<=2||nome.length<=18)return nome;
  return [p[0],p[1]].concat(p.slice(2,-1).map(function(n){return n.charAt(0)+'.';})).concat(p[p.length-1]).join(' ');
}

// Eventos com Date, ordenados por dia, turno e nome.
function eventosAgenda(){
  var f=window.__emultiAgendaDados;if(!f)return {eventos:[],pronto:false};
  var r;
  try{r=f();}catch(e){if(window.console)console.error('Agenda: falha ao montar os eventos',e);return {eventos:[],pronto:true,erro:(e&&e.message)||String(e)};}
  var ev=(r.eventos||[]).map(function(e){return Object.assign({},e,{dt:isoParaDataAgenda(e.data)});}).filter(function(e){return e.dt;});
  ev.sort(function(a,b){
    if(a.dt-b.dt)return a.dt-b.dt;
    var ta=TURNO_ORD_AGENDA[a.turno]||3,tb=TURNO_ORD_AGENDA[b.turno]||3;
    if(ta!==tb)return ta-tb;
    return a.nome.localeCompare(b.nome,'pt-BR');
  });
  return {eventos:ev,pronto:r.pronto!==false,diag:r.diag||null,erro:''};
}

// Semanas (domingo a sábado) que tocam o mês exibido.
function semanasDoMes(){
  var ini=new Date(mesAgenda.getFullYear(),mesAgenda.getMonth(),1),fim=new Date(mesAgenda.getFullYear(),mesAgenda.getMonth()+1,0);
  var out=[],cur=new Date(ini.getFullYear(),ini.getMonth(),1-ini.getDay()),n=1;
  while(cur<=fim){
    var a=new Date(cur),b=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+6);
    var ia=a<ini?ini:a,ib=b>fim?fim:b;
    out.push({n:String(n),inicio:ia,fim:ib,label:'Semana '+n+' ('+pad2Agenda(ia.getDate())+'/'+pad2Agenda(ia.getMonth()+1)+' a '+pad2Agenda(ib.getDate())+'/'+pad2Agenda(ib.getMonth()+1)+')'});
    cur=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+7);n++;
  }
  return out;
}

// Estado calculado a partir dos filtros atuais.
function estadoAgenda(){
  var base=eventosAgenda(),todos=base.eventos;
  var profs={};todos.forEach(function(e){profs[e.profKey]=e.prof;});
  // Uma opção por profissional/unidade configurada (ex.: Aline — Ararinha, Aline — Vila Naiara), mesmo sem agendamentos.
  var extras={};try{extras=(window.__emultiAgendaOpcoes&&window.__emultiAgendaOpcoes())||{};}catch(e){}
  Object.keys(extras).forEach(function(k){
    if(profs[k])return;
    var i=k.indexOf('@'),dup=false;
    if(i>0&&typeof window.__emultiUnidCasa==='function')Object.keys(profs).forEach(function(o){var j=o.indexOf('@');if(j>0&&o.slice(0,j)===k.slice(0,i)&&window.__emultiUnidCasa(o.slice(j+1),k.slice(i+1)))dup=true;});
    if(!dup)profs[k]=extras[k];
  });
  if(profAgenda&&!profs[profAgenda]&&todos.length)profAgenda='';   // filtro de um profissional que não tem mais agendamentos: volta para "Todos"
  var ev=todos.filter(function(e){return !profAgenda||e.profKey===profAgenda;});
  var doMes=ev.filter(function(e){return e.dt.getFullYear()===mesAgenda.getFullYear()&&e.dt.getMonth()===mesAgenda.getMonth();});
  var semanas=semanasDoMes(),sem=semanas.filter(function(s){return s.n===semanaAgenda;})[0]||null;
  var filtrados=sem?doMes.filter(function(e){return e.dt>=sem.inicio&&e.dt<=sem.fim;}):doMes;
  // Dia escolhido: só vale se estiver no mês (e na semana, se uma semana estiver escolhida) exibidos.
  var diaSel=diaAgenda?isoParaDataAgenda(diaAgenda):null;
  if(diaSel&&(diaSel.getFullYear()!==mesAgenda.getFullYear()||diaSel.getMonth()!==mesAgenda.getMonth()||(sem&&(diaSel<sem.inicio||diaSel>sem.fim))))diaSel=null;
  if(!diaSel)diaAgenda='';
  var dia=diaSel?{chave:diaAgenda,dt:diaSel,eventos:doMes.filter(function(e){return chaveDiaAgenda(e.dt)===diaAgenda;})}:null;
  // Dia lotado: algum profissional com tantas pessoas no dia quanto a vaga diária configurada.
  var lot={};
  ev.forEach(function(e){if(e.tipo==='faltou')return;var k=chaveDiaAgenda(e.dt)+'|'+e.profKey;var o=lot[k]=lot[k]||{n:0,cap:e.capDia};o.n++;});
  var lotados={};Object.keys(lot).forEach(function(k){if(lot[k].cap>0&&lot[k].n>=lot[k].cap)lotados[k.split('|')[0]]=true;});
  return {pronto:base.pronto,erro:base.erro,diag:base.diag,todos:todos,evProf:ev,profs:profs,ev:doMes,filtrados:filtrados,semanas:semanas,sem:sem,dia:dia,lotados:lotados};
}

function contarAgenda(lista,tipo){return lista.filter(function(e){return e.tipo===tipo;}).length;}
// O que aparece na tela e vai para PDF/WhatsApp/Imagem: o dia escolhido, senão a semana, senão o mês.
function listaVisivelAgenda(st){return st.dia?st.dia.eventos:(st.sem?st.filtrados:st.ev);}
function rotuloDiaAgenda(dt){return DIAS_AGENDA_LONGO[dt.getDay()]+', '+brAgenda(dt);}


// Quando a Agenda fica vazia, explica o motivo (outro mês, linhas fora da Agenda etc.).
function motivoVazioAgenda(st){
  var m=[],d=st.diag;
  if(st.todos.length&&!st.evProf.length){m.push('Nenhum agendamento do profissional escolhido.');}
  else if(st.todos.length&&!st.dia){
    var fora=st.evProf.filter(function(e){return !(e.dt.getFullYear()===mesAgenda.getFullYear()&&e.dt.getMonth()===mesAgenda.getMonth());});
    if(fora.length){var primeiro=fora.map(function(e){return e.dt;}).sort(function(a,b){return a-b;})[0];m.push('Há '+fora.length+' agendamento(s) em outros meses (o mais próximo, em '+brAgenda(primeiro)+'). Use ‹ › para mudar de mês.');}
  }
  if(d&&!st.todos.length){
    if(!d.linhas)m.push('A tabela de Agendamentos ainda não foi carregada.');
    else if(!d.comData)m.push('Nenhuma linha da tabela tem data agendada.');
    else m.push('A tabela tem '+d.comData+' linha(s) com data, mas nenhuma entrou na Agenda'+(d.inativas?': '+d.inativas+' Cancelado/Faltou':'')+(d.naoElegiveis?(d.inativas?'; ':': ')+d.naoElegiveis+' fora de Pessoas atendidas pela eMulti':'')+'.');
  }
  return m.length?' '+m.join(' '):'';
}

function renderAgenda(){
  var grade=elAgenda('agendaGrade');if(!grade)return;
  var st=estadoAgenda();
  // Filtros
  var selP=elAgenda('agendaProf');
  var chaves=Object.keys(st.profs).sort(function(a,b){return st.profs[a].localeCompare(st.profs[b],'pt-BR');});
  var htmlP='<option value="">Todos os profissionais</option>'+chaves.map(function(k){return '<option value="'+escAgenda(k)+'"'+(k===profAgenda?' selected':'')+'>'+escAgenda(st.profs[k])+'</option>';}).join('');
  if(selP.getAttribute('data-sig')!==htmlP){selP.innerHTML=htmlP;selP.setAttribute('data-sig',htmlP);}
  selP.value=profAgenda;
  var selS=elAgenda('agendaSemana');
  var htmlS='<option value="">Todo o mês</option>'+st.semanas.map(function(s){return '<option value="'+s.n+'">'+escAgenda(s.label)+'</option>';}).join('');
  if(selS.getAttribute('data-sig')!==htmlS){selS.innerHTML=htmlS;selS.setAttribute('data-sig',htmlS);}
  selS.value=semanaAgenda;
  elAgenda('agendaMes').textContent=MESES_AGENDA[mesAgenda.getMonth()]+' '+mesAgenda.getFullYear();
  // Seletor de dia (só os dias do período exibido, com a contagem de cada um).
  var selD=elAgenda('agendaDia');
  if(selD){
    var contDia={};st.ev.forEach(function(e){var k=chaveDiaAgenda(e.dt);contDia[k]=(contDia[k]||0)+1;});
    var iniD=st.sem?st.sem.inicio:new Date(mesAgenda.getFullYear(),mesAgenda.getMonth(),1),fimD=st.sem?st.sem.fim:new Date(mesAgenda.getFullYear(),mesAgenda.getMonth()+1,0);
    var htmlD='<option value="">Todos os dias</option>';
    for(var dd=new Date(iniD);dd<=fimD;dd=new Date(dd.getFullYear(),dd.getMonth(),dd.getDate()+1)){
      var kd=chaveDiaAgenda(dd);
      htmlD+='<option value="'+kd+'">'+DIAS_AGENDA[dd.getDay()]+', '+pad2Agenda(dd.getDate())+'/'+pad2Agenda(dd.getMonth()+1)+' ('+(contDia[kd]||0)+')</option>';
    }
    if(selD.getAttribute('data-sig')!==htmlD){selD.innerHTML=htmlD;selD.setAttribute('data-sig',htmlD);}
    selD.value=st.dia?st.dia.chave:'';
  }
  var rotDia=st.dia?rotuloDiaAgenda(st.dia.dt):'';
  [['agendaPdf','Gerar PDF'],['agendaZap','Copiar texto para WhatsApp'],['agendaImg','Baixar card em imagem']].forEach(function(b){
    var el=elAgenda(b[0]);if(el)el.title=b[1]+(st.dia?' — só '+rotDia:'');
  });

  var lista=listaVisivelAgenda(st);
  elAgenda('agendaLegenda').innerHTML=
    '<span><i style="background:#1C6D53"></i>Agendado ('+contarAgenda(lista,'agendado')+')</span>'
    +'<span><i style="background:#C68A3D"></i>Sugerido ('+contarAgenda(lista,'sugerido')+')</span>'
    +'<span><i style="background:#9AA79F"></i>Realizado ('+contarAgenda(lista,'realizado')+')</span>'
    +'<span><i style="background:#8C6BAE"></i>Faltou ('+contarAgenda(lista,'faltou')+')</span>'
    +'<span><i style="background:#B5474B"></i>Dia lotado (vagas do dia preenchidas)</span>'
    +(st.dia?'<span class="agenda-dia-sel">📌 PDF, WhatsApp e Imagem vão usar só '+escAgenda(rotDia)+'. Clique no dia de novo (ou escolha "Todos os dias") para voltar ao período.</span>':'');

  if(st.erro){
    grade.innerHTML='<p class="agendamentos-vazio" style="padding:22px">Não foi possível montar a Agenda: '+escAgenda(st.erro)+'. Clique em "Atualizar lista" na tabela e abra a Agenda de novo.</p>';
    elAgenda('agendaLista').innerHTML='';return;
  }
  if(!st.pronto){
    grade.innerHTML='<p class="agendamentos-vazio" style="padding:22px">Carregando agendamentos… Se não aparecer, atualize os dados do painel para carregar Pessoas atendidas.</p>';
    elAgenda('agendaLista').innerHTML='';return;
  }

  // Grade
  var primeiro=new Date(mesAgenda.getFullYear(),mesAgenda.getMonth(),1),ultimo=new Date(mesAgenda.getFullYear(),mesAgenda.getMonth()+1,0);
  var porDia={};st.ev.forEach(function(e){(porDia[chaveDiaAgenda(e.dt)]=porDia[chaveDiaAgenda(e.dt)]||[]).push(e);});
  var hoje=new Date();hoje=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  var cel=[],i;
  for(i=0;i<primeiro.getDay();i++)cel.push('<div class="agenda-dia vazio"></div>');
  for(var d=1;d<=ultimo.getDate();d++){
    var dia=new Date(mesAgenda.getFullYear(),mesAgenda.getMonth(),d),k=chaveDiaAgenda(dia),evs=porDia[k]||[];
    var fora=st.sem&&(dia<st.sem.inicio||dia>st.sem.fim);
    var fer=window.__emultiFeriadoAg?window.__emultiFeriadoAg(k):'';
    var selecionado=!!(st.dia&&st.dia.chave===k);
    cel.push('<div class="agenda-dia'+(mesmoDiaAgenda(dia,hoje)?' hoje':st.lotados[k]?' lotado':fer?' feriado':'')+(selecionado?' sel':'')+'" data-dia="'+k+'" role="button" tabindex="0" aria-pressed="'+selecionado+'" aria-label="'+escAgenda(rotuloDiaAgenda(dia)+' — '+evs.length+(evs.length===1?' pessoa':' pessoas')+'. Selecionar para gerar PDF, WhatsApp ou imagem só deste dia')+'"'+(fer?' title="'+escAgenda(fer)+'"':'')+'>'
      +'<div class="agenda-dia-topo"><span class="agenda-num">'+d+'</span>'+(st.lotados[k]?'<span class="agenda-lot">LOTADO</span>':fer?'<span class="agenda-fer">FERIADO</span>':'')+'</div>'
      +evs.map(function(e){return '<span class="agenda-ev '+e.tipo+'" title="'+escAgenda(e.nome+' · '+e.prof+(e.turno?' · '+e.turno:'')+' · '+TIPO_ROTULO_AGENDA[e.tipo])+'">'+escAgenda(nomeCurtoAgenda(e.nome))+'</span>';}).join('')
      +'</div>');
  }
  while(cel.length%7)cel.push('<div class="agenda-dia vazio"></div>');
  if(st.sem){var li=(+st.sem.n-1)*7;cel=cel.slice(li,li+7);}   // semana escolhida: só a linha dela
  grade.innerHTML='<div class="agenda-sem">'+DIAS_AGENDA.map(function(x){return '<div>'+x+'</div>';}).join('')+'</div><div class="agenda-dias">'+cel.join('')+'</div>';

  // Lista detalhada
  var el=elAgenda('agendaLista');
  if(!lista.length){el.innerHTML='<p class="agendamentos-vazio" style="padding:14px 2px">Nenhum agendamento '+(st.dia?'neste dia':'neste período')+'.'+motivoVazioAgenda(st)+'</p>';return;}
  var grupos={},ordem=[];
  lista.forEach(function(e){var k=chaveDiaAgenda(e.dt);if(!grupos[k]){grupos[k]=[];ordem.push(k);}grupos[k].push(e);});
  el.innerHTML='<h3>Agendamentos '+(st.dia?'do dia':'do período')+' ('+lista.length+')</h3>'+ordem.map(function(k){
    var gs=grupos[k],dt=gs[0].dt;
    return '<div class="agenda-lista-dia">'+DIAS_AGENDA[dt.getDay()]+', '+brAgenda(dt)+' — '+gs.length+(gs.length===1?' pessoa':' pessoas')+'</div>'
      +gs.map(function(e){return '<div class="agenda-lista-linha"><span class="nome">'+escAgenda(e.nome)+'</span><span class="prof">'+escAgenda(e.turno||'—')+' · '+escAgenda(e.prof)+'</span><span class="agenda-tag '+e.tipo+'">'+TIPO_ROTULO_AGENDA[e.tipo]+'</span></div>';}).join('');
  }).join('');
}

// ---------- Exportações ----------
function periodoRotuloAgenda(st){
  if(st.dia)return rotuloDiaAgenda(st.dia.dt);
  return MESES_AGENDA[mesAgenda.getMonth()]+' '+mesAgenda.getFullYear()+(st.sem?' — '+st.sem.label:'');
}
function profRotuloAgenda(st){return profAgenda&&st.profs[profAgenda]?st.profs[profAgenda]:'Todos os profissionais';}
function listaExportAgenda(){
  var st=estadoAgenda();
  return {st:st,lista:listaVisivelAgenda(st)};
}
function avisarAgenda(msg){
  var el=elAgenda('agendaLegenda');if(!el)return;
  var a=document.createElement('span');a.textContent=msg;a.style.cssText='color:#1C6D53;font-weight:600';el.appendChild(a);
  setTimeout(function(){if(a.parentNode)a.parentNode.removeChild(a);},3500);
}

function gerarPdfAgenda(){
  var x=listaExportAgenda(),st=x.st,lista=x.lista;
  if(!lista.length){avisarAgenda('Nenhum agendamento '+(st.dia?'neste dia':'neste período')+' para o PDF.');return;}
  var grupos={},ordem=[];
  lista.forEach(function(e){var k=chaveDiaAgenda(e.dt);if(!grupos[k]){grupos[k]=[];ordem.push(k);}grupos[k].push(e);});
  var hoje=brAgenda(new Date());
  var html='<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Agenda eMulti</title><style>'
    +'body{font:13px/1.4 Arial,sans-serif;color:#1b1b1b;margin:18px}h1{font-size:18px;margin:0 0 2px}h2{font-size:14px;margin:16px 0 4px;background:#EAF3EE;padding:5px 8px}.sub{color:#555;margin:0 0 8px;font-size:12px}'
    +'table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #bbb;padding:4px 7px;text-align:left}th{background:#f2f2f2;font-size:12px}td.c{width:70px}td.av{width:60px}tr{page-break-inside:avoid}@media print{body{margin:8mm}}'
    +'</style></head><body><h1>Agenda eMulti — '+escAgenda(periodoRotuloAgenda(st))+'</h1><p class="sub">'+escAgenda(profRotuloAgenda(st))+' · '+lista.length+(lista.length===1?' pessoa':' pessoas')+' · Gerada em '+hoje+'</p>'
    +ordem.map(function(k){
      var gs=grupos[k],dt=gs[0].dt;
      return '<h2>'+DIAS_AGENDA[dt.getDay()]+', '+brAgenda(dt)+' — '+gs.length+(gs.length===1?' pessoa':' pessoas')+'</h2><table><thead><tr><th>Turno</th><th>Nome</th><th>Profissional</th><th>Último atendimento</th><th>Situação</th><th>Avisado?</th></tr></thead><tbody>'
        +gs.map(function(e){var u=isoParaDataAgenda(e.ult);return '<tr><td class="c">'+escAgenda(e.turno||'—')+'</td><td>'+escAgenda(e.nome)+'</td><td>'+escAgenda(e.prof)+'</td><td>'+(u?brAgenda(u):'—')+'</td><td>'+escAgenda(e.tipo==='sugerido'?'Sugerido':e.situacao)+'</td><td class="av"></td></tr>';}).join('')+'</tbody></table>';
    }).join('')+'</body></html>';
  var f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);
  f.contentDocument.open();f.contentDocument.write(html);f.contentDocument.close();
  setTimeout(function(){try{f.contentWindow.focus();f.contentWindow.print();}catch(e){}setTimeout(function(){if(f.parentNode)f.parentNode.removeChild(f);},1500);},300);
}

function copiarWhatsAppAgenda(){
  var x=listaExportAgenda(),st=x.st,lista=x.lista;
  if(!lista.length){avisarAgenda('Nenhum agendamento '+(st.dia?'neste dia':'neste período')+' para copiar.');return;}
  var grupos={},ordem=[];
  lista.forEach(function(e){var k=chaveDiaAgenda(e.dt);if(!grupos[k]){grupos[k]=[];ordem.push(k);}grupos[k].push(e);});
  var l=['🩺 *Agenda eMulti — '+periodoRotuloAgenda(st)+'*','👩‍⚕️ '+profRotuloAgenda(st),'✅ '+(contarAgenda(lista,'agendado')+contarAgenda(lista,'realizado'))+' agendado(s)  •  🕐 '+contarAgenda(lista,'sugerido')+' sugerido(s)',''];
  ordem.forEach(function(k){
    var gs=grupos[k],dt=gs[0].dt;
    l.push('📆 *'+DIAS_AGENDA[dt.getDay()]+', '+brAgenda(dt)+'*');
    gs.forEach(function(e){l.push('  '+(e.tipo==='sugerido'?'🕐':e.tipo==='faltou'?'❌':'✅')+' '+(e.turno?e.turno+' — ':'')+e.nome+(st.profs&&!profAgenda?' _('+e.prof+')_':''));});
    l.push('');
  });
  l.push('_Gerado em '+new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})+'_');
  var texto=l.join('\n');
  function fallback(){var w=window.open('','_blank','width=500,height=600');if(w){w.document.write('<pre style="font-family:monospace;white-space:pre-wrap;padding:20px;font-size:14px;">'+escAgenda(texto)+'</pre>');w.document.close();}}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(texto).then(function(){avisarAgenda('Mensagem copiada! Cole no WhatsApp.');},fallback);else fallback();
}

function baixarCardAgenda(){
  var x=listaExportAgenda(),st=x.st,lista=x.lista;
  if(!lista.length){avisarAgenda('Nenhum agendamento '+(st.dia?'neste dia':'neste período')+' para gerar a imagem.');return;}
  var grupos={},ordem=[];
  lista.forEach(function(e){var k=chaveDiaAgenda(e.dt);if(!grupos[k]){grupos[k]=[];ordem.push(k);}grupos[k].push(e);});
  function trunc(s,m){s=String(s||'');return s.length>m?s.slice(0,m-1)+'…':s;}
  var LINHA_H=40,CAB_H=30,Y0=268,y=Y0,svgLinhas='';
  ordem.forEach(function(k,gi){
    var gs=grupos[k],dt=gs[0].dt;
    if(gi>0){svgLinhas+='<line x1="40" y1="'+y+'" x2="640" y2="'+y+'" stroke="#fff" stroke-opacity=".15"/>';y+=8;}
    svgLinhas+='<rect x="40" y="'+y+'" width="600" height="'+CAB_H+'" rx="6" fill="#1C6D53"/><text x="56" y="'+(y+20)+'" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#BFEBD9">'+DIAS_AGENDA[dt.getDay()]+', '+brAgenda(dt)+' — '+gs.length+(gs.length===1?' pessoa':' pessoas')+'</text>';
    y+=CAB_H;
    gs.forEach(function(e,i){
      var yt=y+i*LINHA_H+LINHA_H/2+4;
      svgLinhas+=(i%2===0?'<rect x="40" y="'+(y+i*LINHA_H)+'" width="600" height="'+LINHA_H+'" fill="#fff" fill-opacity=".04"/>':'')
        +'<text x="56" y="'+yt+'" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="'+(e.tipo==='sugerido'?'#F2C57C':'#fff')+'">'+escAgenda(e.turno||'—')+'</text>'
        +'<text x="130" y="'+yt+'" font-family="system-ui,sans-serif" font-size="12" fill="#fff">'+escAgenda(trunc(e.nome,30))+'</text>'
        +'<text x="440" y="'+yt+'" font-family="system-ui,sans-serif" font-size="11" fill="#A8D8CB">'+escAgenda(trunc(e.prof,24))+'</text>';
    });
    y+=gs.length*LINHA_H+8;
  });
  var H=y+90,hoje=new Date(),total=lista.length;
  var svg='<svg width="680" height="'+H+'" viewBox="0 0 680 '+H+'" xmlns="http://www.w3.org/2000/svg">'
    +'<defs><clipPath id="rc"><rect x="20" y="20" width="640" height="'+(H-40)+'" rx="28"/></clipPath></defs>'
    +'<rect x="20" y="20" width="640" height="'+(H-40)+'" rx="28" fill="#153F35"/>'
    +'<rect x="20" y="20" width="640" height="170" fill="#0D3329" clip-path="url(#rc)"/>'
    +'<circle cx="580" cy="80" r="90" fill="#fff" fill-opacity=".04"/>'
    +'<text x="48" y="62" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#7EE8C4" letter-spacing="2">eMULTI</text>'
    +'<text x="48" y="92" font-family="system-ui,sans-serif" font-size="24" font-weight="700" fill="#fff">Agenda</text>'
    +'<text x="48" y="116" font-family="system-ui,sans-serif" font-size="13" fill="#A8D8CB">'+escAgenda(periodoRotuloAgenda(st))+'</text>'
    +'<text x="48" y="136" font-family="system-ui,sans-serif" font-size="12" fill="#7EE8C4">'+escAgenda(trunc(profRotuloAgenda(st),48))+' — Varjota/CE</text>'
    +'<rect x="40" y="160" width="600" height="46" rx="10" fill="#fff" fill-opacity=".08"/>'
    +'<text x="340" y="180" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#A8D8CB">Total de pessoas agendadas</text>'
    +'<text x="340" y="198" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#fff">'+total+(total===1?' pessoa':' pessoas')+'</text>'
    +'<text x="56" y="250" font-family="system-ui,sans-serif" font-size="10" font-weight="600" fill="#7EE8C4" letter-spacing="1">TURNO</text>'
    +'<text x="130" y="250" font-family="system-ui,sans-serif" font-size="10" font-weight="600" fill="#7EE8C4" letter-spacing="1">PESSOA</text>'
    +'<text x="440" y="250" font-family="system-ui,sans-serif" font-size="10" font-weight="600" fill="#7EE8C4" letter-spacing="1">PROFISSIONAL</text>'
    +svgLinhas
    +'<line x1="40" y1="'+(y+8)+'" x2="640" y2="'+(y+8)+'" stroke="#fff" stroke-opacity=".12"/>'
    +'<text x="56" y="'+(y+32)+'" font-family="system-ui,sans-serif" font-size="11" fill="#7EE8C4">Agenda eMulti — Secretaria de Saúde de Varjota</text>'
    +'<text x="56" y="'+(y+50)+'" font-family="system-ui,sans-serif" font-size="11" fill="#A8D8CB">Gerado em '+hoje.toLocaleDateString('pt-BR')+' às '+hoje.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</text>'
    +'<rect x="20" y="20" width="640" height="'+(H-40)+'" rx="28" fill="none" stroke="#1C6D53" stroke-width="2"/></svg>';
  var url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),img=new Image();
  img.onload=function(){
    var c=document.createElement('canvas');c.width=680*2;c.height=H*2;var ctx=c.getContext('2d');ctx.scale(2,2);ctx.drawImage(img,0,0);URL.revokeObjectURL(url);
    c.toBlob(function(b){
      if(!b){avisarAgenda('Erro ao gerar a imagem.');return;}
      var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='agenda-emulti-'+(st.dia?brAgenda(st.dia.dt):hoje.toLocaleDateString('pt-BR')).replace(/\//g,'-')+'.png';a.click();
      setTimeout(function(){URL.revokeObjectURL(a.href);},2000);avisarAgenda('Card baixado!');
    },'image/png');
  };
  img.onerror=function(){URL.revokeObjectURL(url);avisarAgenda('Erro ao renderizar o card.');};
  img.src=url;
}

// Avança/volta uma semana. Vindo de "Todo o mês": mostra a semana de hoje (no mês atual), a 1ª (avançar)
// ou a última (voltar) nos outros meses. Ao passar da borda do mês, troca de mês.
function irSemanaAgenda(delta){
  var sems=semanasDoMes(),idx;
  if(semanaAgenda){
    idx=(+semanaAgenda)-1+delta;
  }else{
    var h=new Date(),hj=new Date(h.getFullYear(),h.getMonth(),h.getDate());
    if(h.getFullYear()===mesAgenda.getFullYear()&&h.getMonth()===mesAgenda.getMonth()){
      idx=0;sems.forEach(function(x,i){if(hj>=x.inicio)idx=i;});
    }else idx=delta>0?0:sems.length-1;
  }
  if(idx<0){mesAgenda=new Date(mesAgenda.getFullYear(),mesAgenda.getMonth()-1,1);idx=semanasDoMes().length-1;}
  else if(idx>=sems.length){mesAgenda=new Date(mesAgenda.getFullYear(),mesAgenda.getMonth()+1,1);idx=0;}
  semanaAgenda=String(idx+1);
  renderAgenda();
}

// ---------- Eventos ----------
function iniciarAgenda(){
  var pl=elAgenda('agPillLista'),pa=elAgenda('agPillAgenda');if(!pl||!pa||!elAgenda('agendaGrade'))return;
  function ativa(){var p=elAgenda('tabAgendamentos'),v=elAgenda('agVisaoAgenda');return !!(p&&p.classList.contains('active')&&v&&!v.hidden);}
  function mostrar(agenda){
    elAgenda('agVisaoLista').hidden=agenda;elAgenda('agVisaoAgenda').hidden=!agenda;
    pl.classList.toggle('active',!agenda);pa.classList.toggle('active',agenda);
    pl.setAttribute('aria-selected',String(!agenda));pa.setAttribute('aria-selected',String(agenda));
    if(agenda){if(window.__emultiAgendaCarregar)window.__emultiAgendaCarregar();renderAgenda();}
  }
  pl.addEventListener('click',function(){mostrar(false);});
  pa.addEventListener('click',function(){mostrar(true);});
  window.addEventListener('emulti:agenda-dados',function(){if(ativa())renderAgenda();});
  elAgenda('agendaProf').addEventListener('change',function(e){profAgenda=e.target.value;renderAgenda();});
  // Escolher o dia que será exportado: pelo seletor ou clicando no dia do calendário (clicar de novo desmarca).
  var selDiaEl=elAgenda('agendaDia');
  if(selDiaEl)selDiaEl.addEventListener('change',function(e){diaAgenda=e.target.value;renderAgenda();});
  var gradeEl=elAgenda('agendaGrade');
  function alternarDia(c){var k=c&&c.getAttribute('data-dia');if(!k)return;diaAgenda=(diaAgenda===k)?'':k;renderAgenda();}
  gradeEl.addEventListener('click',function(e){alternarDia(e.target.closest&&e.target.closest('[data-dia]'));});
  gradeEl.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('[data-dia]')){e.preventDefault();alternarDia(e.target);}});
  elAgenda('agendaSemana').addEventListener('change',function(e){semanaAgenda=e.target.value;renderAgenda();});
  elAgenda('agendaSemPrev').addEventListener('click',function(){irSemanaAgenda(-1);});
  elAgenda('agendaSemNext').addEventListener('click',function(){irSemanaAgenda(1);});
  elAgenda('agendaPrev').addEventListener('click',function(){mesAgenda=new Date(mesAgenda.getFullYear(),mesAgenda.getMonth()-1,1);semanaAgenda='';diaAgenda='';renderAgenda();});
  elAgenda('agendaNext').addEventListener('click',function(){mesAgenda=new Date(mesAgenda.getFullYear(),mesAgenda.getMonth()+1,1);semanaAgenda='';diaAgenda='';renderAgenda();});
  elAgenda('agendaPdf').addEventListener('click',gerarPdfAgenda);
  elAgenda('agendaZap').addEventListener('click',copiarWhatsAppAgenda);
  elAgenda('agendaImg').addEventListener('click',baixarCardAgenda);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciarAgenda);else iniciarAgenda();
