const CACHE='nexo-pwa-v34';
const ASSETS=['./','./index.html','./style.css?v=34','./app.js?v=34','./cloud.mjs?v=28','./sync-core.mjs','./icons/icon-180.png?v=22','./icons/icon-192.png?v=22','./icons/icon-512.png?v=22','./icons/logo-nexo.webp?v=28','./icons/favicon-32.png?v=22','./manifest.webmanifest?v=22'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('nexo-pwa-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 const appFile=url.pathname.endsWith('/')||/\/(index\.html|app\.js|style\.css|cloud\.mjs|sync-core\.mjs|manifest\.webmanifest)$/.test(url.pathname);
 if(!appFile)return;
 event.respondWith(fetch(req).then(res=>{
  if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)))}return res;
 }).catch(async()=>{
  const cached=await caches.match(req,{ignoreSearch:true});
  if(cached)return cached;
  if(req.mode==='navigate')return caches.match('./index.html');
  return new Response('Offline',{status:503});
 }));
});
