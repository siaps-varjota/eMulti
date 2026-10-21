// Aba de agendamentos: lê/grava a aba Agendamentos pelo backend existente.
var rowsAg=[]; var busyAg=false; var profCacheAg=null;
// Histórico de desfechos (aba "Histórico Agendamentos"): uma linha por Realizado/Faltou, nunca sobrescrita.
var versaoBackendAg=''; // versão do Apps Script que respondeu por último (vazia = backend antigo, sem identificação)
var histAg=[]; var falhaHistAg=null; // falhaHistAg: último erro ao falar com o histórico no backend (null = ok)
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
var redistProfAg='';   // chave da agenda (profissional/unidade) a redistribuir uma única vez (botão "Atualizar" da tabela de configuração)
var cfgAg={m:6,t:6,dias:DIAS_UTEIS_AG.slice(),janela:0,prof:{},soManha:[0,0,0,0,0,1,0],feriados:[],faltas:[],folgas:[],redistribuir:false};   // feriados: [{ini,fim,nome}] fecham todas as agendas; faltas: [{prof,ini,fim,motivo}] só do profissional.
// soManha: dias em que só há atendimento de manhã (padrão: sexta)
function numAg(v,def,min){var n=parseInt(v,10);return isNaN(n)||n<min?def:n;}
function carregarConfigAg(){var c=lsGetAg(LS_CONFIG_AG);if(!c||typeof c!=='object')return;aplicarConfigAg(c,true);}
// Aplica uma configuração (do navegador ou da planilha) sobre cfgAg. comBloqueios=false mantém feriados/imprevistos/folgas como estão
// (eles vêm da aba de bloqueios, não da configuração).
function aplicarConfigAg(c,comBloqueios){
  cfgAg.m=numAg(c.m,6,0);cfgAg.t=numAg(c.t,6,0);cfgAg.janela=numAg(c.janela,0,0);
  if(Array.isArray(c.dias)&&c.dias.length===7)cfgAg.dias=c.dias.map(function(x){return x?1:0;});
  cfgAg.prof=c.prof&&typeof c.prof==='object'?c.prof:{};
  // Regras antigas guardadas na agenda "prof@unidade" passam para o profissional, com a unidade na regra.
  Object.keys(cfgAg.prof).forEach(function(k){
    var i=k.indexOf('@'),o=cfgAg.prof[k];if(i<0||!o||!Array.isArray(o.regras)||!o.regras.length)return;
    var base=k.slice(0,i),ob=cfgAg.prof[base]=cfgAg.prof[base]||{};
    ob.regras=(ob.regras||[]).concat(o.regras.map(function(r){if(!r.unid)r.unid=nomeUnidAg(k.slice(i+1));return r;}));
    delete o.regras;if(!Object.keys(o).length)delete cfgAg.prof[k];
  });
  if(Array.isArray(c.soManha)&&c.soManha.length===7)cfgAg.soManha=c.soManha.map(function(x){return x?1:0;});
  function per(x){return x&&/^\d{4}-\d\d-\d\d$/.test(x.ini||'')&&/^\d{4}-\d\d-\d\d$/.test(x.fim||'');}
  if(!comBloqueios)return;
  cfgAg.feriados=Array.isArray(c.feriados)?c.feriados.filter(per):[];
  cfgAg.faltas=Array.isArray(c.faltas)?c.faltas.filter(function(x){return per(x)&&x.prof;}):[];
  cfgAg.folgas=Array.isArray(c.folgas)?c.folgas.filter(function(x){return per(x)&&x.prof;}):[];
}
function salvarConfigLocalAg(){var c=Object.assign({},cfgAg);delete c.redistribuir;if(bloqueiosModoAg==='servidor'){delete c.feriados;delete c.faltas;delete c.folgas;}lsSetAg(LS_CONFIG_AG,c);}
function salvarConfigAg(){salvarConfigLocalAg();enviarConfigServidorAg();}
// ---------- Configuração compartilhada na planilha (aba "Agenda - Configuração") ----------
// Vagas, dias de atendimento, regras por profissional etc. ficam salvos na planilha e valem para todos que usam o painel;
// o navegador guarda uma cópia só como reserva. Sem acesso à planilha (ex.: backend antigo), vale só a cópia do navegador.
var cfgModoAg='';      // 'servidor' | 'local' | '' (ainda não carregou)
var cfgEmAg='';        // "Atualizado em" da versão da planilha que este painel carregou (usado para detectar edição simultânea)
var cfgJsonAg='';      // última configuração sincronizada com a planilha (para não regravar sem mudança)
var cfgTimerAg=null;
function dadosConfigServidorAg(){var c=Object.assign({},cfgAg);delete c.redistribuir;delete c.feriados;delete c.faltas;delete c.folgas;return c;}
function notaConfigAg(texto,erro){var el=document.getElementById('agConfigModo');if(!el)return;el.textContent=texto||'';el.className='agendamentos-filtro-info'+(erro?' erro':'');}
function notaConfigServidorAg(r){
  var quem=r&&r.por?' Última alteração: '+r.por+(r.em?' em '+String(r.em).slice(0,16):'')+'.':'';
  notaConfigAg('A configuração da agenda (vagas, dias de atendimento e regras) fica salva na planilha (aba “Agenda - Configuração”) e vale para todos que usam o painel.'+quem,false);
}
function notaConfigLocalAg(e){
  var m=(e&&e.message)||'';
  notaConfigAg('Atenção: '+(/n[ãa]o reconhecida/i.test(m)?'o Apps Script publicado ainda não conhece a configuração na planilha (publique a versão nova do backend). ':'não foi possível acessar a configuração na planilha'+(m?' ('+m+')':'')+'. ')+'Por enquanto ela fica só neste navegador.',true);
}
// Troca a configuração local pela da planilha (e guarda a cópia no navegador, sem reenviar).
function aplicarConfigServidorAg(r){
  aplicarConfigAg(r.config,false);cfgEmAg=r.em||'';cfgJsonAg=JSON.stringify(dadosConfigServidorAg());
  salvarConfigLocalAg();notaConfigServidorAg(r);
}
function configServidorMudouAg(){propostaAg={};atualizarBotoesGeracaoAg();renderConfigAg();renderAg();}
// Grava a configuração atual na planilha. Se outra pessoa salvou antes, nada é gravado: carrega a versão dela e avisa.
function gravarConfigServidorAg(){
  var json=JSON.stringify(dadosConfigServidorAg());
  return apiAg({action:'agendamentos.configSave',config:dadosConfigServidorAg(),baseEm:cfgEmAg}).then(function(r){
    if(r&&r.conflito){
      if(r.config&&typeof r.config==='object')aplicarConfigServidorAg(r);
      configServidorMudouAg();
      notaConfigAg('Outra pessoa'+(r.por?' ('+r.por+')':'')+' alterou a configuração da agenda enquanto você editava. Foi carregada a versão mais recente da planilha; refaça a sua alteração.',true);
      return;
    }
    cfgEmAg=(r&&r.em)||'';cfgJsonAg=json;notaConfigServidorAg(r);
  });
}
function enviarConfigServidorAg(){
  if(cfgModoAg!=='servidor')return;
  clearTimeout(cfgTimerAg);
  cfgTimerAg=setTimeout(function(){
    cfgTimerAg=null;
    if(JSON.stringify(dadosConfigServidorAg())===cfgJsonAg)return;   // só feriados/folgas mudaram: nada a enviar
    gravarConfigServidorAg().catch(function(e){
      notaConfigAg('Não foi possível salvar a configuração na planilha ('+((e&&e.message)||e)+'). A alteração ficou só neste navegador e será enviada na próxima vez que você alterar algo.',true);
    });
  },600);
}
// Lê a configuração da planilha. Planilha ainda sem configuração: a deste navegador (se houver) vira a compartilhada.
function carregarConfigServidorAg(){
  return apiAg({action:'agendamentos.configGet'}).then(function(r){
    if(r&&r.config&&typeof r.config==='object'){
      var antes=JSON.stringify(dadosConfigServidorAg());
      aplicarConfigServidorAg(r);cfgModoAg='servidor';
      if(JSON.stringify(dadosConfigServidorAg())!==antes)configServidorMudouAg();
      return;
    }
    cfgModoAg='servidor';cfgEmAg='';cfgJsonAg='';
    if(lsGetAg(LS_CONFIG_AG))return gravarConfigServidorAg();   // primeira vez: envia a configuração já feita neste navegador
    cfgJsonAg=JSON.stringify(dadosConfigServidorAg());notaConfigServidorAg(null);
  }).catch(function(e){
    if(/Sess/i.test((e&&e.message)||''))throw e;
    cfgModoAg='local';notaConfigLocalAg(e);
  });
}
// A visão Agenda (agenda.js) marca os feriados no calendário.
window.__emultiFeriadoAg=function(iso){return folgaDiaAg('',iso);};
// Potencial de atendimento (relatório na lista Atendimentos, em listas.js): consultas que a agenda do profissional
// comporta num intervalo = soma, dia a dia, das vagas da agenda (dias de atendimento/regras × vagas por turno),
// descontando feriados, folgas e imprevistos. Usa a agenda do profissional como um todo (todas as unidades dele).
// Antes de calcular, garante que feriados/folgas/imprevistos foram lidos da planilha (como a aba Agendamentos faz).
window.__emultiPotencialAg=function(){
  var pronto=Promise.resolve();
  if(!bloqueiosModoAg)pronto=pronto.then(function(){return carregarBloqueiosAg();});
  pronto=pronto.then(function(){return carregarConfigServidorAg();});   // sempre a versão mais recente da configuração
  pronto=pronto.catch(function(){}).then(function(){renderConfigAg();});
  return pronto.then(function(){
    return {
      bloqueios:bloqueiosModoAg,   // 'servidor' = lidos da planilha; qualquer outro valor = só os deste navegador
      config:cfgModoAg,            // 'servidor' = configuração da planilha; qualquer outro valor = só a deste navegador
      potencial:function(nomeProf,deIso,ateIso){
        var cap=capAg(normAg(nomeProf)),dt=isoParaDataAg(deIso),fim=isoParaDataAg(ateIso),tot=0;
        if(!dt||!fim)return 0;
        for(var n=0;n<800&&dt<=fim;n++){
          var iso=isoAg(dt);
          if(cap.atende(iso))tot+=capNoDiaAg(cap,iso).dia;
          dt=somaDiaAg(dt,1);
        }
        return tot;
      }
    };
  });
};
// Capacidade efetiva de um profissional (chave = nome normalizado).
function capAg(k){
  var o=(k&&cfgAg.prof[k])||{};
  var m=o.m==null?cfgAg.m:numAg(o.m,cfgAg.m,0), t=o.t==null?cfgAg.t:numAg(o.t,cfgAg.t,0);
  var dias=Array.isArray(o.dias)&&o.dias.length===7?o.dias:cfgAg.dias;
  if(m+t<1){m=6;t=6;}
  if(!dias.some(function(x){return x;}))dias=DIAS_UTEIS_AG;
  // Regras de atendimento (opcionais): quando existem, só elas definem em que dias a agenda atende.
  // As regras ficam no profissional (chave sem unidade) e cada uma diz a unidade; a agenda "prof@unidade" usa só as da sua unidade.
  var kk=String(k||''),pos=kk.indexOf('@'),base=pos<0?kk:kk.slice(0,pos),un=pos<0?'':kk.slice(pos+1),ob=base?(cfgAg.prof[base]||{}):{};
  var regras=Array.isArray(ob.regras)?ob.regras.filter(regraOkAg).filter(function(r){return !un||!r.unid||unidCasaAg(r.unid,un);}):[];
  if(regras.length){
    dias=[0,0,0,0,0,0,0];regras.forEach(function(r){dias[r.dia]=1;});   // dias da semana que aparecem em alguma regra
    return {m:m,t:t,dia:m+t,dias:dias,soManha:[0,0,0,0,0,0,0],k:k||'',regras:regras,atende:function(iso){return regras.some(function(r){return regraValeAg(r,iso);});}};
  }
  return {m:m,t:t,dia:m+t,dias:dias,soManha:cfgAg.soManha,k:k||'',atende:function(iso){var d=isoParaDataAg(iso);return !!d&&!!dias[d.getDay()];}};
}
// ---------- Regras de atendimento por agenda (profissional/unidade) ----------
// Regra = {dia:0-6, freq:'1'|'2'|'3'|'4'|'mes', desde:AAAA-MM-DD (freq 2-4), sem:[1..5] (freq 'mes'),
//          turno:'ambos'|'manha'|'tarde', m:vagas manhã (opcional), t:vagas tarde (opcional)}
//  '1' = toda semana · '2'/'3'/'4' = a cada N semanas, contando a partir da semana de "desde" ·
//  'mes' = só nas semanas escolhidas do mês (1ª, 2ª… ocorrência desse dia da semana no mês).
var UNIDADES_AG=['Ararinha','Centro','Vila Naiara','Croatá','Empréstimos'];
// Unidades em que cada profissional atende (nome normalizado -> unidades). Quem está aqui tem uma agenda por unidade
// (vagas, dias e lotação separados) mesmo que ainda não haja atendimento ou regra cadastrada em todas elas.
// Para incluir outro profissional que atende em 2+ unidades, basta acrescentar uma linha.
var PROF_UNIDADES_AG={
  'aline de sousa rosa':['Centro','Ararinha','Vila Naiara']
};
// Unidade da regra x unidade vinda do PEC (coluna equipe): igual ou uma contém a outra ("EMULTI Vila Naiara" casa com "Vila Naiara").
function unidCasaAg(a,b){var x=normAg(a),y=normAg(b);return !!x&&!!y&&(x===y||x.indexOf(y)>=0||y.indexOf(x)>=0);}
function nomeUnidAg(n){for(var i=0;i<UNIDADES_AG.length;i++)if(unidCasaAg(UNIDADES_AG[i],n))return UNIDADES_AG[i];return String(n||'');}
function regraOkAg(r){
  if(!r||typeof r!=='object'||!(r.dia>=0&&r.dia<=6))return false;
  if(r.freq==='mes')return Array.isArray(r.sem)&&r.sem.length>0;
  if((parseInt(r.freq,10)||1)>1)return !!isoParaDataAg(r.desde);
  return true;
}
function regraValeAg(r,iso){
  var d=isoParaDataAg(iso);if(!d||d.getDay()!==r.dia)return false;
  if(r.freq==='mes')return (r.sem||[]).indexOf(Math.ceil(d.getDate()/7))>=0;
  var cada=parseInt(r.freq,10)||1;if(cada<2)return true;
  var ref=isoParaDataAg(r.desde);if(!ref)return false;
  function seg(x){return Date.UTC(x.getFullYear(),x.getMonth(),x.getDate()-((x.getDay()+6)%7));}   // segunda-feira da semana
  var w=Math.round((seg(d)-seg(ref))/(7*86400000));
  return ((w%cada)+cada)%cada===0;
}
function resumoRegrasAg(regras){
  return regras.map(function(r){
    var f=r.freq==='mes'?(r.sem||[]).map(function(n){return n+'ª';}).join('/')+' semana do mês':((parseInt(r.freq,10)||1)>1?'a cada '+parseInt(r.freq,10)+' semanas (desde '+brAg(r.desde)+')':'toda semana');
    var t=r.turno==='manha'?' · só manhã':(r.turno==='tarde'?' · só tarde':'');
    return (r.unid?r.unid+' · ':'')+DIAS_SEM_AG[r.dia]+' · '+f+t;
  }).join('; ');
}
// Próximo dia de atendimento da agenda a partir de d (inclusive), olhando as regras (ou os dias da semana).
function proxDiaCapAg(d,cap){
  var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  for(var n=0;n<400;n++){if(cap.atende(isoAg(x)))return x;x.setDate(x.getDate()+1);}
  return new Date(d.getFullYear(),d.getMonth(),d.getDate());
}
// Motivo de o dia estar fechado para a agenda k (feriado para todos; imprevisto ou folga só do profissional,
// em todas as unidades dele). '' = dia normal.
function folgaDiaAg(k,iso){
  var i,f;
  for(i=0;i<cfgAg.feriados.length;i++){f=cfgAg.feriados[i];if(iso>=f.ini&&iso<=f.fim)return 'Feriado'+(f.nome?': '+f.nome:'');}
  var base=String(k||'').split('@')[0];
  if(base)for(i=0;i<cfgAg.faltas.length;i++){f=cfgAg.faltas[i];if(normAg(f.prof)===base&&iso>=f.ini&&iso<=f.fim)return 'Imprevisto do profissional'+(f.motivo?': '+f.motivo:'');}
  if(base)for(i=0;i<cfgAg.folgas.length;i++){f=cfgAg.folgas[i];if(normAg(f.prof)===base&&iso>=f.ini&&iso<=f.fim)return 'Folga do profissional'+(f.motivo?': '+f.motivo:'');}
  return '';
}
// Primeiro dia DEPOIS do período fechado (feriado/imprevisto/folga) que cobre iso para a agenda k.
// Quem tinha consulta num dia fechado só pode ser remanejado a partir daí, para não mexer em quem já estava agendado antes.
function diaAposFechamentoAg(k,iso){
  var dt=isoParaDataAg(iso),n=0;
  while(dt&&n<400&&folgaDiaAg(k,isoAg(dt))){dt=somaDiaAg(dt,1);n++;}
  return dt?isoAg(dt):iso;
}
// Capacidade do profissional em um dia específico: nos dias "só manhã" (padrão: sexta) só valem as vagas da manhã.
function capNoDiaAg(cap,iso){
  if(folgaDiaAg(cap.k,iso))return {m:0,t:0,dia:0,dias:cap.dias,soManha:cap.soManha,k:cap.k,fechado:true};
  var d=isoParaDataAg(iso);
  if(cap.regras&&cap.regras.length){
    var m=0,t=0;
    cap.regras.forEach(function(r){
      if(!regraValeAg(r,iso))return;
      if(r.turno!=='tarde')m=Math.max(m,r.m==null?cap.m:r.m);
      if(r.turno!=='manha')t=Math.max(t,r.t==null?cap.t:r.t);
    });
    return {m:m,t:t,dia:m+t,dias:cap.dias,soManha:cap.soManha,k:cap.k,regras:cap.regras,atende:cap.atende};
  }
  if(d&&cap.soManha&&cap.soManha[d.getDay()])return {m:cap.m,t:0,dia:cap.m,dias:cap.dias,soManha:cap.soManha,atende:cap.atende};
  return cap;
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
  var map={},nomes={},ult={},ultProf={},ultUnid={},elegiveis={},unidsDe={},mesesDe={};
  list.rows.forEach(function(r){
    // Só entra quem teve atendimento individual com profissional da eMulti (sem participação só em atividade coletiva).
    if(r.agendavel!==true)return;
    var k=normAg(r[0]);elegiveis[k]=true;if(Array.isArray(r.mesesAtendimentoAgenda))mesesDe[k]=r.mesesAtendimentoAgenda;
    var u=r.ultimoAtendimentoAgendaISO||''; if(u)ult[k]=u;
    // Profissional (da eMulti) do atendimento mais recente — base da distribuição automática de datas.
    var up=String(r.ultimoProfissionalAgenda==null?'':r.ultimoProfissionalAgenda).trim();
    if(up){ultProf[k]=up;nomes[up]=1;var un=String(r.ultimaUnidadeAgenda==null?'':r.ultimaUnidadeAgenda).trim();if(un){ultUnid[k]=un;(unidsDe[normAg(up)]=unidsDe[normAg(up)]||{})[un]=1;}}
    var txt=String(r[5]==null?'':r[5]);
    if(txt&&txt!=='—')map[k]=normAg(txt);
  });
  // Profissional que atendeu em 2+ unidades: vagas, dias e lotação passam a valer por unidade.
  var multi={};Object.keys(unidsDe).forEach(function(pk){if(Object.keys(unidsDe[pk]).length>1)multi[pk]=true;});
  // Profissional com regras em 2+ unidades também tem uma agenda por unidade.
  Object.keys(PROF_UNIDADES_AG).forEach(function(b){if(PROF_UNIDADES_AG[b].length>1)multi[b]=true;});
  Object.keys(cfgAg.prof).forEach(function(b){var ru=cfgAg.prof[b]&&cfgAg.prof[b].regras;if(!Array.isArray(ru))return;var su={};ru.forEach(function(r){if(r&&r.unid)su[normAg(nomeUnidAg(r.unid))]=1;});if(Object.keys(su).length>1)multi[b]=true;});
  profCacheAg={mesesDe:mesesDe,map:map,ult:ult,ultProf:ultProf,ultUnid:ultUnid,multi:multi,elegiveis:elegiveis,rows:list.rows.filter(function(r){return r.agendavel===true;}),nomes:Object.keys(nomes).sort(function(a,b){return a.localeCompare(b,'pt-BR');})};
  return profCacheAg;
}
// Filtro de profissional: texto livre ("Aline") ou uma agenda completa do tipo "Profissional — Unidade".
// A unidade do filtro casa com a do paciente mesmo que o PEC a escreva diferente (ex.: "EMULTI Ararinha" x "Ararinha").
function casaProfAg(nome,pq){
  var n=normAg(nome);if(!pq||n.indexOf(pq)>=0)return true;
  var i=pq.indexOf(' — ');if(i<0)return false;
  var b=pq.slice(0,i).trim(),u=pq.slice(i+3).trim(),j=n.indexOf(' — ');
  if(j<0||!b||!u)return false;
  return n.slice(0,j).indexOf(b)>=0&&unidCasaAg(n.slice(j+3),u);
}
function fillProfAg(){var dl=document.getElementById('agendamentosProfissionais'),c=profMapAg();if(!dl||!c)return;var ag=agendasAg(c),nm={};Object.keys(ag).forEach(function(k){nm[ag[k]]=1;});c.nomes.forEach(function(n){var tem=Object.keys(nm).some(function(x){return x===n||x.indexOf(n+' — ')===0;});if(!tem)nm[n]=1;});
  dl.innerHTML=Object.keys(nm).sort(function(a,b){return a.localeCompare(b,'pt-BR');}).map(function(n){return '<option value="'+escAg(n)+'"></option>';}).join('');}
