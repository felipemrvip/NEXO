export const KEY = 'nexo-pwa-data-v1';
export const MAX_BYTES = 700000;
export function validateData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Backup inválido.');
  const kinds = ['transactions', 'clients', 'jobs', 'cards'];
  if (Object.keys(value).some(k => ![...kinds, 'openingBalance'].includes(k))) throw Error('Formato de dados desconhecido; original preservado.');
  const result = structuredClone(value);
  for (const kind of kinds) {
    if (!Array.isArray(result[kind])) throw Error('Lista inválida: ' + kind);
    const ids = new Set();
    for (const x of result[kind]) {
      if (!x || typeof x.id !== 'string' || !x.id || ids.has(x.id) || typeof x.name !== 'string') throw Error('Registro inválido ou duplicado: ' + kind);
      ids.add(x.id);
      if (kind !== 'clients' && (!Number.isFinite(x.amount) || x.amount < 0)) throw Error('Valor inválido.');
      if (kind === 'transactions' && (!['in','out'].includes(x.kind) || !['pessoal','profissional'].includes(x.scope) || (x.date != null && typeof x.date !== 'string'))) throw Error('Movimentação inválida.');
      if (kind === 'clients' && x.contact != null && typeof x.contact !== 'string') throw Error('Contato inválido.');
      if (kind === 'jobs' && (!Number.isFinite(x.progress) || x.progress < 0 || x.progress > 100 || typeof x.clientId !== 'string')) throw Error('Trabalho inválido.');
      if (kind === 'cards' && (typeof x.paid !== 'boolean' || typeof x.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.due))) throw Error('Cartão inválido.');
    }
  }
  if (result.openingBalance == null) result.openingBalance = 0;
  if (!Number.isFinite(result.openingBalance)) throw Error('Saldo inválido.');
  return result;
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]));
  return value;
}
export function encode(value) {
  const payload = JSON.stringify(sorted(validateData(value)));
  if (new TextEncoder().encode(payload).length > MAX_BYTES) throw Error('Dados acima do limite de sincronização. Faça backup; os dados continuam locais.');
  return payload;
}
export function decide(base, local, remote) {
  if (local === remote) return 'same';
  if (base === null) return remote === null ? 'upload' : 'conflict';
  if (local === base) return remote === null ? 'conflict' : 'download';
  if (remote === base) return 'upload';
  return 'conflict';
}
export function checkRemote(doc) {
  if (!doc || doc.schemaVersion !== 1 || !Number.isSafeInteger(doc.revision) || doc.revision < 1 || typeof doc.payload !== 'string') throw Error('Formato da nuvem inválido. Dados locais preservados.');
  const data = validateData(JSON.parse(doc.payload));
  if (encode(data) !== doc.payload) throw Error('Formato da nuvem incompatível.');
  return doc;
}

const recordTypes = ['transactions','clients','jobs','cards'];
function equalRecord(a,b){return JSON.stringify(sorted(a))===JSON.stringify(sorted(b));}
/**
 * Mescla de três vias: alterações independentes são combinadas; edições
 * concorrentes do mesmo registro exigem intervenção humana.
 * Exclusões não são revertidas automaticamente.
 */
export function mergeThreeWay(basePayload, localPayload, remotePayload){
  if(typeof basePayload!=='string'||typeof localPayload!=='string'||typeof remotePayload!=='string')return null;
  let base,local,remote;
  try{
    base=validateData(JSON.parse(basePayload));
    local=validateData(JSON.parse(localPayload));
    remote=validateData(JSON.parse(remotePayload));
  }catch{return null;}
  const result={};
  for(const kind of recordTypes){
    const b=new Map(base[kind].map(x=>[x.id,x]));
    const l=new Map(local[kind].map(x=>[x.id,x]));
    const r=new Map(remote[kind].map(x=>[x.id,x]));
    const ids=new Set([...b.keys(),...l.keys(),...r.keys()]);
    const merged=[];
    for(const id of ids){
      const old=b.get(id), left=l.get(id), right=r.get(id);
      const leftChanged=!equalRecord(left,old),rightChanged=!equalRecord(right,old);
      if(leftChanged&&rightChanged&&!equalRecord(left,right))return null;
      const winner=leftChanged?left:right;
      if(winner!==undefined)merged.push(winner);
    }
    result[kind]=merged;
  }
  const leftBalance=local.openingBalance!==base.openingBalance;
  const rightBalance=remote.openingBalance!==base.openingBalance;
  if(leftBalance&&rightBalance&&local.openingBalance!==remote.openingBalance)return null;
  result.openingBalance=leftBalance?local.openingBalance:remote.openingBalance;
  try{return encode(result);}catch{return null;}
}
