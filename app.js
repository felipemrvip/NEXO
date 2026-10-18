'use strict';
const LEGACY_KEY='nexo-pwa-data-v1';let activeKey=null;const today=()=>new Date().toISOString().slice(0,10);
const demo={transactions:[],clients:[],jobs:[],cards:[]};
let storageProblem=false,tabLocked=true;let data={...structuredClone(demo),openingBalance:0};let lastSaved=structuredClone(data);
let page='home',scope='geral',period='6m',modal=null;
const app=document.getElementById('app');const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const save=()=>{try{if(storageProblem||tabLocked||!activeKey)throw Error('Entre em uma conta autorizada antes de editar.');localStorage.setItem(activeKey,JSON.stringify(data));lastSaved=structuredClone(data);window.dispatchEvent(new Event('nexo:changed'))}catch(e){data=structuredClone(lastSaved);alert('Não foi possível salvar. '+e.message+' Faça backup antes de continuar.')}};const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random());const clientName=id=>data.clients.find(c=>c.id===id)?.name||'Cliente não encontrado';const visible=()=>data.transactions.filter(x=>scope==='geral'||x.scope===scope);const totals=()=>({income:visible().filter(x=>x.kind==='in').reduce((s,x)=>s+x.amount,0),expense:visible().filter(x=>x.kind==='out').reduce((s,x)=>s+x.amount,0)});
const uiIcon=name=>{const shapes={
 home:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/>',
 jobs:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13a21 21 0 0 0 18 0"/>',
 transactions:'<path d="M3 7h18M6 3l-3 4 3 4"/><path d="M21 17H3m15-4 3 4-3 4"/>',
 cards:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 10h20M6 16h5"/>',
 clients:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 backup:'<path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 17v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3"/>',
 settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.07.07-1.86 1.86-.07-.07A1.7 1.7 0 0 0 16 18.4a1.7 1.7 0 0 0-1 .61l-.06.07h-2.88L12 19a1.7 1.7 0 0 0-2-.6 1.7 1.7 0 0 0-.93.6l-.06.08H6.13l-1.86-1.87.07-.07A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.61-1l-.07-.06v-2.88l.07-.06A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.33-1.88L4.2 7.05 6.06 5.2l.07.06A1.7 1.7 0 0 0 8 5.6a1.7 1.7 0 0 0 1-.61l.06-.07h2.88l.06.07a1.7 1.7 0 0 0 2 .61 1.7 1.7 0 0 0 .93-.61l.06-.07h2.88l1.86 1.87-.07.07A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .61 1l.07.06v2.88l-.07.06a1.7 1.7 0 0 0-.61 2Z"/>'
 };return `<svg class="ui-icon" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]||''}</svg>`};
