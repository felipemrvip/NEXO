import {KEY, encode, validateData, decide, checkRemote} from './sync-core.mjs';

const META = 'nexo-cloud-v1';
const ORIGINAL = 'nexo-backup-before-cloud-v1';
const bridge = window.NexoBridge;
const panel = document.getElementById('cloud-panel');
let auth, db, sdk, user, unsubscribe, busy = false, active = false, conflict = null, meta = null, message = 'Seus dados estão salvos somente neste dispositivo.';
let disabled = false;
try { meta = JSON.parse(localStorage.getItem(META)); } catch { message = 'Configuração de sincronização inválida. Dados locais preservados.'; }
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function paint() {
  panel.innerHTML = `<div class="cloud-card"><div><strong>Sincronização entre aparelhos</strong><p role="status" aria-live="polite">${escape(message)}</p>${user ? `<small>${escape(user.email)}</small>` : ''}</div><div class="cloud-actions">${!sdk ? '<button class="btn tiny" data-cloud="connect">Entrar com Google</button>' : !user ? '<button class="btn tiny" data-cloud="login">Entrar com Google</button>' : !active ? '<button class="btn tiny" data-cloud="enable">Ativar sincronização</button><button class="btn tiny ghost" data-cloud="logout">Sair</button>' : '<button class="btn tiny ghost" data-cloud="retry">Sincronizar agora</button><button class="btn tiny ghost" data-cloud="logout">Desconectar</button>'}<button class="btn tiny ghost" data-cloud="restore">Restaurar backup</button></div>${conflict ? '<div class="cloud-conflict"><p>Há versões diferentes neste aparelho e na nuvem. Nenhuma foi substituída. Baixe as duas cópias antes de escolher qual manter.</p><button class="btn tiny" data-cloud="copies">Baixar as duas versões</button><button class="btn tiny ghost" data-cloud="remote">Usar versão da nuvem</button><button class="btn tiny ghost" data-cloud="local">Usar versão deste aparelho</button></div>' : ''}</div>`;
}
function status(text) { message = text; paint(); }
function authSignal(detail){window.dispatchEvent(new CustomEvent('nexo:auth',{detail}))}
function download(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = name + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function backup(reason) {
  const raw = localStorage.getItem(KEY);
  if (raw !== null) {
    if (localStorage.getItem(ORIGINAL) === null) localStorage.setItem(ORIGINAL, raw);
    localStorage.setItem('nexo-backup-' + reason + '-' + crypto.randomUUID(), raw);
  }
}
function persist(next) { localStorage.setItem(META, JSON.stringify(next)); meta = next; }
function stop() { active = false; unsubscribe?.(); unsubscribe = null; conflict = null; }
function error(e) {
  const code = e?.code || '';
  if(!user)authSignal({error:'Não foi possível entrar. Verifique sua conexão e tente novamente.'});
  status(code.includes('permission-denied') ? 'O Firebase ainda bloqueia o acesso. Nenhum dado local foi apagado; as regras precisam ser publicadas.' : code.includes('popup') ? 'Login não concluído. Permita a janela de login; no iPhone, tente abrir o NEXO no Safari.' : 'Sincronização pausada: ' + (e?.message || 'verifique a conexão') + ' Os dados locais foram preservados.');
}
async function setup() {
  if (sdk) return;
  authSignal({loading:true});
  status('Preparando login seguro…');
  const [app, a, f] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js')
  ]);
  sdk = {...a, ...f};
  const firebase = app.initializeApp({apiKey:'AIzaSyCQUjyPVXoLcpdeaIWMTyhCP_s5bp7uiLk',authDomain:'nexo-4142e.firebaseapp.com',projectId:'nexo-4142e',appId:'1:554390559654:web:72b2b6c5e1d26108a50d67'});
  auth = a.getAuth(firebase); db = f.getFirestore(firebase);
  await auth.authStateReady();
  a.onAuthStateChanged(auth, async next => {
    stop(); user = next;
    authSignal({signedIn:!!next});
    if (user && !user.emailVerified) {
      await a.signOut(auth); status('Use uma conta Google com e-mail verificado.'); return;
    }
    if (user && meta?.uid === user.uid && meta?.consent === true && !disabled) start();
    else status(user ? 'Login concluído. Os registros ainda não foram enviados; ative a sincronização quando desejar.' : 'Seus dados continuam neste dispositivo. Entre para sincronizar.');
  });
  paint();
}
function reference() { return sdk.doc(db, 'users', user.uid, 'nexo', 'state'); }
function start() {
  if (disabled) return;
  stop(); active = true;
  unsubscribe = sdk.onSnapshot(reference(), {includeMetadataChanges:true}, snap => {
    if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) void sync();
  }, error);
  void sync();
}
async function sync() {
  if (!active || busy || conflict || disabled || !user || !bridge.canEdit()) return;
  if (!navigator.onLine) { status('Sem internet. Alterações salvas neste aparelho, aguardando conexão.'); return; }
  busy = true;
  const currentUser = user.uid;
  try {
    status('Sincronizando…');
    const ref = reference();
    const snapshot = await sdk.getDocFromServer(ref);
    if (!active || user?.uid !== currentUser || disabled) return;
    const remote = snapshot.exists() ? checkRemote(snapshot.data()) : null;
    const local = encode(bridge.read());
    const base = meta?.uid === currentUser ? meta.base : null;
    const action = decide(base, local, remote?.payload ?? null);
    if (action === 'conflict') {
      conflict = {remote, local, downloaded:false};
      status('Sincronização pausada: existem versões diferentes.'); return;
    }
    if (action === 'download') {
      backup('before-download');
      bridge.replace(validateData(JSON.parse(remote.payload)));
      persist({...meta, base:remote.payload, revision:remote.revision});
    } else if (action === 'same') {
      persist({...meta, base:remote.payload, revision:remote.revision});
    } else {
      const revision = (remote?.revision ?? 0) + 1;
      await sdk.runTransaction(db, async tx => {
        const latest = await tx.get(ref);
        const d = latest.exists() ? checkRemote(latest.data()) : null;
        if (!active || disabled || user?.uid !== currentUser || (d?.revision ?? 0) !== (remote?.revision ?? 0) || (d?.payload ?? null) !== (remote?.payload ?? null)) throw Error('Outra alteração chegou durante o envio. Tente sincronizar novamente.');
        tx.set(ref, {schemaVersion:1, uid:currentUser, revision, payload:local, updatedAt:sdk.serverTimestamp()});
      });
      persist({...meta, base:local, revision});
    }
    if (encode(bridge.read()) === meta.base) status('Sincronizado. As próximas alterações serão enviadas à sua conta.');
    else { status('Há novas alterações locais aguardando envio.'); setTimeout(() => void sync(), 0); }
  } catch (e) { error(e); }
  finally { busy = false; }
}
async function enable() {
  if (disabled || !user || busy) return;
  if (!bridge.canEdit()) throw Error('Use a primeira aba do NEXO aberta neste navegador.');
  if (!navigator.locks) throw Error('Atualize o navegador antes de ativar a sincronização.');
  const value = validateData(bridge.read()); encode(value);
  const count = value.transactions.length + value.clients.length + value.jobs.length + value.cards.length;
  if (!confirm(`Enviar seus dados ao Firebase do NEXO (nexo-4142e), na sua conta ${user.email}?\n\nInclui saldo inicial e ${count} registros de movimentações, clientes/contatos, trabalhos e cartões. Após ativar, alterações futuras também serão sincronizadas. Será criada uma cópia local e baixado um backup antes de qualquer envio. Se houver dados diferentes na nuvem, você escolherá qual versão manter.\n\nAutoriza ativar a sincronização?`)) return;
  backup('migration'); download(value, 'nexo-antes-da-sincronizacao-' + Date.now());
  persist({uid:user.uid, consent:true, base:null, revision:0});
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
  status('Desconectado. Seus dados continuam neste aparelho; a nuvem não foi apagada.');
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
      bridge.replace(restored); status('Backup restaurado localmente. Ative a sincronização somente se quiser enviar esta versão.');
    } catch(e) { error(e); }
  }; input.click();
}
panel.addEventListener('click', async event => {
  const action = event.target.closest('[data-cloud]')?.dataset.cloud;
  if (!action) return;
  try {
    if (disabled && action !== 'copies') throw Error('Use a primeira aba do NEXO aberta neste navegador.');
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
window.addEventListener('nexo:changed', () => { if (active) { status('Alterações salvas neste aparelho; aguardando sincronização.'); void sync(); } });
window.addEventListener('online', () => { void sync(); });
window.addEventListener('offline', () => { if (active) status('Sem internet. Alterações permanecem salvas neste aparelho.'); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) void sync(); });
setInterval(() => { if (active && !document.hidden && !conflict) void sync(); }, 30000);
window.addEventListener('storage', e => {
  if (e.key === KEY || e.key === META || e.key === null) { disabled = true; stop(); bridge.lock(); status('Outra aba alterou os dados. Recarregue esta página antes de editar.'); }
});
paint();
setup().catch(error);
