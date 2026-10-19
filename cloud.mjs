import {encode, validateData, decide, checkRemote, mergeThreeWay} from './sync-core.mjs?v=39';

const LEGACY_META = 'nexo-cloud-v1';
const META_PREFIX = 'nexo-cloud-v2-user-';
let metaStorageKey = null;
const ORIGINAL = 'nexo-backup-before-cloud-v1';
const bridge = window.NexoBridge;
const panel = document.getElementById('cloud-panel');
let auth, db, sdk, user, unsubscribe, busy = false, active = false, conflict = null, meta = null, message = 'Seus dados estão salvos somente neste dispositivo.';
let syncPhase = 'local', syncAgain = false;
let disabled = false;
const ADMIN_EMAIL = 'felipemrvip@gmail.com';
let allowed = false, authGeneration = 0, invitationRows = [];
const isAdmin = () => !!user && user.emailVerified && user.providerData.some(p=>p.providerId==='google.com') && user.email?.toLowerCase()===ADMIN_EMAIL;
const inviteRef = email => sdk.doc(db,'invitations',email.trim().toLowerCase());
async function checkInvitation() {
  if (!user || !user.emailVerified) return false;
  if (isAdmin()) return true;
  const doc = await sdk.getDocFromServer(inviteRef(user.email));
  return doc.exists() && doc.data().status === 'active';
}
function invitationMarkup() {
  return invitationRows.length ? invitationRows.map(item =>
    '<div class="invite-row"><span class="invite-email">'+escape(item.email)+'</span><span class="invite-state">'+(item.status==='active'?'Ativo':'Bloqueado')+'</span><button type="button" class="btn tiny ghost" data-invite-toggle="'+escape(item.email)+'">'+(item.status==='active'?'Bloquear':'Reativar')+'</button></div>'
  ).join('') : '<p class="muted">Nenhum convite cadastrado.</p>';
}
async function refreshInvitations() {
  if (!isAdmin()) return;
  const snap = await sdk.getDocs(sdk.collection(db,'invitations'));
  invitationRows = [...snap.docs].map(d=>({email:d.id,status:d.data().status})).sort((a,b)=>a.email.localeCompare(b.email));
  paint();
}