function filters(){return `<div class="filters">${[['geral','Geral'],['pessoal','Pessoal'],['profissional','Profissional']].map(([id,label])=>`<button data-scope="${id}" class="${scope===id?'active':''}">${label}</button>`).join('')}</div>`}
function flow(){
 const now=new Date(),monthly=period==='6m',buckets=[];
 if(monthly){
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');buckets.push({key,label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),income:0,expense:0})}
 }else{
  const todayLocal=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const weekday=(todayLocal.getDay()+6)%7;
  const currentMonday=new Date(todayLocal);currentMonday.setDate(todayLocal.getDate()-weekday);
  for(let i=3;i>=0;i--){const d=new Date(currentMonday);d.setDate(currentMonday.getDate()-i*7);buckets.push({start:d,label:'S'+(4-i),income:0,expense:0})}
 }
 const missing=visible().filter(t=>!/^\d{4}-\d{2}-\d{2}$/.test(t.date)).length;
 for(const t of visible()){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(t.date))continue;
  let bucket;
  if(monthly){bucket=buckets.find(b=>b.key===t.date.slice(0,7))}
  else{const d=new Date(t.date+'T12:00:00');bucket=buckets.find((b,i)=>d>=b.start&&(i===buckets.length-1||d<buckets[i+1].start))}
  if(bucket)bucket[t.kind==='in'?'income':'expense']+=Number(t.amount)||0;
 }
 const max=Math.max(1,...buckets.flatMap(b=>[b.income,b.expense]));
 const points=kind=>buckets.map((b,i)=>[20+i*300/(buckets.length-1),148-b[kind]/max*115]);
 const path=kind=>points(kind).map(([x,y],i)=>(i?'L':'M')+' '+x.toFixed(2)+' '+y.toFixed(2)).join(' ');
 const hasData=buckets.some(b=>b.income||b.expense);
 return `<div class="panel"><div class="row"><div><h3>Fluxo financeiro</h3><span class="label">Dados dos seus lançamentos</span></div><button class="btn tiny ghost" data-period="${monthly?'4w':'6m'}">${monthly?'6 meses':'4 semanas'} ⇄</button></div>${hasData?`<svg class="chart" viewBox="0 0 340 175" role="img" aria-label="Receitas e despesas reais por ${monthly?'mês':'semana'}">${[33,71,109,148].map(y=>`<line x1="12" x2="328" y1="${y}" y2="${y}" stroke="#363942" stroke-dasharray="4 5"/>`).join('')}<path d="${path('income')}" fill="none" stroke="#ff922f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="${path('expense')}" fill="none" stroke="#f05243" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${buckets.map((b,i)=>`<text x="${20+i*300/(buckets.length-1)}" y="169" fill="#9297a2" text-anchor="middle" font-size="11">${esc(b.label)}</text>`).join('')}</svg>`:'<p class="empty">Nenhuma movimentação com data neste período.</p>'}<div class="legend"><span><i class="dot" style="background:#ff922f"></i>Receitas</span><span><i class="dot" style="background:#f05243"></i>Despesas</span></div>${missing?`<p class="muted small">Existem ${missing} movimentação(ões) sem data. Edite-as para incluí-las no gráfico.</p>`:''}</div>`
}
function donut(){const {income,expense}=totals(),total=income+expense,p=total?income/total:0,r=73,c=2*Math.PI*r;return `<div class="panel"><h3>Distribuição financeira</h3><svg class="donut" viewBox="0 0 200 200" role="img" aria-label="Receitas ${Math.round(p*100)}%, despesas ${Math.round((total?1-p:0)*100)}%"><circle cx="100" cy="100" r="73" stroke="#343741" stroke-width="22" fill="none"/>${total?`<circle cx="100" cy="100" r="73" stroke="#ff922f" stroke-width="22" fill="none" stroke-dasharray="${p*c} ${c}" transform="rotate(-90 100 100)"/><circle cx="100" cy="100" r="73" stroke="#f05243" stroke-width="22" fill="none" stroke-dasharray="${(1-p)*c} ${c}" stroke-dashoffset="${-p*c}" transform="rotate(-90 100 100)"/>`:''}<text x="100" y="95" fill="#a4a8b2" font-size="12" text-anchor="middle">Movimentado</text><text x="100" y="121" fill="white" font-size="20" font-weight="700" text-anchor="middle">${total.toLocaleString('pt-BR',{maximumFractionDigits:0})}</text></svg><div class="legend"><span><i class="dot" style="background:#ff922f"></i>Receitas ${Math.round(p*100)}%</span><span><i class="dot" style="background:#f05243"></i>Despesas ${Math.round((total?1-p:0)*100)}%</span></div></div>`}
function home(){
 const {income,expense}=totals(),pending=data.cards.filter(c=>!c.paid).reduce((s,c)=>s+c.amount,0);
 const activeJobs=data.jobs.filter(j=>jobDue(j)>0);
 const dateLabel=new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
 return `<div class="head">
  <div class="head-kicker"><span class="kicker-dot"></span>PAINEL DE CONTROLE<span class="head-date">${esc(dateLabel.toUpperCase())}</span></div>
  <h1>Seu dinheiro. <span class="orange">Seu controle.</span></h1>
  <div class="muted">Uma visão clara das suas finanças e dos seus projetos.</div>
 </div>
 ${filters()}
 <section class="hero" aria-label="Resumo financeiro">
  <div class="hero-top row"><div class="hero-label"><span class="hero-pulse"></span>SALDO ATUAL</div><button class="balance-edit" data-edit-balance aria-label="Editar saldo inicial">✎ Editar saldo</button></div>
  <div class="amount">${money(data.openingBalance+income-expense)}</div>
  <div class="herofoot">
   <div>↗ Receitas registradas<b>${money(income)}</b></div>
   <div>↘ Despesas registradas<b>${money(expense)}</b></div>
  </div>
  <div class="hero-toolbar"><button class="btn" data-add="transactions">＋ Nova movimentação</button><button class="btn ghost" data-page="transactions">Ver finanças ↗</button></div>
 </section>
 <div class="dashboard">
  <div class="grid2 wide summary-grid">
   <div class="panel"><span class="iconbox">${uiIcon("jobs")}</span><div class="stat">${activeJobs.length}</div><div class="label">Trabalhos a receber</div></div>
   <div class="panel"><span class="iconbox">${uiIcon("cards")}</span><div class="stat" style="font-size:22px">${money(pending)}</div><div class="label">Faturas a pagar</div></div>
  </div>
  <div class="wide analytics-grid">${flow()}${donut()}</div>
  <section class="wide">
   <div class="section"><h2>Projetos com pagamento pendente</h2><button class="btn tiny ghost" data-page="jobs">Ver todos →</button></div>
   ${activeJobs.slice(0,3).map(j=>`<div class="listcard"><div class="row"><div><strong>${esc(j.name)}</strong><p class="muted small">${esc(clientName(j.clientId))}</p></div><b class="orange">${money(jobDue(j))} pendentes</b></div></div>`).join('')||'<p class="empty">Não há trabalhos com pagamento pendente. Adicione seu primeiro trabalho.</p>'}
  </section>
 </div>
 <div class="notice">Seu saldo é calculado a partir do saldo inicial informado e das movimentações cadastradas. O gráfico considera somente lançamentos com data.</div>`
}
function transactions(){const {income,expense}=totals();return `<div class="head"><div class="eyebrow orange">FINANCEIRO</div><h1>Seu dinheiro.</h1><div class="muted">Controle suas movimentações.</div></div>${filters()}<div class="grid2"><div class="panel finance-income-panel"><div class="label">Receitas</div><div class="stat" style="font-size:21px">${money(income)}</div></div><div class="panel finance-expense-panel"><div class="label">Despesas</div><div class="stat" style="font-size:21px">${money(expense)}</div></div></div>${donut()}<div class="section"><h2>Movimentações</h2><button class="btn" data-add="transactions">+ Nova</button></div>${visible().map(t=>`<div class="listcard row"><div><strong>${esc(t.name)}</strong><p class="muted small">${t.scope==='pessoal'?'Pessoal':'Profissional'}${t.date?' · '+esc(t.date.split('-').reverse().join('/')):' · Sem data'}</p></div><div style="text-align:right"><b class="${t.kind==='in'?'money-in':'money-out'}">${t.kind==='in'?'+':'−'}${money(t.amount)}</b><div class="actions" style="margin-top:8px"><button data-edit="transactions:${t.id}">Editar</button><button class="delete" data-delete="transactions:${t.id}">Excluir</button></div></div></div>`).join('')||'<p class="empty">Nenhuma movimentação.</p>'}<div class="section"><h2>Cartões de crédito</h2><button class="btn tiny ghost" data-page="cards">Ver cartões →</button></div><div class="panel row"><div><div class="label">Faturas pendentes</div><div class="stat" style="font-size:22px">${money(data.cards.filter(c=>!c.paid).reduce((s,c)=>s+c.amount,0))}</div></div><span class="iconbox">${uiIcon("cards")}</span></div>`}
const jobPaid=j=>Math.max(0,Math.min(Number(j.amount)||0,Number(j.paidAmount)||0));
const jobDue=j=>Math.max(0,Math.round(((Number(j.amount)||0)-jobPaid(j))*100)/100);
const jobStatus=j=>['andamento','feito','urgente'].includes(j.status)?j.status:'andamento';
const jobStatusLabel=j=>({andamento:'Em andamento',feito:'Feito',urgente:'Urgente'})[jobStatus(j)];
function removeJobIncome(j,amount){
 let remaining=Math.round(amount*100);
 for(const t of [...data.transactions].filter(t=>t.jobId===j.id&&t.jobAuto&&t.kind==='in').reverse()){
  if(remaining<=0)break;
  const cents=Math.round(t.amount*100),deduct=Math.min(cents,remaining);
  if(deduct===cents)data.transactions=data.transactions.filter(x=>x.id!==t.id);
  else t.amount=(cents-deduct)/100;
  remaining-=deduct;
 }
 return remaining/100;
}
function setJobPaid(j,newPaid){
 const oldPaid=Math.round(jobPaid(j)*100),target=Math.round(newPaid*100),delta=target-oldPaid;
 if(delta<0){const available=data.transactions.filter(t=>t.jobId===j.id&&t.jobAuto&&t.kind==='in').reduce((s,t)=>s+Math.round(t.amount*100),0);if(available < -delta)throw Error('Não foi possível localizar todos os lançamentos do trabalho. Confira as movimentações antes de reduzir o valor recebido.');removeJobIncome(j,-delta/100)}
 if(delta>0)recordJobIncome(j,delta/100);
 j.paidAmount=target/100;
}
function detachJobTransaction(t){
 if(t.jobAuto&&t.jobId&&t.kind==='in'){
  const j=data.jobs.find(j=>j.id===t.jobId);
  if(j)j.paidAmount=Math.max(0,Math.round((jobPaid(j)-t.amount)*100)/100);
 }
}