function apiAg(payload){var api=window.PAINEL_API,token=window.painelToken&&window.painelToken();if(!api||!token)return Promise.reject(Error('Sessão não iniciada. Entre novamente no painel.'));return fetch(api.url,{method:'POST',headers:{'Content-Type':'text/plain'},cache:'no-store',body:JSON.stringify(Object.assign({chave:api.chave,acao:'agendamentos',token:token},payload))}).then(function(r){if(!r.ok)throw Error('Falha de comunicação com a planilha.');return r.json();}).then(function(r){if(r.status==='sessao_expirada'){if(window.logoutPainelEmulti)window.logoutPainelEmulti();throw Error('Sessão expirada. Entre novamente.');}if(r.ok===false||r.status==='erro')throw Error(r.error||r.mensagem||'Operação não concluída.');if(r.versao)versaoBackendAg=String(r.versao);return r;});}
function msgAg(text,error){var el=document.getElementById('agendamentosFeedback');if(el){el.textContent=text||'';el.className='agendamentos-feedback'+(error?' erro':'');}}
function dateAg(v){
  function iso(d){if(!(d instanceof Date)||isNaN(d))return '';var r=d.toISOString().slice(0,10);return /^\d{4}-\d\d-\d\d$/.test(r)?r:'';}
  if(!v)return '';if(v instanceof Date)return iso(v);
  var s=String(v).trim(),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(/^\d{4}-\d\d-\d\d$/.test(s))return s;
  if(m)return m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2);
  return iso(new Date(s));
}
function ultimoDeAg(r,uc){return (uc&&uc.ult[normAg(r.Nome)])||dateAg(r['Último Atendimento'])||'';}

// ---------- Situação ----------
// Cancelado e Faltou não ocupam vaga nem têm turno. Faltou volta para a fila de reagendamento.
function ehAtivoAg(r){var s=r.Situação||'Pendente';return s!=='Cancelado'&&s!=='Faltou'&&s!=='Reagendar';}
// Ocupa vaga: pessoa ativa OU faltoso que já recebeu uma nova data sugerida (ainda não salva).
function ocupaAg(r,ix){return ehAtivoAg(r)||((r.Situação==='Faltou'||r.Situação==='Reagendar')&&propostaAg[ix]!==undefined);}