function loadMeta(uid,admin=false){
  metaStorageKey=META_PREFIX+uid;
  if(admin&&localStorage.getItem(metaStorageKey)===null){
    const raw=localStorage.getItem(LEGACY_META);
    if(raw){
      try{
        const old=JSON.parse(raw);
        if(old?.uid===uid)localStorage.setItem(metaStorageKey,raw);
      }catch{ /* Backup antigo preservado, sem migração automática. */ }
    }
  }
  const raw=localStorage.getItem(metaStorageKey);
  try{meta=raw?JSON.parse(raw):null;}
  catch{meta=null;throw Error('Metadados da sincronização inválidos. Faça um backup antes de continuar.');}
}
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function syncDetails() {
  if (!meta?.consent) return 'Sincronização não ativada neste aparelho.';
  if (!Number.isFinite(meta.lastSyncedAt)) return 'Ainda sem confirmação de sincronização com a nuvem.';
  return 'Última confirmação: ' + new Date(meta.lastSyncedAt).toLocaleString('pt-BR') + ' · revisão ' + (meta.revision || '—');
}
function announceSync() {
  window.dispatchEvent(new CustomEvent('nexo:sync-status',{detail:{phase:syncPhase,message,revision:meta?.revision||0,lastSyncedAt:meta?.lastSyncedAt||null}}));
}
function paint() {
  const actions = !sdk ? '<button class="btn tiny" data-cloud="connect">Entrar com Google</button>'
    : !user || !allowed ? '<button class="btn tiny" data-cloud="login">Entrar com Google</button>'
    : !active ? '<button class="btn tiny" data-cloud="enable">Ativar sincronização</button><button class="btn tiny ghost" data-cloud="logout">Sair</button>'
    : '<button class="btn tiny ghost" data-cloud="retry">Sincronizar agora</button><button class="btn tiny ghost" data-cloud="logout">Desconectar</button>';
  const admin = isAdmin() && allowed ? '<section class="invite-admin"><strong>Administração • Convites</strong><p class="muted">Autorize somente quem você conhece. O convite é uma permissão de acesso, não um envio automático de e-mail.</p><form id="nexo-invite-form" class="invite-form"><label for="invite-email">E-mail Google do convidado</label><div class="invite-form-row"><input id="invite-email" type="email" name="email" placeholder="exemplo@gmail.com" required autocomplete="off" maxlength="254"><button class="btn tiny" type="submit">Autorizar</button></div></form><div class="invite-list">'+invitationMarkup()+'</div><button class="btn tiny ghost" data-cloud="list-invites">Atualizar lista</button></section>' : '';
  const conflictMarkup = conflict ? '<div class="cloud-conflict"><p>Há versões diferentes neste aparelho e na nuvem. Nenhuma foi substituída. Baixe as duas cópias antes de escolher qual manter.</p><button class="btn tiny" data-cloud="copies">Baixar as duas versões</button><button class="btn tiny ghost" data-cloud="remote">Usar versão da nuvem</button><button class="btn tiny ghost" data-cloud="local">Usar versão deste aparelho</button></div>' : '';
  panel.innerHTML = '<div class="cloud-card"><div><strong>Sincronização entre aparelhos</strong><p role="status" aria-live="polite">'+escape(message)+'</p>'+(user && allowed ? '<small>'+escape(user.email)+'</small><small class="cloud-sync-details" data-sync-details>'+escape(syncDetails())+'</small>' : '')+'</div><div class="cloud-actions">'+actions+(allowed?'<button class="btn tiny ghost" data-cloud="restore">Restaurar backup</button>':'')+'</div>'+admin+conflictMarkup+'</div>';
}
function status(text, phase) {
  message=text;
  if (phase) syncPhase=phase;
  const node=panel.querySelector('.cloud-card [role="status"]');
  if(node)node.textContent=text; else paint();
  const details=panel.querySelector('[data-sync-details]');
  if(details)details.textContent=syncDetails();
  announceSync();
}
function authSignal(detail){window.dispatchEvent(new CustomEvent('nexo:auth',{detail}))}
function download(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = name + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function backup(reason) {
  const key = bridge.storageKey();
  const raw = key ? localStorage.getItem(key) : null;
  if (raw !== null) {
    const originalKey = ORIGINAL + '-' + user.uid;
    if (localStorage.getItem(originalKey) === null) localStorage.setItem(originalKey, raw);
    localStorage.setItem('nexo-backup-' + reason + '-' + crypto.randomUUID(), raw);
  }
}
function persist(next) { if(!metaStorageKey)throw Error('Conta não selecionada.');localStorage.setItem(metaStorageKey, JSON.stringify(next)); meta = next; }
function stop() { active = false; unsubscribe?.(); unsubscribe = null; conflict = null; }
function error(e) {
  const code = e?.code || '';
  if(!user)authSignal({error:'Não foi possível entrar. Verifique sua conexão e tente novamente.'});
  status(code.includes('permission-denied') ? 'O Firebase bloqueou o acesso. Nenhum dado local foi apagado; confira as permissões.' : code.includes('popup') ? 'Login não concluído. Permita a janela de login; no iPhone, tente abrir o NEXO no Safari.' : 'Sincronização pausada: ' + (e?.message || 'verifique a conexão') + ' Os dados locais foram preservados.','paused');
}
async function setup() {
  if (sdk) return;
  authSignal({loading:true});
  status('Preparando login seguro…','syncing');
  const sdkTimeout = new Promise((_,reject)=>setTimeout(()=>reject(Error('Tempo limite ao carregar serviços do Google. Verifique sua conexão e tente novamente.')),15000));
  const [app, a, f] = await Promise.race([Promise.all([
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js')
  ]),sdkTimeout]);
  sdk = {...a, ...f};
  const firebase = app.initializeApp({apiKey:'AIzaSyCQUjyPVXoLcpdeaIWMTyhCP_s5bp7uiLk',authDomain:'nexo-4142e.firebaseapp.com',projectId:'nexo-4142e',appId:'1:554390559654:web:72b2b6c5e1d26108a50d67'});
  auth = a.getAuth(firebase); db = f.getFirestore(firebase);
  await auth.authStateReady();
  a.onAuthStateChanged(auth, async next => {
    const generation=++authGeneration;
    stop(); allowed=false; user=next;
    invitationRows=[];meta=null;metaStorageKey=null;
    bridge.deactivateAccount();paint();
    if (!next) {
      authSignal({signedIn:false});
      status('Entre com sua conta Google. O acesso é restrito a pessoas convidadas.','local');
      return;
    }
    authSignal({loading:true,signedIn:false});
    try {
      if (!next.emailVerified || !next.providerData.some(p=>p.providerId==='google.com')) {
        throw Error('Use uma conta Google com e-mail verificado.');
      }
      const permitted = await checkInvitation();
      if (generation!==authGeneration || auth.currentUser?.uid!==next.uid) return;
      if (!permitted) {
        status('Acesso restrito: esta conta não possui convite ativo.','paused');
        await a.signOut(auth);
        if(generation===authGeneration-1)authSignal({error:'Somente pessoas convidadas pelo administrador podem entrar.',signedIn:false});
        return;
      }
      bridge.activateAccount(next.uid,isAdmin());
      loadMeta(next.uid,isAdmin());
      allowed=true;
      paint();
      authSignal({signedIn:true});
      if (meta?.uid === next.uid && meta?.consent === true && !disabled) start();
      else status('Login autorizado. Seus dados estão apenas neste aparelho. Abra Conta para ativar a sincronização.','local');
      if(isAdmin())void refreshInvitations().catch(error);
    } catch(e) {
      if(generation!==authGeneration)return;
      stop();allowed=false;bridge.deactivateAccount();
      authSignal({error:'Não foi possível validar o acesso: '+(e.message||'verifique sua conexão.'),signedIn:false});
      status('Acesso não confirmado. Nenhum dado foi alterado.','paused');
    }
  });
  paint();
}
function reference() { return sdk.doc(db, 'users', user.uid, 'nexo', 'state'); }
function start() {
  if (disabled || !allowed || !user) return;
  stop(); active = true;paint();status('Verificando dados na nuvem…','syncing');
  unsubscribe = sdk.onSnapshot(reference(), {includeMetadataChanges:true}, snap => {
    if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) void sync();
  }, error);
  void sync();
}
async function sync() {
  if (!active || conflict || disabled || !user || !allowed) return;
  if (busy) { syncAgain = true; return; }
  if (!bridge.canEdit()) { status('Sincronização pausada: outra aba está usando a edição neste navegador.','paused'); return; }
  if (!navigator.onLine) { status('Sem internet. Alterações salvas neste aparelho, aguardando conexão.','offline'); return; }
  busy = true;
  const currentUser = user.uid;
  try {
    status('Sincronizando…','syncing');
    const ref = reference();
    const snapshot = await sdk.getDocFromServer(ref);
    if (!active || user?.uid !== currentUser || disabled || !allowed) return;
    const remote = snapshot.exists() ? checkRemote(snapshot.data()) : null;
    const local = encode(bridge.read());
    const base = meta?.uid === currentUser ? meta.base : null;
    let action = decide(base, local, remote?.payload ?? null);
    let uploadPayload = local;
    let mergedPayload = null;
    // Em um aparelho novo, sem base anterior e sem lançamentos locais,
    // é seguro carregar os dados existentes da nuvem automaticamente.
    if (action === 'conflict' && base === null && remote &&
        bridge.read().transactions.length===0 && bridge.read().clients.length===0 &&
        bridge.read().jobs.length===0 && bridge.read().cards.length===0 &&
        bridge.read().openingBalance===0) action='download';
    if (action === 'conflict' && base !== null && remote) {
      mergedPayload = mergeThreeWay(base,local,remote.payload);
      if (mergedPayload !== null) {
        if (mergedPayload === remote.payload) action='download';
        else if (mergedPayload === local) action='upload';
        else { action='upload'; uploadPayload=mergedPayload; }
      }
    }
    if (action === 'conflict') {
      conflict = {remote, local, downloaded:false};
      status('Sincronização pausada: existem versões diferentes. Abra Conta para baixar ambas e decidir com segurança.','conflict'); return;
    }
    if (action === 'download') {
      backup('before-download');
      bridge.replace(validateData(JSON.parse(remote.payload)));
      persist({...meta, base:remote.payload, revision:remote.revision, lastSyncedAt:Date.now()});
    } else if (action === 'same') {
      persist({...meta, base:remote.payload, revision:remote.revision});
    } else {
      const revision = (remote?.revision ?? 0) + 1;
      await sdk.runTransaction(db, async tx => {
        const latest = await tx.get(ref);
        const d = latest.exists() ? checkRemote(latest.data()) : null;
        if (!active || disabled || !allowed || user?.uid !== currentUser || (d?.revision ?? 0) !== (remote?.revision ?? 0) || (d?.payload ?? null) !== (remote?.payload ?? null)) throw Error('Outra alteração chegou durante o envio. Tente sincronizar novamente.');
        tx.set(ref, {schemaVersion:1, uid:currentUser, revision, payload:uploadPayload, updatedAt:sdk.serverTimestamp()});
      });
      // Após a transação confirmada, aplica a união sem sobrescrever alterações
      // locais feitas enquanto a gravação estava em andamento.
      if (mergedPayload !== null && uploadPayload !== local && encode(bridge.read())===local) {
        backup('before-auto-merge');
        bridge.replace(validateData(JSON.parse(uploadPayload)));
      }
      persist({...meta, base:uploadPayload, revision, lastSyncedAt:Date.now()});
    }
    if (encode(bridge.read()) === meta.base) status('Sincronizado com a nuvem. Revisão '+meta.revision+' confirmada.','synced');
    else { status('Alterações locais aguardando envio à nuvem.','pending'); syncAgain=true; }
  } catch (e) { error(e); }
  finally {
    busy = false;
    if (syncAgain && active && !conflict && !disabled) {
      syncAgain=false;
      queueMicrotask(()=>void sync());
    }
  }
}
async function enable() {
  if (disabled || !user || !allowed || busy) return;
  if (!bridge.canEdit()) throw Error('Use a primeira aba do NEXO aberta neste navegador.');
  // Alguns WebKit/iPhones não expõem navigator.locks. O NexoBridge.canEdit()
  // já verifica se a edição está disponível; não bloquear a nuvem por isso.
  const value = validateData(bridge.read()); encode(value);
  const count = value.transactions.length + value.clients.length + value.jobs.length + value.cards.length;
  if (!confirm(`Enviar seus dados ao Firebase do NEXO (nexo-4142e), na sua conta ${user.email}?\n\nInclui saldo inicial e ${count} registros de movimentações, clientes/contatos, trabalhos e cartões. Após ativar, alterações futuras também serão sincronizadas. Será criada uma cópia local e baixado um backup antes de qualquer envio. Se houver dados diferentes na nuvem, você escolherá qual versão manter.\n\nAutoriza ativar a sincronização?`)) return;
  backup('migration'); download(value, 'nexo-antes-da-sincronizacao-' + Date.now());
  persist(meta?.uid===user.uid ? {...meta,consent:true} : {uid:user.uid, consent:true, base:null, revision:0});
  start();
}
async function resolve(choice) {
  if (!conflict || busy || !active || disabled) return;
  if (!conflict.downloaded) { alert('Baixe as duas versões primeiro.'); return; }
  if (!confirm(choice === 'remote' ? 'Usar os dados da nuvem neste aparelho? A versão local ficará guardada no backup.' : 'Enviar a versão deste aparelho e substituir a versão da nuvem? As duas cópias já foram baixadas.')) return;
  const c = conflict;
  const snap = await sdk.getDocFromServer(reference());
  const latest = snap.exists() ? checkRemote(snap.data()) : null;
  if ((latest?.revision ?? 0) !== (c.remote?.revision ?? 0) || encode(bridge.read()) !== c.local) {
    conflict = null; await sync(); return;
  }
  backup('conflict');
  if (choice === 'remote') {
    if (!latest) throw Error('A versão na nuvem não existe. A cópia local foi mantida.');
    bridge.replace(validateData(JSON.parse(latest.payload)));
  }
  persist({...meta, base:latest?.payload ?? null, revision:latest?.revision ?? 0});
  conflict = null; await sync();
}
async function logout() {
  if (busy) { alert('Aguarde o envio em andamento terminar.'); return; }
  stop(); persist({...meta, consent:false}); await sdk.signOut(auth);
  status('Desconectado. Seus dados continuam neste aparelho; a nuvem não foi apagada.','local');
}
function restore() {
  if (busy) { alert('Aguarde a sincronização terminar.'); return; }
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = async () => {
    try {
      const file = input.files[0]; if (!file) return;
      const restored = validateData(JSON.parse(await file.text())); encode(restored);
      if (!confirm('Restaurar este backup neste aparelho? A versão atual será preservada em uma cópia local. A sincronização será desconectada; nada será enviado à nuvem.')) return;
      stop(); persist({...meta, consent:false}); backup('before-restore');
      bridge.replace(restored); status('Backup restaurado localmente. Ative a sincronização somente se quiser enviar esta versão.','local');
    } catch(e) { error(e); }
  }; input.click();
}
panel.addEventListener('click', async event => {
  const action = event.target.closest('[data-cloud]')?.dataset.cloud;
  if (!action) return;
  try {
    if (disabled && action !== 'copies') throw Error('Use a primeira aba do NEXO aberta neste navegador.');
    if (action === 'list-invites') await refreshInvitations();
    if (action === 'connect') { await setup(); status('Pronto. Clique em Entrar com Google para abrir o login.'); }
    if (action === 'login') { const provider = new sdk.GoogleAuthProvider(); provider.setCustomParameters({prompt:'select_account'}); await sdk.signInWithPopup(auth, provider); }
    if (action === 'enable') await enable();
    if (action === 'retry') await sync();
    if (action === 'logout') await logout();
    if (action === 'restore') restore();
    if (action === 'copies' && conflict) {
      download({local:JSON.parse(conflict.local),cloud:conflict.remote ? JSON.parse(conflict.remote.payload) : null}, 'nexo-duas-versoes-' + Date.now());
      // Also save plain restorable copies locally before enabling a choice.
      backup('conflict-local');
      if (conflict.remote) localStorage.setItem('nexo-backup-conflict-cloud-' + crypto.randomUUID(), conflict.remote.payload);
      conflict.downloaded = true;
    }
    if (action === 'remote' || action === 'local') await resolve(action);
  } catch(e) { error(e); }
});
panel.addEventListener('submit', async e => {
  if (e.target.id !== 'nexo-invite-form') return;
  e.preventDefault();
  if (!isAdmin()) return;
  const email = String(new FormData(e.target).get('email')||'').trim().toLowerCase();
  if (email===ADMIN_EMAIL) { alert('O administrador já possui acesso.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) { alert('Informe um e-mail válido.'); return; }
  try {
    const ref=inviteRef(email), existing=await sdk.getDocFromServer(ref);
    if (existing.exists()) {
      if (existing.data().status==='active') { alert('Esse e-mail já está autorizado.'); return; }
      await sdk.updateDoc(ref,{status:'active',updatedAt:sdk.serverTimestamp()});
    } else await sdk.setDoc(ref, {email,status:'active',createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()});
    e.target.reset(); await refreshInvitations(); status('E-mail autorizado: '+email+'. Compartilhe o link do NEXO com essa pessoa.');
  } catch(err) { error(err); }
});
panel.addEventListener('click', async e => {
  const email = e.target.closest('[data-invite-toggle]')?.dataset.inviteToggle;
  if (!email || !isAdmin()) return;
  try {
    const ref=inviteRef(email), snap=await sdk.getDocFromServer(ref);
    if (!snap.exists()) return;
    const status=snap.data().status==='active'?'blocked':'active';
    if (!confirm((status==='blocked'?'Bloquear':'Reativar')+' o acesso de '+email+'?')) return;
    await sdk.updateDoc(ref,{status,updatedAt:sdk.serverTimestamp()});
    await refreshInvitations();
  } catch(err) { error(err); }
});
let verifying=false;
async function verifyAccess(){
  if(verifying||!allowed||!user||!navigator.onLine)return;
  verifying=true;
  const checkedUid=user.uid;
  try{
    const stillAllowed=await checkInvitation();
    if(user?.uid!==checkedUid)return;
    if(!stillAllowed){
      stop();allowed=false;bridge.deactivateAccount();
      authSignal({error:'Seu convite foi bloqueado ou revogado. Contate o administrador.',signedIn:false});
      await sdk.signOut(auth);
    }
  }catch(e){
    if(user?.uid===checkedUid){
      stop();allowed=false;bridge.deactivateAccount();
      authSignal({error:'Não foi possível confirmar seu acesso. Verifique a conexão e entre novamente.',signedIn:false});
      await sdk.signOut(auth);
    }
  }finally{verifying=false;}
}
window.addEventListener('nexo:changed', () => {
  if (active) { status('Salvo neste aparelho; aguardando confirmação da nuvem.','pending'); void sync(); }
  else if (allowed) status('Salvo neste aparelho. Sincronização não ativada aqui.','local');
});
window.addEventListener('online', () => { void verifyAccess(); void sync(); });
window.addEventListener('offline', () => { if (active) status('Sem internet. Alterações permanecem salvas neste aparelho.','offline'); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) {void verifyAccess(); void sync();} });
setInterval(() => { if (allowed && !document.hidden) {void verifyAccess(); if(active && !conflict)void sync();} }, 30000);
window.addEventListener('storage', e => {
  if (e.key === bridge.storageKey() || e.key === metaStorageKey || e.key === LEGACY_META || e.key === null) { disabled = true; stop(); bridge.lock(); status('Outra aba alterou os dados. Recarregue esta página antes de editar.','paused'); }
});
paint();
setup().catch(error);