function recordJobIncome(j,amount){
 const cents=Math.round(amount*100);
 if(cents<=0)return;
 data.transactions.unshift({id:uid(),name:'Pagamento: '+j.name+' — '+clientName(j.clientId),amount:cents/100,date:today(),kind:'in',scope:'profissional',jobId:j.id,jobAuto:true});
}
function receiveJob(j,amount){
 const cents=Math.round(amount*100);
 if(!Number.isFinite(amount)||cents<=0||cents>Math.round(jobDue(j)*100))throw Error('Pagamento inválido.');
 setJobPaid(j,jobPaid(j)+cents/100);
}

function jobs(){const due=data.jobs.reduce((sum,j)=>sum+jobDue(j),0);return `<div class="head"><div class="eyebrow orange">PRODUTIVIDADE</div><h1>Seus projetos.</h1><div class="muted">Gerencie trabalhos, sinais e pagamentos.</div></div><div class="grid2"><div class="panel"><div class="stat">${data.jobs.length}</div><div class="label">Projetos</div></div><div class="panel"><div class="stat">${money(due)}</div><div class="label">Total a receber</div></div></div><div class="section"><h2>Todos os trabalhos</h2><button class="btn" data-add="jobs">+ Novo</button></div>${[['urgente','Urgentes'],['andamento','Em andamento'],['feito','Feitos']].map(([status,label])=>{const items=data.jobs.filter(j=>jobStatus(j)===status);return `<section class="job-group job-group-${status}"><div class="job-group-title"><h2>${status==='urgente'?'⚡ ':status==='feito'?'✓ ':'◷ '}${label}</h2><span>${items.length} ${items.length===1?'trabalho':'trabalhos'}</span></div>${items.map(j=>`<div class="listcard"><div class="row"><div><strong>${esc(j.name)}</strong><p class="muted small">${esc(clientName(j.clientId))}</p></div><b>${money(j.amount)}</b></div><div class="job-payments"><div><span class="muted small">Recebido</span><strong>${money(jobPaid(j))}</strong></div><div><span class="muted small">Falta receber</span><strong class="${jobDue(j)===0?'job-settled':'orange'}">${money(jobDue(j))}</strong></div></div><div class="row"><span class="job-status ${jobDue(j)===0?'paid':'pending'}">${jobDue(j)===0?'✓ Pago':jobPaid(j)>0?'◐ Parcialmente pago':'○ Aguardando pagamento'}</span><div class="actions">${jobDue(j)>0?`<button data-job-payment="${esc(j.id)}">+ Receber</button><button data-job-settle="${esc(j.id)}">Marcar pago</button>`:''}</div></div><div class="row"><label class="job-status-control">Situação do trabalho <select data-job-status="${esc(j.id)}" aria-label="Situação do trabalho ${esc(j.name)}"><option value="andamento" ${jobStatus(j)==='andamento'?'selected':''}>Em andamento</option><option value="feito" ${jobStatus(j)==='feito'?'selected':''}>Feito</option><option value="urgente" ${jobStatus(j)==='urgente'?'selected':''}>Urgente</option></select></label><div class="actions"><button data-edit="jobs:${esc(j.id)}">Editar</button><button class="delete" data-delete="jobs:${esc(j.id)}">Excluir</button></div></div></div>`).join('')||'<p class="empty job-empty">Nenhum trabalho nesta categoria.</p>'}</section>`}).join('')}`}
function clients(){return `<div class="head"><div class="eyebrow orange">RELACIONAMENTOS</div><h1>Seus clientes.</h1><div class="muted">Organize seus contatos profissionais.</div></div><div class="section"><h2>${data.clients.length} clientes</h2><button class="btn" data-add="clients">+ Novo</button></div>${data.clients.map(c=>`<div class="listcard"><div class="row"><div><strong>${esc(c.name)}</strong><p class="muted small">${esc(c.contact||'Sem contato')}</p></div><span class="iconbox">${uiIcon("transactions")}</span></div><div class="barline"></div><div class="row"><span class="label">Trabalhos vinculados: ${data.jobs.filter(j=>j.clientId===c.id).length}</span><div class="actions"><button data-edit="clients:${c.id}">Editar</button><button class="delete" data-delete="clients:${c.id}">Excluir</button></div></div></div>`).join('')||'<p class="empty">Nenhum cliente cadastrado.</p>'}`}