// ---------- Filtros ----------
// Filtro próprio da aba: último atendimento nos últimos N dias (padrão 120; 0/vazio = todos).
// Filtro próprio da aba: meses do último atendimento (vários; nenhum marcado = todos os meses).
var mesesSelAg=[];   // 'AAAA-MM'
var mesesModoAg='qualquer';   // 'qualquer' = teve atendimento (eMulti) em algum dos meses · 'ultimo' = o último atendimento caiu num deles
function mesesDaPessoaAg(r,uc){
  var n=normAg(r.Nome),a=mesesModoAg==='qualquer'&&uc&&uc.mesesDe&&uc.mesesDe[n];
  if(a&&a.length)return a;
  var u=String(ultimoDeAg(r,uc)||'').slice(0,7);return u?[u]:[];
}
var MESES_ABREV_AG=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function rotuloMesAg(m){var p=String(m).split('-');return MESES_ABREV_AG[Number(p[1])-1]+'/'+p[0];}
function limiteDiasAg(){if(!mesesSelAg.length)return '';var set={};mesesSelAg.forEach(function(m){set[m]=true;});return {set:set,n:mesesSelAg.length};}
function dentroDiasAg(r,uc,lim){if(!lim)return true;return mesesDaPessoaAg(r,uc).some(function(m){return !!lim.set[m];});}
// Monta a lista de meses (mais recente primeiro) a partir do último atendimento de cada pessoa elegível.
var mesesSigAg='';
function atualizarMesesAg(){
  var box=document.getElementById('agendamentosMesesLista'),res=document.getElementById('agendamentosMesesResumo');if(!box||!res)return;
  var uc=profMapAg(),tem={};
  if(uc)Object.keys(uc.ult).forEach(function(n){
    var a=(mesesModoAg==='qualquer'&&uc.mesesDe&&uc.mesesDe[n]&&uc.mesesDe[n].length)?uc.mesesDe[n]:[String(uc.ult[n]||'').slice(0,7)];
    a.forEach(function(m){if(/^\d{4}-\d\d$/.test(m))tem[m]=(tem[m]||0)+1;});
  });
  mesesSelAg.forEach(function(m){if(!tem[m])tem[m]=0;});
  var ms=Object.keys(tem).sort().reverse(),sig=mesesModoAg+'|'+ms.map(function(m){return m+':'+tem[m]+(mesesSelAg.indexOf(m)>=0?'*':'');}).join(',');
  var pre=mesesModoAg==='qualquer'?'Atendidos em: ':'Último atendimento: ';
  res.textContent=!mesesSelAg.length?pre+'todos os meses':pre+(mesesSelAg.length<=2?mesesSelAg.slice().sort().reverse().map(rotuloMesAg).join(', '):mesesSelAg.length+' meses');
  if(sig===mesesSigAg)return;mesesSigAg=sig;
  box.innerHTML=ms.length?ms.map(function(m){return '<label><input type="checkbox" data-mes="'+m+'"'+(mesesSelAg.indexOf(m)>=0?' checked':'')+'> '+rotuloMesAg(m)+' <small>('+tem[m]+')</small></label>';}).join(''):'<small>Carregue Pessoas atendidas para listar os meses.</small>';
}
function seguirListaAg(){var el=document.getElementById('agendamentosSeguir');return !!(el&&el.checked);}
// Opcional: seguir também a lista "Pessoas atendidas" com os filtros aplicados lá (Mês, colunas, busca).
function filtroListaAg(){
  if(!seguirListaAg())return null;
  var f=window.__emultiPessoasAtendidasFiltradas&&window.__emultiPessoasAtendidasFiltradas();
  if(!f||!Array.isArray(f.nomes))return null;
  var set={};f.nomes.forEach(function(n){set[normAg(n)]=true;});
  return {set:set,origem:f.origem,meses:f.meses||[],n:f.nomes.length};
}
var FILTROS_IDS_AG={prof:'agendamentosProfissional',turno:'agendamentosTurno',sit:'agendamentosSituacao',de:'agendamentosDe',ate:'agendamentosAte',pp:'agendamentosPorPagina'};
// Lembra os filtros (não a busca por nome) entre aberturas do painel.
function salvarFiltrosAg(){var o={sort:sortAg,seguir:seguirListaAg(),meses:mesesSelAg.slice(),mesesModo:mesesModoAg};Object.keys(FILTROS_IDS_AG).forEach(function(k){o[k]=valAg(FILTROS_IDS_AG[k]);});lsSetAg(LS_FILTROS_AG,o);}
function restaurarFiltrosAg(){
  var o=lsGetAg(LS_FILTROS_AG);if(!o||typeof o!=='object')return;
  Object.keys(FILTROS_IDS_AG).forEach(function(k){var el=document.getElementById(FILTROS_IDS_AG[k]);if(el&&o[k]!=null)el.value=o[k];});
  var sg=document.getElementById('agendamentosSeguir');if(sg)sg.checked=!!o.seguir;
  if(o.mesesModo==='ultimo'||o.mesesModo==='qualquer')mesesModoAg=o.mesesModo;
  if(Array.isArray(o.meses))mesesSelAg=o.meses.filter(function(m){return /^\d{4}-\d\d$/.test(m);});
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
    rowsAg.push({Nome:nome,Atendimentos:Number(p[1])||0,Total:Number(p[3])||0,'Último Atendimento':p.ultimoAtendimentoAgendaISO||'',Situação:'Pendente','Data agendada':'','Atualizado em':'',_virtual:true});
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
    case 'prof':return normAg(nomeProfAg(r,uc))||null;
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
    if(uc&&!uc.elegiveis[normAg(r.Nome)])return false;   // só atendidos por profissional da eMulti (não só atividade coletiva)
    if(lf&&!lf.set[normAg(r.Nome)])return false;
    if(!dentroDiasAg(r,uc,lim))return false;
    if(sf&&(r.Situação||'Pendente')!==sf)return false;
    if(tf){var t=turnos[ix];if(tf==='sem'?!!t:(!t||t.classe!==tf))return false;}
    if(de||ate){var d=propostaAg[ix]||dateAg(r['Data agendada']);if(!d||(de&&d<de)||(ate&&d>ate))return false;}
    if(q&&!String(r.Nome||'').toLocaleLowerCase('pt-BR').includes(q))return false;
    if(pq){var up=nomeProfAg(r,uc)||'';if(!casaProfAg(up,pq))return false;}
    return true;
  });
  list=ordenarAg(list,uc,turnos);
  return {uc:uc,list:list,turnos:turnos,lf:lf,lim:lim,semProf:semProf,filtrado:!!(q||pq||lf||lim||tf||sf||de||ate)};
}
function renderAg(){
  atualizarBotoesGeracaoAg();
  renderAfetadosAg();
  setTimeout(function(){window.dispatchEvent(new Event('emulti:agenda-dados'));},0);
  var body=document.getElementById('agendamentosBody'); if(!body)return;
  marcarOrdemAg();atualizarMesesAg();
  var c=calcularListaAg(),uc=c.uc,list=c.list,turnos=c.turnos,lf=c.lf,lim=c.lim;
  document.getElementById('agendamentosContagem').textContent=list.length+(list.length===1?' pessoa':' pessoas');
  var info=document.getElementById('agendamentosFiltroInfo');
  if(info){var txtDias=lim?((mesesModoAg==='qualquer'?'Atendidos em ':'Último atendimento em ')+(lim.n<=3?mesesSelAg.slice().sort().reverse().map(rotuloMesAg).join(', '):lim.n+' meses selecionados')):'Todos os períodos';info.textContent=txtDias+(lf?' · seguindo também a lista Pessoas atendidas (aba '+lf.origem+'): '+lf.n+(lf.n===1?' pessoa':' pessoas')+' · '+(lf.meses.length?lf.meses.length+(lf.meses.length===1?' mês selecionado':' meses selecionados'):'todos os meses')+'.':'.');}
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
    body.innerHTML='<tr><td colspan="9" class="agendamentos-vazio">'+(busyAg?'Carregando…':c.semProf?'Dados de profissionais indisponíveis. Atualize os dados do painel.':c.filtrado?'Nenhuma pessoa encontrada.':'Nenhum registro disponível. Sincronize Pessoas atendidas.')+'</td></tr>';
    return;
  }
  var pos=new Map();rowsAg.forEach(function(r,i){pos.set(r,i);});
  body.innerHTML=vis.map(function(r){
    var ix=pos.get(r), prop=propostaAg[ix], data=prop||dateAg(r['Data agendada']);
    var prof=(uc&&nomeProfAg(r,uc))||'—', t=turnos[ix];
    var turnoHtml=t?'<span class="ag-turno '+t.classe+'" title="'+escAg(t.dica)+'">'+t.rotulo+'</span>':'<span title="'+escAg(motivoSemTurnoAg(r,ix,uc))+'">—</span>';
    var sit=r.Situação||'Pendente';
    return '<tr data-ag-ix="'+ix+'"'+(prop?' class="agendamentos-gerada" title="Data gerada automaticamente — ainda não salva"':'')+'>'
      +'<td class="agendamentos-nome">'+escAg(r.Nome)+'</td>'
      +'<td>'+escAg(r.Atendimentos)+'</td>'
      +'<td>'+escAg(brAg(ultimoDeAg(r,uc)))+'</td>'
      +'<td class="agendamentos-prof">'+escAg(prof)+'</td>'
      +'<td><select data-ag="situacao" aria-label="Situação" style="width:auto;min-width:0;max-width:none;padding:6px 24px 6px 9px">'+['Pendente','Agendado','Realizado','Reagendar','Faltou','Cancelado'].map(function(s){return '<option'+(sit===s?' selected':'')+'>'+s+'</option>';}).join('')+'</select></td>'
      +'<td><input type="date" data-ag="dataAgendada" style="width:auto;min-width:0;max-width:none;padding:6px 8px" value="'+data+'"></td>'
      +'<td>'+turnoHtml+'</td>'
      +'<td><button type="button" class="agendamentos-salvar" data-ag-save>Salvar</button></td>'
      +'<td class="agendamentos-atualizado">'+escAg(r['Atualizado em']||'')+(r['Atualizado por']?'<br><small>'+escAg(r['Atualizado por'])+'</small>':'')+'</td></tr>';
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
//  opt: {cap:function(prof)->{dia,dias}, janela:n}  (janela = nº mínimo de dias de atendimento para espalhar; 0 = uma semana inteira)
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
    var N=fila.length,dias=[],livre=0,vistos=0,dia=proxDiaCapAg(inicio,cap),guard=0;
    // Janela mínima: a configurada ou, no automático (0), uma semana inteira de atendimento —
    // assim poucas pessoas não lotam só o primeiro dia e deixam o resto da semana vazio.
    var semana=cap.dias.reduce(function(a,x){return a+(x?1:0);},0)||1,janEf=janela>0?janela:semana;
    // Último dia já com gente (até 8 semanas à frente): os dias vazios antes dele entram na
    // distribuição, para os buracos da agenda serem preenchidos antes de lotar os dias cheios.
    var limHoriz=isoAg(somaDiaAg(inicio,56)),ultOc='';
    Object.keys(oc).forEach(function(k){if(oc[k]>0&&k>=isoAg(inicio)&&k<=limHoriz&&k>ultOc)ultOc=k;});
    // 1) dias de atendimento com vaga, até caber todo mundo, cobrir a janela e alcançar o último dia ocupado
    while((livre<N||vistos<janEf||(ultOc&&isoAg(dia)<=ultOc))&&guard<3000){
      guard++;vistos++;
      var k=isoAg(dia),f=Math.max(0,capNoDiaAg(cap,k).dia-(oc[k]||0));
      if(f>0){dias.push({k:k,f:f,carga:oc[k]||0,n:0});livre+=f;}
      dia=proxDiaCapAg(somaDiaAg(dia,1),cap);
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
// ---------- Chave de agenda: profissional (+ unidade, quando ele atende em mais de uma) ----------
// Quem atende em 2 unidades (ex.: Centro e Croatá) tem uma agenda por unidade: cada uma com suas
// vagas, dias de atendimento e lotação. Os demais continuam com a chave simples (nome normalizado).
function chaveProfAg(r,uc){
  var n=normAg(r.Nome),p=uc&&uc.ultProf[n];if(!p)return '';
  var k=normAg(p),u=uc.ultUnid&&uc.ultUnid[n];
  return (uc.multi&&uc.multi[k]&&u)?k+'@'+normAg(u):k;
}
// Nome para exibir: "Profissional — Unidade" quando a agenda é separada por unidade.
function nomeProfAg(r,uc){
  var n=normAg(r.Nome),p=uc&&uc.ultProf[n];if(!p)return '';
  var u=uc.ultUnid&&uc.ultUnid[n];
  return (uc.multi&&uc.multi[normAg(p)]&&u)?p+' — '+u:p;
}
// Todas as agendas existentes {chave: nome para exibir}.
function agendasAg(uc){
  var o={};
  Object.keys(uc.ultProf).forEach(function(n){var r={Nome:n};var k=chaveProfAg(r,uc);if(k)o[k]=nomeProfAg(r,uc);});
  // Unidades configuradas nas regras de atendimento também têm agenda própria (ex.: Ararinha e Vila Naiara),
  // mesmo que nenhum paciente tenha sido atendido ali ainda. Só vale para quem atende em 2+ unidades.
  var bases={};Object.keys(cfgAg.prof).forEach(function(b){bases[b]=1;});Object.keys(PROF_UNIDADES_AG).forEach(function(b){bases[b]=1;});
  Object.keys(bases).forEach(function(base){
    var ru=(cfgAg.prof[base]&&Array.isArray(cfgAg.prof[base].regras))?cfgAg.prof[base].regras:[];
    var unids=[];
    function add(u){u=u?nomeUnidAg(u):'';if(u&&unids.map(normAg).indexOf(normAg(u))<0)unids.push(u);}
    (PROF_UNIDADES_AG[base]||[]).forEach(add);
    ru.forEach(function(r){if(r&&r.unid)add(r.unid);});
    if(!(unids.length>1||(uc.multi&&uc.multi[base])))return;
    var nome='';Object.keys(o).forEach(function(k){if(!nome&&k.split('@')[0]===base)nome=o[k].split(' — ')[0];});
    if(!nome)uc.nomes.forEach(function(n){if(!nome&&normAg(n)===base)nome=n;});
    if(!nome)return;   // profissional sem nenhum paciente identificado: não há nome para exibir
    unids.forEach(function(u){
      var achou=false;
      Object.keys(o).forEach(function(k){var i=k.indexOf('@');if(i>0&&k.slice(0,i)===base&&unidCasaAg(k.slice(i+1),u))achou=true;});
      if(!achou)o[base+'@'+normAg(u)]=nome+' — '+u;
    });
  });
  return o;
}
// A visão Agenda (agenda.js) lista uma opção por profissional/unidade, mesmo sem agendamentos no mês.
window.__emultiUnidCasa=unidCasaAg;
window.__emultiAgendaOpcoes=function(){var uc=profMapAg();return uc?agendasAg(uc):{};};
// Próximo dia de atendimento (a partir de iso, inclusive) em que o profissional ainda tem vaga.
// ignorarIx = linha que está sendo movida (não conta como ocupante). Nunca deixa "excedente".
function proximaVagaAg(ix,iso,uc){
  var r=rowsAg[ix],k=chaveProfAg(r,uc),cap=capAg(k),oc={};
  rowsAg.forEach(function(x,i){
    if(i===ix||chaveProfAg(x,uc)!==k||!ocupaAg(x,i))return;
    var d=propostaAg[i]||dateAg(x['Data agendada']);if(d)oc[d]=(oc[d]||0)+1;
  });
  var dia=isoParaDataAg(iso);if(!dia)return iso;
  dia=proxDiaCapAg(dia,cap);
  for(var g=0;g<3000;g++){
    var d=isoAg(dia);
    if((oc[d]||0)<capNoDiaAg(cap,d).dia)return d;
    dia=proxDiaCapAg(somaDiaAg(dia,1),cap);
  }
  return iso;
}
// Por que a linha está sem turno (mostrado como dica no "—" da coluna Turno).
function motivoSemTurnoAg(r,ix,uc){
  if((r.Situação||'Pendente')==='Cancelado')return 'Sem turno: agendamento cancelado';
  if((r.Situação||'Pendente')==='Faltou')return 'Sem turno: faltou — aguardando reagendamento';
  if((r.Situação||'Pendente')==='Reagendar')return 'Sem turno: aguardando a nova data do reagendamento';
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
    var k=chaveProfAg(r,uc); if(!k||!ocupaAg(r,ix))return;
    var d=propostaAg[ix]||dateAg(r['Data agendada']); if(!d)return;
    (grupos[k+'|'+d]=grupos[k+'|'+d]||[]).push({ix:ix,ult:ultimoDeAg(r,uc),nome:String(r.Nome||''),fixo:turnoGuardadoAg(r,ix)});
  });
  Object.keys(grupos).forEach(function(g){
    var cap=capNoDiaAg(capAg(g.slice(0,g.lastIndexOf('|'))),g.slice(g.lastIndexOf('|')+1));
    var ord=grupos[g].sort(function(a,b){
      if(a.ult!==b.ult)return a.ult<b.ult?-1:1;
      return a.nome.localeCompare(b.nome,'pt-BR');
    });
    // turno gravado na tarde não vale em dia/agenda sem vaga à tarde (ex.: sexta só manhã)
    ord.forEach(function(x){if(x.fixo==='tarde'&&cap.t<1)x.fixo='';});
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
      else res[x.ix]={rotulo:'Excedente',classe:'excedente',dica:cap.fechado?(folgaDiaAg(cap.k,g.slice(g.lastIndexOf('|')+1))||'Dia sem atendimento'):'Acima do limite de '+cap.dia+' pessoas por dia para este profissional'};
    });
  });
  return res;
}
// Turno que a linha teria com a situação/data informadas (usado ao gravar, para guardar na planilha).
function turnoFuturoAg(ix,sit,data){
  var uc=profMapAg();if(!uc||!data||sit==='Cancelado'||sit==='Faltou'||sit==='Reagendar')return '';
  var r=rowsAg[ix],bs=r.Situação,bd=r['Data agendada'],bt=r.Turno,bp=propostaAg[ix];
  r.Situação=sit;r['Data agendada']=data;r.Turno='';delete propostaAg[ix];
  var t=turnosAg(uc)[ix];
  r.Situação=bs;r['Data agendada']=bd;r.Turno=bt;if(bp!==undefined)propostaAg[ix]=bp;
  return t?t.rotulo:'';
}
function atualizarBotoesGeracaoAg(){
  var tem=Object.keys(propostaAg).length>0;
  ['agendamentosSalvarGerados','agendamentosDescartar'].forEach(function(id){var el=document.getElementById(id);if(el)el.hidden=!tem;});var mnu=document.getElementById('agendamentosAcoes');if(mnu&&tem)mnu.open=true;
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
function gerarAg(auto,prefixo,tentativa){
  if(auto!==true)auto=false;
  if(busyAg){
    // Ocupado (salvando/carregando): quem chamou pode já ter zerado as datas geradas; tenta de novo quando liberar.
    if(auto&&!(tentativa>=8))setTimeout(function(){gerarAg(true,prefixo,(tentativa||0)+1);},500);
    return;
  }
  var uc=profMapAg();
  if(!uc||!Object.keys(uc.ultProf).length){if(!auto)msgAg('Atualize os dados do painel para carregar Pessoas atendidas antes de gerar as datas.',true);return;}
  if(!rowsAg.length){if(!auto)msgAg('Não há registros em Agendamentos. Clique em "Sincronizar Pessoas atendidas" primeiro.',true);return;}
  var ini=isoParaDataAg(valAg('agendamentosInicio'));
  var inicio=diaUtilAg(ini||amanhaAg());
  var pq=auto?'':normAg(valAg('agendamentosProfissional'));
  var lf=filtroListaAg(),lim=limiteDiasAg();
  var ocupados={},nomes={},cands=[],faltList=[],bloqList=[],semProf=0,jaTem=0,faltosos=0;
  rowsAg.forEach(function(r){
    var k=chaveProfAg(r,uc),d=dateAg(r['Data agendada']);
    if(!k||!d||!ehAtivoAg(r))return;
    (ocupados[k]=ocupados[k]||{})[d]=((ocupados[k]||{})[d]||0)+1;
  });
  // Excedente não existe: quem está acima do limite do dia vai para o próximo dia com vaga.
  // Datas futuras já gravadas em dia que o profissional (unidade) NÃO atende, segundo a configuração
  // atual: voltam para a fila e são redistribuídas nos dias certos (só vira data salva após "Salvar datas geradas").
  var hojeIso=isoAg(new Date()),foraDia={},nForaDia=0,origForaDia={};
  rowsAg.forEach(function(r,ix){
    var k=chaveProfAg(r,uc),d=dateAg(r['Data agendada']),sit=r.Situação||'Pendente';
    if(!k||!d||d<hojeIso||sit==='Realizado'||!ehAtivoAg(r))return;
    var dt=isoParaDataAg(d);if(!dt)return;
    // Redistribuir: todo mundo com data a partir do início volta para a fila (a data só muda se a nova distribuição for diferente).
    var invalido=!capAg(k).atende(d)||!!folgaDiaAg(k,d);
    if(!invalido&&!((cfgAg.redistribuir||redistProfAg===k)&&d>=isoAg(inicio)))return;
    origForaDia[ix]=d;
    if(pq&&!casaProfAg(nomeProfAg(r,uc),pq))return;
    foraDia[ix]=true;
    if(ocupados[k]&&ocupados[k][d])ocupados[k][d]--;
    nomes[k]=nomeProfAg(r,uc);nForaDia++;
    // Dia fechado (feriado, imprevisto ou folga): só vai para DEPOIS do período fechado (nunca para antes).
    if(folgaDiaAg(k,d))bloqList.push({ix:ix,k:k,nome:String(r.Nome||''),ult:ultimoDeAg(r,uc),orig:d,apos:diaAposFechamentoAg(k,d)});
    else cands.push({ix:ix,prof:k,nome:String(r.Nome||''),ult:ultimoDeAg(r,uc),pri:1});
  });
  var turnosAtuais=turnosAg(uc),excedentes=[];
  Object.keys(turnosAtuais).forEach(function(i){
    var r=rowsAg[i],d=propostaAg[i]||dateAg(r['Data agendada']);
    if(foraDia[i])return;
    if(turnosAtuais[i].classe==='excedente'&&!propostaAg[i]&&(r.Situação||'Pendente')!=='Realizado'&&d>=isoAg(new Date()))excedentes.push({ix:Number(i),d:d});
  });
  excedentes.forEach(function(x){var k=chaveProfAg(rowsAg[x.ix],uc);if(ocupados[k]&&ocupados[k][x.d])ocupados[k][x.d]--;});
  rowsAg.forEach(function(r,ix){
    if(foraDia[ix])return;
    if(!uc.elegiveis[normAg(r.Nome)])return;
    if(lf&&!lf.set[normAg(r.Nome)])return;
    if(!dentroDiasAg(r,uc,lim))return;
    var sit=r.Situação||'Pendente';
    if(sit!=='Pendente'&&sit!=='Faltou'&&sit!=='Reagendar')return;
    // Pendente com data já está resolvido; Faltou volta para a fila mesmo tendo a data antiga.
    if(sit==='Pendente'&&dateAg(r['Data agendada'])){jaTem++;return;}
    var prof=nomeProfAg(r,uc);
    if(!prof){semProf++;return;}
    var k=chaveProfAg(r,uc);
    if(pq&&!casaProfAg(prof,pq))return;
    nomes[k]=prof;
    // Faltoso: reagendado para o mesmo dia da semana, na semana seguinte à falta (ou o próximo dia com vaga).
    if(sit==='Faltou'||sit==='Reagendar'){faltosos++;faltList.push({ix:ix,k:k,nome:String(r.Nome||''),ult:ultimoDeAg(r,uc),falta:dateAg(r['Data agendada'])});return;}
    cands.push({ix:ix,prof:k,nome:String(r.Nome||''),ult:ultimoDeAg(r,uc),pri:1});
  });
  if(!cands.length&&!excedentes.length&&!faltList.length&&!bloqList.length){propostaAg={};atualizarBotoesGeracaoAg();renderAg();if(auto){if(prefixo)msgAg(prefixo,false);else{var fb=document.getElementById('agendamentosFeedback');if(fb&&/Salvar datas geradas/.test(fb.textContent||''))msgAg('Nenhuma pessoa pendente para agendar no momento.',false);}return;}msgAg('Nenhuma pessoa pendente para agendar'+(pq?' deste profissional':'')+'.'+(jaTem?' '+jaTem+' já têm data.':''),false);return;}
  // Faltosos primeiro (têm prioridade nas vagas da semana seguinte); depois o restante da fila.
  var pf={};propostaAg={};
  // Quem tinha consulta marcada em dia fechado vem primeiro: primeira vaga a partir do dia seguinte ao fechamento.
  bloqList.sort(function(a,b){return a.orig<b.orig?-1:a.orig>b.orig?1:(a.ult<b.ult?-1:a.ult>b.ult?1:a.nome.localeCompare(b.nome,'pt-BR'));}).forEach(function(b){
    var piso=isoAg(inicio),alvo=b.apos;
    if(alvo<piso)alvo=piso;
    var d=proximaVagaAg(b.ix,alvo,uc);
    pf[b.ix]=d;propostaAg[b.ix]=d;
    (ocupados[b.k]=ocupados[b.k]||{})[d]=((ocupados[b.k]||{})[d]||0)+1;
  });
  faltList.sort(function(a,b){return (a.falta||'')<(b.falta||'')?-1:(a.falta||'')>(b.falta||'')?1:(a.ult<b.ult?-1:a.ult>b.ult?1:a.nome.localeCompare(b.nome,'pt-BR'));}).forEach(function(f){
    var piso=isoAg(inicio),alvo=f.falta?isoAg(somaDiaAg(isoParaDataAg(f.falta),7)):piso;
    if(alvo<piso)alvo=piso;
    var d=proximaVagaAg(f.ix,alvo,uc);
    pf[f.ix]=d;propostaAg[f.ix]=d;
    (ocupados[f.k]=ocupados[f.k]||{})[d]=((ocupados[f.k]||{})[d]||0)+1;
  });
  propostaAg=Object.assign(cands.length?planejarAg(cands,ocupados,inicio,{cap:capAg,janela:cfgAg.janela}):{},pf);
  // Quem voltou para a fila e caiu na mesma data de antes não tem o que salvar.
  var semMudar=0;Object.keys(origForaDia).forEach(function(i){if(propostaAg[i]===origForaDia[i]){delete propostaAg[i];semMudar++;}});
  nForaDia-=semMudar;
  // Realoca os excedentes para o primeiro dia seguinte (ao dia deles) com vaga.
  excedentes.sort(function(a,b){return a.d<b.d?-1:a.d>b.d?1:a.ix-b.ix;}).forEach(function(x){
    var k=chaveProfAg(rowsAg[x.ix],uc);nomes[k]=nomes[k]||nomeProfAg(rowsAg[x.ix],uc);
    var nova=proximaVagaAg(x.ix,isoAg(somaDiaAg(isoParaDataAg(x.d),1)),uc);
    propostaAg[x.ix]=nova;
  });
  var datas=Object.keys(propostaAg).map(function(i){return propostaAg[i];}).sort();
  if(!datas.length){renderAg();atualizarBotoesGeracaoAg();msgAg((prefixo?prefixo+' ':'')+'Nada a mudar: a distribuição atual já está de acordo com a configuração.',false);return;}
  renderAg();atualizarBotoesGeracaoAg();resumoGeradoAg(uc,nomes);
  var totalDist=cands.length+faltList.length+bloqList.length-semMudar;
  msgAg((prefixo?prefixo+' ':'')+totalDist+(totalDist===1?' pessoa distribuída':' pessoas distribuídas')+(faltosos?' ('+faltosos+(faltosos===1?' faltoso reagendado':' faltosos reagendados')+')':'')+(nForaDia?' ('+nForaDia+(nForaDia===1?' já agendada mudou':' já agendadas mudaram')+' de data: dia sem atendimento ou redistribuição)':'')+' de '+brAg(datas[0])+' a '+brAg(datas[datas.length-1])+' (dias de atendimento e vagas por profissional conforme a configuração). Revise e clique em "Salvar datas geradas".'+(semProf?' '+semProf+' sem profissional identificado ficaram de fora.':''),false);
}
function descartarAg(){propostaAg={};atualizarBotoesGeracaoAg();renderAg();msgAg('Datas geradas descartadas.',false);}

// ---------- Presenças (PEC) e reagendamento dos faltosos ----------
// A lista de atendimentos vem do PEC (atualizada todo dia). Com ela dá para saber, para cada
// agendamento vencido, quem veio (houve atendimento com a eMulti na data agendada ou depois) e
// quem não veio. Quem veio vira "Realizado"; quem não veio vira "Faltou" e recebe nova data na
// semana seguinte (mesmo dia da semana; se não houver vaga, o próximo dia com vaga). Só vale para
// datas que o PEC já cobre: se a lista ainda não chegou até o dia, o agendamento é deixado em paz.
function pecAteAg(){
  var list=window.__emultiPessoasAtendidas&&window.__emultiPessoasAtendidas(),max='';
  if(list&&Array.isArray(list.rows))list.rows.forEach(function(r){var d=r.ultimoAtendimentoISO||'';if(d>max)max=d;});
  return max;
}
function reagendarFaltososAg(){
  if(busyAg)return;
  var uc=profMapAg();
  if(!uc){msgAg('Atualize os dados do painel (PEC) para carregar Pessoas atendidas antes de reagendar.',true);return;}
  if(!rowsAg.length){msgAg('Não há registros em Agendamentos. Abra a lista ou sincronize Pessoas atendidas primeiro.',true);return;}
  var pq=normAg(valAg('agendamentosProfissional')),hoje=isoAg(new Date()),pec=pecAteAg();
  if(!pec){msgAg('Não encontrei atendimentos na lista do PEC. Atualize os dados do painel.',true);return;}
  var mudar=[],vieram=0,faltaram=0,aguardando=0;
  rowsAg.forEach(function(r,ix){
    if(r._virtual||(r.Situação||'Pendente')!=='Agendado')return;
    var d=dateAg(r['Data agendada']);if(!d||d>=hoje)return;                 // só datas já passadas (hoje ainda não está no PEC)
    var k=normAg(r.Nome);if(!uc.elegiveis[k])return;
    if(pq&&!casaProfAg(nomeProfAg(r,uc),pq))return;
    var ult=uc.ult[k]||'';
    if(ult>=d){vieram++;mudar.push({ix:ix,nome:r.Nome,situacao:'Realizado',dataAgendada:d,turno:r.Turno||''});}
    else if(pec>=d){faltaram++;mudar.push({ix:ix,nome:r.Nome,situacao:'Faltou',dataAgendada:d,turno:''});}
    else aguardando++;                                                         // o PEC ainda não chegou nesse dia
  });
  var escopo=pq?' (filtro de profissional: "'+valAg('agendamentosProfissional').trim()+'")':' (todos os profissionais)';
  var sufixo=aguardando?' '+aguardando+(aguardando===1?' agendamento ficou':' agendamentos ficaram')+' de fora porque o PEC só vai até '+brAg(pec)+'.':'';
  if(!mudar.length){gerarAg(true,'Nenhum agendamento vencido para dar baixa'+escopo+'.'+sufixo);return;}
  if(!window.confirm('Dados do PEC até '+brAg(pec)+escopo+'\n\n• '+vieram+(vieram===1?' pessoa veio':' pessoas vieram')+' → Realizado\n• '+faltaram+(faltaram===1?' pessoa faltou':' pessoas faltaram')+' → Faltou (nova data na semana seguinte, para você revisar)\n\nAtualizar a situação na planilha agora?'))return;
  busyAg=true;
  var linhas=mudar.map(function(x){return rowsAg[x.ix];});
  msgAg('Conferindo se alguém alterou a planilha…',false);
  verificarConflitosAg(linhas).then(function(conf){return conf.length?confirmarConflitosAg(conf):true;}).then(function(seguir){
    if(!seguir)throw {cancelado:true};
    var btns=['agendamentosReagendar','agendamentosGerar'];btns.forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=true;});
    function progresso(n){msgAg('Atualizando presenças… '+n+' de '+mudar.length,false);}
    var envio=loteIndisponivelAg?enviarIndividualAg(mudar,progresso):enviarLoteAg(mudar,progresso).catch(function(e){
      if(e&&/Sess/i.test(e.message||''))throw e;
      loteIndisponivelAg=true;return enviarIndividualAg(mudar,progresso);
    });
    return envio.then(function(out){btns.forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=false;});return out;},function(e){btns.forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=false;});throw e;});
  }).then(function(out){
    var porIx={};mudar.forEach(function(x){porIx[x.ix]=x;});
    out.ok.forEach(function(ix){var r=rowsAg[ix],x=porIx[ix];r.Situação=x.situacao;r['Data agendada']=x.dataAgendada;r.Turno=x.turno;});
    registrarHistoricoAg(out.ok.map(function(ix){return porIx[ix];}));
    busyAg=false;
    var nOkV=out.ok.filter(function(ix){return porIx[ix].situacao==='Realizado';}).length,nOkF=out.ok.length-nOkV;
    var msg='Presenças atualizadas (PEC até '+brAg(pec)+'): '+nOkV+(nOkV===1?' realizado':' realizados')+', '+nOkF+(nOkF===1?' faltou':' faltaram')+'.'+(out.falhas.length?' '+out.falhas.length+' não puderam ser salvos ('+out.falhas[out.falhas.length-1].erro+').':'')+sufixo;
    propostaAg={};atualizarBotoesGeracaoAg();renderAg();
    gerarAg(true,msg);
  }).catch(function(e){
    busyAg=false;
    if(e&&e.cancelado){msgAg('Nada foi alterado: a planilha tinha mudanças de outra pessoa. Clique em "Atualizar lista" e tente de novo.',true);return;}
    msgAg((e&&e.message)||'Não foi possível atualizar as presenças.',true);
  }).finally(function(){renderAg();});
}

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
  var antes={};ixs.forEach(function(i){i=Number(i);var r=rowsAg[i];antes[i]={sit:r.Situação||'Pendente',data:dateAg(r['Data agendada']),turno:r.Turno||''};});   // para registrar Remarcado
  var btns=['agendamentosGerar','agendamentosSalvarGerados','agendamentosDescartar'];
  btns.forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=true;});
  function progresso(n){msgAg('Salvando agendamentos… '+n+' de '+total,false);}
  var envio=loteIndisponivelAg?enviarIndividualAg(items,progresso):enviarLoteAg(items,progresso).catch(function(e){
    if(e&&/Sess/i.test(e.message||''))throw e;
    loteIndisponivelAg=true;              // backend ainda não tem a ação em lote
    return enviarIndividualAg(items,progresso);
  });
  envio.then(function(out){
    var remarcados=[];
    out.ok.forEach(function(ix){var an=antes[ix];if(an&&an.data&&an.data!==propostaAg[ix]&&(an.sit==='Agendado'||an.sit==='Pendente'))remarcados.push({ix:ix,situacao:'Remarcado',dataAgendada:an.data,turno:an.turno});});
    if(remarcados.length)registrarHistoricoAg(remarcados);
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
function loadAg(){if(busyAg)return;busyAg=true;profCacheAg=null;propostaAg={};atualizarBotoesGeracaoAg();msgAg('Carregando agendamentos…');renderAg();carregarBloqueiosAg().then(carregarConfigServidorAg).then(function(){return apiAg({action:'agendamentos.list'});}).then(function(r){rowsAg=Array.isArray(r.rows)?r.rows:[];completarVirtuaisAg();msgAg('');carregarHistoricoAg();}).catch(function(e){msgAg(e.message||'Falha ao carregar.',true);}).finally(function(){busyAg=false;renderAg();renderConfigAg();try{gerarAg(true);}catch(e){if(window.console)console.error(e);msgAg('Lista carregada, mas não foi possível sugerir datas: '+((e&&e.message)||e),true);}});}
function syncAg(){if(busyAg)return;profCacheAg=null;var list=window.__emultiPessoasAtendidas&&window.__emultiPessoasAtendidas();if(!list||!Array.isArray(list.rows)||!list.rows.length){msgAg('Atualize os dados do painel para carregar Pessoas atendidas antes de sincronizar.',true);return;}var pessoas=list.rows.filter(function(r){return r.agendavel===true;}).map(function(r){return{nome:String(r[0]||'').trim(),at:Number(r[1])||0,total:Number(r[3])||0,ultimo:r.ultimoAtendimentoAgendaISO||''};}).filter(function(x){return x.nome;});if(!pessoas.length){msgAg('Nenhuma pessoa em Pessoas atendidas. Atualize os dados do painel e tente de novo.',true);return;}busyAg=true;msgAg('Sincronizando '+pessoas.length+' pessoas…');renderAg();var syncMsg='';apiAg({action:'agendamentos.sync',rows:pessoas}).then(function(r){syncMsg='Sincronização concluída: '+(Number(r.inseridos)||0)+' novos; '+(Number(r.atualizados)||0)+' atualizados ('+pessoas.length+' pessoas em Pessoas atendidas).';msgAg(syncMsg);return apiAg({action:'agendamentos.list'});}).then(function(r){rowsAg=Array.isArray(r.rows)?r.rows:rowsAg;completarVirtuaisAg();}).catch(function(e){msgAg(e.message||'Falha ao sincronizar.',true);}).finally(function(){busyAg=false;renderAg();renderConfigAg();if(syncMsg){propostaAg={};gerarAg(true,syncMsg);}});}

// ---------- Histórico de desfechos (Realizado/Faltou) ----------
// Cada baixa vira uma linha na aba "Histórico Agendamentos". Se o backend não responder (Apps Script
// antigo, erro, sem internet), a baixa fica guardada neste navegador e é reenviada sozinha na próxima
// tentativa — nada se perde enquanto você corrige o Apps Script.
var HIST_PEND_KEY='emulti_hist_pendente';
function lerPendHistAg(){try{var a=JSON.parse(localStorage.getItem(HIST_PEND_KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
function salvarPendHistAg(a){try{if(a.length)localStorage.setItem(HIST_PEND_KEY,JSON.stringify(a));else localStorage.removeItem(HIST_PEND_KEY);}catch(e){}}
function chaveHistAg(nome,data){return normAg(nome)+'|'+data;}
function chavePendHistAg(x){return chaveHistAg(x.nome,x.dataAgendada)+'|'+x.desfecho;}
// Traduz a resposta do backend para uma orientação objetiva.
function motivoHistAg(e){
  var m=(e&&e.message)||String(e||'');
  if(/n[ãa]o reconhecida/i.test(m))return 'o Apps Script publicado não conhece o histórico (versão antiga). Confira se o backend-agendamentos.gs está no arquivo certo, sem outro arquivo com as mesmas funções, e se você fez Implantar → Gerenciar implantações → Editar → Nova versão → Implantar.';
  if(/Erro no servidor/i.test(m))var det=m.replace(/^Erro no servidor:\s*/i,'');return 'o Apps Script deu erro: '+det+(/\.$/.test(det)?'':'.');
  return (m||'sem resposta do servidor')+(/\.$/.test(m)?'':'.');
}
function avisoHistAg(e){return 'A situação foi salva, mas o histórico NÃO foi gravado na planilha: '+motivoHistAg(e)+' As baixas ficam guardadas neste navegador e são reenviadas sozinhas; depois de corrigir o Apps Script, clique em "Testar histórico".';}
function mesclarHistoricoAg(rows){
  var ix={};histAg.forEach(function(h,i){ix[chaveHistAg(h.Nome,dateAg(h['Data agendada']))]=i;});
  rows.forEach(function(x){
    var h={Nome:x.nome,Profissional:x.prof||'',Unidade:x.unidade||'','Data agendada':x.dataAgendada,Turno:x.turno||'',Desfecho:x.desfecho},k=chaveHistAg(x.nome,x.dataAgendada);
    if(ix[k]!==undefined)histAg[ix[k]]=h;else{ix[k]=histAg.length;histAg.push(h);}
  });
}
// Reenvia o que ficou pendente. Rejeita (e mantém tudo guardado) se o backend recusar.
function enviarPendHistAg(){
  var p=lerPendHistAg();if(!p.length)return Promise.resolve();
  return apiAg({action:'agendamentos.historicoAdd',rows:p}).then(function(){
    var enviados={};p.forEach(function(x){enviados[chavePendHistAg(x)]=1;});
    salvarPendHistAg(lerPendHistAg().filter(function(x){return !enviados[chavePendHistAg(x)];}));
  });
}
// Lê o histórico da planilha. Se falhar, a Agenda segue com a aba Agendamentos + o que está pendente aqui.
function carregarHistoricoAg(){
  if(falhaHistAg&&Date.now()-falhaHistAg.quando<30000)return Promise.resolve();   // não insiste a cada clique
  return enviarPendHistAg().then(function(){return apiAg({action:'agendamentos.historicoList'});}).then(function(r){
    falhaHistAg=null;histAg=Array.isArray(r.rows)?r.rows:[];mesclarHistoricoAg(lerPendHistAg());
    window.dispatchEvent(new Event('emulti:agenda-dados'));
  }).catch(function(e){
    if(/Sess/i.test((e&&e.message)||''))return;
    falhaHistAg={erro:e,quando:Date.now()};mesclarHistoricoAg(lerPendHistAg());
    window.dispatchEvent(new Event('emulti:agenda-dados'));
  });
}
// Desfechos que entram no histórico. Remarcado = a data que a pessoa tinha foi trocada por outra.
var DESFECHOS_HIST_AG=['Realizado','Faltou','Cancelado','Remarcado'];
// Grava no histórico cada desfecho (Realizado, Faltou, Cancelado, Remarcado). Não bloqueia nem desfaz a alteração se falhar.
function registrarHistoricoAg(itens){
  var uc=profMapAg(),rows=[];
  itens.forEach(function(x){
    if(DESFECHOS_HIST_AG.indexOf(x.situacao)===-1)return;
    var r=rowsAg[x.ix];if(!r||!x.dataAgendada)return;
    var n=normAg(r.Nome);
    rows.push({nome:String(r.Nome||''),prof:(uc&&uc.ultProf[n])||'',unidade:(uc&&uc.ultUnid&&uc.ultUnid[n])||'',dataAgendada:x.dataAgendada,turno:x.turno||'',desfecho:x.situacao});
  });
  if(!rows.length)return Promise.resolve();
  mesclarHistoricoAg(rows);window.dispatchEvent(new Event('emulti:agenda-dados'));
  // guarda como pendente (mesma pessoa+data troca o desfecho) e tenta enviar já
  var pend=lerPendHistAg(),pos={};pend.forEach(function(x,i){pos[chaveHistAg(x.nome,x.dataAgendada)]=i;});
  rows.forEach(function(x){var k=chaveHistAg(x.nome,x.dataAgendada);if(pos[k]!==undefined)pend[pos[k]]=x;else{pos[k]=pend.length;pend.push(x);}});
  salvarPendHistAg(pend);
  return enviarPendHistAg().then(function(){falhaHistAg=null;}).catch(function(e){
    if(/Sess/i.test((e&&e.message)||''))return;
    falhaHistAg={erro:e,quando:Date.now()};
    msgAg(avisoHistAg(e),true);
  });
}
// Texto sobre qual versão do Apps Script está respondendo.
function textoVersaoAg(){
  return versaoBackendAg
    ?'Apps Script em uso: versão '+versaoBackendAg+'.'
    :'Apps Script em uso: versão antiga, sem identificação. Publique a versão nova do backend (Implantar → Gerenciar implantações → Editar → Nova versão) para ele passar a informar a versão aqui.';
}
// Botão "Testar histórico": cria a aba na planilha (se faltar), lê de volta e mostra o motivo exato se falhar.
// Importação única: traz para o histórico o que já está como Realizado, Faltou ou Cancelado com data na aba Agendamentos.
// Parcial: ali só fica a última consulta de cada pessoa. Pode repetir sem duplicar (mesma pessoa + data = uma linha).
function importarHistoricoAg(){
  if(busyAg)return;
  var uc=profMapAg();
  if(!uc){msgAg('Atualize os dados do painel (PEC) para carregar Pessoas atendidas antes de importar: o profissional e a unidade vêm de lá.',true);return;}
  var hoje=isoAg(new Date()),rows=[],cont={Realizado:0,Faltou:0,Cancelado:0};
  rowsAg.forEach(function(r){
    if(r._virtual)return;
    var sit=r.Situação||'Pendente';if(!cont.hasOwnProperty(sit))return;
    var d=dateAg(r['Data agendada']);if(!d)return;
    if(sit!=='Cancelado'&&d>hoje)return;
    var n=normAg(r.Nome);
    cont[sit]++;
    rows.push({nome:String(r.Nome||''),prof:uc.ultProf[n]||'',unidade:(uc.ultUnid&&uc.ultUnid[n])||'',dataAgendada:d,turno:r.Turno||'',desfecho:sit});
  });
  if(!rows.length){msgAg('Não há registros Realizado, Faltou ou Cancelado com data na aba Agendamentos para importar.',true);return;}
  if(!window.confirm('Importar para o histórico o que já está na aba Agendamentos?\n\n• '+cont.Realizado+' Realizado\n• '+cont.Faltou+' Faltou\n• '+cont.Cancelado+' Cancelado\n\nSó existe a última consulta de cada pessoa, então a importação é parcial. Quem já está no histórico não duplica; se o desfecho for diferente, vale o da aba Agendamentos.'))return;
  busyAg=true;
  var btn=document.getElementById('agendamentosImportarHist');if(btn)btn.disabled=true;
  var partes=[],adicionados=0,atualizados=0,feitos=0;
  for(var i=0;i<rows.length;i+=300)partes.push(rows.slice(i,i+300));
  function prox(){
    if(!partes.length)return Promise.resolve();
    var parte=partes.shift();
    msgAg('Importando para o histórico… '+feitos+' de '+rows.length,false);
    return apiAg({action:'agendamentos.historicoAdd',rows:parte}).then(function(r){adicionados+=Number(r.adicionados)||0;atualizados+=Number(r.atualizados)||0;feitos+=parte.length;return prox();});
  }
  prox().then(function(){return apiAg({action:'agendamentos.historicoList'});}).then(function(r){
    falhaHistAg=null;histAg=Array.isArray(r.rows)?r.rows:[];mesclarHistoricoAg(lerPendHistAg());
    window.dispatchEvent(new Event('emulti:agenda-dados'));
    var iguais=rows.length-adicionados-atualizados;
    msgAg('Importação concluída: '+adicionados+(adicionados===1?' registro novo':' registros novos')+', '+atualizados+(atualizados===1?' atualizado':' atualizados')+' e '+iguais+(iguais===1?' já estava':' já estavam')+' no histórico.',false);
  }).catch(function(e){
    msgAg('Não foi possível importar: '+((e&&e.message)||e),true);
  }).finally(function(){busyAg=false;if(btn)btn.disabled=false;});
}
function testarHistoricoAg(){
  msgAg('Testando o histórico na planilha…',false);
  return apiAg({action:'agendamentos.historicoAdd',rows:[]}).then(function(){return enviarPendHistAg();}).then(function(){return apiAg({action:'agendamentos.historicoList'});}).then(function(r){
    falhaHistAg=null;histAg=Array.isArray(r.rows)?r.rows:[];mesclarHistoricoAg(lerPendHistAg());
    window.dispatchEvent(new Event('emulti:agenda-dados'));
    var n=histAg.length,pend=lerPendHistAg().length;
    msgAg('Histórico funcionando: a aba "Histórico Agendamentos" existe na planilha ('+n+(n===1?' registro':' registros')+').'+(pend?' Ainda há '+pend+' baixas pendentes neste navegador.':'')+' '+textoVersaoAg(),false);
  }).catch(function(e){
    if(/Sess/i.test((e&&e.message)||''))return msgAg(e.message,true);
    falhaHistAg={erro:e,quando:Date.now()};
    msgAg('Histórico com problema: '+motivoHistAg(e),true);
  });
}
window.testarHistoricoAgendamentos=testarHistoricoAg;
// Ganchos usados pela visão "Faltas" (faltas.js).
window.__emultiFaltasDados=function(){return {hist:histAg,linhas:rowsAg,erro:falhaHistAg,versao:versaoBackendAg};};
window.__emultiFaltasAtualizar=function(){loadAg();};

// ---------- Dados para a aba Agenda (calendário) ----------
// Mesma base da aba Agendamentos: salvos na planilha (Agendado/Realizado) + datas geradas ainda não salvas (Sugerido).
window.__emultiAgendaDados=function(){
  var uc=profMapAg();if(!uc)return {eventos:[],pronto:false};
  var turnos={};try{turnos=turnosAg(uc);}catch(e){if(window.console)console.error('Agenda: falha ao calcular turnos',e);}
  var ev=[],emitidos={},diag={historico:histAg.length,linhas:rowsAg.length,comData:0,inativas:0,naoElegiveis:0,semProf:0};
  rowsAg.forEach(function(r,ix){
    var prop=propostaAg[ix],d=prop||dateAg(r['Data agendada']);if(!d)return;
    diag.comData++;
    var sit=r.Situação||'Pendente';if(!prop&&!ehAtivoAg(r)){diag.inativas++;return;}
    if(!uc.elegiveis[normAg(r.Nome)]){diag.naoElegiveis++;return;}
    // Sem profissional identificado a pessoa continua na Agenda (antes sumia sem aviso).
    var k=chaveProfAg(r,uc),semProf=!k;if(semProf){k='__sem_profissional';diag.semProf++;}
    var t=turnos[ix];
    emitidos[chaveHistAg(r.Nome,d)]=true;
    ev.push({atual:true,data:d,nome:String(r.Nome||''),prof:semProf?'Sem profissional definido':nomeProfAg(r,uc),profKey:k,tipo:prop?'sugerido':(sit==='Realizado'?'realizado':'agendado'),situacao:sit,turno:t?t.rotulo:'',ult:ultimoDeAg(r,uc),capDia:semProf?0:capNoDiaAg(capAg(k),d).dia});
  });
  // Desfechos de agendamentos antigos (a linha da pessoa já foi sobrescrita por um novo agendamento).
  histAg.forEach(function(h){
    if(h.Desfecho!=='Realizado'&&h.Desfecho!=='Faltou')return;
    var d=dateAg(h['Data agendada']);if(!d||emitidos[chaveHistAg(h.Nome,d)])return;
    var pk=normAg(h.Profissional),un=normAg(h.Unidade),sep=pk&&uc.multi&&uc.multi[pk]&&un;
    var k=pk?(sep?pk+'@'+un:pk):'__sem_profissional';
    emitidos[chaveHistAg(h.Nome,d)]=true;
    ev.push({data:d,nome:String(h.Nome||''),prof:pk?(sep?h.Profissional+' — '+h.Unidade:h.Profissional):'Sem profissional definido',profKey:k,tipo:h.Desfecho==='Faltou'?'faltou':'realizado',situacao:h.Desfecho==='Faltou'?'Faltou':'Realizado',turno:String(h.Turno||''),ult:'',capDia:pk?capNoDiaAg(capAg(k),d).dia:0});
  });
  return {eventos:ev,pronto:true,diag:diag};
};
// ---------- Simulação de retorno (aba Frequência e Retorno) ----------
// Independente de quantas consultas a pessoa já teve: a ÚLTIMA consulta (PEC) vale como a 1ª, o agendamento atual como a 2ª
// e um novo agendamento como a 3ª. Barra 1 = última consulta -> agendamento atual. Barra 2 = agendamento -> agendamento seguinte
// da mesma pessoa (histórico de agendamentos + agendamento atual). Faltas não contam como consulta. Valores em dias, por profissional.
window.__emultiSimulacaoRetorno=function(){
  var d=window.__emultiAgendaDados&&window.__emultiAgendaDados();if(!d||!d.pronto)return {pronto:false};
  if(!rowsAg.length&&!histAg.length)return {pronto:false};   // tabela de Agendamentos ainda não carregada
  function dias(a,b){var x=a.split('-'),y=b.split('-');return Math.round((Date.UTC(+y[0],+y[1]-1,+y[2])-Date.UTC(+x[0],+x[1]-1,+x[2]))/86400000);}
  var pac={},diag={eventos:d.eventos.length,atuais:0,comUltima:0,gapPositivo:0};
  d.eventos.forEach(function(e){
    if(e.tipo==='faltou'||e.profKey==='__sem_profissional')return;
    var k=normAg(e.nome),p=pac[k]=pac[k]||{ult:'',ev:[]};
    if(e.atual)diag.atuais++;
    if(e.ult&&e.atual){p.ult=e.ult;diag.comUltima++;}
    p.ev.push({data:e.data,prof:String(e.prof||'').split(' — ')[0],atual:!!e.atual});
  });
  var porProf={};
  function slot(n){return porProf[n]=porProf[n]||{prof:n,d1:[],d2:[]};}
  Object.keys(pac).forEach(function(k){
    var p=pac[k],ev=p.ev.sort(function(a,b){return a.data<b.data?-1:a.data>b.data?1:0;}),uniq=[];
    ev.forEach(function(e){if(!uniq.length||uniq[uniq.length-1].data!==e.data)uniq.push(e);});
    var cur=uniq.filter(function(e){return e.atual;})[0];
    if(cur&&p.ult){var g=dias(p.ult,cur.data);if(g>0){slot(cur.prof).d1.push(g);diag.gapPositivo++;}}
    for(var i=1;i<uniq.length;i++){var g2=dias(uniq[i-1].data,uniq[i].data);if(g2>0)slot(uniq[i-1].prof).d2.push(g2);}
  });
  return {pronto:true,diag:diag,profs:Object.keys(porProf).map(function(n){return porProf[n];})};
};
window.__emultiAgendaCarregar=function(){if(rowsAg.length||busyAg){window.dispatchEvent(new Event('emulti:agenda-dados'));return;}loadAg();};

// ---------- Salvar uma linha ----------
// Aviso antes de salvar quando a data escolhida à mão não tem vaga (dia lotado, fechado ou sem atendimento).
// Se a pessoa continuar, a data passa para o próximo dia com vaga (regra "sem excedente").
function avisoDiaLotadoAg(ix,r,fields,antData){
  var d=fields.dataAgendada,sit=fields.situacao;
  if(!d||d===antData||sit==='Cancelado'||sit==='Faltou'||sit==='Realizado'||sit==='Reagendar')return '';
  var uc=profMapAg();if(!uc)return '';
  var k=chaveProfAg(r,uc);if(!k)return '';
  var livre=proximaVagaAg(ix,d,uc);
  if(livre===d)return '';
  var m=String(motivoDiaAg(k,d)||'');
  m=/^ACEITA/.test(m)?'o dia '+brAg(d)+' não tem vaga disponível para este profissional.':m.replace(/^N[ÃA]O aceita\s*—\s*/i,'');
  return 'Atenção: '+m+'\n\nSe continuar, '+String(r.Nome||'')+' será salvo(a) em '+brAg(livre)+' (próximo dia com vaga), e não em '+brAg(d)+'.\n\nContinuar?';
}
// ---------- Retorno: ao marcar Realizado, sugere datas de retorno com vaga ----------
// Depois que a situação "Realizado" é salva, abre um card com as próximas datas em que o profissional
// da última consulta tem vaga (mesmas regras da agenda: dias de atendimento, vagas por turno,
// feriados, folgas e imprevistos). A pessoa escolhe a data e o retorno já fica gravado como "Agendado".
// O desfecho "Realizado" continua no histórico; só a linha da aba Agendamentos passa a mostrar o retorno.
var LS_RETORNO_AG='emulti.agendamentos.retorno';
var INTERVALOS_RETORNO_AG=[15,30,45,60];
var INTERVALOS_REAGENDAR_AG=[7,14,21,30];   // card aberto por "Reagendar": datas mais próximas
function intervalosRetAg(){return retAg&&retAg.modo==='reagendar'?INTERVALOS_REAGENDAR_AG:INTERVALOS_RETORNO_AG;}
var retAg=null;   // {ix, base (AAAA-MM-DD do atendimento), dias, sel (data escolhida), selTurno, busy, modo ('retorno'|'reagendar')}
function diasRetornoSalvoAg(){var o=lsGetAg(LS_RETORNO_AG),n=o?parseInt(o.dias,10):0;return n>0&&n<=365?n:30;}
function rotuloDataAg(iso){return diaSemAg(iso)+' '+brAg(iso);}
function classeTurnoAg(rot){return rot==='Manhã'?'manha':(rot==='Tarde'?'tarde':'excedente');}
// Primeira data a considerar: base + intervalo, nunca antes de amanhã.
function alvoRetornoAg(base,dias){
  var d=isoParaDataAg(base)||new Date(),alvo=isoAg(somaDiaAg(d,dias)),min=isoAg(amanhaAg());
  return alvo<min?min:alvo;
}
// Próximos dias com vaga para a agenda (profissional/unidade) da pessoa, a partir de deIso.
// Usa a mesma ocupação de proximaVagaAg (datas salvas + datas geradas ainda não salvas).
// Devolve null se o profissional não foi identificado.
function vagasRetornoAg(ix,deIso,uc,max){
  var r=rowsAg[ix],k=chaveProfAg(r,uc);if(!k)return null;
  var cap=capAg(k),oc={};
  rowsAg.forEach(function(x,i){
    if(i===ix||chaveProfAg(x,uc)!==k||!ocupaAg(x,i))return;
    var d=propostaAg[i]||dateAg(x['Data agendada']);if(d)oc[d]=(oc[d]||0)+1;
  });
  var dia=isoParaDataAg(deIso),out=[];if(!dia)return out;
  dia=proxDiaCapAg(dia,cap);
  for(var g=0;g<400&&out.length<max;g++){
    var d=isoAg(dia),c=capNoDiaAg(cap,d),livres=c.dia-(oc[d]||0);
    if(livres>0)out.push({iso:d,livres:livres,turno:turnoFuturoAg(ix,'Agendado',d)});
    dia=proxDiaCapAg(somaDiaAg(dia,1),cap);
  }
  return out;
}
function elRetAg(id){return document.getElementById(id);}
function atualizarOkRetornoAg(){
  var ok=document.querySelector('#agRetOverlay [data-ret="ok"]');if(!ok||!retAg)return;
  ok.disabled=!retAg.sel||!!retAg.busy;
  var verbo=retAg.modo==='reagendar'?'Reagendar para ':'Agendar retorno em ';
  ok.textContent=retAg.busy?'Agendando…':(retAg.sel?verbo+rotuloDataAg(retAg.sel)+(retAg.selTurno?' · '+retAg.selTurno:''):'Escolha uma data');
}
function marcarSelRetornoAg(){
  document.querySelectorAll('#agRetLista [data-ret-iso]').forEach(function(b){b.classList.toggle('sel',!!retAg&&b.dataset.retIso===retAg.sel);});
}
function erroRetornoAg(t){var e=elRetAg('agRetErro');if(!e)return;e.textContent=t||'';e.hidden=!t;}
function renderOpcoesRetornoAg(){
  if(!retAg)return;
  var uc=profMapAg(),r=rowsAg[retAg.ix];if(!r)return;
  var alvo=alvoRetornoAg(retAg.base,retAg.dias),exato=isoAg(somaDiaAg(isoParaDataAg(retAg.base)||new Date(),retAg.dias));
  elRetAg('agRetAlvo').textContent=(retAg.modo==='reagendar'?'Reagendar em ':'Retorno em ')+retAg.dias+(retAg.dias===1?' dia':' dias')+' — datas com vaga a partir de '+rotuloDataAg(alvo)+(alvo!==exato?' (primeira data futura)':'')+':';
  var ops=uc?vagasRetornoAg(retAg.ix,alvo,uc,6):null,dsBase=diaSemAg(retAg.base),html;
  if(ops===null)html='<p class="ag-ret-aviso">Não deu para identificar o profissional da última consulta, então as vagas não podem ser conferidas. Escolha a data em "Outra data".</p>';
  else if(!ops.length)html='<p class="ag-ret-aviso">Nenhuma vaga encontrada nos próximos meses para este profissional. Confira a configuração da agenda.</p>';
  else html=ops.map(function(o){
    var mesmo=dsBase&&diaSemAg(o.iso)===dsBase;
    return '<button type="button" class="ag-ret-op'+(retAg.sel===o.iso?' sel':'')+'" data-ret-iso="'+o.iso+'" data-ret-turno="'+escAg(o.turno)+'">'
      +'<span class="ag-ret-op-data">'+escAg(rotuloDataAg(o.iso))+'</span>'
      +(o.turno?'<span class="ag-turno '+classeTurnoAg(o.turno)+'">'+escAg(o.turno)+'</span>':'')
      +'<small>'+o.livres+(o.livres===1?' vaga livre':' vagas livres')+(mesmo?' · mesmo dia da semana':'')+'</small></button>';
  }).join('');
  elRetAg('agRetLista').innerHTML=html;
  document.querySelectorAll('#agRetOverlay [data-ret-dias]').forEach(function(b){b.classList.toggle('sel',Number(b.dataset.retDias)===retAg.dias);});
  var inp=document.querySelector('#agRetOverlay [data-ret="dias"]');if(inp)inp.value=intervalosRetAg().indexOf(retAg.dias)>=0?'':retAg.dias;
}
function limparOutraRetornoAg(){
  var i=document.querySelector('#agRetOverlay [data-ret="outra"]'),m=elRetAg('agRetOutraMsg');
  if(i)i.value='';if(m){m.textContent='';m.className='ag-ret-msg';}
}
function escolherOpcaoRetornoAg(iso,turno){
  retAg.sel=iso;retAg.selTurno=turno||'';erroRetornoAg('');limparOutraRetornoAg();marcarSelRetornoAg();atualizarOkRetornoAg();
}
// "Outra data": confere a vaga; sem vaga, oferece a próxima.
function escolherOutraRetornoAg(v){
  var m=elRetAg('agRetOutraMsg');erroRetornoAg('');
  retAg.sel='';retAg.selTurno='';
  if(!v){m.textContent='';m.className='ag-ret-msg';}
  else if(v<=isoAg(new Date())){m.textContent='Escolha uma data futura.';m.className='ag-ret-msg erro';}
  else{
    var uc=profMapAg(),r=rowsAg[retAg.ix],k=uc&&chaveProfAg(r,uc);
    if(!k){retAg.sel=v;m.textContent='Profissional não identificado: a vaga não foi conferida.';m.className='ag-ret-msg';}
    else{
      var livre=proximaVagaAg(retAg.ix,v,uc);
      if(livre===v){retAg.sel=v;retAg.selTurno=turnoFuturoAg(retAg.ix,'Agendado',v);m.textContent='Tem vaga'+(retAg.selTurno?' ('+retAg.selTurno+')':'')+'.';m.className='ag-ret-msg ok';}
      else{m.innerHTML='Sem vaga em '+escAg(brAg(v))+'. Próxima: <button type="button" class="ag-ret-usar" data-ret-usar="'+livre+'">'+escAg(rotuloDataAg(livre))+'</button>';m.className='ag-ret-msg erro';}
    }
  }
  marcarSelRetornoAg();atualizarOkRetornoAg();
}
function fecharRetornoAg(){
  var el=elRetAg('agRetOverlay');if(el)el.remove();
  document.removeEventListener('keydown',teclaRetornoAg);retAg=null;
}
function teclaRetornoAg(e){if(e.key==='Escape'&&retAg&&!retAg.busy)fecharRetornoAg();}
function confirmarRetornoAg(){
  if(!retAg||!retAg.sel||retAg.busy)return;
  var ix=retAg.ix,r=rowsAg[ix],uc=profMapAg(),iso=retAg.sel,movido='';
  if(!r)return;
  retAg.busy=true;erroRetornoAg('');atualizarOkRetornoAg();
  verificarConflitosAg([r]).then(function(conf){return conf.length?confirmarConflitosAg(conf):true;}).then(function(seguir){
    if(!seguir)throw {cancelado:true};
    // Outra pessoa pode ter ocupado a vaga enquanto o card estava aberto: confere de novo na hora de gravar.
    if(uc&&chaveProfAg(r,uc)){var livre=proximaVagaAg(ix,iso,uc);if(livre!==iso){movido=brAg(iso)+' → '+brAg(livre);iso=livre;}}
    var turno=turnoFuturoAg(ix,'Agendado',iso);
    return apiAg({action:'agendamentos.update',nome:r.Nome,turno:turno,situacao:'Agendado',dataAgendada:iso}).then(function(){return turno;});
  }).then(function(turno){
    r.Situação='Agendado';r['Data agendada']=iso;r.Turno=turno;delete propostaAg[ix];
    var foiReag=!!(retAg&&retAg.modo==='reagendar');
    if(!foiReag)lsSetAg(LS_RETORNO_AG,{dias:retAg?retAg.dias:diasRetornoSalvoAg()});
    fecharRetornoAg();atualizarBotoesGeracaoAg();
    msgAg((foiReag?'Reagendamento de ':'Retorno de ')+r.Nome+' agendado para '+brAg(iso)+(turno?' ('+turno+')':'')+'.'+(movido?' A vaga escolhida foi ocupada, então passou para o próximo dia com vaga ('+movido+').':''));
    renderAg();
  }).catch(function(e){
    if(e&&e.cancelado){fecharRetornoAg();msgAg('Retorno não agendado: outra pessoa mudou esta linha. A tela mostra o estado atual da planilha.',true);renderAg();return;}
    if(retAg){retAg.busy=false;erroRetornoAg((e&&e.message)||'Falha ao agendar o retorno.');atualizarOkRetornoAg();}
  });
}
function abrirRetornoAg(ix,realizadoIso,modo,origem){
  var r=rowsAg[ix];if(!r)return;
  var reag=modo==='reagendar';
  var uc=profMapAg(),prof=(uc&&nomeProfAg(r,uc))||'',real=/^\d{4}-\d\d-\d\d$/.test(realizadoIso||'')?realizadoIso:'';
  fecharRetornoAg();
  // Reagendar: conta a partir de hoje (não do atendimento) e começa pelo intervalo mais curto.
  retAg={ix:ix,base:reag?isoAg(new Date()):(real||isoAg(new Date())),dias:reag?INTERVALOS_REAGENDAR_AG[0]:diasRetornoSalvoAg(),sel:'',selTurno:'',busy:false,modo:reag?'reagendar':'retorno',origem:origem||''};
  var el=document.createElement('div');el.id='agRetOverlay';el.className='ag-ret-overlay';
  el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','agRetTitulo');
  el.innerHTML='<div class="ag-ret-card">'
    +'<button type="button" class="ag-ret-x" data-ret="fechar" aria-label="Fechar">×</button>'
    +'<h3 id="agRetTitulo">'+(reag?'Reagendar consulta':'Agendar retorno')+'</h3>'
    +'<p class="ag-ret-sub"><b>'+escAg(r.Nome)+'</b>'+(prof?' · '+escAg(prof):'')+'<br>'+(reag?(origem==='falta'?(real?'Faltou em '+escAg(brAg(real)):'Falta registrada')+' — escolha a nova data':(real?'Consulta de '+escAg(brAg(real))+' será reagendada':'Consulta marcada para reagendamento')):(real?'Atendimento realizado em '+escAg(brAg(real)):'Atendimento marcado como realizado'))+'</p>'
    +'<div class="ag-ret-int"><span>'+(reag?'Reagendar em':'Retorno em')+'</span>'
    +intervalosRetAg().map(function(n){return '<button type="button" class="ag-ret-int-btn" data-ret-dias="'+n+'">'+n+' dias</button>';}).join('')
    +'<label class="ag-ret-custom"><input type="number" min="1" max="365" inputmode="numeric" data-ret="dias" aria-label="Outro intervalo, em dias"> dias</label></div>'
    +'<p class="ag-ret-alvo" id="agRetAlvo"></p>'
    +'<div class="ag-ret-lista" id="agRetLista"></div>'
    +'<div class="ag-ret-outra"><label>Outra data <input type="date" data-ret="outra"></label><span id="agRetOutraMsg" class="ag-ret-msg" aria-live="polite"></span></div>'
    +'<p class="ag-ret-erro" id="agRetErro" hidden></p>'
    +'<div class="ag-ret-acoes"><button type="button" class="ag-ret-pular" data-ret="fechar">Agora não</button><button type="button" class="ag-ret-ok" data-ret="ok" disabled>Escolha uma data</button></div>'
    +'</div>';
  el.addEventListener('click',function(e){
    if(!retAg)return;
    if(e.target===el){if(!retAg.busy)fecharRetornoAg();return;}
    var t=e.target.closest('[data-ret],[data-ret-dias],[data-ret-iso],[data-ret-usar]');if(!t||retAg.busy)return;
    if(t.dataset.ret==='fechar'){fecharRetornoAg();return;}
    if(t.dataset.ret==='ok'){confirmarRetornoAg();return;}
    if(t.dataset.retDias){retAg.dias=Number(t.dataset.retDias);retAg.sel='';retAg.selTurno='';limparOutraRetornoAg();renderOpcoesRetornoAg();atualizarOkRetornoAg();return;}
    if(t.dataset.retIso){escolherOpcaoRetornoAg(t.dataset.retIso,t.dataset.retTurno);return;}
    if(t.dataset.retUsar){var i=document.querySelector('#agRetOverlay [data-ret="outra"]');if(i)i.value=t.dataset.retUsar;escolherOutraRetornoAg(t.dataset.retUsar);}
  });
  el.addEventListener('input',function(e){
    if(!retAg||e.target.dataset.ret!=='dias')return;
    var n=parseInt(e.target.value,10);if(!(n>=1&&n<=365))return;
    retAg.dias=n;retAg.sel='';retAg.selTurno='';limparOutraRetornoAg();
    var v=e.target.value;renderOpcoesRetornoAg();e.target.value=v;atualizarOkRetornoAg();
  });
  el.addEventListener('change',function(e){if(retAg&&e.target.dataset.ret==='outra')escolherOutraRetornoAg(e.target.value);});
  document.body.appendChild(el);document.addEventListener('keydown',teclaRetornoAg);
  renderOpcoesRetornoAg();atualizarOkRetornoAg();
  var primeiro=el.querySelector('.ag-ret-op');if(primeiro)primeiro.focus();
}
function saveAg(tr){
  var ix=Number(tr.dataset.agIx),r=rowsAg[ix];if(!r)return;
  var antSit=r.Situação||'Pendente',antData=dateAg(r['Data agendada']),antTurno=r.Turno||'';   // estado antes de salvar (para o histórico)
  var btn=tr.querySelector('[data-ag-save]'),fields={};
  tr.querySelectorAll('[data-ag]').forEach(function(el){fields[el.dataset.ag]=el.value;});
  btn.disabled=true;btn.textContent='Salvando…';
  var turno='',movidoAg='';
  verificarConflitosAg([r]).then(function(conf){return conf.length?confirmarConflitosAg(conf):true;}).then(function(seguir){
    if(!seguir)throw {cancelado:true};
    var av=avisoDiaLotadoAg(ix,r,fields,antData);
    if(av&&!window.confirm(av))throw {cancelado:true,lotado:true};
    return r._virtual?garantirNaPlanilhaAg([r]):null;
  }).then(function(){
    // Sem excedente: se o dia escolhido já está lotado para o profissional, vai para o próximo dia com vaga.
    if(fields.dataAgendada&&fields.situacao!=='Cancelado'&&fields.situacao!=='Faltou'&&fields.situacao!=='Realizado'&&fields.situacao!=='Reagendar'){
      var ucv=profMapAg();
      if(ucv&&chaveProfAg(r,ucv)){
        var livre=proximaVagaAg(ix,fields.dataAgendada,ucv);
        if(livre!==fields.dataAgendada){movidoAg=brAg(fields.dataAgendada)+' → '+brAg(livre);fields.dataAgendada=livre;}
      }
    }
    turno=turnoFuturoAg(ix,fields.situacao,fields.dataAgendada);
    return apiAg(Object.assign({action:'agendamentos.update',nome:r.Nome,turno:turno},fields));
  }).then(function(){
    r.Situação=fields.situacao;r['Data agendada']=fields.dataAgendada;r.Turno=turno;
    delete propostaAg[ix];atualizarBotoesGeracaoAg();
    var histSave=[{ix:ix,situacao:fields.situacao,dataAgendada:fields.situacao==='Cancelado'?(fields.dataAgendada||antData):fields.dataAgendada,turno:turno||antTurno}];
    // Trocou a data de quem estava Pendente/Agendado: a data anterior entra no histórico como Remarcado.
    if(antData&&(antSit==='Agendado'||antSit==='Pendente')&&(fields.situacao==='Agendado'||fields.situacao==='Pendente')&&fields.dataAgendada&&fields.dataAgendada!==antData)histSave.push({ix:ix,situacao:'Remarcado',dataAgendada:antData,turno:antTurno});
    // Reagendar: a data que a pessoa tinha foi trocada — entra no histórico como Remarcado.
    if(fields.situacao==='Reagendar'&&antData&&(antSit==='Agendado'||antSit==='Pendente'))histSave.push({ix:ix,situacao:'Remarcado',dataAgendada:antData,turno:antTurno});
    registrarHistoricoAg(histSave);
    var aviso='Alterações de '+r.Nome+' salvas.'+(movidoAg?' O dia estava lotado, então a data passou para o próximo dia com vaga ('+movidoAg+').':'');
    msgAg(aviso);
    // Realizado (vindo de outra situação): abre o card com as datas de retorno disponíveis.
    if(fields.situacao==='Realizado'&&antSit!=='Realizado')abrirRetornoAg(ix,fields.dataAgendada||antData||'');
    // Reagendar: abre o mesmo card, com as datas disponíveis para o novo agendamento.
    if(fields.situacao==='Reagendar')abrirRetornoAg(ix,antData||fields.dataAgendada||'','reagendar');
    // Faltou: a falta já foi para o histórico (lista de Faltas). Pergunta se quer reagendar agora:
    // sim = abre o card com as datas disponíveis; não = continua como Faltou, aguardando data
    // (aparece em Agendamentos e entra na geração automática de datas).
    if(fields.situacao==='Faltou'&&antSit!=='Faltou'){
      var quer=window.confirm(r.Nome+' faltou'+(fields.dataAgendada||antData?' em '+brAg(fields.dataAgendada||antData):'')+'.\n\nDeseja reagendar agora?\n\nOK = escolher a nova data\nCancelar = manter como Faltou (continua na lista de Faltas e em Agendamentos)');
      if(quer)abrirRetornoAg(ix,fields.dataAgendada||antData||'','reagendar','falta');
    }
  }).catch(function(e){
    if(e&&e.cancelado){msgAg(e.lotado?'Alteração não salva: o dia escolhido não tem vaga. Escolha outra data.':'Alteração não salva: outra pessoa mudou esta linha. A tela mostra o estado atual da planilha.',true);return;}
    msgAg((e&&e.message)||'Falha ao salvar.',true);
  }).finally(function(){renderAg();});
}

// ---------- Vagas por dia ----------
function renderVagasAg(uc){
  var det=document.getElementById('agendamentosVagas'),box=document.getElementById('agendamentosVagasTabela');
  if(!det||!box||!det.open)return;
  if(!uc){box.innerHTML='<p class="agendamentos-vazio">Carregue Pessoas atendidas para ver as vagas.</p>';return;}
  var nomes=agendasAg(uc);
  var ks=Object.keys(nomes).sort(function(a,b){return nomes[a].localeCompare(nomes[b],'pt-BR');});
  if(!ks.length){box.innerHTML='<p class="agendamentos-vazio">Sem profissionais identificados.</p>';return;}
  var oc={};
  rowsAg.forEach(function(r,ix){var k=chaveProfAg(r,uc),d=propostaAg[ix]||dateAg(r['Data agendada']);if(!k||!d||!ocupaAg(r,ix))return;(oc[k]=oc[k]||{})[d]=(oc[k][d]||0)+1;});
  var caps={};ks.forEach(function(k){caps[k]=capAg(k);});
  var h=new Date(),d=new Date(h.getFullYear(),h.getMonth(),h.getDate()),dias=[],guard=0;
  while(dias.length<15&&guard<150){guard++;var isoD=isoAg(d);if(ks.some(function(k){return caps[k].atende(isoD);}))dias.push(d);d=somaDiaAg(d,1);}
  var html='<div class="table-wrap"><table class="data-table agendamentos-vagas-tab"><thead><tr><th>Dia</th>'+ks.map(function(k){return '<th>'+escAg(nomes[k])+'</th>';}).join('')+'</tr></thead><tbody>';
  dias.forEach(function(dt){
    var iso=isoAg(dt);
    html+='<tr><td class="agendamentos-nome">'+DIAS_SEM_AG[dt.getDay()]+', '+brAg(iso)+'</td>'+ks.map(function(k){
      var cap=caps[k];if(!cap.atende(iso))return '<td class="vaga-off" title="Não atende neste dia">—</td>';
      var fo=folgaDiaAg(k,iso);if(fo)return '<td class="vaga-off" title="'+escAg(fo)+'">'+(fo.indexOf('Feriado')===0?'feriado':(fo.indexOf('Folga')===0?'folga':'imprevisto'))+'</td>';
      var cd=capNoDiaAg(cap,iso),n=(oc[k]&&oc[k][iso])||0,cls=n>=cd.dia?'vaga-lotado':(n>=cd.dia*0.75?'vaga-quase':'vaga-livre');
      return '<td class="'+cls+'" title="'+(cd.dia-n>0?(cd.dia-n)+' vaga(s) livre(s)':'Sem vagas')+(cd.t<1&&cap.t>0?' (só manhã)':'')+'">'+n+'/'+cd.dia+'</td>';
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
  det.querySelectorAll('.agendamentos-cfg-manha input').forEach(function(cb){cb.checked=!!cfgAg.soManha[Number(cb.dataset.dia)];});
  var rd=document.getElementById('agCfgRedist');if(rd)rd.checked=!!cfgAg.redistribuir;
  var box=document.getElementById('agCfgProf');if(!box)return;
  var uc=profMapAg();
  if(!uc){box.innerHTML='<p class="agendamentos-filtro-info">Carregue Pessoas atendidas para configurar por profissional.</p>';return;}
  var nomes=agendasAg(uc);
  var ks=Object.keys(nomes).sort(function(a,b){return nomes[a].localeCompare(nomes[b],'pt-BR');});
  var editorFeitoAg={};
  box.innerHTML='<div class="table-wrap"><table class="data-table"><thead><tr><th>Profissional</th><th>Vagas manhã</th><th>Vagas tarde</th>'+DIAS_SEM_AG.map(function(n){return '<th>'+n+'</th>';}).join('')+'<th>Regras</th></tr></thead><tbody>'+ks.map(function(k){
    var o=cfgAg.prof[k]||{},cap=capAg(k),temRegras=!!(cap.regras&&cap.regras.length),base=k.split('@')[0],unRow=k.indexOf('@')<0?'':nomeUnidAg(k.slice(k.indexOf('@')+1)),aberto=!!regrasAbertasAg[base]&&!editorFeitoAg[base]&&unRow===(regrasUnidPadraoAg[base]||'');if(aberto)editorFeitoAg[base]=true;
    return '<tr data-k="'+escAg(k)+'"><td class="agendamentos-nome">'+escAg(nomes[k])+' <button type="button" class="agendamentos-btn agendamentos-secundario" data-redist="'+escAg(k)+'" title="Refaz as datas já agendadas desta agenda (a partir da data de Início) com as vagas e dias atuais. Nada é salvo até clicar em Salvar datas geradas." style="padding:2px 8px;font-size:12px;margin-left:6px">Atualizar</button> <button type=\"button\" class=\"agendamentos-btn agendamentos-secundario\" data-regras-toggle=\"'+escAg(base)+'\" data-un=\"'+escAg(k.indexOf('@')<0?'':nomeUnidAg(k.slice(k.indexOf('@')+1)))+'\" style=\"padding:2px 8px;font-size:12px;margin-left:4px\">'+(aberto?'Fechar regras':'Regras')+'</button></td>'
      +'<td><input type="number" min="0" data-campo="m" placeholder="'+cfgAg.m+'" value="'+(o.m==null?'':o.m)+'"></td>'
      +'<td><input type="number" min="0" data-campo="t" placeholder="'+cfgAg.t+'" value="'+(o.t==null?'':o.t)+'"></td>'
      +[0,1,2,3,4,5,6].map(function(i){return '<td><input type="checkbox" data-dia="'+i+'"'+(cap.dias[i]?' checked':'')+(temRegras?' disabled title="Definido pelas regras de atendimento"':'')+'></td>';}).join('')
      +'<td class="ag-regras-cel">'+(temRegras?'<span class="ag-regras-resumo" title="'+escAg(resumoRegrasAg(cap.regras))+'">'+cap.regras.length+(cap.regras.length===1?' regra':' regras')+'</span> ':'')+'<button type="button" class="agendamentos-btn agendamentos-secundario" data-regras-toggle="'+escAg(base)+'" data-un="'+escAg(k.indexOf('@')<0?'':nomeUnidAg(k.slice(k.indexOf('@')+1)))+'" style="padding:2px 8px;font-size:12px">'+(aberto?'Fechar':(temRegras?'Editar':'Definir regras'))+'</button></td></tr>'
      +(aberto?'<tr data-kr="'+escAg(base)+'" class="ag-regras-linha"><td colspan="11">'+htmlRegrasAg(base,nomes[k].split(' — ')[0],unRow)+'</td></tr>':'');
  }).join('')+'</tbody></table></div>';
}
var regrasAbertasAg={};   // profissionais com o editor de regras aberto
var regrasUnidPadraoAg={};   // unidade da linha em que o editor foi aberto (vira a unidade das regras novas)
function proximaDataDiaAg(dia){var h=new Date(),x=new Date(h.getFullYear(),h.getMonth(),h.getDate());while(x.getDay()!==dia)x.setDate(x.getDate()+1);return isoAg(x);}
function unidadesOpcoesAg(){
  var uc=profMapAg(),lista=UNIDADES_AG.slice();
  if(uc)Object.keys(uc.ultUnid).forEach(function(n){var u=nomeUnidAg(uc.ultUnid[n]);if(u&&lista.map(normAg).indexOf(normAg(u))<0)lista.push(u);});
  return lista;
}
function htmlRegrasAg(base,nomeProf,unFiltro){
  var o=cfgAg.prof[base]||{},todas=Array.isArray(o.regras)?o.regras:[],unids=unidadesOpcoesAg();
  // Linha de uma unidade: mostra só as regras dessa unidade (e as de "Todas as unidades"); a unidade fica fixa.
  var regras=[];todas.forEach(function(r,i){if(!unFiltro||!r.unid||unidCasaAg(r.unid,unFiltro))regras.push({r:r,i:i});});
  var h='<div class="ag-regras"><p class="agendamentos-filtro-info"><b>Regras de atendimento — '+escAg(nomeProf)+(unFiltro?' — '+escAg(unFiltro):'')+'.</b> Cada regra é um dia da semana em que o profissional atende em uma unidade. Com pelo menos uma regra válida, <b>só as regras</b> valem para essa unidade (os dias da tabela ficam desativados). Ex.: Centro, segunda a cada 2 semanas desde 19/10; Croatá, segunda a cada 2 semanas desde 26/10; Centro, terça toda semana. O paciente é ligado à unidade do último atendimento dele no PEC.</p>';
  if(!regras.length)h+='<p class="agendamentos-filtro-info">Sem regras: vale a configuração simples (dias marcados na tabela).</p>';
  regras.forEach(function(x){
    var r=x.r,i=x.i,cada=parseInt(r.freq,10)||1,ok=regraOkAg(r);
    h+='<div class="ag-regra'+(ok?'':' ag-regra-invalida')+'" data-i="'+i+'">'
      +(unFiltro?'<b class="ag-regra-un" style="padding:0 8px">'+escAg(r.unid?nomeUnidAg(r.unid):'Todas as unidades')+'</b>':'<select data-rf="unid" aria-label="Unidade"><option value="">Todas as unidades</option>'+unids.map(function(u){return '<option value="'+escAg(u)+'"'+(r.unid&&normAg(r.unid)===normAg(u)?' selected':'')+'>'+escAg(u)+'</option>';}).join('')+'</select>')
      +'<select data-rf="dia" aria-label="Dia da semana">'+DIAS_SEM_AG.map(function(n,d){return '<option value="'+d+'"'+(r.dia===d?' selected':'')+'>'+n+'</option>';}).join('')+'</select>'
      +'<select data-rf="freq" aria-label="Frequência">'+[['1','Toda semana'],['2','A cada 2 semanas (quinzenal)'],['3','A cada 3 semanas'],['4','A cada 4 semanas'],['mes','Semanas do mês…']].map(function(f){return '<option value="'+f[0]+'"'+(String(r.freq||'1')===f[0]?' selected':'')+'>'+f[1]+'</option>';}).join('')+'</select>'
      +(cada>1?'<label>a partir de <input type="date" data-rf="desde" value="'+escAg(r.desde||'')+'"></label>':'')
      +(r.freq==='mes'?'<span class="ag-regra-sem">'+[1,2,3,4,5].map(function(n){return '<label><input type="checkbox" data-rf="sem" data-n="'+n+'"'+((r.sem||[]).indexOf(n)>=0?' checked':'')+'> '+n+'ª</label>';}).join('')+'</span>':'')
      +'<select data-rf="turno" aria-label="Turno">'+[['ambos','Manhã e tarde'],['manha','Só manhã'],['tarde','Só tarde']].map(function(f){return '<option value="'+f[0]+'"'+((r.turno||'ambos')===f[0]?' selected':'')+'>'+f[1]+'</option>';}).join('')+'</select>'
      +'<label>vagas manhã <input type="number" min="0" data-rf="m" placeholder="padrão" value="'+(r.m==null?'':r.m)+'"></label>'
      +'<label>vagas tarde <input type="number" min="0" data-rf="t" placeholder="padrão" value="'+(r.t==null?'':r.t)+'"></label>'
      +'<button type="button" class="agendamentos-btn agendamentos-secundario" data-rf-del="'+i+'" style="padding:2px 8px;font-size:12px">Remover</button>'
      +(ok?'':'<small class="ag-aviso"> Incompleta: '+(r.freq==='mes'?'marque pelo menos uma semana do mês':'informe a data inicial')+' (regra ignorada até lá).</small>')
      +'</div>';
  });
  h+='<div><button type="button" class="agendamentos-btn" data-rf-add="1" style="padding:4px 10px;font-size:12px">+ Adicionar regra</button>'+(regras.length?' <button type="button" class="agendamentos-btn agendamentos-secundario" data-rf-limpar="1" style="padding:4px 10px;font-size:12px">'+(unFiltro?'Remover as regras desta unidade (voltar aos dias simples)':'Remover todas (voltar aos dias simples)')+'</button>':'')+'</div></div>';
  return h;
}
// Mudou a configuração: guarda, e refaz a sugestão de datas.
function configMudouAg(){salvarConfigAg();propostaAg={};atualizarBotoesGeracaoAg();renderAg();gerarAg(true);}

// ---------- Feriados, imprevistos e folgas ----------
function brDataAg(iso){return iso?iso.split('-').reverse().join('/'):'';}
function periodoAg(a,b){return a===b?brDataAg(a):brDataAg(a)+' a '+brDataAg(b);}
function renderFolgasAg(){
  var det=document.getElementById('agendamentosFolgas');if(!det)return;
  var sel=document.getElementById('agFaltaProf'),uc=profMapAg();
  if(sel){
    var atual=sel.value,nomes=uc?uc.nomes:[];
    sel.innerHTML='<option value="">Profissional…</option>'+nomes.map(function(n){return '<option value="'+escAg(n)+'">'+escAg(n)+'</option>';}).join('');
    sel.value=atual;
  }
  var sg=document.getElementById('agFolgaProf');
  if(sg){
    var atualG=sg.value,nomesG=uc?uc.nomes:[];
    sg.innerHTML='<option value="">Profissional…</option>'+nomesG.map(function(n){return '<option value="'+escAg(n)+'">'+escAg(n)+'</option>';}).join('');
    sg.value=atualG;
  }
  var sc=document.getElementById('agConsultaProf');
  if(sc&&uc){var at=sc.value,ag=agendasAg(uc),ks=Object.keys(ag).sort(function(a,b){return ag[a].localeCompare(ag[b],'pt-BR');});
    sc.innerHTML='<option value="">Agenda…</option>'+ks.map(function(k){return '<option value="'+escAg(k)+'">'+escAg(ag[k])+'</option>';}).join('');sc.value=at;}
  var box=document.getElementById('agFolgasLista');if(!box)return;
  var itens=[];
  cfgAg.feriados.forEach(function(f,i){itens.push({ini:f.ini,html:'<li><b>Feriado</b>'+(f.nome?' — '+escAg(f.nome):'')+' · '+periodoAg(f.ini,f.fim)+(f.por?' · por '+escAg(f.por):'')+' <button type="button" class="agendamentos-btn agendamentos-secundario" data-folga="f" data-i="'+i+'">Remover</button></li>'});});
  cfgAg.faltas.forEach(function(f,i){itens.push({ini:f.ini,html:'<li><b>Imprevisto</b> — '+escAg(f.prof)+(f.motivo?' ('+escAg(f.motivo)+')':'')+' · '+periodoAg(f.ini,f.fim)+(f.por?' · por '+escAg(f.por):'')+' <button type="button" class="agendamentos-btn agendamentos-secundario" data-folga="l" data-i="'+i+'">Remover</button></li>'});});
  cfgAg.folgas.forEach(function(f,i){itens.push({ini:f.ini,html:'<li><b>Folga</b> — '+escAg(f.prof)+(f.motivo?' ('+escAg(f.motivo)+')':'')+' · '+periodoAg(f.ini,f.fim)+(f.por?' · por '+escAg(f.por):'')+' <button type="button" class="agendamentos-btn agendamentos-secundario" data-folga="g" data-i="'+i+'">Remover</button></li>'});});
  itens.sort(function(a,b){return a.ini<b.ini?-1:a.ini>b.ini?1:0;});
  box.innerHTML=itens.length?'<ul class="agendamentos-folgas-lista">'+itens.map(function(x){return x.html;}).join('')+'</ul>':'<p class="agendamentos-filtro-info">Nenhum feriado, imprevisto ou folga cadastrado.</p>';
}
// Consulta: por que uma agenda (profissional/unidade) aceita ou não agendamento em um dia.
function motivoDiaAg(k,iso){
  var dt=isoParaDataAg(iso);if(!dt)return 'Informe uma data válida.';
  var uc=profMapAg(),cap=capAg(k),nomes=uc?agendasAg(uc):{},nome=nomes[k]||k||'agenda';
  var dow=dt.getDay(),sem=DIAS_SEM_AG[dow]+', '+brDataAg(iso);
  var atende=DIAS_SEM_AG.filter(function(n,i){return cap.dias[i];}).join(', ');
  if(!cap.atende(iso))return 'NÃO aceita — '+nome+' não atende neste dia ('+(cap.regras&&cap.regras.length?'regras: '+resumoRegrasAg(cap.regras):'dias configurados: '+atende)+').';
  var fo=folgaDiaAg(k,iso);if(fo)return 'NÃO aceita — '+sem+' está fechado: '+fo+'.';
  var cd=capNoDiaAg(cap,iso);
  if(cd.dia<1)return 'NÃO aceita — '+nome+' está com 0 vagas neste dia (confira as vagas da manhã/tarde).';
  var n=0;if(uc)rowsAg.forEach(function(r,ix){if(chaveProfAg(r,uc)!==k||!ocupaAg(r,ix))return;if((propostaAg[ix]||dateAg(r['Data agendada']))===iso)n++;});
  var tur=cd.t<1&&cap.t>0?' (dia só de manhã)':'';
  var ini=valAg('agendamentosInicio'),extra='';
  if(iso<isoAg(amanhaAg()))extra=' Atenção: a data já passou; a geração automática só usa datas a partir de amanhã.';
  else if(ini&&iso<ini)extra=' Atenção: a geração automática começa em '+brDataAg(ini)+' (campo Início), então este dia não é usado.';
  if(n>=cd.dia)return 'NÃO aceita — '+sem+' está LOTADO para '+nome+': '+n+'/'+cd.dia+' vagas'+tur+'.'+extra;
  return 'ACEITA — '+sem+': '+n+'/'+cd.dia+' vagas ocupadas, '+(cd.dia-n)+' livre(s)'+tur+'.'+extra+(n===0?' (a distribuição automática só chega a este dia quando os anteriores já estão cheios ou não bastam para todos).':'');
}
function consultarDiaAg(){
  var out=document.getElementById('agConsultaRes'),k=valAg('agConsultaProf'),iso=valAg('agConsultaData');
  if(!out)return;
  if(!k||!iso){out.textContent='Escolha a agenda e a data.';return;}
  out.textContent=motivoDiaAg(k,iso);
}
function folgaMudouAg(){salvarConfigAg();renderFolgasAg();configMudouAg();}

// ---------- Bloqueios na planilha (feriados, imprevistos e folgas) ----------
// Ficam na aba "Agenda - Bloqueios", compartilhados por todos que usam o painel. Se o Apps Script publicado
// ainda não conhece essa aba (versão antiga), os cadastros continuam valendo só neste navegador.
var bloqueiosModoAg='';   // 'servidor' | 'local' | '' (ainda não carregou)
var TIPO_FER_AG='Feriado',TIPO_IMP_AG='Imprevisto',TIPO_FOL_AG='Folga';
function listaBloqAg(tipo){return tipo===TIPO_FER_AG?cfgAg.feriados:(tipo===TIPO_IMP_AG?cfgAg.faltas:cfgAg.folgas);}
function linhaBloqAg(tipo,x){return {tipo:tipo,prof:tipo===TIPO_FER_AG?'':(x.prof||''),ini:x.ini,fim:x.fim,motivo:(tipo===TIPO_FER_AG?x.nome:x.motivo)||''};}
function aplicarBloqueiosAg(rows){
  var fer=[],imp=[],fol=[];
  (rows||[]).forEach(function(b){
    if(!/^\d{4}-\d\d-\d\d$/.test(b.ini||'')||!/^\d{4}-\d\d-\d\d$/.test(b.fim||''))return;
    if(b.tipo===TIPO_FER_AG)fer.push({id:b.id,ini:b.ini,fim:b.fim,nome:b.motivo||'',por:b.por||''});
    else if(b.prof&&b.tipo===TIPO_IMP_AG)imp.push({id:b.id,prof:b.prof,ini:b.ini,fim:b.fim,motivo:b.motivo||'',por:b.por||''});
    else if(b.prof&&b.tipo===TIPO_FOL_AG)fol.push({id:b.id,prof:b.prof,ini:b.ini,fim:b.fim,motivo:b.motivo||'',por:b.por||''});
  });
  cfgAg.feriados=fer;cfgAg.faltas=imp;cfgAg.folgas=fol;
}
function notaBloqueiosAg(migrados,erro){
  var el=document.getElementById('agBloqueiosModo');if(!el)return;
  if(bloqueiosModoAg==='servidor'){
    el.textContent='Feriados, imprevistos e folgas ficam salvos na planilha (aba “Agenda - Bloqueios”) e valem para todos que usam o painel.'+(migrados?' '+migrados+(migrados===1?' cadastro que estava só neste navegador foi enviado':' cadastros que estavam só neste navegador foram enviados')+' para a planilha.':'');
    el.className='agendamentos-filtro-info';return;
  }
  var m=(erro&&erro.message)||'';
  el.textContent='Atenção: '+(/n[ãa]o reconhecida/i.test(m)?'o Apps Script publicado ainda não conhece os bloqueios na planilha (publique a versão nova do backend). ':'não foi possível acessar os bloqueios na planilha'+(m?' ('+m+')':'')+'. ')+'Por enquanto os cadastros ficam só neste navegador.';
  el.className='agendamentos-filtro-info erro';
}
// Lê os bloqueios da planilha. O que estava só neste navegador (sem id) é enviado uma vez e deixa de ficar aqui.
function carregarBloqueiosAg(){
  var legado=[];
  [TIPO_FER_AG,TIPO_IMP_AG,TIPO_FOL_AG].forEach(function(t){listaBloqAg(t).forEach(function(x){if(!x.id)legado.push(linhaBloqAg(t,x));});});
  return apiAg({action:'agendamentos.bloqueiosList'}).then(function(r){
    return legado.length?apiAg({action:'agendamentos.bloqueiosAdd',rows:legado}):r;
  }).then(function(r){
    aplicarBloqueiosAg(r.rows);bloqueiosModoAg='servidor';salvarConfigAg();notaBloqueiosAg(legado.length);
  }).catch(function(e){
    if(/Sess/i.test((e&&e.message)||''))throw e;
    bloqueiosModoAg='local';notaBloqueiosAg(0,e);
  });
}
function registrarBloqueioAg(tipo,x,campos){
  function pronto(){campos.forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});folgaMudouAg();mostrarAfetadosAg(tipo,x);}
  if(bloqueiosModoAg!=='servidor'){listaBloqAg(tipo).push(x);pronto();return;}
  msgAg('Salvando na planilha…',false);
  apiAg({action:'agendamentos.bloqueiosAdd',rows:[linhaBloqAg(tipo,x)]}).then(function(r){
    aplicarBloqueiosAg(r.rows);msgAg('',false);pronto();
  }).catch(function(e){msgAg('Não foi possível salvar na planilha: '+((e&&e.message)||e),true);});
}
function removerBloqueioAg(lista,i){
  var item=lista[i];if(!item)return;
  if(bloqueiosModoAg==='servidor'&&item.id){
    msgAg('Removendo da planilha…',false);
    apiAg({action:'agendamentos.bloqueiosRemove',id:item.id}).then(function(r){aplicarBloqueiosAg(r.rows);msgAg('',false);folgaMudouAg();}).catch(function(e){msgAg('Não foi possível remover na planilha: '+((e&&e.message)||e),true);});
    return;
  }
  lista.splice(i,1);folgaMudouAg();
}
function addFeriadoAg(){
  var ini=valAg('agFerIni'),fim=valAg('agFerFim')||ini,nome=valAg('agFerNome').trim();
  if(!ini){msgAg('Informe a data do feriado.',true);return;}
  if(fim<ini){msgAg('A data final do feriado é anterior à inicial.',true);return;}
  registrarBloqueioAg(TIPO_FER_AG,{ini:ini,fim:fim,nome:nome},['agFerIni','agFerFim','agFerNome']);
}
function addFaltaAg(){
  var prof=valAg('agFaltaProf'),ini=valAg('agFaltaIni'),fim=valAg('agFaltaFim')||ini,motivo=valAg('agFaltaMotivo').trim();
  if(!prof||!ini){msgAg('Escolha o profissional e a data do imprevisto.',true);return;}
  if(fim<ini){msgAg('A data final do imprevisto é anterior à inicial.',true);return;}
  registrarBloqueioAg(TIPO_IMP_AG,{prof:prof,ini:ini,fim:fim,motivo:motivo},['agFaltaIni','agFaltaFim','agFaltaMotivo']);
}
function addFolgaAg(){
  var prof=valAg('agFolgaProf'),ini=valAg('agFolgaIni'),fim=valAg('agFolgaFim')||ini,motivo=valAg('agFolgaMotivo').trim();
  if(!prof||!ini){msgAg('Escolha o profissional e a data da folga.',true);return;}
  if(fim<ini){msgAg('A data final da folga é anterior à inicial.',true);return;}
  registrarBloqueioAg(TIPO_FOL_AG,{prof:prof,ini:ini,fim:fim,motivo:motivo},['agFolgaIni','agFolgaFim','agFolgaMotivo']);
}

// ---------- Pacientes afetados por um bloqueio ----------
// Ao cadastrar feriado, imprevisto ou folga, lista quem tinha consulta marcada no período e a nova data
// (sugerida pela geração automática, ainda não salva, ou já salva) para avisar os pacientes.
var afetadosAg=null;   // {titulo, itens:[{ix,nome,dataOrig,turno,prof}]}
function turnoRotuloAg(v){var n=normAg(v);return n==='manha'?'Manhã':(n==='tarde'?'Tarde':'');}
function mostrarAfetadosAg(tipo,x){
  var uc=profMapAg(),hoje=isoAg(new Date()),base=tipo===TIPO_FER_AG?'':normAg(x.prof),itens=[];
  rowsAg.forEach(function(r,ix){
    var d=dateAg(r['Data agendada']);
    if(!d||d<hoje||d<x.ini||d>x.fim)return;
    if((r.Situação||'Pendente')==='Realizado'||!ehAtivoAg(r))return;
    var k=uc?chaveProfAg(r,uc):'';
    if(base&&String(k||'').split('@')[0]!==base)return;
    itens.push({ix:ix,nome:String(r.Nome||''),dataOrig:d,turno:String(r.Turno||''),prof:uc?nomeProfAg(r,uc):''});
  });
  itens.sort(function(p,q){return p.dataOrig<q.dataOrig?-1:p.dataOrig>q.dataOrig?1:p.nome.localeCompare(q.nome,'pt-BR');});
  var quem=tipo===TIPO_FER_AG?'Feriado'+(x.nome?': '+x.nome:''):tipo+' — '+x.prof+(x.motivo?' ('+x.motivo+')':'');
  afetadosAg={titulo:quem+' · '+periodoAg(x.ini,x.fim),itens:itens};
  renderAfetadosAg();
}
function turnosSeguroAg(){var uc=profMapAg();try{return uc?turnosAg(uc):{};}catch(e){return {};}}
function estadoAfetadoAg(it,turnos){
  var r=rowsAg[it.ix],prop=propostaAg[it.ix],atual=r?dateAg(r['Data agendada']):'';
  if(prop){var t=turnos&&turnos[it.ix];return {nova:prop,turno:t?t.rotulo:'',estado:'Sugerida — ainda não salva'};}
  if(atual&&atual!==it.dataOrig)return {nova:atual,turno:turnoRotuloAg(r.Turno),estado:'Já salva'};
  return {nova:'',turno:'',estado:'Sem nova data — gere as datas'};
}
function renderAfetadosAg(){
  var box=document.getElementById('agAfetados');if(!box)return;
  if(!afetadosAg){box.innerHTML='';return;}
  var turnos=turnosSeguroAg(),itens=afetadosAg.itens,n=itens.length;
  var btn=function(acao,txt){return '<button type="button" class="agendamentos-btn agendamentos-secundario" data-afet="'+acao+'">'+txt+'</button>';};
  var topo='<div class="agendamentos-afetados-topo"><b>Pacientes afetados</b> · '+escAg(afetadosAg.titulo)+' · '+n+(n===1?' paciente':' pacientes')+'<span class="agendamentos-afetados-acoes">'+(n?btn('csv','Exportar CSV')+btn('copiar','Copiar lista'):'')+btn('fechar','Fechar')+'</span></div>';
  if(!n){box.innerHTML='<div class="agendamentos-afetados">'+topo+'<p class="agendamentos-filtro-info">Nenhum paciente tinha consulta marcada neste período.</p></div>';return;}
  var corpo=itens.map(function(it){
    var e=estadoAfetadoAg(it,turnos),tr=turnoRotuloAg(it.turno);
    return '<tr><td>'+escAg(it.nome)+'</td><td>'+escAg(it.prof)+'</td><td>'+escAg(brAg(it.dataOrig))+(tr?' · '+tr:'')+'</td><td>'+(e.nova?escAg(brAg(e.nova))+(e.turno?' · '+escAg(e.turno):''):'—')+'</td><td'+(e.nova?'':' class="faltas-sem-data"')+'>'+escAg(e.estado)+'</td></tr>';
  }).join('');
  box.innerHTML='<div class="agendamentos-afetados">'+topo+'<div class="table-wrap"><table class="data-table"><thead><tr><th>Paciente</th><th>Profissional</th><th>Data que estava</th><th>Nova data</th><th>Situação da nova data</th></tr></thead><tbody>'+corpo+'</tbody></table></div><p class="agendamentos-filtro-info">As datas “sugeridas” só valem depois de clicar em “Salvar datas geradas”. Use Exportar CSV ou Copiar lista para avisar os pacientes.</p></div>';
}
function cliqueAfetadosAg(e){
  var b=e.target.closest&&e.target.closest('button[data-afet]');if(!b||!afetadosAg)return;
  var acao=b.getAttribute('data-afet');
  if(acao==='fechar'){afetadosAg=null;renderAfetadosAg();return;}
  var turnos=turnosSeguroAg();
  var linhas=afetadosAg.itens.map(function(it){return {it:it,e:estadoAfetadoAg(it,turnos)};});
  if(acao==='csv'){
    var cab=['Paciente','Profissional','Data anterior','Turno anterior','Nova data','Novo turno','Situação da nova data'];
    var csv='\ufeff'+[cab].concat(linhas.map(function(l){return [l.it.nome,l.it.prof,brAg(l.it.dataOrig),turnoRotuloAg(l.it.turno),brAg(l.e.nova),l.e.turno,l.e.estado];})).map(function(r){return r.map(csvCelAg).join(';');}).join('\r\n');
    var link=document.createElement('a');
    link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    link.download='pacientes-afetados-'+isoAg(new Date())+'.csv';
    document.body.appendChild(link);link.click();document.body.removeChild(link);
    setTimeout(function(){URL.revokeObjectURL(link.href);},1000);
    return;
  }
  if(acao==='copiar'){
    var txt=afetadosAg.titulo+'\n'+linhas.map(function(l){
      var tr=turnoRotuloAg(l.it.turno);
      return '• '+l.it.nome+' — consulta de '+brAg(l.it.dataOrig)+(tr?' ('+tr+')':'')+(l.e.nova?' → nova data '+brAg(l.e.nova)+(l.e.turno?' ('+l.e.turno+')':'')+(l.e.estado.indexOf('Sugerida')===0?' [sugerida]':''):' → sem nova data ainda');
    }).join('\n');
    var ok=function(){msgAg('Lista copiada.',false);};
    var plano=function(){var t=document.createElement('textarea');t.value=txt;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();try{document.execCommand('copy');ok();}catch(err){msgAg('Não foi possível copiar. Use Exportar CSV.',true);}document.body.removeChild(t);};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(ok,plano);else plano();
  }
}

// ---------- Exportar / imprimir ----------
function linhasAgendaAg(c){
  var pos=new Map();rowsAg.forEach(function(r,i){pos.set(r,i);});
  var out=[];
  c.list.forEach(function(r){
    var ix=pos.get(r);if(!ocupaAg(r,ix))return;
    var d=propostaAg[ix]||dateAg(r['Data agendada']);if(!d)return;
    var t=c.turnos[ix];
    out.push({prof:(c.uc&&nomeProfAg(r,c.uc))||'Sem profissional identificado',data:d,turno:t?t.rotulo:'',tclasse:t?t.classe:'',nome:String(r.Nome||''),ult:ultimoDeAg(r,c.uc),sit:propostaAg[ix]?'Proposta (não salva)':(r.Situação||'Pendente'),at:r.Atendimentos,total:r.Total});
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
  var cab=['Profissional','Data','Dia da semana','Turno','Nome','Último atendimento','Situação','Atendimentos'];
  var txt=[cab].concat(linhas.map(function(l){return [l.prof,brAg(l.data),diaSemAg(l.data),l.turno,l.nome,brAg(l.ult),l.sit,l.at];})).map(function(r){return r.map(csvCelAg).join(';');}).join('\r\n');
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
  mesesSelAg=[];mesesSigAg='';
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
  var mModo=document.getElementById('agendamentosMesesModo');
  if(mModo){mModo.value=mesesModoAg;mModo.addEventListener('change',function(){mesesModoAg=mModo.value==='ultimo'?'ultimo':'qualquer';mesesSigAg='';refiltrarAg();});}
  var mBox=document.getElementById('agendamentosMesesLista');
  if(mBox)mBox.addEventListener('change',function(e){var cb=e.target.closest('input[data-mes]');if(!cb)return;var m=cb.dataset.mes,i=mesesSelAg.indexOf(m);if(cb.checked&&i<0)mesesSelAg.push(m);else if(!cb.checked&&i>=0)mesesSelAg.splice(i,1);mesesSigAg='';refiltrarAg();});
  var mLimpa=document.getElementById('agendamentosMesesLimpar');
  if(mLimpa)mLimpa.addEventListener('click',function(){mesesSelAg=[];mesesSigAg='';var d=document.getElementById('agendamentosMeses');if(d)d.open=false;refiltrarAg();});
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
  // Três botões na mesma linha abrem um painel por vez (os <details> continuam sendo o painel; só o título deles fica oculto).
  var paineisAg=[['agBtnVagas','agendamentosVagas'],['agBtnConfig','agendamentosConfig'],['agBtnFolgas','agendamentosFolgas']];
  function sincPaineisAg(){paineisAg.forEach(function(p){var b=document.getElementById(p[0]),d=document.getElementById(p[1]);if(!b||!d)return;var on=!!d.open;b.classList.toggle('agendamentos-secundario',!on);b.setAttribute('aria-expanded',on?'true':'false');});}
  paineisAg.forEach(function(p){
    var b=document.getElementById(p[0]);if(!b)return;
    b.addEventListener('click',function(){
      var alvo=document.getElementById(p[1]),abrir=!!alvo&&!alvo.open;
      paineisAg.forEach(function(q){var d=document.getElementById(q[1]);if(d)d.open=false;});
      if(alvo&&abrir)alvo.open=true;
      sincPaineisAg();
    });
  });
  sincPaineisAg();
  var dc=document.getElementById('agendamentosConfig');
  if(dc){
    dc.addEventListener('toggle',function(){if(dc.open)renderConfigAg();});
    var gm=document.getElementById('agCfgM'),gt=document.getElementById('agCfgT'),gj=document.getElementById('agCfgJanela');
    if(gm)gm.addEventListener('change',function(){cfgAg.m=numAg(gm.value,6,0);configMudouAg();});
    if(gt)gt.addEventListener('change',function(){cfgAg.t=numAg(gt.value,6,0);configMudouAg();});
    if(gj)gj.addEventListener('change',function(){cfgAg.janela=numAg(gj.value,0,0);configMudouAg();});
    dc.querySelectorAll('.agendamentos-cfg-dias input').forEach(function(cb){cb.addEventListener('change',function(){cfgAg.dias[Number(cb.dataset.dia)]=cb.checked?1:0;configMudouAg();});});
    dc.querySelectorAll('.agendamentos-cfg-manha input').forEach(function(cb){cb.addEventListener('change',function(){cfgAg.soManha[Number(cb.dataset.dia)]=cb.checked?1:0;configMudouAg();});});
    var rdb=document.getElementById('agCfgRedist');
    if(rdb)rdb.addEventListener('change',function(){cfgAg.redistribuir=rdb.checked;propostaAg={};atualizarBotoesGeracaoAg();renderAg();gerarAg(true);});   // só nesta sessão (não é salvo)
    var pr=document.getElementById('agCfgProf');
    // Botão "Atualizar" ao lado do profissional: redistribui só essa agenda (uma vez), sem mexer na caixa global.
    if(pr)pr.addEventListener('click',function(e){
      var b=e.target.closest('button[data-redist]');if(!b||busyAg)return;
      var tr=b.closest('tr[data-k]'),nome=tr?tr.querySelector('.agendamentos-nome').firstChild.textContent.trim():'';
      redistProfAg=b.dataset.redist;propostaAg={};
      try{gerarAg(true);}finally{redistProfAg='';}
      if(!Object.keys(propostaAg).length)msgAg('Nada a mudar em '+nome+': as datas já agendadas seguem a configuração atual (ou estão antes da data de Início).',false);
    });
    // Editor de regras de atendimento (linha logo abaixo da agenda)
    function salvarRegrasAg(k,o){if(o.regras&&!o.regras.length)delete o.regras;if(Object.keys(o).length)cfgAg.prof[k]=o;else delete cfgAg.prof[k];}
    if(pr)pr.addEventListener('click',function(e){
      var t=e.target.closest('button');if(!t)return;
      if(t.dataset.regrasToggle!==undefined){var kk=t.dataset.regrasToggle,un=t.dataset.un||'';if(regrasAbertasAg[kk]&&(regrasUnidPadraoAg[kk]||'')!==un){regrasUnidPadraoAg[kk]=un;}else{regrasAbertasAg[kk]=!regrasAbertasAg[kk];regrasUnidPadraoAg[kk]=un;}renderConfigAg();return;}
      var tr=t.closest('tr[data-kr]');if(!tr)return;
      var k=tr.dataset.kr,o=cfgAg.prof[k]||{};o.regras=Array.isArray(o.regras)?o.regras:[];
      if(t.dataset.rfAdd){o.regras.push({unid:regrasUnidPadraoAg[k]||'',dia:1,freq:'1',turno:'ambos'});}
      else if(t.dataset.rfDel!==undefined){o.regras.splice(Number(t.dataset.rfDel),1);}
      else if(t.dataset.rfLimpar){var uf=regrasUnidPadraoAg[k]||'';o.regras=uf?o.regras.filter(function(r){return !(r.unid&&unidCasaAg(r.unid,uf));}):[];}
      else return;
      cfgAg.prof[k]=o;salvarRegrasAg(k,o);profCacheAg=null;renderConfigAg();configMudouAg();
    });
    if(pr)pr.addEventListener('change',function(e){
      var tr=e.target.closest('tr[data-kr]');if(!tr||!e.target.dataset.rf)return;
      var box=e.target.closest('.ag-regra'),k=tr.dataset.kr,o=cfgAg.prof[k]||{},r=o.regras&&o.regras[Number(box.dataset.i)];if(!r)return;
      var f=e.target.dataset.rf,v=e.target.value,estrutura=false;
      if(f==='unid'){r.unid=v;estrutura=true;}
      else if(f==='dia'){r.dia=Number(v);estrutura=true;}
      else if(f==='freq'){r.freq=v;if(v==='mes'){if(!Array.isArray(r.sem)||!r.sem.length)r.sem=[1,3];delete r.desde;}else{delete r.sem;if((parseInt(v,10)||1)>1&&!r.desde)r.desde=proximaDataDiaAg(r.dia);else if((parseInt(v,10)||1)<2)delete r.desde;}estrutura=true;}
      else if(f==='desde'){r.desde=v;estrutura=true;}
      else if(f==='sem'){var n=Number(e.target.dataset.n),a=(r.sem||[]).filter(function(x){return x!==n;});if(e.target.checked)a.push(n);r.sem=a.sort();estrutura=true;}
      else if(f==='turno'){r.turno=v;}
      else if(f==='m'||f==='t'){if(v==='')delete r[f];else r[f]=numAg(v,0,0);}
      cfgAg.prof[k]=o;profCacheAg=null;
      if(estrutura)renderConfigAg();
      configMudouAg();
    });
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
    var df=document.getElementById('agendamentosFolgas');
    if(df){
      df.addEventListener('toggle',function(){if(df.open)renderFolgasAg();});
      var bf=document.getElementById('agFerAdd'),bl=document.getElementById('agFaltaAdd'),ls=document.getElementById('agFolgasLista');
      if(bf)bf.addEventListener('click',addFeriadoAg);
      if(bl)bl.addEventListener('click',addFaltaAg);
      var bg=document.getElementById('agFolgaAdd');if(bg)bg.addEventListener('click',addFolgaAg);
      var af=document.getElementById('agAfetados');if(af)af.addEventListener('click',cliqueAfetadosAg);
      var bc=document.getElementById('agConsultaBtn');if(bc)bc.addEventListener('click',consultarDiaAg);
      if(ls)ls.addEventListener('click',function(e){
        var b=e.target.closest('button[data-folga]');if(!b)return;
        removerBloqueioAg(b.dataset.folga==='f'?cfgAg.feriados:(b.dataset.folga==='g'?cfgAg.folgas:cfgAg.faltas),Number(b.dataset.i));
      });
    }
    var rs=document.getElementById('agCfgReset');
    if(rs)rs.addEventListener('click',function(){cfgAg={m:6,t:6,dias:DIAS_UTEIS_AG.slice(),janela:0,prof:{},soManha:[0,0,0,0,0,1,0],feriados:cfgAg.feriados,faltas:cfgAg.faltas,folgas:cfgAg.folgas,redistribuir:false};renderConfigAg();configMudouAg();});
  }
  document.getElementById('agendamentosAtualizar').addEventListener('click',loadAg);
  var btnTestarHist=document.getElementById('agendamentosTestarHist');if(btnTestarHist)btnTestarHist.addEventListener('click',testarHistoricoAg);var btnImpHist=document.getElementById('agendamentosImportarHist');if(btnImpHist)btnImpHist.addEventListener('click',importarHistoricoAg);document.getElementById('agendamentosSincronizar').addEventListener('click',syncAg);
  // Mudou o filtro em Pessoas atendidas: só importa se a aba está seguindo aquela lista.
  window.addEventListener('emulti:pessoas-filtro',function(){
    if(!seguirListaAg())return;
    var painel=document.getElementById('tabAgendamentos');
    if(painel&&painel.classList.contains('active'))refiltrarAg();
    else if(Object.keys(propostaAg).length){propostaAg={};atualizarBotoesGeracaoAg();}
  });
  var ini=document.getElementById('agendamentosInicio');if(ini)ini.value=isoAg(diaUtilAg(amanhaAg()));
  document.getElementById('agendamentosGerar').addEventListener('click',function(){gerarAg(false);});
  var rfEl=document.getElementById('agendamentosReagendar');if(rfEl)rfEl.addEventListener('click',reagendarFaltososAg);
  document.getElementById('agendamentosSalvarGerados').addEventListener('click',salvarGeradosAg);
  document.getElementById('agendamentosDescartar').addEventListener('click',descartarAg);
  document.querySelector('.tab[data-tab="agendamentos"]').addEventListener('click',loadAg);
  b.addEventListener('click',function(e){var btn=e.target.closest('[data-ag-save]');if(btn)saveAg(btn.closest('tr'));});
  b.addEventListener('change',function(e){
    if(e.target.dataset.ag==='situacao')saveAg(e.target.closest('tr'));
    // Ajuste manual da data de uma linha gerada: vale como nova proposta (ainda sem salvar).
    if(e.target.dataset.ag==='dataAgendada'){var tr=e.target.closest('tr'),ix=Number(tr.dataset.agIx);if(propostaAg[ix]!==undefined){if(e.target.value){var ucm=profMapAg(),dm=e.target.value;if(ucm&&chaveProfAg(rowsAg[ix],ucm)){var lv=proximaVagaAg(ix,dm,ucm);if(lv!==dm){dm=lv;msgAg('Dia lotado: a data passou para o próximo dia com vaga ('+brAg(lv)+').',false);}}propostaAg[ix]=dm;}else delete propostaAg[ix];atualizarBotoesGeracaoAg();renderAg();}}
  });
  b.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.matches('input[data-ag]')){e.preventDefault();saveAg(e.target.closest('tr'));}});
});
