// Execute com: node --test tests/dashboard-audit.test.cjs
// Os testes usam as funções reais do app.js, sem Firebase nem dados pessoais.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function extract(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a, 'funcoes do aplicativo nao encontradas');
 return source.slice(a,b);
}
const finance=extract('const nexoCents=','function home(){');
const makeEngine=new Function('data','uid','today','jobDue', finance+'return {metrics:nexoDashboardMetrics,reconcile:nexoReconcileCardPayment};');
function fixture(){
 const data={
  openingBalance:5000,
  transactions:[
   {id:'income',name:'Recebimento',amount:200,kind:'in',scope:'profissional'},
   {id:'expense',name:'Compra',amount:100,kind:'out',scope:'pessoal'}
  ],
  jobs:[{id:'j1',name:'Projeto',amount:1500,paidAmount:500}],
  cards:[{id:'c1',name:'Nubank',amount:1200,paid:false,scope:'pessoal',due:'2026-11-15'}]
 };
 let id=0;
 const engine=makeEngine(data,()=>String(++id),()=> '2026-10-18',j=>Math.max(0,j.amount-(j.paidAmount||0)));
 return {data,...engine};
}
test('saldo consolidado desconta pendencias e nao antecipa trabalhos',()=>{
 const {metrics}=fixture();
 assert.equal(metrics().currentBalance,5100);
 assert.equal(metrics().pending,1200);
 assert.equal(metrics().availableAfterCards,3900);
 assert.equal(metrics().jobsReceivable,1000);
});
test('quitar fatura troca passivo por despesa sem mudar saldo liquido',()=>{
 const {data,metrics,reconcile}=fixture();
 const old=data.cards[0],paid={...old,paid:true};
 reconcile(old,paid);data.cards[0]=paid;
 assert.equal(metrics().availableAfterCards,3900);
 assert.equal(metrics().expense,1300);
 assert.equal(metrics().pending,0);
 assert.equal(data.transactions.filter(t=>t.cardAuto).length,1);
});
test('quitar duas vezes nao duplica pagamento',()=>{
 const {data,reconcile}=fixture();
 const paid={...data.cards[0],paid:true};
 reconcile(data.cards[0],paid);reconcile(paid,paid);
 assert.equal(data.transactions.filter(t=>t.cardAuto).length,1);
});
test('reabrir fatura elimina lancamento gerado',()=>{
 const {data,metrics,reconcile}=fixture();
 const old=data.cards[0],paid={...old,paid:true};
 reconcile(old,paid);
 const reopened={...paid,paid:false};reconcile(paid,reopened);data.cards[0]=reopened;
 assert.equal(metrics().availableAfterCards,3900);
 assert.equal(data.transactions.filter(t=>t.cardAuto).length,0);
});
test('fatura legada ja paga nao e cobrada retroativamente',()=>{
 const {data,metrics,reconcile}=fixture();
 const oldPaid={id:'old',name:'Legada',amount:250,paid:true,due:'2026-01-15'};
 data.cards.push(oldPaid);
 reconcile(oldPaid,oldPaid);
 assert.equal(metrics().availableAfterCards,3900);
 assert.equal(data.transactions.filter(t=>t.cardId==='old').length,0);
});
test('alterar valor da fatura quitada atualiza despesa vinculada',()=>{
 const {data,metrics,reconcile}=fixture();
 const old=data.cards[0],paid={...old,paid:true};
 reconcile(old,paid);const altered={...paid,amount:1400};
 reconcile(paid,altered);data.cards[0]=altered;
 assert.equal(metrics().availableAfterCards,3700);
 assert.equal(data.transactions.filter(t=>t.cardAuto).length,1);
 assert.equal(data.transactions.find(t=>t.cardAuto).amount,1400);
});
test('pagamento de fatura na area profissional e contabilizado como tal',()=>{
 const {data,reconcile}=fixture();const c=data.cards[0],p={...c,paid:true,scope:'profissional'};
 reconcile(c,p);
 assert.equal(data.transactions.find(t=>t.cardAuto).scope,'profissional');
});
test('centavos nao acumulam erro de ponto flutuante',()=>{
 const {data,metrics}=fixture();
 data.transactions=[{id:'a',amount:0.1,kind:'in'},{id:'b',amount:0.2,kind:'in'}];
 data.cards=[];
 data.openingBalance=0;
 assert.equal(metrics().income,0.3);
 assert.equal(metrics().availableAfterCards,0.3);
});