function parseNubankCSV(text){
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
 const parse=line=>{let fields=[],v='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){v+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){fields.push(v);v=''}else v+=c}if(quoted)throw Error('CSV inválido');fields.push(v);return fields};
 if(lines.length<2||lines.length>10000)throw Error('Arquivo vazio ou grande demais.');
 if(parse(lines.shift()).map(x=>x.trim().toLowerCase()).join('|')!=='date|title|amount')throw Error('Colunas esperadas: date,title,amount');
 const counts=new Map();
 return lines.map((line,i)=>{const [date,title,raw,...extra]=parse(line);if(extra.length||!date||!title||!raw||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Linha '+(i+2)+' inválida');const amount=raw.replace(/\s/g,'');if(!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(amount))throw Error('Valor inválido na linha '+(i+2));const cents=Math.round(Number(amount.replace(/\./g,'').replace(',','.'))*100);const fingerprint=JSON.stringify([date,title,cents]);const count=(counts.get(fingerprint)||0)+1;counts.set(fingerprint,count);return {date,title,cents,key:fingerprint+'#'+count}}).filter(x=>x.cents!==0);
}
function nubankModal(){
 const m=modal,card=data.cards.find(c=>c.nubankInvoice===m.invoice),keys=new Set((card?.nubankPurchases||[]).map(p=>p.key)),rows=m.rows.filter(p=>!keys.has(p.key));
 const relevant=rows.filter(p=>!/pagamento recebido/i.test(p.title)),total=relevant.reduce((n,p)=>n+p.cents,0)/100;
 return '<div class="modalback"><div class="modal"><h2>Importar fatura Nubank</h2><p class="muted small">Vencimento: '+esc(m.invoice.split('-').reverse().join('/'))+' · '+rows.length+' lançamentos novos · '+(m.rows.length-rows.length)+' já importados</p><div class="panel"><div class="label">Alteração prevista na fatura</div><div class="stat">'+money(total)+'</div></div><p class="muted small">Pagamentos recebidos não são contabilizados como compras. Estornos reduzem a fatura. Nenhum valor será lançado em Finanças.</p><div class="nubank-preview">'+(rows.map(p=>'<div class="row"><span>'+esc(p.date)+' · '+esc(p.title)+'</span><strong>'+money(p.cents/100)+'</strong></div>').join('')||'<p class="empty">Nenhum lançamento novo.</p>')+'</div><div class="modalfooter"><button class="btn ghost" data-close>Cancelar</button><button class="btn" data-nubank-confirm '+(!rows.length?'disabled':'')+'>Confirmar importação</button></div></div></div>';
}
function nubankConfirm(){
 const m=modal,card=data.cards.find(c=>c.nubankInvoice===m.invoice),keys=new Set((card?.nubankPurchases||[]).map(p=>p.key)),rows=m.rows.filter(p=>!keys.has(p.key));if(!rows.length)return;
 const amount=rows.filter(p=>!/pagamento recebido/i.test(p.title)).reduce((n,p)=>n+p.cents,0)/100;
 if(card){card.nubankPurchases=[...(card.nubankPurchases||[]),...rows];card.amount=Math.max(0,Math.round((card.amount+amount)*100)/100)}
 else data.cards.unshift({id:uid(),name:'Nubank • '+m.invoice.slice(0,7),due:m.invoice,amount:Math.max(0,Math.round(amount*100)/100),paid:false,nubankInvoice:m.invoice,nubankPurchases:rows});
 modal=null;save();render();alert('Fatura Nubank importada na área Cartões!');
}


let cardListExpanded={},cardSearch={},cardFilter={};
function cardPurchaseType(p){
 const t=String(p.title||'').toLowerCase();
 if(/pagamento\s+recebido/.test(t))return {type:'payment',label:'Pagamento',icon:'↙'};
 if(p.cents<0||/estorno|reembolso/.test(t))return {type:'refund',label:'Estorno',icon:'↩'};
 if(/supermercado|mercado\*|mercearia|atacad|mercantil/.test(t))return {type:'market',label:'Mercado',icon:'▦'};
 if(/academia|fitness|gym/.test(t))return {type:'health',label:'Saúde',icon:'♡'};
 if(/adobe|software|solution|tecnologia|digital|assin|curso|produtora/.test(t))return {type:'digital',label:'Digital',icon:'⌘'};
 if(/shopee|aliexpress|loja|shop/.test(t))return {type:'shopping',label:'Compras',icon:'▤'};
 return {type:'other',label:'Outros',icon:'◈'};
}
function cardPurchaseName(title){
 return String(title||'').replace(/\s*-\s*Parcela\s+\d+\s*\/\s*\d+\s*$/i,'').replace(/\s+/g,' ').trim();
}
function cardPurchaseInstallment(title){const m=String(title||'').match(/Parcela\s+(\d+)\s*\/\s*(\d+)/i);return m?m[1]+'/'+m[2]+' parcelas':null}
function cardPurchaseList(c){
 const rows=Array.isArray(c.nubankPurchases)?c.nubankPurchases:[];
 if(!rows.length)return '';
 const sorted=[...rows].sort((a,b)=>b.date.localeCompare(a.date));
 const expanded=!!cardListExpanded[c.id],query=(cardSearch[c.id]||'').trim().toLocaleLowerCase('pt-BR'),filter=cardFilter[c.id]||'all';
 const filtered=sorted.filter(p=>{const type=cardPurchaseType(p);return (filter==='all'||(filter==='installments'?!!cardPurchaseInstallment(p.title):filter==='credits'?['payment','refund'].includes(type.type):filter===type.type))&&(!query||p.title.toLocaleLowerCase('pt-BR').includes(query)||type.label.toLocaleLowerCase('pt-BR').includes(query))});
 const visibleRows=expanded?filtered:filtered.slice(0,5),purchases=rows.filter(p=>p.cents>0&&!/pagamento\s+recebido/i.test(p.title)).length,refunds=rows.filter(p=>cardPurchaseType(p).type==='refund').length,payments=rows.filter(p=>cardPurchaseType(p).type==='payment').length;
 return '<div class="card-purchases"><div class="card-purchase-head"><div><h3>Movimentações</h3><span>'+rows.length+' lançamentos importados</span></div><span class="card-purchase-count">'+purchases+' compras · '+refunds+' estornos'+(payments?' · '+payments+' pagamentos':'')+'</span></div><div class="card-purchase-tools"><label class="card-search-wrap"><span aria-hidden="true">⌕</span><input type="search" data-card-search="'+esc(c.id)+'" placeholder="Buscar estabelecimento" aria-label="Buscar lançamentos deste cartão" value="'+esc(cardSearch[c.id]||'')+'"></label><select data-card-filter="'+esc(c.id)+'" aria-label="Filtrar lançamentos"><option value="all" '+(filter==='all'?'selected':'')+'>Todos</option><option value="installments" '+(filter==='installments'?'selected':'')+'>Parcelados</option><option value="credits" '+(filter==='credits'?'selected':'')+'>Estornos e pagamentos</option><option value="market" '+(filter==='market'?'selected':'')+'>Mercado</option><option value="digital" '+(filter==='digital'?'selected':'')+'>Digital</option><option value="shopping" '+(filter==='shopping'?'selected':'')+'>Compras</option><option value="health" '+(filter==='health'?'selected':'')+'>Saúde</option><option value="other" '+(filter==='other'?'selected':'')+'>Outros</option></select></div><div class="card-purchase-items">'+(visibleRows.map(p=>{const kind=cardPurchaseType(p),installment=cardPurchaseInstallment(p.title);return '<div class="card-purchase-row"><span class="card-purchase-icon card-kind-'+kind.type+'" aria-hidden="true">'+kind.icon+'</span><div class="card-purchase-main"><strong title="'+esc(p.title)+'">'+esc(cardPurchaseName(p.title))+'</strong><div class="card-purchase-meta"><span>'+esc(p.date.split('-').reverse().join('/'))+'</span><span class="card-category">'+esc(kind.label)+'</span>'+(installment?'<span class="card-installment">'+esc(installment)+'</span>':'')+'</div></div><strong class="card-purchase-amount '+(p.cents<0?'card-credit':'')+'">'+(p.cents<0?'− ':'')+money(Math.abs(p.cents)/100)+'</strong></div>'}).join('')||'<p class="empty">Nenhum lançamento encontrado.</p>')+'</div>'+(filtered.length>5?'<button class="card-show-more" data-card-expand="'+esc(c.id)+'">'+(expanded?'Mostrar menos ↑':'Ver todos os '+filtered.length+' lançamentos ↓')+'</button>':'')+'</div>';
}
function cards(){
 const pending=data.cards.filter(c=>!c.paid).reduce((s,c)=>s+Number(c.amount||0),0);
 return '<div class="head"><div class="eyebrow orange">FINANÇAS / CARTÕES</div><h1>Seus cartões.</h1><div class="muted">Faturas organizadas, compras sob controle.</div></div><section class="cards-overview"><div><span class="cards-overview-label">TOTAL DE FATURAS PENDENTES</span><div class="cards-overview-value">'+money(pending)+'</div><span class="cards-overview-caption">'+data.cards.filter(c=>!c.paid).length+' fatura(s) em aberto · '+data.cards.length+' cartão(ões) cadastrado(s)</span></div><span class="cards-overview-symbol" aria-hidden="true">▤</span></section><div class="section cards-section"><h2>Minhas faturas</h2><div class="actions"><button class="btn ghost" data-nubank-select>↥ Importar CSV Nubank</button><button class="btn" data-add="cards">+ Adicionar</button></div><input id="nexo-nubank-file" type="file" accept=".csv,text/csv" hidden></div>'+ (data.cards.map(c=>'<article class="card-invoice"><div class="card-invoice-header"><div class="card-invoice-identity"><span class="card-invoice-brand" aria-hidden="true">▤</span><div><h2>'+esc(c.nubankInvoice?'Nubank':c.name)+'</h2><span>'+(c.nubankInvoice?'Fatura '+esc(new Date(c.due+'T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})):'Cartão cadastrado')+'</span></div></div><span class="card-invoice-status '+(c.paid?'is-paid':'')+'">'+(c.paid?'✓ Pago':'● Pendente')+'</span></div><div class="card-invoice-summary"><span class="card-invoice-label">VALOR DA FATURA</span><strong class="card-invoice-value">'+money(c.amount)+'</strong><div class="card-invoice-info"><span>▦ Vencimento '+esc(c.due.split('-').reverse().join('/'))+'</span>'+(c.nubankPurchases?.length?'<span>'+c.nubankPurchases.length+' lançamentos</span>':'')+'</div></div>'+cardPurchaseList(c)+'<div class="card-invoice-footer"><div class="actions"><button data-togglecard="'+esc(c.id)+'">'+(c.paid?'↶ Reabrir':'✓ Marcar pago')+'</button><button data-edit="cards:'+esc(c.id)+'">Editar</button><button class="delete" data-delete="cards:'+esc(c.id)+'">Excluir</button></div></div></article>').join('')||'<p class="empty">Nenhum cartão cadastrado. Importe sua fatura Nubank para começar.</p>')+'<div class="notice">Faturas são controladas separadamente das despesas de Finanças. Pagamentos recebidos e estornos aparecem identificados na lista, sem serem tratados como compras.</div>';
}
function field(label,name,value='',type='text',extra=''){return `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`}
function selectField(label,name,options,current){return `<label class="field">${label}<select name="${name}">${options.map(([v,l])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`}
function renderModal(){if(!modal)return '';if(modal.mode==='nubank-import')return nubankModal();if(modal.mode==='balance'){return `<div class="modalback"><form class="modal" id="balance-form"><h2>Editar saldo inicial</h2><p class="muted small">Informe o valor que você já tinha antes das movimentações cadastradas no NEXO. As receitas e despesas serão somadas automaticamente.</p><label class="field">Saldo inicial (R$)<input name="openingBalance" type="number" inputmode="decimal" step="0.01" required value="${data.openingBalance}"></label><div class="modalfooter"><button class="btn ghost" type="button" data-close>Cancelar</button><button class="btn" type="submit">Salvar saldo</button></div></form></div>`}if(modal.mode==='reset'){return `<div class="modalback"><div class="modal"><h2>Começar do zero?</h2><p class="muted">Isso apagará todos os clientes, trabalhos, receitas, despesas e cartões deste dispositivo. Se a sincronização estiver ativa, a exclusão também será enviada à nuvem e aos outros aparelhos. O NEXO continuará instalado.</p><p class="muted small">Antes de continuar, recomendamos usar o botão Backup para guardar uma cópia.</p><label class="field">Para confirmar, digite APAGAR<input id="reset-confirmation" type="text" placeholder="APAGAR" autocomplete="off" autocapitalize="characters"></label><div class="modalfooter"><button class="btn ghost" data-close>Cancelar</button><button class="btn danger" data-confirm-reset>Apagar tudo</button></div></div></div>`}if(modal.mode==='job-payment'){const j=data.jobs.find(x=>x.id===modal.id);if(!j)return '';return `<div class="modalback"><form class="modal" id="job-payment-form"><h2>Registrar pagamento</h2><p class="muted small">${esc(j.name)} — Falta receber ${money(jobDue(j))}. Registre um sinal ou parcela recebida.</p><label class="field">Valor recebido agora (R$)<input name="payment" type="number" inputmode="decimal" min="0.01" max="${jobDue(j)}" step="0.01" required></label><p class="muted small">O pagamento será registrado automaticamente como receita profissional no saldo e nas movimentações. Não cadastre a mesma receita novamente.</p><div class="modalfooter"><button class="btn ghost" type="button" data-close>Cancelar</button><button class="btn" type="submit">Confirmar recebimento</button></div></form></div>`} if(modal.mode==='delete'){return `<div class="modalback"><div class="modal"><h2>Excluir registro?</h2><p class="muted">Deseja excluir <b>${esc(modal.item.name)}</b>? A exclusão será sincronizada se a sincronização estiver ativa. Guarde um backup antes de confirmar.</p><div class="modalfooter"><button class="btn ghost" data-close>Cancelar</button><button class="btn danger" data-confirm-delete>Excluir</button></div></div></div>`}const x=modal.item||{},type=modal.type;let fields=field('Nome / descrição','name',x.name,'text','required maxlength="120"');if(type==='transactions')fields+=field('Valor (R$)','amount',x.amount??'','number','required min="0.01" step="0.01"')+field('Data da movimentação','date',x.date??(modal.item?'':today()),'date','required')+selectField('Tipo','kind',[['out','Despesa'],['in','Receita']],x.kind||'out')+selectField('Área','scope',[['pessoal','Pessoal'],['profissional','Profissional']],x.scope||'pessoal');if(type==='clients')fields+=field('Contato','contact',x.contact||'');if(type==='jobs')fields+=selectField('Cliente','clientId',data.clients.map(c=>[c.id,c.name]),x.clientId||data.clients[0]?.id)+field('Valor contratado (R$)','amount',x.amount??'','number','required min="0" step="0.01"')+field('Valor já recebido / sinal (R$)','paidAmount',x.paidAmount??0,'number','required min="0" step="0.01"');if(type==='cards')fields+=field('Valor da fatura (R$)','amount',x.amount??'','number','required min="0" step="0.01"')+field('Vencimento','due',x.due||today(),'date','required')+selectField('Situação','paid',[['false','Pendente'],['true','Paga']],String(x.paid??false));return `<div class="modalback"><form class="modal" id="edit-form"><h2>${modal.item?'Editar':'Adicionar'} ${({'transactions':'movimentação','jobs':'trabalho','clients':'cliente','cards':'cartão'})[type]}</h2>${fields}<div class="modalfooter"><button class="btn ghost" type="button" data-close>Cancelar</button><button class="btn" type="submit">Salvar</button></div></form></div>`}
function render(){const pages={home,transactions,jobs,clients,cards};app.innerHTML=`<main class="shell"><header class="top"><div class="brand"><img class="logo brand-app-icon" src="./icons/logo-nexo.webp?v=22" width="44" height="44" alt="" aria-hidden="true"><div><strong>nexo</strong><div class="eyebrow">FINANÇAS &amp; PROJETOS</div></div></div><div class="topactions"><button class="btn tiny ghost accountbtn" data-account-open title="Gerenciar conta Google e sincronização" aria-label="Conta e sincronização">${uiIcon('settings')} Conta</button><button class="btn tiny ghost" data-export title="Salvar cópia de segurança">${uiIcon('backup')} Backup</button><button class="btn tiny ghost" data-import title="Importar arquivo de backup do NEXO">${uiIcon('backup')} Importar backup</button><input id="nexo-import-file" type="file" accept=".json,application/json" hidden aria-label="Selecionar backup JSON do NEXO"><button class="btn tiny ghost settingsbtn" data-reset-open title="Configurações: começar do zero" aria-label="Configurações e limpeza de dados">${uiIcon('settings')}</button></div></header>${pages[page]()}<nav class="nav" aria-label="Navegação principal">${[['home','⌂','Início'],['jobs','▣','Trabalhos'],['transactions','◈','Finanças'],['cards','▤','Cartões'],['clients','♙','Clientes']].map(([id,ico,label])=>`<button data-page="${id}" class="${page===id?'active':''}"><span>${uiIcon(id)}</span>${label}</button>`).join('')}</nav></main>${renderModal()}`}
// Importação local: valida antes de substituir; não altera dados até a confirmação.
function validateBackup(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('O arquivo não contém um backup válido do NEXO.');
 const keys=['transactions','clients','jobs','cards'];
 if(keys.some(k=>!Array.isArray(value[k])))throw Error('Backup incompatível: faltam listas de movimentações, clientes, trabalhos ou cartões.');
 if(keys.some(k=>value[k].length>100000))throw Error('Backup grande demais para importar com segurança.');
 for(const k of keys)for(const item of value[k]){
  if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||!item.id||typeof item.name!=='string')throw Error('Backup inválido: registro de '+k+' incompleto.');
  if(['transactions','jobs','cards'].includes(k)&&(!Number.isFinite(item.amount)||item.amount<0))throw Error('Backup inválido: valores financeiros inconsistentes.');
 }
 const opening=value.openingBalance==null?0:value.openingBalance;
 if(typeof opening!=='number'||!Number.isFinite(opening))throw Error('Backup inválido: saldo inicial incorreto.');
 return {...value,openingBalance:opening};
}
app.addEventListener('change',async e=>{
 if(e.target.id!=='nexo-nubank-file')return;
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 if(!activeKey||storageProblem||tabLocked){alert('Entre em sua conta antes de importar.');return}
 try{
 if(file.size>2*1024*1024)throw Error('Arquivo maior que 2 MB');
 const rows=parseNubankCSV(await file.text());
 const match=file.name.match(/20\d{2}-\d{2}-\d{2}/);
 const invoice=match?match[0]:prompt('Vencimento da fatura (AAAA-MM-DD):');
 if(!invoice||!/^20\d{2}-(0[1-9]|1[0-2])-[0-3]\d$/.test(invoice))throw Error('Vencimento inválido');
 modal={mode:'nubank-import',invoice,rows};render();
 }catch(err){alert('Erro ao importar CSV: '+err.message)}
});
app.addEventListener('change',async e=>{
 if(e.target.id!=='nexo-import-file')return;
 const input=e.target,file=input.files?.[0];input.value='';
 if(!file)return;
 if(tabLocked||!activeKey){alert('Entre com uma conta autorizada e use a primeira aba do NEXO antes de importar.');return}
 try{
  if(file.size>10*1024*1024)throw Error('O arquivo excede 10 MB.');
  const next=validateBackup(JSON.parse(await file.text()));
  const counts='Movimentações: '+next.transactions.length+'\nClientes: '+next.clients.length+'\nTrabalhos: '+next.jobs.length+'\nCartões: '+next.cards.length;
  if(!confirm('IMPORTAR BACKUP?\n\n'+counts+'\n\nATENÇÃO: os dados atuais deste dispositivo serão SUBSTITUÍDOS pelos dados do arquivo. Antes de continuar, use o botão Backup para salvar uma cópia dos dados atuais.\n\nDeseja realmente substituir?'))return;
  // Só atualiza a memória após a gravação bem-sucedida no navegador.
  localStorage.setItem(activeKey,JSON.stringify(next));
  data=structuredClone(next);lastSaved=structuredClone(next);storageProblem=false;
  modal=null;page='home';scope='geral';render();
  window.dispatchEvent(new Event('nexo:changed'));
  alert('Backup restaurado com sucesso neste dispositivo!');
 }catch(err){alert('Não foi possível importar o backup. Seus dados anteriores foram mantidos. '+err.message)}
});

app.addEventListener('input',e=>{
 if(!e.target.matches('[data-card-search]'))return;
 const id=e.target.dataset.cardSearch,position=e.target.selectionStart;
 cardSearch[id]=e.target.value;
 const c=data.cards.find(x=>x.id===id);if(!c)return;
 const wrapper=e.target.closest('.card-purchases');
 const replacement=document.createElement('div');replacement.innerHTML=cardPurchaseList(c);
 wrapper.replaceWith(replacement.firstElementChild);
 const input=app.querySelector('[data-card-search="'+CSS.escape(id)+'"]');
 if(input){input.focus();try{input.setSelectionRange(position,position)}catch{}}
});
app.addEventListener('change',e=>{
 if(!e.target.matches('[data-card-filter]'))return;
 cardFilter[e.target.dataset.cardFilter]=e.target.value;render();
});
function closeNexoAccount(){document.getElementById('nexo-account-view').hidden=true;document.body.classList.remove('account-open');document.querySelector('[data-account-open]')?.focus()}
document.getElementById('nexo-account-close').addEventListener('click',closeNexoAccount);
document.getElementById('nexo-account-view').addEventListener('click',e=>{if(e.target.id==='nexo-account-view')closeNexoAccount()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('nexo-account-view').hidden)closeNexoAccount()});
app.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(!activeKey)return;if((storageProblem||tabLocked)&&!['page','scope','period','export','import','close'].some(k=>k in b.dataset)){alert('Edição pausada para preservar seus dados. Use a primeira aba do NEXO ou restaure um backup.');return}if(b.dataset.cardExpand!==undefined){const id=b.dataset.cardExpand;cardListExpanded[id]=!cardListExpanded[id];render();return}if(b.dataset.nubankSelect!==undefined){document.getElementById('nexo-nubank-file')?.click();return}if(b.dataset.nubankConfirm!==undefined){nubankConfirm();return}if(b.dataset.accountOpen!==undefined){const view=document.getElementById('nexo-account-view');view.hidden=false;document.body.classList.add('account-open');document.getElementById('nexo-account-close')?.focus();return}if(b.dataset.import!==undefined){document.getElementById('nexo-import-file')?.click();return}if(b.dataset.page){page=b.dataset.page;modal=null;render();window.scrollTo(0,0)}else if(b.dataset.scope){scope=b.dataset.scope;render()}else if(b.dataset.period){period=b.dataset.period;render()}else if(b.dataset.add){if(b.dataset.add==='jobs'&&!data.clients.length){alert('Cadastre um cliente antes de criar um trabalho.');page='clients';render();return}modal={type:b.dataset.add,item:null};render()}else if(b.dataset.edit){const [type,id]=b.dataset.edit.split(':');modal={type,item:data[type].find(x=>x.id===id)};render()}else if(b.dataset.delete){const [type,id]=b.dataset.delete.split(':');if(type==='clients'&&data.jobs.some(j=>j.clientId===id)){alert('Este cliente tem trabalhos vinculados. Exclua ou transfira esses trabalhos primeiro.');return}modal={mode:'delete',type,item:data[type].find(x=>x.id===id)};render()}else if(b.dataset.editBalance!==undefined){modal={mode:'balance'};render()}else if(b.dataset.resetOpen!==undefined){modal={mode:'reset'};render()}else if(b.dataset.confirmReset!==undefined){const input=document.getElementById('reset-confirmation');if(!input||input.value.trim().toUpperCase()!=='APAGAR'){alert('Digite APAGAR para confirmar a exclusão.');return}data={transactions:[],clients:[],jobs:[],cards:[],openingBalance:0};page='home';scope='geral';modal=null;save();render();window.scrollTo(0,0)}else if(b.dataset.confirmDelete!==undefined){const type=modal.type,item=modal.item;if(type==='transactions')detachJobTransaction(item);if(type==='jobs'){data.transactions=data.transactions.filter(t=>!(t.jobId===item.id&&t.jobAuto));}data[type]=data[type].filter(x=>x.id!==item.id);modal=null;save();render()}else if(b.dataset.close!==undefined){modal=null;render()}else if(b.dataset.jobPayment){const j=data.jobs.find(x=>x.id===b.dataset.jobPayment);if(j&&jobDue(j)>0){modal={mode:'job-payment',id:j.id};render()}}else if(b.dataset.jobSettle){const j=data.jobs.find(x=>x.id===b.dataset.jobSettle);if(j&&jobDue(j)>0&&confirm('Confirmar recebimento de '+money(jobDue(j))+' de '+j.name+'? O valor será lançado como receita profissional.')){receiveJob(j,jobDue(j));save();render()}}else if(b.dataset.togglecard){data.cards=data.cards.map(c=>c.id===b.dataset.togglecard?{...c,paid:!c.paid}:c);save();render()}else if(b.dataset.export!==undefined){const blob=new Blob([storageProblem?(localStorage.getItem(activeKey)||''):JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nexo-backup-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}});
app.addEventListener('change',e=>{const el=e.target;if(!el.matches('[data-job-status]'))return;if(!activeKey||storageProblem||tabLocked){alert('Entre com uma conta autorizada antes de editar.');render();return}const j=data.jobs.find(x=>x.id===el.dataset.jobStatus);if(!j||!['andamento','feito','urgente'].includes(el.value))return;j.status=el.value;save();render()});
app.addEventListener('submit',e=>{if(!activeKey||storageProblem||tabLocked){e.preventDefault();alert('Entre com uma conta autorizada antes de editar.');return}if(e.target.id==='balance-form'){e.preventDefault();const amount=Number(new FormData(e.target).get('openingBalance'));if(!Number.isFinite(amount)){alert('Informe um saldo válido.');return}data.openingBalance=Math.round(amount*100)/100;modal=null;save();render();return}if(e.target.id==='job-payment-form'){e.preventDefault();const j=data.jobs.find(x=>x.id===modal.id),payment=Number(new FormData(e.target).get('payment'));if(!j||!Number.isFinite(payment)||payment<=0||Math.round(payment*100)>Math.round(jobDue(j)*100)){alert('Informe um valor válido, até o saldo pendente.');return}receiveJob(j,payment);modal=null;save();render();return}if(e.target.id!=='edit-form')return;e.preventDefault();const f=new FormData(e.target),type=modal.type,old=modal.item||{},name=String(f.get('name')||'').trim();if(!name)return;const obj={...old,id:old.id||uid(),name};if(type==='transactions'){Object.assign(obj,{amount:Number(f.get('amount')),date:String(f.get('date')||''),kind:f.get('kind'),scope:f.get('scope')})}if(type==='transactions'&&!/^\d{4}-\d{2}-\d{2}$/.test(obj.date))return;if(type==='transactions'&&old.jobAuto&&old.jobId){if(obj.kind!=='in'||obj.scope!=='profissional'){alert('Pagamentos vinculados a trabalhos precisam permanecer como receitas profissionais.');return}const j=data.jobs.find(j=>j.id===old.jobId);if(j){const delta=Math.round((obj.amount-old.amount)*100)/100;if(delta>0&&delta>jobDue(j)){alert('O valor supera o saldo pendente do trabalho.');return}j.paidAmount=Math.max(0,Math.round((jobPaid(j)+delta)*100)/100)}}if(type==='clients')obj.contact=String(f.get('contact')||'').trim();if(type==='jobs')Object.assign(obj,{amount:Number(f.get('amount')),paidAmount:Number(f.get('paidAmount')),clientId:f.get('clientId'),status:jobStatus(old)});if(type==='cards')Object.assign(obj,{amount:Number(f.get('amount')),due:f.get('due'),paid:f.get('paid')==='true'});if('amount'in obj&&(!Number.isFinite(obj.amount)||obj.amount<0||(type==='transactions'&&obj.amount===0)))return;if(type==='jobs'&&(!Number.isFinite(obj.paidAmount)||obj.paidAmount<0||Math.round(obj.paidAmount*100)>Math.round(obj.amount*100))){alert('O valor recebido não pode superar o valor contratado.');return}if(type==='jobs'){const target=obj.paidAmount;obj.paidAmount=Number(old.paidAmount)||0;try{setJobPaid(obj,target)}catch(err){alert(err.message);return}}data[type]=old.id?data[type].map(x=>x.id===old.id?obj:x):[obj,...data[type]];modal=null;save();render()});
render();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));



window.NexoBridge={
 activateAccount(userId,admin=false){
  if(typeof userId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(userId))throw Error('Identidade Firebase inválida.');
  activeKey=null;data={...structuredClone(demo),openingBalance:0};lastSaved=structuredClone(data);
  const nextKey=LEGACY_KEY+'-user-'+userId;
  try{
   // Apenas o administrador pode migrar os dados do armazenamento antigo.
   if(admin&&localStorage.getItem(nextKey)===null){
    const legacy=localStorage.getItem(LEGACY_KEY);
    if(legacy!==null)localStorage.setItem(nextKey,legacy);
   }
   const raw=localStorage.getItem(nextKey);
   const next=raw===null?{...structuredClone(demo),openingBalance:0}:JSON.parse(raw);
   if(!next||Object.keys(demo).some(k=>!Array.isArray(next[k])))throw Error('Dados inválidos desta conta. O original foi preservado.');
   if(next.openingBalance==null)next.openingBalance=0;
   data=next;lastSaved=structuredClone(data);storageProblem=false;
   activeKey=nextKey;page='home';scope='geral';modal=null;render();
  }catch(e){storageProblem=true;render();throw e;}
 },
 deactivateAccount(){
  activeKey=null;data={...structuredClone(demo),openingBalance:0};lastSaved=structuredClone(data);
  page='home';scope='geral';modal=null;render();
 },
 storageKey(){return activeKey},
 read(){if(!activeKey||storageProblem)throw Error('Conta não autorizada ou dados locais inválidos.');return structuredClone(data)},
 replace(next){if(!activeKey||tabLocked)throw Error('Conta indisponível ou outra aba em uso.');const raw=JSON.stringify(next);localStorage.setItem(activeKey,raw);data=structuredClone(next);lastSaved=structuredClone(next);storageProblem=false;modal=null;render()},
 lock(){tabLocked=true},
 canEdit(){return !!activeKey&&!tabLocked&&!storageProblem}
};

// Dados financeiros carregados somente após verificação da identidade.
if(navigator.locks){navigator.locks.request('nexo-editor-v1',{ifAvailable:true},lock=>{if(!lock){alert('NEXO já está aberto em outra aba. Use a primeira aba para editar.');return}tabLocked=false;return new Promise(()=>{})})}else{tabLocked=false}

const welcome=document.getElementById('nexo-welcome');
const welcomeStatus=document.getElementById('nexo-welcome-status');
function showWelcome(show){
 welcome.hidden=!show;
 document.body.classList.toggle('nexo-locked',show);
 if(show){document.getElementById('nexo-account-view').hidden=true;document.body.classList.remove('account-open')}
}
showWelcome(true);
window.addEventListener('nexo:auth',event=>{
 const detail=event.detail||{};
 if(detail.error){showWelcome(true);welcomeStatus.textContent=detail.error;document.getElementById('nexo-google-login').disabled=false;return}
 if(detail.loading){welcomeStatus.textContent='Verificando sua conta Google…';document.getElementById('nexo-google-login').disabled=true;return}
 welcomeStatus.textContent='Entre com sua conta Google para continuar.';
 document.getElementById('nexo-google-login').disabled=false;
 showWelcome(!detail.signedIn);
});
document.getElementById('nexo-google-login').addEventListener('click',()=>{
 const button=document.querySelector('#cloud-panel [data-cloud="login"],#cloud-panel [data-cloud="connect"]');
 if(button)button.click();
 else welcomeStatus.textContent='Aguarde a inicialização do login Google e tente novamente.';
});
import('./cloud.mjs?v=25').catch(error=>{
 const panel=document.getElementById('cloud-panel');
 if(panel)panel.textContent='Não foi possível carregar o login Google. Seus dados continuam salvos neste dispositivo. '+error.message;
 window.dispatchEvent(new CustomEvent('nexo:auth',{detail:{error:'Login indisponível. Verifique a internet e tente novamente.'}}));
});
